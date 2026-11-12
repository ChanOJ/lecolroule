#!/usr/bin/env python3
"""Synchronise the built website (Hugo output, dist/ by default) to a bunny.net storage zone.

- Source: every file of the build directory (--source, default dist/).
- Uploads only new or changed files (SHA-256 comparison).
- Deletes remote files that are not in the repository (orphans), except PROTECTED.
- Purges the pull zone cache when something changed.
- With --indexnow URL (prod only): notifies the search engines of the IndexNow
  protocol (Bing, Yandex, Naver, Seznam...; also read by AI assistants relying
  on Bing) of the pages added, changed or deleted.

Standard library only (Python >= 3.9).

Environment variables:
  BUNNY_STORAGE_ZONE      storage zone name
  BUNNY_STORAGE_PASSWORD  storage zone password (access key)
  BUNNY_STORAGE_ENDPOINT  e.g. https://uk.storage.bunnycdn.com (default: https://storage.bunnycdn.com)
  BUNNY_API_KEY           account API key (purge), optional with --dry-run / --no-purge
  BUNNY_PULLZONE_ID       numeric pull zone id, same
  DEPLOY_ENV              optional environment label shown in the summary (test, prod)

Usage:
  hugo && python3 scripts/deploy.py --dry-run   # show the plan without changing anything
  hugo && python3 scripts/deploy.py             # deploy and purge
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Files of the build directory never uploaded.
# The e-mail versions of the blog posts (newsletter) are only read by
# scripts/newsletter.py: not published.
SKIP = ["*.DS_Store", "*/email.html"]

# Remote paths never deleted, even if they are not in the repository
# (fnmatch patterns, e.g. "folder/*").
PROTECTED: list[str] = []

# IndexNow key: public, served at the site root as /<key>.txt (static/) to
# prove the site owns it.
INDEXNOW_KEY = "d0d3e0eb3f50e66fbba261e492f3d5f2"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
# Pages not worth notifying: the root language page and the 404 page (noindex).
INDEXNOW_SKIP = ["index.html", "404.html"]

# Guard: refuse to delete more than this share of the remote files
# (and at least MIN_DELETE_GUARD files) without --allow-mass-delete.
MAX_DELETE_RATIO = 0.25
MIN_DELETE_GUARD = 10

PARALLELISM = 8
RETRIES = 3

REPO_ROOT = Path(__file__).resolve().parent.parent


def log(msg: str) -> None:
    print(msg, flush=True)


def matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, p) for p in patterns)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest().upper()


# --------------------------------------------------------------------------- local

def local_files(source: Path) -> dict[str, Path]:
    """Every file of the build directory, keyed by its path relative to it."""
    if not source.is_dir():
        sys.exit(f"Build directory {source} not found: run `hugo` first.")
    return {
        p.relative_to(source).as_posix(): p
        for p in sorted(source.rglob("*"))
        if p.is_file() and not matches(p.name, SKIP)
        and not matches(p.relative_to(source).as_posix(), SKIP)
    }


# -------------------------------------------------------------------------- remote

class Storage:
    def __init__(self, endpoint: str, zone: str, password: str):
        # Only the scheme and host of the endpoint are used: the dashboard shows
        # "https://storage.bunnycdn.com/<zone>", and a zone name left in the
        # endpoint must never leak into another zone's URLs.
        parsed = urllib.parse.urlsplit(endpoint)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            sys.exit(f"Invalid BUNNY_STORAGE_ENDPOINT: expected https://<host>, got {endpoint!r}")
        self.base = f"{parsed.scheme}://{parsed.netloc}/{urllib.parse.quote(zone)}/"
        self.headers = {"AccessKey": password}

    def _request(self, method: str, rel: str, data: bytes | None = None,
                 extra_headers: dict | None = None) -> bytes:
        url = self.base + urllib.parse.quote(rel, safe="/")
        headers = {**self.headers, **(extra_headers or {})}
        for attempt in range(1, RETRIES + 1):
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")[:300]
                if e.code < 500 or attempt == RETRIES:
                    raise RuntimeError(f"{method} {rel} -> HTTP {e.code}: {body}") from None
            except urllib.error.URLError as e:
                if attempt == RETRIES:
                    raise RuntimeError(f"{method} {rel} -> {e.reason}") from None
            time.sleep(2 ** attempt)
        raise AssertionError("unreachable")

    def list_recursive(self) -> tuple[dict[str, str | None], set[str]]:
        """Return ({file_path: checksum}, {directory_paths})."""
        files: dict[str, str | None] = {}
        dirs: set[str] = set()
        stack = [""]
        while stack:
            d = stack.pop()
            entries = json.loads(self._request("GET", d) or b"[]")
            for e in entries:
                rel = d + e["ObjectName"]
                if e["IsDirectory"]:
                    dirs.add(rel)
                    stack.append(rel + "/")
                else:
                    checksum = e.get("Checksum")
                    files[rel] = checksum.upper() if checksum else None
        return files, dirs

    def upload(self, rel: str, path: Path, checksum: str) -> None:
        self._request("PUT", rel, data=path.read_bytes(), extra_headers={
            "Content-Type": "application/octet-stream",
            "Checksum": checksum,
        })

    def delete(self, rel: str) -> None:
        self._request("DELETE", rel)


def purge_pullzone(api_key: str, pullzone_id: str) -> None:
    url = f"https://api.bunny.net/pullzone/{urllib.parse.quote(pullzone_id)}/purgeCache"
    req = urllib.request.Request(url, data=b"", method="POST",
                                 headers={"AccessKey": api_key})
    try:
        urllib.request.urlopen(req, timeout=60).close()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Purge Pull Zone -> HTTP {e.code}: {e.read()[:300]!r}") from None


# ---------------------------------------------------------------------------- plan

def plan(local: dict[str, Path], remote: dict[str, str | None], remote_dirs: set[str]):
    local_sums = {rel: sha256_file(p) for rel, p in local.items()}
    uploads = sorted(rel for rel, s in local_sums.items() if remote.get(rel) != s)

    orphans = sorted(rel for rel in remote if rel not in local and not matches(rel, PROTECTED))

    # Remote directories without any local or protected file: deleted in one call.
    def dir_needed(d: str) -> bool:
        prefix = d + "/"
        return (any(r.startswith(prefix) for r in local)
                or any(r.startswith(prefix) and matches(r, PROTECTED) for r in remote)
                or matches(prefix, PROTECTED))

    orphan_dirs = sorted(d for d in remote_dirs if not dir_needed(d))
    # Keep only the top-level ones.
    orphan_dirs = [d for d in orphan_dirs
                   if not any(d.startswith(o + "/") for o in orphan_dirs if o != d)]
    loose_orphans = [f for f in orphans
                     if not any(f.startswith(d + "/") for d in orphan_dirs)]
    return local_sums, uploads, orphans, orphan_dirs, loose_orphans


def page_urls(site: str, rels: list[str]) -> list[str]:
    """URLs of the pages (".../index.html") among deployed paths."""
    return sorted(site.rstrip("/") + "/" + rel[: -len("index.html")]
                  for rel in rels
                  if rel.endswith("index.html") and rel not in INDEXNOW_SKIP)


def indexnow(site: str, urls: list[str]) -> str:
    """Submit URLs to IndexNow; returns a one-line result (never raises)."""
    host = urllib.parse.urlsplit(site).hostname
    body = json.dumps({"host": host, "key": INDEXNOW_KEY,
                       "keyLocation": f"{site.rstrip('/')}/{INDEXNOW_KEY}.txt",
                       "urlList": urls}).encode()
    req = urllib.request.Request(INDEXNOW_ENDPOINT, data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return f"IndexNow: {len(urls)} URL(s) submitted (HTTP {r.status})."
    except urllib.error.HTTPError as e:
        return f"IndexNow: HTTP {e.code} {e.reason} ({len(urls)} URL(s) not submitted)."
    except OSError as e:
        return f"IndexNow: {e} ({len(urls)} URL(s) not submitted)."


def summary(lines: list[str]) -> None:
    text = "\n".join(lines)
    log(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="do not change anything")
    ap.add_argument("--no-delete", action="store_true", help="do not delete orphans")
    ap.add_argument("--no-purge", action="store_true", help="do not purge the pull zone")
    ap.add_argument("--force-purge", action="store_true", help="purge even without changes")
    ap.add_argument("--source", type=Path, default=REPO_ROOT / "dist",
                    help="build directory to deploy (default: dist/)")
    ap.add_argument("--allow-mass-delete", action="store_true",
                    help="disable the guard on the number of deletions")
    ap.add_argument("--indexnow", metavar="SITE_URL",
                    help="notify IndexNow of the changed pages of this site (prod), "
                         "e.g. https://www.lecolroule.fr")
    args = ap.parse_args()

    env = os.environ
    try:
        zone = env["BUNNY_STORAGE_ZONE"]
        password = env["BUNNY_STORAGE_PASSWORD"]
    except KeyError as e:
        sys.exit(f"Missing environment variable: {e.args[0]}")
    endpoint = env.get("BUNNY_STORAGE_ENDPOINT") or "https://storage.bunnycdn.com"
    do_purge = not (args.dry_run or args.no_purge)
    if do_purge and not (env.get("BUNNY_API_KEY") and env.get("BUNNY_PULLZONE_ID")):
        sys.exit("BUNNY_API_KEY and BUNNY_PULLZONE_ID are required to purge "
                 "(or use --no-purge).")

    local = local_files(args.source)
    if not local:
        sys.exit("No local file to deploy: aborting.")
    if args.indexnow and f"{INDEXNOW_KEY}.txt" not in local:
        sys.exit(f"IndexNow key file {INDEXNOW_KEY}.txt missing from the build (static/).")

    storage = Storage(endpoint, zone, password)
    log(f"Listing storage zone {zone!r}...")
    remote, remote_dirs = storage.list_recursive()
    log(f"{len(local)} local files, {len(remote)} remote files.")

    local_sums, uploads, orphans, orphan_dirs, loose = plan(local, remote, remote_dirs)
    if args.no_delete:
        orphans, orphan_dirs, loose = [], [], []

    guard = max(MIN_DELETE_GUARD, int(len(remote) * MAX_DELETE_RATIO))
    if len(orphans) > guard and not args.allow_mass_delete:
        summary([f"**Aborted**: {len(orphans)} deletions planned (> {guard}).",
                 *[f"- `{o}`" for o in orphans],
                 "Run again with --allow-mass-delete if this is intended."])
        return 2

    label = env.get("DEPLOY_ENV")
    title = ("bunny.net deployment" + (f" to {label}" if label else "")
             + (" (dry run)" if args.dry_run else ""))
    lines = [f"## {title}", "",
             f"- Files to upload: **{len(uploads)}**",
             f"- Files to delete: **{len(orphans)}**"
             + (f" ({len(orphans) - len(loose)} through {len(orphan_dirs)} folder(s))"
                if orphan_dirs else ""),
             ""]
    lines += [f"- ⬆️ `{u}`" + ("" if u in remote else " (new)") for u in uploads]
    lines += [f"- 🗑️ `{d}/` (folder)" for d in orphan_dirs]
    lines += [f"- 🗑️ `{o}`" for o in loose]
    summary(lines)

    if args.dry_run:
        return 0

    with ThreadPoolExecutor(PARALLELISM) as pool:
        list(pool.map(lambda r: storage.upload(r, local[r], local_sums[r]), uploads))
        list(pool.map(storage.delete, loose))
    for d in orphan_dirs:
        storage.delete(d + "/")
    log("Storage zone up to date.")

    if do_purge and (uploads or orphans or args.force_purge):
        purge_pullzone(env["BUNNY_API_KEY"], env["BUNNY_PULLZONE_ID"])
        log("Pull zone cache purged.")
    elif do_purge:
        log("No change: no purge.")

    if args.indexnow:
        urls = page_urls(args.indexnow, uploads + orphans)
        if urls:
            result = indexnow(args.indexnow, urls)
            log(result)
            summary([f"- {result}"] + [f"  - {u}" for u in urls])
        else:
            log("IndexNow: no page changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
