#!/usr/bin/env python3
"""Airbnb rating and latest reviews of Le Col Roulé -> data/reviews.yaml -> the site.

Runs on the owners' Mac (LaunchAgent, every day at 20:00; see README.md,
"Airbnb reviews"), never on a server:

1. Reads the rating and the number of reviews on the public listing page
   (plain HTTP, no login). Same as data/reviews.yaml: stops there.
2. Otherwise opens the host back office (headless Chromium, its own profile in
   ~/Library/Application Support/lecolroule-reviews/profile, where Airbnb
   keeps the session) and reads the latest reviews in their original
   language: first name, stay, stars, text. The script never logs in: when
   the session has ended it says so (macOS notification) and stops; log in
   again by hand with --login (Airbnb sends a code by SMS to a new device).
3. New or changed reviews: their language and their translations into the
   other languages of the site, by the Claude API. Credentials: the `ant`
   CLI login of the Mac (`ant auth login`, once), which the SDK renews by
   itself; when it ends, a notification asks to log in again. No API key.
4. Writes data/reviews.yaml in a clone of the repository of its own
   (~/Library/Application Support/lecolroule-reviews/repo), checks that the
   site builds (hugo --panicOnWarning), opens a pull request, merges it, waits
   for the automatic test deployment, then deploys to prod and waits for it.
5. A macOS notification says what happened; everything is logged to
   ~/Library/Logs/lecolroule-reviews.log.

Usage (from the repository):
  <venv>/bin/python scripts/airbnb/reviews.py --update
  options: --dry-run (no pull request or deployment: writes the YAML in the
  clone and prints the diff), --force (reads the back office even when the
  public listing is unchanged)
  <venv>/bin/python scripts/airbnb/reviews.py --login   (log in by hand, once)
<venv> is ~/Library/Application Support/lecolroule-reviews/venv (Playwright,
PyYAML, anthropic).
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import yaml
from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

LISTING = "https://www.airbnb.fr/rooms/48075207"
BACK_OFFICE = "https://www.airbnb.fr/performance/quality/overall/reviews?ds-start=-60&ds-end=0"
REPO_URL = "https://github.com/ChanOJ/lecolroule.git"
GH_REPO = "ChanOJ/lecolroule"
HOME = Path.home() / "Library" / "Application Support" / "lecolroule-reviews"
PROFILE = HOME / "profile"
DEBUG = HOME / "debug"
CLONE = HOME / "repo"
LOG = Path.home() / "Library" / "Logs" / "lecolroule-reviews.log"
DATA = "data/reviews.yaml"
LANGS = ["fr", "en", "nl", "de", "it"]
SHOWN = 4  # reviews shown on the home page
MODEL = "claude-opus-5-5"

log = logging.getLogger("reviews")


class Stop(Exception):
    """Ends the run with a notification (not an error of the script itself)."""


# ------------------------------------------------------------ notifications

def notify(message: str) -> None:
    log.info("notification: %s", message)
    text = message.replace("\\", "\\\\").replace('"', '\\"')
    subprocess.run(["osascript", "-e", f'display notification "{text}" with title "Le Col Roulé – avis Airbnb"'],
                   check=False)


# ------------------------------------------------------------ public listing

def public_listing() -> tuple[float, int]:
    """Rating and number of reviews of the public listing page (no login)."""
    request = urllib.request.Request(LISTING, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
                      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept-Language": "fr-FR,fr;q=0.9"})
    html = urllib.request.urlopen(request, timeout=30).read().decode("utf-8", "replace")
    rating = re.search(r'"starRating":([0-9.]+)', html)
    count = re.search(r'"reviewCount":([0-9]+)', html)
    if not rating or not count:
        raise Stop("note ou nombre d'avis introuvable sur la page publique de l'annonce (format changé ?)")
    return round(float(rating.group(1)), 2), int(count.group(1))


# ------------------------------------------------------------ back office

MONTHS = {"janv": 1, "févr": 2, "mars": 3, "avr": 4, "mai": 5, "juin": 6,
          "juil": 7, "août": 8, "sept": 9, "oct": 10, "nov": 11, "déc": 12}


def stay_end(stay: str) -> str:
    """Last day of a stay as the back office writes it ("30 août – 6 sept. 2026",
    "1–22 août 2026", "28 déc. 2026 – 3 janv. 2027"), ISO."""
    end = re.split(r"\s*[–-]\s*", stay)[-1].strip()
    m = re.match(r"(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})", end)
    if not m or m.group(2) not in MONTHS:
        raise Stop(f"date de séjour illisible dans le back-office : {stay!r}")
    return dt.date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1))).isoformat()


def parse_reviews(text: str) -> list[dict]:
    """Reviews of the back-office page text (newest first): each one is its
    first name, "<stay> • <listing>", "Qualité globale", "Évaluation de N sur 5",
    "N", the text (one or more lines), "Afficher les détails"."""
    # Airbnb writes non-breaking and narrow no-break spaces ("77 commentaires")
    lines = [re.sub(r"[\u00a0\u202f\u2009]", " ", l).strip() for l in text.splitlines()]
    start = next((i for i, l in enumerate(lines) if re.fullmatch(r"\d+ commentaires?", l)), None)
    if start is None:
        raise Stop("liste des avis introuvable dans le back-office (format changé ?)")
    reviews, i = [], start + 1
    while i + 4 < len(lines) and not lines[i].startswith("Affichage de la page"):
        name, stay = lines[i], lines[i + 1]
        stars = re.fullmatch(r"Évaluation de (\d) sur 5", lines[i + 3])
        if " • " not in stay or not stars:
            raise Stop(f"avis illisible dans le back-office près de {name!r} (format changé ?)")
        j, body = i + 5, []
        while j < len(lines) and lines[j] != "Afficher les détails":
            if lines[j]:
                body.append(lines[j])
            j += 1
        reviews.append({"name": name, "date": stay_end(stay.split(" • ")[0]),
                        "stars": int(stars.group(1)), "text": "\n".join(body)})
        i = j + 1
        while i < len(lines) and not lines[i]:
            i += 1
    if not reviews:
        raise Stop("aucun avis lu dans le back-office")
    return reviews


def settle(page, seconds: float = 4) -> None:
    """Airbnb never stops its network requests ("networkidle" never comes):
    the page loaded, then a few seconds for its scripts to draw it.
    Playwright's own wait: time.sleep() would block its events."""
    try:
        page.wait_for_load_state("load", timeout=30000)
    except PlaywrightTimeout:
        pass
    page.wait_for_timeout(seconds * 1000)


