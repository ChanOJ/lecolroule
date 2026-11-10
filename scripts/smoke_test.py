#!/usr/bin/env python3
"""Smoke test of a deployed environment of the website (Hugo layout).

Checks the language home pages and a deep page per language, the root redirect
by browser language and by language cookie (language menu), the 301 of every legacy /valloire/... URL
(infra/legacy_redirects.json), HTTP -> HTTPS, the 404 page, security headers
and environment-specific rules (noindex and analytics on test, no noindex on
prod). Optionally:
  --expect-repo-content  every page of the build (dist/) must be served
                         byte-identical by the CDN (run right after a
                         deployment: proves both the upload and the purge);
  --redirect-domains     the alternative domains (Infomaniak web redirection)
                         must answer 301 to the prod site.

Writes a Markdown report to $GITHUB_STEP_SUMMARY when set, exits 1 on failure.
Standard library only (Python >= 3.9).

Usage:
  hugo && python3 scripts/smoke_test.py --env test --expect-repo-content
  python3 scripts/smoke_test.py --env prod --redirect-domains
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

HOSTS = {"test": "test.lecolroule.fr", "prod": "www.lecolroule.fr"}

# Alternative domains redirected to the prod site by Infomaniak, and the
# targets accepted for them (the former home page still 301s to /fr/).
REDIRECT_DOMAINS = ["lecolroule.fr", "lecolroule.com", "lecolroulé.com", "lecolroulé.fr"]
REDIRECT_TARGETS = ["https://www.lecolroule.fr/", "https://www.lecolroule.fr/valloire/"]

# Language home pages and one deep page per language.
PAGES = {
    "/fr/": "fr",
    "/en/": "en",
    "/nl/": "nl",
    "/de/": "de",
    "/it/": "it",
    "/fr/appartement-valloire/": "fr",
    "/en/valloire-apartment/": "en",
    "/nl/appartement-valloire/": "nl",
    "/de/ferienwohnung-valloire/": "de",
    "/it/appartamento-valloire/": "it",
}
# Root redirect: Accept-Language header -> expected language (None: no header).
ROOT_LANGUAGES = {
    "fr-FR,fr;q=0.9,en;q=0.8": "fr",
    "fr-BE,fr;q=0.9": "fr",
    "en-GB,en;q=0.9": "en",
    "nl-BE,nl;q=0.9,fr;q=0.8": "nl",
    "de-CH,de;q=0.9": "de",
    "it-IT,it;q=0.9": "it",
    "es-ES,es;q=0.9": "en",
    # First language wins, other accepted languages only as a fallback.
    "en-GB,en;q=0.9,fr;q=0.8": "en",
    "it-IT,it;q=0.9,de;q=0.8": "it",
    "es-ES,es;q=0.9,de;q=0.8": "de",
    None: "en",
}
# Root redirect with the language menu cookie: (Cookie, Accept-Language) ->
# expected language. The cookie prevails; an unknown value is ignored.
ROOT_COOKIES = {
    ("lcr_lang=fr", "en-GB,en;q=0.9"): "fr",
    ("lcr_lang=en", "fr-FR,fr;q=0.9"): "en",
    ("_ga=GA1.1.1; lcr_lang=fr", None): "fr",
    ("lcr_lang=xx", "fr-FR,fr;q=0.9"): "fr",
    ("lcr_lang=it", "de-CH,de;q=0.9"): "it",
}

ANALYTICS_SOURCES = ["googletagmanager.com", "google-analytics.com", "analytics.google.com"]

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"
LEGACY_REDIRECTS = REPO_ROOT / "infra" / "legacy_redirects.json"
USER_AGENT = "lecolroule-smoke-test"


class Response:
    def __init__(self, status: int, headers: http.client.HTTPMessage, body: bytes):
        self.status, self.headers, self.body = status, headers, body

    def header(self, name: str) -> str:
        return self.headers.get(name, "")


def fetch(url: str, headers: dict | None = None) -> Response:
    """GET without following redirects; TLS certificates are verified."""
    u = urllib.parse.urlsplit(url)
    conn_cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(u.hostname.encode("idna").decode(), u.port, timeout=20)
    path = (u.path or "/") + (f"?{u.query}" if u.query else "")
    try:
        conn.request("GET", path, headers={"User-Agent": USER_AGENT, "Accept": "*/*", **(headers or {})})
        r = conn.getresponse()
        return Response(r.status, r.headers, r.read())
    finally:
        conn.close()


class Report:
    def __init__(self, title: str):
        self.title, self.rows, self.failed = title, [], 0

    def check(self, name: str, fn) -> None:
        try:
            detail = fn() or ""
            ok = True
        except AssertionError as e:
            detail, ok = str(e), False
        except Exception as e:  # network errors, TLS errors...
            detail, ok = f"{type(e).__name__}: {e}", False
        self.failed += not ok
        self.rows.append((ok, name, detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""), flush=True)

    def write(self) -> None:
        passed = len(self.rows) - self.failed
        lines = [f"## {self.title}", "", f"**{passed}/{len(self.rows)} checks passed**", "",
                 "| | Check | Detail |", "|---|---|---|"]
        lines += [f"| {'✅' if ok else '❌'} | {name} | {detail.replace('|', '/')} |"
                  for ok, name, detail in self.rows]
        path = os.environ.get("GITHUB_STEP_SUMMARY")
        if path:
            with open(path, "a", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")


# ------------------------------------------------------------------------ checks

def expect_status(r: Response, status: int) -> None:
    assert r.status == status, f"HTTP {r.status}, expected {status}"


def expect_redirect(url: str, targets, status: int = 301, headers: dict | None = None):
    targets = [targets] if isinstance(targets, str) else targets

    def run():
        r = fetch(url, headers)
        expect_status(r, status)
        assert r.header("Location") in targets, f"Location {r.header('Location')!r}, expected {targets[0]!r}"
        return f"{status} → {r.header('Location')}"
    return run


def expect_page(url: str, lang: str):
    def run():
        r = fetch(url)
        expect_status(r, 200)
        assert re.search(rf'<html lang="?{lang}"?>'.encode(), r.body), f'no <html lang="{lang}">'
        return f"200, lang={lang}, {len(r.body)} bytes"
    return run


def expect_build_content(base: str, wait: int):
    """Every page of dist/ served byte-identical; retried while the purge propagates."""
    pages = sorted(p for p in DIST.rglob("index.html") if p.parent != DIST)
    assert pages, f"no page in {DIST}: run `hugo` first"

    def run():
        deadline = time.monotonic() + wait
        while True:
            differing = []
            for p in pages:
                path = "/" + p.parent.relative_to(DIST).as_posix() + "/"
                r = fetch(base + path)
                if r.status != 200 or r.body != p.read_bytes():
                    differing.append(f"{path} (HTTP {r.status})")
            if not differing:
                return f"{len(pages)} pages identical to the build"
            if time.monotonic() >= deadline:
                raise AssertionError("differs from the build: " + ", ".join(differing))
            time.sleep(5)
    return run


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--env", choices=sorted(HOSTS), required=True)
    ap.add_argument("--expect-repo-content", action="store_true",
                    help="every page of dist/ must be served identically (right after a deployment)")
    ap.add_argument("--redirect-domains", action="store_true",
                    help="also check the alternative domains redirections")
    ap.add_argument("--wait", type=int, default=90,
                    help="seconds to wait for the CDN to serve the new content (default 90)")
    args = ap.parse_args()

    host = HOSTS[args.env]
    base = f"https://{host}"
    report = Report(f"Smoke test of {args.env} ({host})")

    # Pages.
    for path, lang in PAGES.items():
        report.check(f"Page {path}", expect_page(base + path, lang))

    # Root: browser language (302), and HTTP -> HTTPS (301).
    for accept, lang in ROOT_LANGUAGES.items():
        headers = {"Accept-Language": accept} if accept else None
        report.check(f"Root, Accept-Language {accept or '(none)'}",
                     expect_redirect(f"{base}/", f"{base}/{lang}/", 302, headers))
    for (cookie, accept), lang in ROOT_COOKIES.items():
        headers = {"Cookie": cookie, **({"Accept-Language": accept} if accept else {})}
        report.check(f"Root, Cookie {cookie}, Accept-Language {accept or '(none)'}",
                     expect_redirect(f"{base}/", f"{base}/{lang}/", 302, headers))
    report.check("HTTP redirects to HTTPS", expect_redirect(f"http://{host}/fr/", f"{base}/fr/"))

    # Legacy URLs: 301 to their new address, unknown ones: 404.
    legacy = {k: v for k, v in json.loads(LEGACY_REDIRECTS.read_text()).items() if not k.startswith("_")}
    for new, olds in legacy.items():
        for old in olds:
            report.check(f"Legacy {old}", expect_redirect(base + old, base + new))
    report.check("Legacy URL with a query string",
                 expect_redirect(f"{base}/valloire/appartement?utm_source=x", f"{base}/fr/appartement-valloire/"))

    def legacy_unknown():
        r = fetch(f"{base}/valloire/unknown-page")
        expect_status(r, 404)
        return "404"
    report.check("Unknown legacy URL", legacy_unknown)

    def assets():
        # Every stylesheet, script, image and preloaded font referenced by a
        # page (fingerprinted URLs: their names change with their content).
        body = fetch(f"{base}/fr/appartement-valloire/").body.decode()
        # Attribute values may be unquoted: the HTML is minified.
        urls = sorted(set(m[0] or m[1] for m in re.findall(
            r'(?<![\w-])(?:href|src|data-src)=(?:"(/(?:css|js|images|webfonts)/[^"]+)"|(/(?:css|js|images|webfonts)/[^\s"\'>]+))', body)))
        assert urls, "no stylesheet, script or image found in the page"
        broken = [u for u in urls if fetch(base + u).status != 200]
        assert not broken, "not served: " + ", ".join(broken)
        return f"{len(urls)} files served"
    report.check("Stylesheets, scripts, images and fonts", assets)

    def not_found():
        r = fetch(f"{base}/fr/page-that-does-not-exist/")
        expect_status(r, 404)
        assert b"<title>Erreur 404" in r.body, "body is not 404.html"
        return "404 with 404.html"
    report.check("Unknown URL serves 404.html", not_found)

    if args.expect_repo_content:
        report.check("Pages match the build", expect_build_content(base, args.wait))

    # Headers (set by the "security_headers" edge rule).
    page = fetch(f"{base}/fr/")

    def headers():
        expected = {
            "Strict-Transport-Security": "max-age",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "same-origin",
            "Content-Security-Policy": "default-src",
        }
        missing = [h for h, v in expected.items() if v not in page.header(h)]
        assert not missing, "missing or wrong: " + ", ".join(missing)
        return ", ".join(expected)
    report.check("Security headers", headers)

    csp = page.header("Content-Security-Policy")
    robots = page.header("X-Robots-Tag")
    if args.env == "test":
        def noindex():
            assert "noindex" in robots, f"X-Robots-Tag {robots!r}"
            return robots
        report.check("Not indexed (X-Robots-Tag)", noindex)

        def no_analytics():
            found = [s for s in ANALYTICS_SOURCES if s in csp]
            assert not found, "analytics allowed by CSP: " + ", ".join(found)
            return "no analytics source in CSP"
        report.check("Analytics blocked", no_analytics)
    else:
        def indexed():
            assert "noindex" not in robots, f"X-Robots-Tag {robots!r} would deindex the site"
            return "no noindex"
        report.check("Indexable (no noindex)", indexed)

        def analytics():
            assert "googletagmanager.com" in csp, "Google Tag Manager not allowed by CSP"
            return "analytics allowed by CSP"
        report.check("Analytics allowed", analytics)

    if args.redirect_domains:
        for domain in REDIRECT_DOMAINS:
            for h in (domain, f"www.{domain}"):
                if h == HOSTS["prod"]:
                    continue  # the site itself, not a redirection
                for scheme in ("http", "https"):
                    report.check(f"{scheme}://{h}/", expect_redirect(f"{scheme}://{h}/", REDIRECT_TARGETS))

    report.write()
    print(f"\n{len(report.rows) - report.failed}/{len(report.rows)} checks passed.")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
