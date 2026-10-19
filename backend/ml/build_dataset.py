"""Build the CodePulse training dataset from real open-source git history.

For each repository:
  1. Take a snapshot at SNAPSHOT_DATE (last commit before it on the main line).
  2. Extract static features from every non-test .py file in that snapshot.
  3. Walk the commits in the following LABEL_WINDOW and count, per file, the
     bug-fix commits that touched it (renames are followed forward).

Features come strictly from the past and defect counts strictly from the
future, so the label cannot leak into the features.

Usage:  python -m ml.build_dataset [--labels-only]   (expects clones in data/repos/)
"""

from __future__ import annotations

import os
import random
import re
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pandas as pd

from ml.features import NUMERIC_FEATURES, CodeParseError, extract_features

ROOT = Path(__file__).resolve().parent.parent
REPOS_DIR = ROOT / "data" / "repos"
OUT_CSV = ROOT / "data" / "dataset.csv"

SNAPSHOT_DATE = "2024-01-01"
WINDOW_END = "2026-01-01"
MAX_FILES_PER_REPO = 1500  # keeps very large repos from dominating
MIN_SLOC = 10
MAX_BYTES = 400_000
SEED = 42
TIP = "origin/HEAD"  # the remote default branch; HEAD itself is moved to the snapshot

FIX_RE = re.compile(
    r"\b(fix(e[sd]|ing)?|bug(s|fix)?|hotfix|regression|crash(es|ed)?|defect|fault|broken|incorrect|wrong)\b",
    re.IGNORECASE,
)
EXCLUDE_RE = re.compile(
    r"(^|/)(tests?|testing|docs?|examples?|benchmarks?|asv_bench|migrations|scripts|tools|ci|galleries)/"
    r"|(^|/)(test_[^/]*|[^/]*_tests?|conftest|setup|conf)\.py$"
)


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, errors="replace"
    ).stdout


def fix_counts(repo: Path, snap: str) -> tuple[dict[str, int], dict[str, int]]:
    """Return (bug-fix commit count, total commit count) per snapshot path.

    Rename detection is disabled: in a blobless clone it would download the
    contents of every changed file. Files renamed inside the window therefore
    lose the commits made after the rename (a documented limitation)."""
    log = git(
        repo, "log", "--reverse", "--no-merges", "--name-status", "--no-renames",
        f"--until={WINDOW_END}", "--format=%x01%s", f"{snap}..{TIP}",
    )
    fixes: dict[str, int] = {}
    total: dict[str, int] = {}
    for chunk in log.split("\x01")[1:]:
        lines = chunk.splitlines()
        is_fix = bool(FIX_RE.search(lines[0]))
        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            path = parts[-1]
            total[path] = total.get(path, 0) + 1
            if is_fix:
                fixes[path] = fixes.get(path, 0) + 1
    return fixes, total


def snapshot_commit(repo: Path) -> str:
    return git(repo, "rev-list", "-n1", "--first-parent", f"--before={SNAPSHOT_DATE}", TIP).strip()


def _features_for(args: tuple[str, str, str]) -> dict | None:
    repo_name, rel, abs_path = args
    try:
        if os.path.getsize(abs_path) > MAX_BYTES:
            return None
        source = Path(abs_path).read_text(encoding="utf-8", errors="strict")
        feats = extract_features(source)
    except (UnicodeDecodeError, CodeParseError, RecursionError, ValueError, MemoryError):
        return None
    if feats.numeric["sloc"] < MIN_SLOC:
        return None
    return {"repo": repo_name, "path": rel, **feats.numeric, "tokens": feats.tokens}


def process_repo(repo: Path, pool: ProcessPoolExecutor) -> pd.DataFrame:
    snap = snapshot_commit(repo)
    print(f"[{repo.name}] snapshot {snap[:10]} — checking out", flush=True)
    git(repo, "checkout", "-q", "--detach", "--force", snap)

    paths = [p for p in git(repo, "ls-tree", "-r", "--name-only", snap).splitlines()
             if p.endswith(".py") and not EXCLUDE_RE.search(p)]
    rng = random.Random(SEED)
    if len(paths) > MAX_FILES_PER_REPO:
        paths = sorted(rng.sample(paths, MAX_FILES_PER_REPO))

    rows = [r for r in pool.map(_features_for, [(repo.name, p, str(repo / p)) for p in paths], chunksize=16) if r]
    fixes, total = fix_counts(repo, snap)
    df = pd.DataFrame(rows)
    df["fix_commits"] = df["path"].map(lambda p: fixes.get(p, 0))
    df["total_commits"] = df["path"].map(lambda p: total.get(p, 0))
    print(f"[{repo.name}] {len(df)} files, {int((df.fix_commits > 0).sum())} with ≥1 fix", flush=True)
    return df


def relabel() -> None:
    """Recompute fix/commit counts for an existing dataset without re-extracting features."""
    df = pd.read_csv(OUT_CSV, keep_default_na=False)
    for name, idx in df.groupby("repo").groups.items():
        repo = REPOS_DIR / name
        fixes, total = fix_counts(repo, snapshot_commit(repo))
        df.loc[idx, "fix_commits"] = df.loc[idx, "path"].map(lambda p: fixes.get(p, 0))
        df.loc[idx, "total_commits"] = df.loc[idx, "path"].map(lambda p: total.get(p, 0))
        sub = df.loc[idx]
        print(f"[{name}] {len(sub)} files, {int((sub.fix_commits > 0).sum())} with ≥1 fix", flush=True)
    df.to_csv(OUT_CSV, index=False)
    print(f"Relabelled {len(df)} rows in {OUT_CSV}")


def main() -> None:
    repos = sorted(p for p in REPOS_DIR.iterdir() if (p / ".git").exists())
    if not repos:
        sys.exit(f"No repositories found in {REPOS_DIR}")
    if "--labels-only" in sys.argv:
        relabel()
        return
    with ProcessPoolExecutor() as pool:
        frames = [process_repo(r, pool) for r in repos]
    df = pd.concat(frames, ignore_index=True)
    cols = ["repo", "path", *NUMERIC_FEATURES, "fix_commits", "total_commits", "tokens"]
    df[cols].to_csv(OUT_CSV, index=False)
    print(f"Wrote {len(df)} rows to {OUT_CSV}")


if __name__ == "__main__":
    main()
