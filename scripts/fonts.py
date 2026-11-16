#!/usr/bin/env python3
"""Font Awesome subset: only the icons the site uses -> assets/fontawesome/.

The Font Awesome fonts (static/webfonts/fa-*.woff2, about 170 KB) hold some
1,600 icons; the site uses a few dozen. This script:

- builds the site (hugo, into a temporary directory) and reads every page:
  the icons are the classes fa-<name> of its elements, their font given by the
  other classes of the element, as the theme's CSS does: `brands`/`fab` ->
  brands font, `solid`/`fas`/`fa` -> solid font (Font Awesome 5 Free, weight
  900), `icon`/`far` alone -> regular font (weight 400). The codepoints the
  site's own stylesheets write in `content: '\\f...'` (the theme's ticked
  checkbox) are kept in both Free fonts;
- writes into assets/fontawesome/ (ignored by git) the woff2 fonts reduced to
  those icons, fontawesome.css (the Font Awesome stylesheet with the rules of
  those icons only and an @font-face per font left) and icons.json (the list).

layouts/_partials/styles.html uses assets/fontawesome/ when it exists (fonts
fingerprinted), else the full fonts: a local preview without this script shows
every icon. Nothing to maintain by hand: a new icon in a page or a template is
in the next subset. The deployment workflow runs it before building the site,
then `--check dist` after: every icon of the built pages must be in the subset
the pages use.

An icon missing from the font its classes select (e.g. a brand icon without
the `brands` class, so invisible) or an element with fa-<icon> but no class
telling its font is an error.

Usage:
  python3 scripts/fonts.py               build the site, write the subset
  python3 scripts/fonts.py --site DIR    use an already built site instead
  python3 scripts/fonts.py --check dist  check a build against the subset
Requires fonttools and brotli (pip install fonttools brotli).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FA_CSS = REPO_ROOT / "assets/css/fontawesome-all.min.css"
SITE_CSS = [REPO_ROOT / "assets/css/main.css", REPO_ROOT / "assets/css/site.css"]
FONTS_DIR = REPO_ROOT / "static/webfonts"
OUT_DIR = REPO_ROOT / "assets/fontawesome"

# style -> (font file, font family, weight)
FONTS = {
    "solid": ("fa-solid-900.woff2", "Font Awesome 5 Free", 900),
    "regular": ("fa-regular-400.woff2", "Font Awesome 5 Free", 400),
    "brands": ("fa-brands-400.woff2", "Font Awesome 5 Brands", 400),
}

ICON_RULE = re.compile(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-f]+)"\}')
FONT_FACE = re.compile(r"@font-face\{[^}]*\}")
CLASS_ATTR = re.compile(r"""\sclass=(?:"([^"]*)"|'([^']*)'|([^\s>"']+))""")
CSS_CODEPOINT = re.compile(r"""content:\s*["']\\(f[0-9a-f]{3})["']""", re.I)


def fail(msg: str) -> None:
    print(f"fonts.py: {msg}", file=sys.stderr)
    sys.exit(1)


def icon_codepoints(css: str) -> dict[str, int]:
    """fa-<name> -> codepoint, from the rules .fa-<name>:before{content:"\\f..."}."""
    icons = {}
    for selectors, code in ICON_RULE.findall(css):
        for sel in selectors.split(","):
            if sel:
                icons[sel[len("."):-len(":before")]] = int(code, 16)
    if len(icons) < 1000:
        fail(f"only {len(icons)} icon rules found in {FA_CSS.name}: format changed?")
    return icons


def style_of(classes: set[str]) -> str | None:
    if classes & {"brands", "fab"}:
        return "brands"
    if classes & {"solid", "fas", "fa"}:
        return "solid"
    if classes & {"icon", "far", "regular"}:
        return "regular"
    return None


def used_icons(site: Path, icons: dict[str, int]) -> dict[str, set[str]]:
    """style -> icon names (fa-...) used by the HTML pages of a built site."""
    used: dict[str, set[str]] = {style: set() for style in FONTS}
    errors = []
    pages = sorted(site.rglob("*.html"))
    if not pages:
        fail(f"no HTML page in {site}")
    for page in pages:
        html = page.read_text(encoding="utf-8", errors="replace")
        for m in CLASS_ATTR.finditer(html):
            classes = set((m.group(1) or m.group(2) or m.group(3)).split())
            names = {c for c in classes if c in icons}
            if not names:
                continue
            style = style_of(classes)
            if style is None:
                errors.append(f"{page.relative_to(site)}: {' '.join(sorted(classes))}: "
                              "which font? (add icon, solid or brands)")
                continue
            used[style] |= names
    if errors:
        fail("icons without a font:\n  " + "\n  ".join(sorted(set(errors))))
    return used


def css_codepoints() -> set[int]:
    """Codepoints written directly in the site's stylesheets (content: '\\f...')."""
    found = set()
    for path in SITE_CSS:
        found |= {int(c, 16) for c in CSS_CODEPOINT.findall(path.read_text(encoding="utf-8"))}
    return found


