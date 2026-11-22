#!/usr/bin/env python3
"""Publish a blog post as an "Update" on the Google Business Profile listing.

Only the French post is published (the listing is in French). The text is the
post's Markdown turned into plain text (at most 1500 characters, no link: the
API refuses URLs in the text), the photo is the first image of the post's
e-mail version (dist/fr/blog/<post>/email.html, an absolute prod URL), and a
"Learn more" button points to the post on the prod blog page.

Modes:
  test (default)  checks the credentials, finds the listing and prints what
                  would be published; nothing is posted;
  send            publishes it. Refused when the post is not on the prod blog
                  page yet (its image and link would be broken), and skipped
                  when the listing already has a post with that button link.
  --login         one-time: asks Google for the refresh token (opens a browser,
                  log in as the owner of the listing, local server on 127.0.0.1).

Environment: GBP_CLIENT_ID, GBP_CLIENT_SECRET (OAuth client of type "Desktop
app", Google Cloud project "lecolroule"), GBP_REFRESH_TOKEN (from --login;
scope business.manage). Writes a Markdown report to $GITHUB_STEP_SUMMARY when set.
Standard library only (Python >= 3.9).

Usage:
  pass-cli run --env-file scripts/gbp.env -- python3 scripts/gbp_post.py --login
  hugo && pass-cli run --env-file scripts/gbp.env -- python3 scripts/gbp_post.py 2026-12-01-winter
  hugo && ... python3 scripts/gbp_post.py 2026-12-01-winter --send
"""

from __future__ import annotations

import argparse
import html
import http.server
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"
SITE = "https://www.lecolroule.fr"
LISTING = "Le Col Roulé"  # title of the listing (params.lodging.name)
SCOPE = "https://www.googleapis.com/auth/business.manage"
MAX_TEXT = 1500
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
LOCATIONS_URL = "https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations"
POSTS_URL = "https://mybusiness.googleapis.com/v4/{location}/localPosts"


def env(name: str) -> str:
    if not os.environ.get(name):
        sys.exit(f"Missing environment variable {name}.")
    return os.environ[name]