def on_back_office(page) -> bool:
    return "/performance/" in page.url and "login" not in page.url


def back_office_reviews() -> list[dict]:
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            str(PROFILE), headless=True, locale="fr-FR", timezone_id="Europe/Paris",
            viewport={"width": 1280, "height": 900})
        try:
            page = browser.pages[0] if browser.pages else browser.new_page()
            page.goto(BACK_OFFICE, wait_until="domcontentloaded", timeout=60000)
            settle(page, 6)
            DEBUG.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(DEBUG / "last-run.png"), full_page=True)
            text = page.inner_text("body")
            (DEBUG / "last-run.txt").write_text(page.url + "\n\n" + text, encoding="utf-8")
            if not on_back_office(page):
                raise Stop("session Airbnb terminée : relancez la connexion à la main (reviews.py --login)")
            return parse_reviews(text)
        finally:
            browser.close()


# ------------------------------------------------------------ translations

SCHEMA = {
    "type": "object",
    "properties": {
        "lang": {"type": "string", "description": "ISO 639-1 code of the language the review is written in"},
        "translations": {
            "type": "object",
            "properties": {l: {"type": "string"} for l in LANGS},
            "required": LANGS,
            "additionalProperties": False,
        },
    },
    "required": ["lang", "translations"],
    "additionalProperties": False,
}

INSTRUCTIONS = """\
You translate a guest review of "Le Col Roulé", a holiday rental flat in Valloire (French Alps), for the
multilingual website of the owners, Hélène and Charles. Return the language the review is written in
(ISO 639-1 code) and its translation into French (fr), English (en), Dutch (nl), German (de) and Italian (it);
for the language of the review itself, return the text unchanged.

Translate faithfully: same meaning, tone and length, natural wording, no additions or comments. Keep
names, place names and emoticons. When the text ends with "…" (cut), end the translation with "…" too.
English: British spelling; "flat" for the apartment. Dutch: neutral Dutch, also fine for Flanders.
German: Swiss spelling (always "ss", never "ß"), fine for Germany and Austria too.
Stay faithful to the original wording, including its grammatical genders: no rewording for style.
Keep local activity names the reader may not know (e.g. "ruisseling") but make them clear in context."""


def translate(client, text: str) -> dict:
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        system=INSTRUCTIONS,
        messages=[{"role": "user", "content": text}],
    )
    if response.stop_reason == "refusal":
        raise Stop("traduction refusée par l'API Claude : avis non publié")
    if response.stop_reason == "max_tokens":
        raise Stop("traduction coupée (max_tokens) : avis non publié")
    result = json.loads(next(b.text for b in response.content if b.type == "text"))
    lang = result["lang"].lower()[:2]
    return {"lang": lang, "translations": {l: t for l, t in result["translations"].items() if l != lang}}


