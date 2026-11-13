#!/usr/bin/env python3
"""Textures of the 3D model: assets/3d/textures/ -> assets/js/visit3d-textures.js.

The pictures of the 3D visit (assets/js/visit3d.js: frames, map, skis...) are
small image files in assets/3d/textures/, one per texture, named after its key
(snowboard.jpg -> picture(g, 'snowboard', ...)). This script:

- removes their metadata (EXIF, XMP, IPTC, comments, PNG text chunks: camera
  model, dates, GPS position...), rewriting the files in place: the repository
  is public. Colour profiles (ICC) are kept;
- writes assets/js/visit3d-textures.js, the module imported by visit3d.js,
  with every texture as a data URI (the model stays one file, with or without
  Hugo), and the outline of the opaque parts of every PNG with transparency
  (OUTLINES: the model cuts shaped pictures along it) with the average colour
  of those parts (their edges).

Textures are embedded in the model's bundle, so keep them small: about 5 px per
centimetre of the picture in the model, at most MAX_SIDE px on the longest side
(e.g. on macOS: sips -Z 400 name.jpg). A larger image is an error.

Run it after adding, changing or removing a texture. With --check it changes
nothing and fails if a texture still has metadata, is too large or the module
is not up to date (the deployment workflow runs it before building the site).

Usage:
  python3 scripts/textures.py
  python3 scripts/textures.py --check
Standard library only.
"""

from __future__ import annotations

import base64
import math
import struct
import sys
import zlib
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEXTURES = REPO_ROOT / "assets" / "3d" / "textures"
MODULE = REPO_ROOT / "assets" / "js" / "visit3d-textures.js"
MAX_SIDE = 1024
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}

# PNG chunks kept: image data and colour information; text, dates and EXIF go.
PNG_KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"iCCP", b"sRGB", b"gAMA", b"cHRM", b"sBIT", b"pHYs"}


def strip_jpeg(data: bytes) -> bytes:
    """JPEG without its metadata segments: keeps APP0 (JFIF), APP2 when it is
    the ICC profile, APP14 (Adobe colour transform) and the image segments."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG file")
    out, i = [b"\xff\xd8"], 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError(f"bad JPEG marker at byte {i}")
        marker = data[i + 1]
        if marker == 0xFF:          # fill byte
            i += 1
            continue
        if marker == 0xD9:          # end of image
            out.append(data[i:i + 2])
            break
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        segment = data[i:i + 2 + length]
        if marker == 0xDA:          # start of scan: the rest is image data
            out.append(data[i:])
            break
        payload = segment[4:]
        keep = (marker == 0xE0
                or (marker == 0xE2 and payload.startswith(b"ICC_PROFILE\0"))
                or marker == 0xEE
                or not (0xE0 <= marker <= 0xEF or marker == 0xFE))
        if keep:
            out.append(segment)
        i += 2 + length
    return b"".join(out)


def strip_png(data: bytes) -> bytes:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")
    out, i = [data[:8]], 8
    while i < len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        kind = data[i + 4:i + 8]
        chunk = data[i:i + 12 + length]
        if kind in PNG_KEEP:
            out.append(chunk)
        i += 12 + length
    return b"".join(out)


def size(data: bytes) -> tuple[int, int]:
    """Width and height of a PNG or JPEG image."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    i = 2
    while i < len(data):
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):   # start of frame
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    raise ValueError("no JPEG frame header")


LINE = 100           # length of the lines of the generated module
GRID = 256           # outline grid: cells on the longest side of the image
TOLERANCE = 0.6      # outline simplification, in grid cells