def call(method: str, url: str, token: str | None = None, body: dict | None = None,
         form: dict | None = None) -> dict:
    headers = {"accept": "application/json"}
    data = None
    if token:
        headers["authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        headers["content-type"] = "application/json"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(url, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"Google {method} {url.split('?')[0]}: HTTP {e.code} {e.read().decode()[:600]}")


def login() -> int:
    """Authorization code flow with a loopback redirect (OAuth client "Desktop app")."""
    client_id, client_secret = env("GBP_CLIENT_ID"), env("GBP_CLIENT_SECRET")
    state, result = secrets.token_urlsafe(16), {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if "code" in query or "error" in query:
                result.update({k: v[0] for k, v in query.items()})
            self.send_response(200)
            self.send_header("content-type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("Authorisation received: you can close this tab.".encode())

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{server.server_port}"
    url = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state})
    print("Opening the browser. If it does not open, visit:\n" + url)
    webbrowser.open(url)
    while not result:
        server.handle_request()
    if result.get("state") != state or "code" not in result:
        sys.exit(f"Authorisation failed: {result.get('error', 'unexpected answer')}")
    tokens = call("POST", TOKEN_URL, form={
        "code": result["code"], "client_id": client_id, "client_secret": client_secret,
        "redirect_uri": redirect, "grant_type": "authorization_code"})
    if "refresh_token" not in tokens:
        sys.exit("Google returned no refresh token (revoke the app at "
                 "https://myaccount.google.com/permissions and retry).")
    print("\nRefresh token (store it in Proton Pass `google-refresh-token` and in the "
          "GitHub secret GBP_REFRESH_TOKEN; never in a file of the repository):\n")
    print(tokens["refresh_token"])
    return 0


def access_token() -> str:
    return call("POST", TOKEN_URL, form={
        "client_id": env("GBP_CLIENT_ID"), "client_secret": env("GBP_CLIENT_SECRET"),
        "refresh_token": env("GBP_REFRESH_TOKEN"), "grant_type": "refresh_token"})["access_token"]


def find_location(token: str) -> str:
    """The v4 resource name (accounts/<id>/locations/<id>) of the listing."""
    found = []
    for account in call("GET", ACCOUNTS_URL, token).get("accounts", []):
        url = LOCATIONS_URL.format(account=account["name"]) + "?readMask=name,title&pageSize=100"
        for loc in call("GET", url, token).get("locations", []):
            if loc.get("title") == LISTING:
                found.append(f"{account['name']}/{loc['name']}")
    if len(found) != 1:
        sys.exit(f"Expected one listing titled {LISTING!r}, found {len(found)}.")
    return found[0]


def existing_links(token: str, location: str) -> set[str]:
    """Button links of the listing's existing posts."""
    links, page = set(), ""
    while True:
        res = call("GET", POSTS_URL.format(location=location) + "?pageSize=100" + page, token)
        links |= {p.get("callToAction", {}).get("url") for p in res.get("localPosts", [])}
        if not res.get("nextPageToken"):
            return links
        page = "&pageToken=" + urllib.parse.quote(res["nextPageToken"])


def plain_text(markdown: str) -> str:
    """Post Markdown as plain text: no link (the API refuses URLs), no shortcode."""
    text = re.sub(r"\{\{<.*?>\}\}", "", markdown)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\\\n", "\n", text)
    text = re.sub(r"(\*\*|__|\*|_)(\S.*?\S|\S)\1", r"\2", text)
    text = re.sub(r"^#+\s*", "", text, flags=re.M)
    text = re.sub(r"^\s*[-*]\s+", "• ", text, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def build_post(post: str) -> dict:
    source = REPO_ROOT / "content" / "blog" / f"{post}.fr.md"
    email = DIST / "fr" / "blog" / post / "email.html"
    if not source.is_file() or not email.is_file():
        sys.exit(f"{source} or {email} not found: run `hugo` first, and check the post name.")
    meta, body = re.fullmatch(r"---\n(.*?)\n---\n(.*)", source.read_text(encoding="utf-8"), re.S).groups()
    title = re.search(r'^title:\s*"?(.*?)"?\s*$', meta, re.M).group(1)
    text = f"{title}\n\n{plain_text(body)}"
    if len(text) > MAX_TEXT:
        cut = text[:MAX_TEXT - 1]
        text = cut[:max(cut.rfind("\n\n"), cut.rfind(". ") + 1)].rstrip() or cut
        text += "\n…"
    summary = {
        "languageCode": "fr", "topicType": "STANDARD", "summary": text,
        "callToAction": {"actionType": "LEARN_MORE", "url": f"{SITE}/fr/blog/#{post}"},
    }
    image = re.search(r'<img src="(https://[^"]+)"', html.unescape(email.read_text(encoding="utf-8")))
    if image:
        summary["media"] = [{"mediaFormat": "PHOTO", "sourceUrl": image.group(1)}]
    return summary


def on_prod(post: str) -> bool:
    req = urllib.request.Request(f"{SITE}/fr/blog/", headers={"User-Agent": "lecolroule-gbp"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return f'id="{post}"'.encode() in r.read()
    except urllib.error.URLError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("post", nargs="?", help="post file name without language and extension, e.g. 2026-12-01-winter")
    ap.add_argument("--send", action="store_true", help="publish (default: check and print only)")
    ap.add_argument("--login", action="store_true", help="one-time: get the refresh token")
    args = ap.parse_args()
    if args.login:
        return login()
    if not args.post:
        ap.error("the post name is required")

    payload = build_post(args.post)
    lines = [f"## Google Business Profile: {args.post} ({'send' if args.send else 'test'})", ""]
    if args.send and not on_prod(args.post):
        sys.exit(f"The post is not on {SITE}/fr/blog/ yet: deploy prod first.")
    token = access_token()
    location = find_location(token)
    link = payload["callToAction"]["url"]
    if link in existing_links(token, location):
        line = f"- Already posted on {location} (button link {link}): nothing to do."
    elif args.send:
        res = call("POST", POSTS_URL.format(location=location), token, payload)
        line = f"- Published on {location}: {res.get('name')} ({len(payload['summary'])} characters)."
    else:
        line = (f"- Test only, {location} found. Would publish ({len(payload['summary'])} characters, "
                f"photo {payload.get('media', [{}])[0].get('sourceUrl', 'none')}):\n\n"
                + "\n".join("  > " + t for t in payload["summary"].splitlines()))
    print(line)
    lines.append(line)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
