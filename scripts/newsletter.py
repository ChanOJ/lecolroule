#!/usr/bin/env python3
"""Send a blog post as the newsletter: one Brevo campaign per Brevo list.

The e-mail is the post's e-mail version built by Hugo
(dist/<lang>/blog/<post>/email.html, layouts/blog/page.email.html); subject
and preview text come from its <title> and <meta name="preview">. Lists,
sender and test address: params.newsletter in hugo.toml.

Modes:
  test (default)  create or update the campaigns (drafts) and send them as
                  test e-mails to the test address only;
  send            send them to their lists. Refused when the post is not on
                  the prod site yet (its links and images would be broken),
                  or when a campaign for this post was already sent.

Campaign name: "Blog <post> <lang>", e.g. "Blog 2026-12-01-winter fr": a test
run creates the draft, the send run updates and sends that same draft.

Environment: BREVO_API_KEY (campaigns read/write).
Writes a Markdown report to $GITHUB_STEP_SUMMARY when set.
Standard library only (Python >= 3.9).

Usage:
  hugo && python3 scripts/newsletter.py 2026-12-01-winter
  hugo && python3 scripts/newsletter.py 2026-12-01-winter --send
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST = REPO_ROOT / "dist"
API = "https://api.brevo.com/v3"
SITE = "https://www.lecolroule.fr"


def settings() -> dict:
    """params.newsletter of hugo.toml: its plain `key = value` lines (strings,
    integers), the [params.newsletter.lists] and
    [params.newsletter.unsubscribePages] tables as "lists" and
    "unsubscribePages" (no tomllib in Python 3.9)."""
    cfg, table = {"lists": {}, "unsubscribePages": {}}, None
    for line in (REPO_ROOT / "hugo.toml").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("["):
            table = line.strip("[]")
            continue
        m = re.fullmatch(r'(\w+)\s*=\s*(?:"([^"]*)"|(\d+))', line)
        if m and table == "params.newsletter":
            cfg[m[1]] = m[2] if m[2] is not None else int(m[3])
        elif m and table == "params.newsletter.lists":
            cfg["lists"][m[1]] = int(m[3])
        elif m and table == "params.newsletter.unsubscribePages" and m[2]:
            cfg["unsubscribePages"][m[1]] = m[2]
    return cfg


def brevo(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"api-key": os.environ["BREVO_API_KEY"], "accept": "application/json",
                 "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"Brevo {method} {path}: HTTP {e.code} {e.read().decode()[:500]}")


def campaigns_named(name: str) -> list[dict]:
    """Classic e-mail campaigns with this exact name (any status)."""
    found, offset = [], 0
    while True:
        page = brevo("GET", f"/emailCampaigns?type=classic&limit=100&offset={offset}"
                            "&excludeHtmlContent=true")
        items = page.get("campaigns") or []
        found += [c for c in items if c.get("name") == name]
        offset += len(items)
        if not items or offset >= page.get("count", 0):
            return found


def read_email(lang: str, post: str) -> tuple[str, str, str]:
    path = DIST / lang / "blog" / post / "email.html"
    if not path.is_file():
        sys.exit(f"{path} not found: run `hugo` first, and check the post name "
                 f"(content/blog/{post}.{lang}.md).")
    content = path.read_text(encoding="utf-8")
    subject = html.unescape(re.search(r"<title>(.*?)</title>", content, re.S).group(1)).strip()
    preview = html.unescape(re.search(r'<meta name="preview" content="([^"]*)"', content).group(1))
    return subject, preview, content


def on_prod(lang: str, post: str) -> bool:
    """Is the post on the prod blog page of this language?"""
    req = urllib.request.Request(f"{SITE}/{lang}/blog/", headers={"User-Agent": "lecolroule-newsletter"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return f'id="{post}"'.encode() in r.read()
    except urllib.error.URLError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("post", help="post file name without language and extension, e.g. 2026-12-01-winter")
    ap.add_argument("--send", action="store_true", help="send to the lists (default: test e-mails only)")
    args = ap.parse_args()
    if "BREVO_API_KEY" not in os.environ:
        sys.exit("Missing environment variable BREVO_API_KEY.")

    cfg = settings()
    sender = {"name": cfg["senderName"], "email": cfg["senderEmail"]}
    lines = [f"## Newsletter: {args.post} ({'send' if args.send else 'test'})", ""]

    plans = []
    for lang, list_id in cfg["lists"].items():
        subject, preview, content = read_email(lang, args.post)
        name = f"Blog {args.post} {lang}"
        existing = campaigns_named(name)
        if any(c.get("status") not in ("draft",) for c in existing):
            sys.exit(f"A campaign {name!r} was already sent or scheduled at Brevo: refusing.")
        if args.send and not on_prod(lang, args.post):
            sys.exit(f"The post is not on {SITE}/{lang}/blog/ yet: deploy prod first.")
        plans.append((lang, list_id, name, subject, preview, content, existing))

    for lang, list_id, name, subject, preview, content, existing in plans:
        campaign = {"name": name, "subject": subject, "previewText": preview, "sender": sender,
                    "htmlContent": content, "recipients": {"listIds": [list_id]}}
        # Unsubscribe page in the language of the list (else Brevo's default
        # page, in the language of the visitor's browser).
        if lang in cfg["unsubscribePages"]:
            campaign["unsubscriptionPageId"] = cfg["unsubscribePages"][lang]
        if existing:
            cid = existing[0]["id"]
            brevo("PUT", f"/emailCampaigns/{cid}", campaign)
            action = "updated"
        else:
            cid = brevo("POST", "/emailCampaigns", campaign)["id"]
            action = "created"
        if args.send:
            brevo("POST", f"/emailCampaigns/{cid}/sendNow")
            done = f"sent to list #{list_id}"
        else:
            brevo("POST", f"/emailCampaigns/{cid}/sendTest", {"emailTo": [cfg["testEmail"]]})
            done = f"test e-mail sent to {cfg['testEmail']}"
        line = f"- **{lang}** « {subject} »: campaign #{cid} {action}, {done}"
        print(line)
        lines.append(line)

    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