def png_pixels(data: bytes) -> tuple[int, int, list[bytes], int]:
    """Width, height, unfiltered rows and channels of an 8-bit PNG."""
    w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", data[16:29])
    if depth != 8 or interlace or ctype not in (0, 2, 4, 6):
        raise ValueError("PNG must be 8-bit, not interlaced, grey or RGB with or without alpha")
    ch = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    idat, i = [], 8
    while i < len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        if data[i + 4:i + 8] == b"IDAT":
            idat.append(data[i + 8:i + 8 + length])
        i += 12 + length
    raw, stride, rows, prev, pos = zlib.decompress(b"".join(idat)), w * ch, [], bytearray(w * ch), 0
    for _ in range(h):
        f, line = raw[pos], bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if f == 1:
            for k in range(ch, stride):
                line[k] = (line[k] + line[k - ch]) & 255
        elif f == 2:
            line = bytearray((a + b) & 255 for a, b in zip(line, prev))
        elif f == 3:
            for k in range(stride):
                line[k] = (line[k] + ((line[k - ch] if k >= ch else 0) + prev[k]) // 2) & 255
        elif f == 4:
            for k in range(stride):
                a = line[k - ch] if k >= ch else 0
                b, c = prev[k], (prev[k - ch] if k >= ch else 0)
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[k] = (line[k] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, rows, ch


def simplify(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker on a closed loop."""
    def dp(seq):
        (ax, ay), (bx, by) = seq[0], seq[-1]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1
        best, idx = 0, 0
        for k in range(1, len(seq) - 1):
            d = abs(dy * (seq[k][0] - ax) - dx * (seq[k][1] - ay)) / norm
            if d > best:
                best, idx = d, k
        if best <= tol:
            return [seq[0], seq[-1]]
        return dp(seq[:idx + 1])[:-1] + dp(seq[idx:])
    far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)
    return dp(pts[:far + 1])[:-1] + dp(pts[far:] + [pts[0]])[:-1]


def area(pts) -> float:
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1])) / 2


def inside(pt, poly) -> bool:
    x, y, res = pt[0], pt[1], False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            res = not res
    return res


def outline(data: bytes) -> dict | None:
    """Outline of the opaque parts of a PNG (alpha >= 50 %) on a grid of GRID cells, simplified:
    {"color": average colour of the opaque pixels, "shapes": [[outer, hole, ...], ...]}, points as
    flat [u, v, ...] lists in texture coordinates (v up). None when the image has no transparency."""
    w, h, rows, ch = png_pixels(data)
    if ch in (1, 3):
        return None
    step = max(1, math.ceil(max(w, h) / GRID))
    nx, ny = math.ceil(w / step), math.ceil(h / step)
    a = ch - 1
    opaque = [[rows[min(h - 1, j * step + step // 2)][min(w - 1, i * step + step // 2) * ch + a] >= 128
               for i in range(nx)] for j in range(ny)]
    if all(all(r) for r in opaque):
        return None
    total, rgb = 0, [0, 0, 0]
    for row in rows[::2]:
        for k in range(0, len(row), 2 * ch):
            if row[k + a] >= 128:
                total += 1
                for c in range(3):
                    rgb[c] += row[k + (c if ch == 4 else 0)]
    color = "#%02x%02x%02x" % tuple(round(v / max(total, 1)) for v in rgb)

    # Boundary edges of the opaque cells, each cell walked clockwise (y down): opaque on the right
    cell = lambda i, j: 0 <= i < nx and 0 <= j < ny and opaque[j][i]
    out = defaultdict(list)
    for j in range(ny):
        for i in range(nx):
            if not opaque[j][i]:
                continue
            if not cell(i, j - 1): out[(i, j)].append((i + 1, j))
            if not cell(i + 1, j): out[(i + 1, j)].append((i + 1, j + 1))
            if not cell(i, j + 1): out[(i + 1, j + 1)].append((i, j + 1))
            if not cell(i - 1, j): out[(i, j + 1)].append((i, j))
    loops = []
    for start in list(out):
        while out[start]:
            loop, v, d = [start], start, None
            while True:
                cands = out[v]
                if d is None:
                    nxt = cands[0]
                else:                                        # turn right first: pinched cells stay apart
                    order = [(-d[1], d[0]), d, (d[1], -d[0])]
                    nxt = min(cands, key=lambda q: order.index((q[0] - v[0], q[1] - v[1])))
                cands.remove(nxt)
                d, v = (nxt[0] - v[0], nxt[1] - v[1]), nxt
                if v == start:
                    break
                loop.append(v)
            if abs(area(loop)) >= 4:
                mids = [((x1 + x2) / 2, (y1 + y2) / 2) for (x1, y1), (x2, y2) in zip(loop, loop[1:] + loop[:1])]
                loops.append(simplify(mids, TOLERANCE))       # edge midpoints: staircases become slopes
    outers = [l for l in loops if area(l) > 0]
    shapes = [[l] for l in outers]
    for hole in (l for l in loops if area(l) < 0):
        owners = [s for s in shapes if inside(hole[0], s[0]) or inside(((hole[0][0] + hole[1][0]) / 2, (hole[0][1] + hole[1][1]) / 2), s[0])]
        if owners:
            min(owners, key=lambda s: area(s[0])).append(hole)
    uv = lambda l: [c for x, y in l for c in (round(min(1, x * step / w), 4), round(max(0, 1 - y * step / h), 4))]
    return {"color": color, "shapes": [[uv(l) for l in s] for s in shapes]}


def stripped(path: Path) -> bytes:
    data = path.read_bytes()
    return strip_png(data) if path.suffix.lower() == ".png" else strip_jpeg(data)


def module(textures: dict[str, tuple[str, bytes]], outlines: dict[str, dict]) -> str:
    lines = [
        "// Generated by scripts/textures.py from assets/3d/textures/: do not edit by hand.",
        "// Textures of the 3D model (assets/js/visit3d.js), as data URIs, by name.",
        "export default {",
    ]
    for name in sorted(textures):
        mime, data = textures[name]
        # Short lines: very long lines make git hosts fail on diffs and merges
        uri = f"data:{mime};base64,{base64.b64encode(data).decode()}"
        lines.append(f"  '{name}': [")
        lines += [f"    '{uri[k:k + LINE]}'," for k in range(0, len(uri), LINE)]
        lines.append("  ].join(''),")
    lines.append("};")
    lines.append("// Outlines of the opaque parts of the PNG textures: { name: { color, shapes: [[outer, hole...]] } },")
    lines.append("// points as flat [u, v, ...] lists in texture coordinates.")
    lines.append("export const OUTLINES = {")
    for name in sorted(outlines):
        o = outlines[name]
        lines.append(f"  '{name}': {{ color: '{o['color']}', shapes: [")
        for shape in o["shapes"]:
            lines.append("    [")
            for loop in shape:
                nums = [f"{c:g}" for c in loop]
                rows, row = [], ""
                for n in nums:
                    if len(row) + len(n) + 1 > LINE:
                        rows.append(row)
                        row = ""
                    row += n + ","
                rows.append(row)
                lines.append("      [")
                lines += [f"        {r}" for r in rows]
                lines.append("      ],")
            lines.append("    ],")
        lines.append("  ] },")
    lines.append("};")
    return "\n".join(lines) + "\n"


def main() -> int:
    check = "--check" in sys.argv[1:]
    files = sorted(p for p in TEXTURES.iterdir() if p.suffix.lower() in MIME)
    others = sorted(p.name for p in TEXTURES.iterdir() if p.suffix.lower() not in MIME and not p.name.startswith("."))
    problems = [f"{name}: not a .jpg or .png file" for name in others]
    textures, outlines = {}, {}
    for path in files:
        clean = stripped(path)
        if clean != path.read_bytes():
            if check:
                problems.append(f"{path.name}: has metadata (run scripts/textures.py)")
            else:
                path.write_bytes(clean)
                print(f"{path.name}: metadata removed")
        w, h = size(clean)
        if max(w, h) > MAX_SIDE:
            problems.append(f"{path.name}: {w} x {h} px, more than {MAX_SIDE} px (resize it)")
        textures[path.stem] = (MIME[path.suffix.lower()], clean)
        if path.suffix.lower() == ".png":
            o = outline(clean)
            if o:
                outlines[path.stem] = o

    content = module(textures, outlines)
    current = MODULE.read_text(encoding="utf-8") if MODULE.exists() else ""
    if content != current:
        if check:
            problems.append(f"{MODULE.relative_to(REPO_ROOT)} is not up to date (run scripts/textures.py)")
        else:
            MODULE.write_text(content, encoding="utf-8")
            print(f"{MODULE.relative_to(REPO_ROOT)}: {len(textures)} textures, {len(outlines)} outlines, {len(content) // 1024} KB")

    for p in problems:
        print(f"ERROR {p}")
    if check and not problems:
        print(f"{len(textures)} textures without metadata, module up to date.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
