"""SQLite persistence for past scans."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "scans.db"


class ScanStore:
    def __init__(self, path: Path = DB_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS scans (
                    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, filename TEXT,
                    risk_score REAL NOT NULL, risk_level TEXT NOT NULL, model TEXT NOT NULL,
                    loc INTEGER NOT NULL, result TEXT NOT NULL)"""
            )

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def save(self, result: dict) -> None:
        loc = next((m["value"] for m in result["metrics"] if m["key"] == "loc"), 0)
        with self._conn() as c:
            c.execute(
                "INSERT INTO scans VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (result["id"], result["created_at"], result["filename"], result["risk_score"],
                 result["risk_level"], result["model"]["key"], int(loc), json.dumps(result)),
            )

    def list(self, limit: int = 20) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, created_at, filename, risk_score, risk_level, model, loc FROM scans "
                "ORDER BY created_at DESC, rowid DESC LIMIT ?", (limit,)
            ).fetchall()
        keys = ["id", "created_at", "filename", "risk_score", "risk_level", "model", "loc"]
        return [dict(zip(keys, r)) for r in rows]

    def get(self, scan_id: str) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT result FROM scans WHERE id = ?", (scan_id,)).fetchone()
        return json.loads(row[0]) if row else None