def subset(font_file: str, codepoints: set[int]) -> bytes:
    from fontTools import subset as ftsubset
    from fontTools.ttLib import TTFont

    # recalcTimestamp=False: the same icons give the same file (same fingerprint).
    font = TTFont(FONTS_DIR / font_file, recalcTimestamp=False)
    options = ftsubset.Options()
    options.flavor = "woff2"
    options.name_IDs = ["*"]  # keep the licence and copyright names (SIL OFL)
    options.drop_tables += ["FFTM"]  # FontForge timestamps
    subsetter = ftsubset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    out = BytesIO()
    font.flavor = "woff2"
    font.save(out)
    return out.getvalue()


def cmap(font_file: str) -> set[int]:
    from fontTools.ttLib import TTFont

    return set(TTFont(FONTS_DIR / font_file).getBestCmap())


def subset_css(css: str, keep: set[str], styles: list[str]) -> str:
    """The Font Awesome stylesheet with the rules of the kept icons only and an
    @font-face (woff2 only, font-display: swap) for each font left."""
    def icon_rule(m: re.Match) -> str:
        sels = [s for s in m.group(1).split(",") if s and s[1:-len(":before")] in keep]
        return f'{",".join(sels)}{{content:"\\{m.group(2)}"}}' if sels else ""

    css = ICON_RULE.sub(icon_rule, css)
    if len(FONT_FACE.findall(css)) != 3:
        fail(f"the 3 @font-face rules were not found in {FA_CSS.name}")
    css = FONT_FACE.sub("", css)
    faces = "".join(
        f'@font-face{{font-family:"{FONTS[s][1]}";font-style:normal;font-weight:{FONTS[s][2]};'
        f'font-display:swap;src:url({FONTS[s][0]}) format("woff2")}}'
        for s in styles)
    # After the licence comment, which ends the first line(s).
    end = css.find("*/") + 2
    return css[:end] + "\n" + faces + css[end:]


def build_site(dest: Path) -> None:
    cmd = ["hugo", "--panicOnWarning", "--quiet", "--destination", str(dest)]
    if subprocess.run(cmd, cwd=REPO_ROOT).returncode != 0:
        fail("the hugo build failed")


def write_subset(site: Path) -> None:
    css = FA_CSS.read_text(encoding="utf-8")
    icons = icon_codepoints(css)
    used = used_icons(site, icons)
    extra = css_codepoints()

    errors = []
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.iterdir():
        old.unlink()
    styles, sizes = [], []
    for style, (font_file, _, _) in FONTS.items():
        glyphs = cmap(font_file)
        points = {icons[name] for name in used[style]}
        for name in sorted(used[style]):
            if icons[name] not in glyphs:
                errors.append(f"fa-{name} is not in the {style} font")
        if style != "brands":
            points |= extra & glyphs
        if not points:
            continue
        data = subset(font_file, points)
        (OUT_DIR / font_file).write_bytes(data)
        styles.append(style)
        full = (FONTS_DIR / font_file).stat().st_size
        sizes.append(f"{font_file}: {len(points)} glyphs, {len(data) / 1024:.1f} KB "
                     f"(full font {full / 1024:.1f} KB)")
    if errors:
        for old in OUT_DIR.iterdir():
            old.unlink()
        fail("icons missing from their font (wrong style class?):\n  " + "\n  ".join(errors))

    keep = set().union(*used.values())
    out_css = subset_css(css, keep, styles)
    (OUT_DIR / "fontawesome.css").write_text(out_css, encoding="utf-8")
    manifest = {style: sorted(names) for style, names in used.items() if names}
    (OUT_DIR / "icons.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for line in sizes:
        print(line)
    print(f"fontawesome.css: {len(out_css) / 1024:.1f} KB (full {len(css) / 1024:.1f} KB)")
    for style, names in manifest.items():
        print(f"{style}: {' '.join(names)}")


def check(site: Path) -> None:
    manifest_path = OUT_DIR / "icons.json"
    if not manifest_path.exists():
        fail(f"{manifest_path.relative_to(REPO_ROOT)} missing: run scripts/fonts.py first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    used = used_icons(site, icon_codepoints(FA_CSS.read_text(encoding="utf-8")))
    missing = [f"{style} fa-{name}" for style, names in used.items()
               for name in sorted(names - set(manifest.get(style, [])))]
    if missing:
        fail("icons of the built site missing from the subset (run scripts/fonts.py "
             "before hugo):\n  " + "\n  ".join(missing))
    # The pages must use the subset stylesheet, not the full one.
    sheets = list(site.rglob("fontawesome*.css"))
    if not sheets or any("webfonts/fa-" in p.read_text(encoding="utf-8") for p in sheets):
        fail(f"the Font Awesome stylesheet of {site} is not the subset one")
    print(f"Font Awesome subset OK: {sum(len(n) for n in used.values())} icons, all in the subset")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    group = ap.add_mutually_exclusive_group()
    group.add_argument("--site", type=Path, help="built site to read instead of building it")
    group.add_argument("--check", type=Path, metavar="SITE",
                       help="check that every icon of this built site is in the subset")
    args = ap.parse_args()
    try:
        import brotli  # noqa: F401  (woff2 compression)
        import fontTools  # noqa: F401
    except ImportError:
        fail("fonttools and brotli are needed: pip install fonttools brotli")

    if args.check:
        check(args.check)
    elif args.site:
        write_subset(args.site)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            build_site(Path(tmp))
            write_subset(Path(tmp))
    return 0


if __name__ == "__main__":
    sys.exit(main())