# ------------------------------------------------------------ YAML

HEADER = """\
# Airbnb rating and latest reviews, shown at the bottom of the home page
# (layouts/_partials/reviews.html). Updated by scripts/airbnb/reviews.py on the
# owners' Mac (see README.md, "Airbnb reviews"), or by hand: the original texts
# are in the host back office
#   https://www.airbnb.fr/performance/quality/overall/reviews?ds-start=-60&ds-end=0
# and the rating and the number of reviews on the listing page.
#
# Each review: the guest's first name only (no photo), the last day of the
# stay, the stars, the language it was written in (`lang`), its original `text`,
# and its translation into each other language of the site (`translations`).
# The page shows the text of its language, shortened.
"""


class Dumper(yaml.SafeDumper):
    """The layout of the file written by hand: list items indented under their key."""

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def _str(dumper, value):
    """Keys, codes, names and dates plain (as written by hand), texts in double quotes."""
    if re.fullmatch(r"[A-Za-zÀ-ÿ][\w-]*|\d{4}-\d{2}-\d{2}", value):
        return dumper.represent_scalar("tag:yaml.org,2002:str", value)
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style='"')


Dumper.add_representer(str, _str)


def write_yaml(path: Path, data: dict) -> None:
    body = yaml.dump(data, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=10000)
    path.write_text(HEADER + body, encoding="utf-8")


def merge(current: dict, rating: float, count: int, latest: list[dict], client) -> dict:
    """The new content of the YAML: the latest reviews, with the translations
    kept for those already there with the same text and stars, asked for the
    others (a new review, or a longer or edited text: the back office's text
    always wins)."""
    known = {(r["name"], str(r["date"])): r for r in current.get("reviews", [])}
    reviews = []
    for r in latest[:SHOWN]:
        old = known.get((r["name"], r["date"]))
        if old and old.get("translations") and old.get("stars") == r["stars"] and old.get("text") == r["text"]:
            reviews.append(old)
            continue
        log.info("translating the review of %s (%s)", r["name"], r["date"])
        t = translate(client, r["text"])
        reviews.append({"name": r["name"], "date": r["date"], "stars": r["stars"],
                        "lang": t["lang"], "text": r["text"], "translations": t["translations"]})
    for r in reviews:  # dates written plain (YAML dates), as by hand
        r["date"] = dt.date.fromisoformat(str(r["date"]))
    return {"updated": dt.date.today(), "rating": rating, "count": count, "reviews": reviews}


def same_content(a: dict, b: dict) -> bool:
    strip = lambda d: {k: v for k, v in d.items() if k != "updated"}
    norm = lambda d: json.loads(json.dumps(strip(d), default=str))
    return norm(a) == norm(b)


# ------------------------------------------------------------ git, GitHub

def run(*cmd: str, cwd: Path = CLONE, capture: bool = True) -> str:
    log.info("$ %s", " ".join(cmd))
    out = subprocess.run(cmd, cwd=cwd, check=True, text=True, capture_output=capture)
    return (out.stdout or "").strip()


def fresh_clone() -> None:
    """The clone of the script, on an up-to-date main (never the working copy)."""
    if not (CLONE / ".git").exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        run("git", "clone", "--quiet", REPO_URL, str(CLONE), cwd=HOME)
    run("git", "fetch", "--quiet", "origin")
    run("git", "checkout", "--quiet", "main")
    run("git", "reset", "--quiet", "--hard", "origin/main")
    run("git", "clean", "-qfd")


def wait_run(workflow: str, event: str, sha: str, timeout: int = 1800) -> None:
    """Waits for the run of a workflow on a commit, and its success."""
    deadline = time.monotonic() + timeout
    run_id = None
    while time.monotonic() < deadline:
        runs = json.loads(run("gh", "run", "list", "--repo", GH_REPO, "--workflow", workflow, "--event", event,
                              "--limit", "10", "--json", "databaseId,headSha,status,conclusion"))
        match = [r for r in runs if r["headSha"] == sha]
        if match:
            run_id = match[0]["databaseId"]
            if match[0]["status"] == "completed":
                if match[0]["conclusion"] != "success":
                    raise Stop(f"le déploiement ({workflow}, {event}) a échoué : voir GitHub Actions, run {run_id}")
                return
        time.sleep(20)
    raise Stop(f"le déploiement ({workflow}, {event}) n'a pas fini à temps (run {run_id})")


