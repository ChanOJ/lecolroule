#!/usr/bin/env python3
"""Check the external links of the built website (dist/).

Every http(s) link of the HTML pages (href, src, data-src) is requested without
following redirects:
  - 2xx: OK;
  - 3xx: warning, with the final URL (update the link to it);
  - 4xx, 5xx, network errors: error.
Sites that block robots or require a login are only reported, never failing
(BOT_PROTECTED). Internal links are not checked here: Hugo fails the build on
an unknown page or image.

Writes a Markdown report to $GITHUB_STEP_SUMMARY when set. Exits 1 on errors
(and on redirects too with --strict). Standard library only (Python >= 3.9).

Usage:
  hugo && python3 scripts/check_links.py [--strict]
"""

from __future__ import annotations

import argparse
import html
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"

# Never checked: our own site (pages not live yet before a deployment), embeds
# and third-party scripts that only work inside a page.
IGNORED = [
    "lecolroule.fr",
    "www.google.com/maps/embed",
    "www.googletagmanager.com",
    "www.google.com/recaptcha",
    "sibforms.com/forms",
    "sibforms.com/serve",
    "assets.brevo.com",
    "cdn.mouseflow.com",
]

# Sites answering robots with 403/999 or a login/consent redirect: reported,
# never failing. Check them by hand from time to time.
BOT_PROTECTED = [
    "facebook.com",
    "linkedin.com",
    "blablacar.",
    "exoloisirs.com",
    "oura.com",
    "google.com/maps",
    "maps.app.goo.gl",
    "youtube.com",
]

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15"
# Attribute values may be unquoted: the HTML is minified.
LINK_RE = re.compile(r'''(?<![\w-])(?:href|src|data-src)=(?:"(https?://[^"]+)"|'(https?://[^']+)'|(https?://[^\s"'>]+))''')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


NO_REDIRECT = urllib.request.build_opener(NoRedirect)


def request(url: str, follow: bool):
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "fr,en;q=0.8",
    })
    opener = urllib.request.build_opener() if follow else NO_REDIRECT
    try:
        with opener.open(req, timeout=20) as r:
            return r.status, r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location") or ""


def check(url: str):
    """(category, detail): ok / redirect / error / protected."""
    # Up to 3 attempts on transient failures (network errors, 429, 5xx), so
    # that a site briefly down does not raise a false alarm.
    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            status, location = request(url, follow=False)
        except Exception as e:  # DNS, TLS, timeout...
            if attempt == attempts:
                return "error", f"{type(e).__name__}: {e}"
        else:
            if status != 429 and status < 500 or attempt == attempts:
                break
        time.sleep(5 * attempt)
    protected = any(p in url for p in BOT_PROTECTED)
    if 200 <= status < 300:
        return "ok", str(status)
    if 300 <= status < 400:
        if protected:
            return "protected", f"{status} → {location}"
        try:
            final_status, final = request(urllib.parse.urljoin(url, location), follow=True)
            return "redirect", f"{status} → {final} ({final_status})"
        except Exception:
            return "redirect", f"{status} → {location}"
    if protected:
        return "protected", str(status)
    return "error", str(status)


def collect() -> dict[str, set[str]]:
    """External URL -> pages using it."""
    links: dict[str, set[str]] = defaultdict(set)
    for page in sorted(DIST.rglob("*.html")):
        rel = "/" + page.relative_to(DIST).as_posix().removesuffix("index.html")
        for groups in LINK_RE.findall(page.read_text(encoding="utf-8")):
            url = html.unescape("".join(groups))
            if not any(i in url for i in IGNORED):
                links[url].add(rel)
    return links


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--strict", action="store_true", help="also fail on redirects")
    args = ap.parse_args()

    if not DIST.is_dir():
        sys.exit(f"{DIST} not found: run `hugo` first.")
    links = collect()
    with ThreadPoolExecutor(12) as pool:
        results = dict(zip(links, pool.map(check, links)))

    by_cat = defaultdict(list)
    for url, (cat, detail) in sorted(results.items()):
        by_cat[cat].append((url, detail))

    titles = {"error": "❌ Broken", "redirect": "↪️ Redirected (update the link)",
              "protected": "🔒 Not checkable (robots blocked or login), check by hand"}
    lines = ["## External links", "",
             f"{len(results)} links: " + ", ".join(f"{len(by_cat[c])} {c}" for c in ("ok", "redirect", "error", "protected"))]
    for cat in ("error", "redirect", "protected"):
        if by_cat[cat]:
            lines += ["", f"### {titles[cat]}", "", "| Link | Result | Pages |", "|---|---|---|"]
            lines += [f"| {u} | {d} | {', '.join(sorted(links[u]))} |" for u, d in by_cat[cat]]
    report = "\n".join(lines)
    print(report)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(report + "\n")

    failed = by_cat["error"] or (args.strict and by_cat["redirect"])
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
