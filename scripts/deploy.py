#!/usr/bin/env python3
"""Synchronise les fichiers versionnés du site vers une Storage Zone bunny.net.

- Source : les fichiers suivis par git (`git ls-files`), moins DEPLOY_EXCLUDE.
- Envoie uniquement les fichiers nouveaux ou modifiés (comparaison SHA-256).
- Supprime côté storage les fichiers absents du dépôt (orphelins), sauf PROTECTED.
- Purge le cache de la Pull Zone si quelque chose a changé.

Aucune dépendance hors bibliothèque standard (Python >= 3.9).

Variables d'environnement :
  BUNNY_STORAGE_ZONE      nom de la Storage Zone
  BUNNY_STORAGE_PASSWORD  mot de passe (clé d'accès) de la Storage Zone
  BUNNY_STORAGE_ENDPOINT  ex. https://uk.storage.bunnycdn.com (défaut : https://storage.bunnycdn.com)
  BUNNY_API_KEY           clé API du compte (purge) — facultative en --dry-run / --no-purge
  BUNNY_PULLZONE_ID       identifiant numérique de la Pull Zone — idem

Usage :
  python3 scripts/deploy.py --dry-run     # affiche le plan sans rien modifier
  python3 scripts/deploy.py               # déploie et purge
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Fichiers du dépôt qui ne font pas partie du site (motifs fnmatch, chemins relatifs).
DEPLOY_EXCLUDE = [
    ".gitignore",
    ".github/*",
    ".claude/*",
    "scripts/*",
    "CLAUDE.md",
    "README.md",
    "*.DS_Store",
]

# Chemins distants jamais supprimés, même s'ils n'existent pas dans le dépôt
# (motifs fnmatch, ex. "dossier/*").
PROTECTED: list[str] = []

# Garde-fou : refuse de supprimer plus que cette part des fichiers distants
# (et au moins MIN_DELETE_GUARD fichiers) sans --allow-mass-delete.
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

def local_files(allow_dirty: bool) -> dict[str, Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO_ROOT, check=True, capture_output=True
    ).stdout.decode()
    files = {}
    for rel in filter(None, out.split("\0")):
        if matches(rel, DEPLOY_EXCLUDE):
            continue
        p = REPO_ROOT / rel
        if p.is_file():  # ignore les fichiers supprimés mais pas encore commités
            files[rel] = p

    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", *files.keys()],
        cwd=REPO_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()
    if dirty and not allow_dirty:
        sys.exit(
            "Des fichiers du site ont des modifications non commitées :\n"
            f"{dirty}\nCommitez-les ou relancez avec --allow-dirty."
        )
    return files


# -------------------------------------------------------------------------- remote

class Storage:
    def __init__(self, endpoint: str, zone: str, password: str):
        endpoint = endpoint.rstrip("/")
        # Le dashboard affiche « https://storage.bunnycdn.com/<zone> » : accepte les deux formes.
        if endpoint.endswith("/" + zone):
            endpoint = endpoint[: -len(zone) - 1]
        self.base = f"{endpoint}/{urllib.parse.quote(zone)}/"
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
        """Renvoie ({chemin_fichier: checksum}, {chemins_dossiers})."""
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

    # Dossiers distants sans aucun fichier local ni protégé : supprimés d'un coup.
    def dir_needed(d: str) -> bool:
        prefix = d + "/"
        return (any(r.startswith(prefix) for r in local)
                or any(r.startswith(prefix) and matches(r, PROTECTED) for r in remote)
                or matches(prefix, PROTECTED))

    orphan_dirs = sorted(d for d in remote_dirs if not dir_needed(d))
    # Ne garde que les dossiers de plus haut niveau.
    orphan_dirs = [d for d in orphan_dirs
                   if not any(d.startswith(o + "/") for o in orphan_dirs if o != d)]
    loose_orphans = [f for f in orphans
                     if not any(f.startswith(d + "/") for d in orphan_dirs)]
    return local_sums, uploads, orphans, orphan_dirs, loose_orphans


def summary(lines: list[str]) -> None:
    text = "\n".join(lines)
    log(text)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="n'effectue aucune modification")
    ap.add_argument("--no-delete", action="store_true", help="ne supprime pas les orphelins")
    ap.add_argument("--no-purge", action="store_true", help="ne purge pas la Pull Zone")
    ap.add_argument("--force-purge", action="store_true", help="purge même sans changement")
    ap.add_argument("--allow-dirty", action="store_true",
                    help="autorise des modifications non commitées (usage local)")
    ap.add_argument("--allow-mass-delete", action="store_true",
                    help="désactive le garde-fou sur le nombre de suppressions")
    args = ap.parse_args()

    env = os.environ
    try:
        zone = env["BUNNY_STORAGE_ZONE"]
        password = env["BUNNY_STORAGE_PASSWORD"]
    except KeyError as e:
        sys.exit(f"Variable d'environnement manquante : {e.args[0]}")
    endpoint = env.get("BUNNY_STORAGE_ENDPOINT") or "https://storage.bunnycdn.com"
    do_purge = not (args.dry_run or args.no_purge)
    if do_purge and not (env.get("BUNNY_API_KEY") and env.get("BUNNY_PULLZONE_ID")):
        sys.exit("BUNNY_API_KEY et BUNNY_PULLZONE_ID sont requis pour la purge "
                 "(ou utilisez --no-purge).")

    local = local_files(args.allow_dirty)
    if not local:
        sys.exit("Aucun fichier local à déployer : abandon.")

    storage = Storage(endpoint, zone, password)
    log(f"Lecture de la Storage Zone « {zone} »…")
    remote, remote_dirs = storage.list_recursive()
    log(f"{len(local)} fichiers locaux, {len(remote)} fichiers distants.")

    local_sums, uploads, orphans, orphan_dirs, loose = plan(local, remote, remote_dirs)
    if args.no_delete:
        orphans, orphan_dirs, loose = [], [], []

    guard = max(MIN_DELETE_GUARD, int(len(remote) * MAX_DELETE_RATIO))
    if len(orphans) > guard and not args.allow_mass_delete:
        summary([f"**Abandon** : {len(orphans)} suppressions prévues (> {guard}).",
                 *[f"- `{o}`" for o in orphans],
                 "Relancez avec --allow-mass-delete si c'est voulu."])
        return 2

    title = "Déploiement bunny.net" + (" (dry-run)" if args.dry_run else "")
    lines = [f"## {title}", "",
             f"- Fichiers à envoyer : **{len(uploads)}**",
             f"- Fichiers à supprimer : **{len(orphans)}**"
             + (f" (dont {len(orphans) - len(loose)} via {len(orphan_dirs)} dossier(s))"
                if orphan_dirs else ""),
             ""]
    lines += [f"- ⬆️ `{u}`" + ("" if u in remote else " (nouveau)") for u in uploads]
    lines += [f"- 🗑️ `{d}/` (dossier)" for d in orphan_dirs]
    lines += [f"- 🗑️ `{o}`" for o in loose]
    summary(lines)

    if args.dry_run:
        return 0

    with ThreadPoolExecutor(PARALLELISM) as pool:
        list(pool.map(lambda r: storage.upload(r, local[r], local_sums[r]), uploads))
        list(pool.map(storage.delete, loose))
    for d in orphan_dirs:
        storage.delete(d + "/")
    log("Storage à jour.")

    if do_purge and (uploads or orphans or args.force_purge):
        purge_pullzone(env["BUNNY_API_KEY"], env["BUNNY_PULLZONE_ID"])
        log("Cache de la Pull Zone purgé.")
    elif do_purge:
        log("Aucun changement : pas de purge.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
