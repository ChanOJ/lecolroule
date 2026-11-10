#!/usr/bin/env python3
"""Smoke test of a deployed environment of the website.

Checks pages, deep links, the root redirect, the 404 page, security headers
and environment-specific rules (noindex and analytics on test, no noindex on
prod). Optionally:
  --expect-repo-content  the HTML served by the CDN must be byte-identical to
                         the files of the current checkout (run right after a
                         deployment: proves both the upload and the purge);
  --redirect-domains     the alternative domains (Infomaniak web redirection)
                         must answer 301 to https://www.lecolroule.fr/valloire/.

Writes a Markdown report to $GITHUB_STEP_SUMMARY when set, exits 1 on failure.
Standard library only (Python >= 3.9).

Usage:
  python3 scripts/smoke_test.py --env test --expect-repo-content
  python3 scripts/smoke_test.py --env prod --redirect-domains
"""

from __future__ import annotations

import argparse
import http.client
import os
import sys
import time
import urllib.parse
from pathlib import Path

HOSTS = {"test": "test.lecolroule.fr", "prod": "www.lecolroule.fr"}
PROD_HOME = "https://www.lecolroule.fr/valloire/"

# Alternative domains redirected to the prod home page by Infomaniak.
REDIRECT_DOMAINS = ["lecolroule.fr", "lecolroule.com", "lecolroulé.com", "lecolroulé.fr"]

ANALYTICS_SOURCES = ["googletagmanager.com", "google-analytics.com", "analytics.google.com", "mouseflow.com"]

REPO_ROOT = Path(__file__).resolve().parent.parent
USER_AGENT = "lecolroule-smoke-test"


class Response:
    def __init__(self, status: int, headers: http.client.HTTPMessage, body: bytes):
        self.status, self.headers, self.body = status, headers, body

    def header(self, name: str) -> str:
        return self.headers.get(name, "")


def fetch(url: str) -> Response:
    """GET without following redirects; TLS certificates are verified."""
    u = urllib.parse.urlsplit(url)
    conn_cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(u.hostname.encode("idna").decode(), u.port, timeout=20)
    try:
        conn.request("GET", u.path or "/", headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
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


def expect_redirect(url: str, target: str):
    def run():
        r = fetch(url)
        expect_status(r, 301)
        assert r.header("Location") == target, f"Location {r.header('Location')!r}, expected {target!r}"
        return f"301 → {target}"
    return run


def expect_page(url: str, lang: str):
    def run():
        r = fetch(url)
        expect_status(r, 200)
        assert f'<html lang="{lang}">'.encode() in r.body, f'no <html lang="{lang}">'
        return f"200, lang={lang}, {len(r.body)} bytes"
    return run


def expect_repo_content(url: str, rel: str, wait: int):
    """Byte-identical to the checkout; retried while the CDN purge propagates."""
    expected = (REPO_ROOT / rel).read_bytes()

    def run():
        deadline = time.monotonic() + wait
        while True:
            r = fetch(url)
            if r.status == 200 and r.body == expected:
                return f"identical to {rel}"
            if time.monotonic() >= deadline:
                assert r.status == 200, f"HTTP {r.status}"
                raise AssertionError(f"differs from {rel} ({len(r.body)} vs {len(expected)} bytes)")
            time.sleep(5)
    return run


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--env", choices=sorted(HOSTS), required=True)
    ap.add_argument("--expect-repo-content", action="store_true",
                    help="served HTML must match the checkout (right after a deployment)")
    ap.add_argument("--redirect-domains", action="store_true",
                    help="also check the alternative domains redirections")
    ap.add_argument("--wait", type=int, default=90,
                    help="seconds to wait for the CDN to serve the new content (default 90)")
    args = ap.parse_args()

    host = HOSTS[args.env]
    base = f"https://{host}"
    home = f"{base}/valloire/"
    report = Report(f"Smoke test of {args.env} ({host})")

    # Pages and routing (edge rules + client-side routing).
    report.check("FR home page", expect_page(home, "fr"))
    report.check("EN home page", expect_page(f"{base}/valloire/en/", "en"))
    report.check("FR deep link /valloire/appartement", expect_page(f"{base}/valloire/appartement", "fr"))
    report.check("EN deep link /valloire/en/apartment", expect_page(f"{base}/valloire/en/apartment", "en"))
    report.check("Root redirects to /valloire/", expect_redirect(f"{base}/", home))
    report.check("HTTP redirects to HTTPS", expect_redirect(f"http://{host}/valloire/", home))

    def asset():
        r = fetch(f"{base}/assets/css/main.css")
        expect_status(r, 200)
        assert r.header("Content-Type").startswith("text/css"), f"Content-Type {r.header('Content-Type')!r}"
        return "200 text/css"
    report.check("Stylesheet", asset)

    def not_found():
        r = fetch(f"{base}/404.html")
        expect_status(r, 404)
        assert b'name="error"' in r.body, "body is not error.html"
        return "404 with error.html"
    report.check("Unknown URL serves error.html", not_found)

    if args.expect_repo_content:
        report.check("FR page matches the repository",
                     expect_repo_content(home, "valloire/indexfr.html", args.wait))
        report.check("EN page matches the repository",
                     expect_repo_content(f"{base}/valloire/en/", "valloire/indexen.html", args.wait))

    # Headers (set by the "security_headers" edge rule).
    page = fetch(home)

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
                    report.check(f"{scheme}://{h}/", expect_redirect(f"{scheme}://{h}/", PROD_HOME))

    report.write()
    print(f"\n{len(report.rows) - report.failed}/{len(report.rows)} checks passed.")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
