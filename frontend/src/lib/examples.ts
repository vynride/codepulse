import { GNARLY } from "./examples/gnarly";

export interface CodeExample {
  id: string;
  label: string;
  filename: string;
  code: string;
}

const CLEAN = `"""Small, well-factored helpers for slugifying titles."""

import re
import unicodedata

_NON_WORD = re.compile(r"[^\\w\\s-]")
_SEPARATORS = re.compile(r"[-\\s]+")


def normalize(text: str) -> str:
    """Strip accents and lowercase the text."""
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower()


def slugify(title: str, max_length: int = 60) -> str:
    """Turn an arbitrary title into a URL-safe slug."""
    cleaned = _NON_WORD.sub("", normalize(title)).strip()
    slug = _SEPARATORS.sub("-", cleaned)
    return slug[:max_length].rstrip("-")


def unique_slug(title: str, taken: set[str]) -> str:
    """Return a slug that does not collide with any slug in \`taken\`."""
    base = slugify(title)
    candidate, n = base, 2
    while candidate in taken:
        candidate = f"{base}-{n}"
        n += 1
    return candidate
`;

const MEDIUM = `"""Thin client for the inventory service REST API.

Handles auth token refresh, retries with exponential backoff, a small
in-memory response cache and cursor-based pagination.
"""

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Iterator, Optional

import requests

log = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class ApiError(Exception):
    def __init__(self, status: int, message: str, payload: Optional[dict] = None):
        super().__init__(f"{status}: {message}")
        self.status = status
        self.payload = payload or {}


@dataclass
class CacheEntry:
    payload: Any
    expires_at: float


@dataclass
class ApiClient:
    base_url: str
    client_id: str
    client_secret: str
    retries: int = 3
    backoff: float = 0.5
    ttl: float = 30.0
    timeout: float = 10.0
    _token: Optional[str] = None
    _token_expires: float = 0.0
    _cache: dict = field(default_factory=dict)
    _session: requests.Session = field(default_factory=requests.Session)

    # -- auth -------------------------------------------------------------

    def _refresh_token(self) -> None:
        resp = self._session.post(
            self.base_url + "/oauth/token",
            data={"grant_type": "client_credentials"},
            auth=(self.client_id, self.client_secret),
            timeout=self.timeout,
        )
        if resp.status_code != 200:
            raise ApiError(resp.status_code, "could not obtain access token")
        body = resp.json()
        self._token = body["access_token"]
        # refresh a minute early to avoid racing the expiry
        self._token_expires = time.monotonic() + body.get("expires_in", 3600) - 60

    def _headers(self) -> dict:
        if self._token is None or time.monotonic() >= self._token_expires:
            self._refresh_token()
        return {"Accept": "application/json", "Authorization": f"Bearer {self._token}"}

    # -- cache ------------------------------------------------------------

    def _cache_key(self, method: str, path: str, params: Optional[dict]) -> str:
        return f"{method} {path} " + json.dumps(params or {}, sort_keys=True)

    def _cached(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        if entry.expires_at < time.monotonic():
            del self._cache[key]
            return None
        return entry.payload

    def invalidate(self, prefix: str = "") -> int:
        stale = [k for k in self._cache if k.split(" ", 2)[1].startswith(prefix)]
        for k in stale:
            del self._cache[k]
        return len(stale)

    # -- transport --------------------------------------------------------

    def _request(self, method: str, path: str, params: Optional[dict] = None,
                 body: Optional[dict] = None) -> Any:
        last_error: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            try:
                resp = self._session.request(
                    method,
                    self.base_url + path,
                    params=params,
                    json=body,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
                if resp.status_code == 401 and attempt == 1:
                    # token revoked server-side; force a refresh and retry once
                    self._token = None
                    continue
                if resp.status_code in RETRYABLE_STATUS:
                    retry_after = resp.headers.get("Retry-After")
                    raise ApiError(resp.status_code, "retryable", {"retry_after": retry_after})
                if resp.status_code >= 400:
                    try:
                        detail = resp.json()
                    except ValueError:
                        detail = {"raw": resp.text[:200]}
                    raise ApiError(resp.status_code, detail.get("message", "request failed"), detail)
                return resp.json() if resp.content else None
            except (requests.ConnectionError, requests.Timeout) as exc:
                last_error = exc
            except ApiError as exc:
                if exc.status not in RETRYABLE_STATUS:
                    raise
                last_error = exc
            if attempt < self.retries:
                delay = self.backoff * (2 ** (attempt - 1))
                if isinstance(last_error, ApiError) and last_error.payload.get("retry_after"):
                    delay = max(delay, float(last_error.payload["retry_after"]))
                log.warning("%s %s failed (%s); retrying in %.1fs", method, path, last_error, delay)
                time.sleep(delay)
        raise RuntimeError(f"{method} {path} failed after {self.retries} attempts") from last_error

    # -- public API -------------------------------------------------------

    def get(self, path: str, params: Optional[dict] = None, use_cache: bool = True) -> Any:
        key = self._cache_key("GET", path, params)
        if use_cache:
            hit = self._cached(key)
            if hit is not None:
                return hit
        data = self._request("GET", path, params=params)
        if use_cache:
            self._cache[key] = CacheEntry(data, time.monotonic() + self.ttl)
        return data

    def post(self, path: str, body: dict) -> Any:
        result = self._request("POST", path, body=body)
        self.invalidate(path)
        return result

    def paginate(self, path: str, page_size: int = 100, **filters) -> Iterator[dict]:
        cursor = None
        while True:
            params = {"limit": page_size, **filters}
            if cursor:
                params["cursor"] = cursor
            page = self.get(path, params, use_cache=False)
            for item in page.get("items", []):
                yield item
            cursor = page.get("next_cursor")
            if not cursor:
                break


def sync_stock_levels(client: ApiClient, warehouse: str, threshold: int = 5) -> list[dict]:
    """Return items whose stock fell below \`threshold\` in the given warehouse."""
    low = []
    for item in client.paginate("/items", warehouse=warehouse):
        qty = item.get("quantity", 0)
        reserved = item.get("reserved", 0)
        if item.get("discontinued"):
            continue
        if qty - reserved < threshold:
            low.append({"sku": item["sku"], "available": qty - reserved})
    log.info("%d low-stock items in %s", len(low), warehouse)
    return low


def bulk_update_prices(client: ApiClient, changes: dict[str, float], dry_run: bool = False) -> dict:
    """Apply price changes in batches of 50; returns counts of updated / skipped / failed SKUs."""
    stats = {"updated": 0, "skipped": 0, "failed": 0}
    batch: list[dict] = []
    for sku, price in changes.items():
        if price is None or price < 0:
            stats["skipped"] += 1
            continue
        batch.append({"sku": sku, "price": round(price, 2)})
        if len(batch) == 50:
            _flush(client, batch, stats, dry_run)
            batch = []
    if batch:
        _flush(client, batch, stats, dry_run)
    return stats


def _flush(client: ApiClient, batch: list[dict], stats: dict, dry_run: bool) -> None:
    if dry_run:
        stats["updated"] += len(batch)
        return
    try:
        result = client.post("/items/prices", {"items": batch})
        stats["updated"] += result.get("updated", len(batch))
        stats["failed"] += len(result.get("errors", []))
    except ApiError as exc:
        log.error("price batch failed: %s", exc)
        stats["failed"] += len(batch)
`;


export const EXAMPLES: CodeExample[] = [
  { id: "clean", label: "Clean helpers", filename: "slugs.py", code: CLEAN },
  { id: "medium", label: "Inventory API client", filename: "inventory_client.py", code: MEDIUM },
  { id: "gnarly", label: "Gnarly billing module", filename: "order_processing.py", code: GNARLY },
];

export const DEFAULT_EXAMPLE = EXAMPLES[1];