def publish(summary: str) -> None:
    branch = f"reviews-{dt.datetime.now():%Y%m%d-%H%M}"
    run("git", "checkout", "--quiet", "-b", branch)
    run("git", "add", DATA)
    run("git", "commit", "--quiet", "-m", f"Reviews: {summary}\n\nUpdated by scripts/airbnb/reviews.py.")
    run("git", "push", "--quiet", "-u", "origin", branch)
    url = run("gh", "pr", "create", "--repo", GH_REPO, "--base", "main", "--head", branch,
              "--title", f"Reviews: {summary}",
              "--body", f"Airbnb rating and latest reviews, updated by `scripts/airbnb/reviews.py` "
                        f"on the owners' Mac: {summary}.\n\nThe site builds with `hugo --panicOnWarning`.")
    run("gh", "pr", "merge", url, "--merge", "--delete-branch")
    run("git", "fetch", "--quiet", "origin")
    sha = run("git", "rev-parse", "origin/main")
    log.info("merged %s as %s: waiting for the test deployment", url, sha)
    wait_run("deploy.yml", "push", sha)
    run("gh", "workflow", "run", "deploy.yml", "--repo", GH_REPO, "--ref", "main",
        "-f", "environment=prod", "-f", "dry_run=false")
    time.sleep(10)
    wait_run("deploy.yml", "workflow_dispatch", sha)


# ------------------------------------------------------------ main

def update(dry_run: bool, force: bool) -> int:
    rating, count = public_listing()
    fresh_clone()
    path = CLONE / DATA
    current = yaml.safe_load(path.read_text(encoding="utf-8"))
    log.info("public listing: %s, %d reviews; site: %s, %d", rating, count, current.get("rating"), current.get("count"))
    if not force and current.get("rating") == rating and current.get("count") == count:
        log.info("unchanged: nothing to do")
        return 0
    latest = back_office_reviews()
    import anthropic
    try:
        # no argument: the `ant auth login` profile of the Mac (renewed by the SDK)
        new = merge(current, rating, count, latest, anthropic.Anthropic())
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
        raise Stop("connexion à l'API Claude refusée : relancez `ant auth login` dans un terminal") from e
    if same_content(current, new):
        log.info("same reviews and rating as the site: nothing to do")
        return 0
    write_yaml(path, new)
    run("hugo", "--quiet", "--panicOnWarning", "-d", str(HOME / "build"))
    added = [r["name"] for r in new["reviews"] if (r["name"], r["date"]) not in
             {(o["name"], str(o["date"])) for o in current.get("reviews", [])}]
    summary = f"{lang_number(rating)} ({count} reviews)" + (f", new: {', '.join(added)}" if added else "")
    if dry_run:
        print(run("git", "diff", "--stat"))
        print(run("git", "diff"))
        log.info("dry run: %s (not published; the clone is reset on the next run)", summary)
        return 0
    publish(summary)
    notify(f"Site mis à jour : note {lang_number(rating)}, {count} avis" +
           (f", nouveaux : {', '.join(added)}" if added else ""))
    return 0


def lang_number(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def manual_login() -> int:
    """Opens the back office in the script's own browser profile (visible) and
    lets you log in by hand (Airbnb asks a new device for a code by SMS): the
    profile then keeps the session. Waits up to 10 minutes."""
    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="fr-FR", timezone_id="Europe/Paris",
            viewport={"width": 1280, "height": 900})
        page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto(BACK_OFFICE, wait_until="domcontentloaded", timeout=60000)
        settle(page)
        if not on_back_office(page):
            button = page.get_by_role("button", name="Uniquement les cookies nécessaires")
            if button.count():
                button.first.click()
            print("Log in in the window (e-mail, SMS code, password...): the script waits.", flush=True)
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline and not any(on_back_office(pg) for pg in browser.pages):
                page.wait_for_timeout(2000)
        ok = any(on_back_office(pg) for pg in browser.pages)
        print("OK: logged in, session kept in the profile." if ok else "NOT LOGGED IN within 10 minutes.")
        browser.close()
        return 0 if ok else 1


def main() -> int:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                        handlers=[logging.FileHandler(LOG, encoding="utf-8"), logging.StreamHandler()])
    if "--login" in sys.argv:
        return manual_login()
    if "--update" not in sys.argv:
        print(__doc__)
        return 2
    try:
        return update("--dry-run" in sys.argv, "--force" in sys.argv)
    except Stop as e:
        notify(f"Mise à jour des avis arrêtée : {e}")
        return 1
    except subprocess.CalledProcessError as e:
        log.error("command failed: %s\n%s", e.cmd, e.stderr)
        notify(f"Mise à jour des avis : échec de « {' '.join(e.cmd[:3])} » (voir le journal)")
        return 1
    except Exception as e:  # anything else: say so rather than fail silently
        log.exception("unexpected error")
        notify(f"Mise à jour des avis : erreur inattendue ({type(e).__name__}), voir le journal")
        return 1


if __name__ == "__main__":
    sys.exit(main())
