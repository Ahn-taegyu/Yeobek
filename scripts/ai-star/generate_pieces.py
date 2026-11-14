"""Generate src/components/ui/ai-star/pieces.ts from the AI star mark SVG.

usage (repo root; needs `pip install shapely`, which is not a project dependency):
  python scripts/ai-star/generate_pieces.py [scripts/ai-star/ai-star-mark.svg] [src/components/ui/ai-star/pieces.ts]

- Strokes with area >= BIG move on their own; smaller specks ride along with the stroke they sit on.
- The background disk (largest path) is cut into overlapping brush-stroke shapes that follow the swirl;
  each shape is intersected with the disk offline, so the component needs no clipPaths.
- The core light blob (ragged edge) is also intersected with the disk offline.
"""
import json
import math
import random
import re
import sys

from shapely.geometry import Polygon
from shapely.ops import unary_union

SRC = sys.argv[1] if len(sys.argv) > 1 else "scripts/ai-star/ai-star-mark.svg"
OUT = sys.argv[2] if len(sys.argv) > 2 else "src/components/ui/ai-star/pieces.ts"
CX, CY = 85.5, 74.0
BIG, DROP = 15.0, 3.0
RINGS = [0, 5, 14, 24, 34, 50]
SECTORS = [1, 5, 8, 11, 14]
TWIST = 0.035  # rad per unit radius
EXT = 0.3  # brush overhang past its cell, per side (fraction of cell arc)
WID = 1.45  # brush width vs ring thickness
LIGHT_R = 33.0
PREC = 1  # decimals in output coordinates


def flatten(d):
    """Absolute M/L/H/V/C/Z path -> list of polygons (cubics sampled)."""
    toks = re.findall(r"[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    polys, cur, i, cmd = [], [], 0, None
    x = y = 0.0
    while i < len(toks):
        t = toks[i]
        if t in "MLHVCZ":
            cmd = t
            i += 1
            if cmd == "Z":
                if cur:
                    polys.append(cur)
                cur = []
            continue
        if cmd == "M":
            x, y = float(toks[i]), float(toks[i + 1]); i += 2
            if cur:
                polys.append(cur)
            cur = [(x, y)]
            cmd = "L"
        elif cmd == "L":
            x, y = float(toks[i]), float(toks[i + 1]); i += 2
            cur.append((x, y))
        elif cmd == "H":
            x = float(toks[i]); i += 1
            cur.append((x, y))
        elif cmd == "V":
            y = float(toks[i]); i += 1
            cur.append((x, y))
        elif cmd == "C":
            x1, y1, x2, y2, x3, y3 = map(float, toks[i:i + 6]); i += 6
            for k in range(1, 9):
                s = k / 8
                u = 1 - s
                cur.append((u**3 * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s**3 * x3,
                            u**3 * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s**3 * y3))
            x, y = x3, y3
    if cur:
        polys.append(cur)
    return [p for p in polys if len(p) >= 3]


def area_centroid(polys):
    a = cx = cy = 0.0
    for p in polys:
        for j in range(len(p)):
            x0, y0 = p[j]; x1, y1 = p[(j + 1) % len(p)]
            cr = x0 * y1 - x1 * y0
            a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr
    if abs(a) < 1e-9:
        pts = [q for p in polys for q in p]
        return 0.0, sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts)
    return abs(a / 2), cx / (3 * a), cy / (3 * a)


def inside(x, y, polys):
    ins = False
    for p in polys:
        for j in range(len(p)):
            x0, y0 = p[j]; x1, y1 = p[j - 1]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
                ins = not ins
    return ins


def num(v):
    t = f"{v:.{PREC}f}".rstrip("0").rstrip(".")
    return "0" if t in ("-0", "") else t


def join(vals):
    s = ""
    for v in vals:
        t = num(v)
        t = t.replace("0.", ".", 1) if t.startswith("0.") else t.replace("-0.", "-.", 1)
        s += t if (not s or t.startswith("-") or s[-1].isalpha()) else " " + t
    return s


def round_path(d):
    """Absolute M/L/H/V/C/Z -> compact relative commands, rounded against the rounded pen to avoid drift."""
    toks = re.findall(r"[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?", d)
    out, i, cmd = [], 0, None
    px = py = sx = sy = 0.0
    q = lambda v: round(v, PREC)
    while i < len(toks):
        t = toks[i]
        if t in "MLHVCZ":
            cmd = t; i += 1
            if cmd == "Z":
                out.append("z"); px, py = sx, sy
            continue
        if cmd == "M":
            x, y = q(float(toks[i])), q(float(toks[i + 1])); i += 2
            out.append("m" + join([x - px, y - py])); px, py = sx, sy = x, y; cmd = "L"
        elif cmd == "L":
            x, y = q(float(toks[i])), q(float(toks[i + 1])); i += 2
            out.append("l" + join([x - px, y - py])); px, py = x, y
        elif cmd == "H":
            x = q(float(toks[i])); i += 1
            out.append("h" + join([x - px])); px = x
        elif cmd == "V":
            y = q(float(toks[i])); i += 1
            out.append("v" + join([y - py])); py = y
        elif cmd == "C":
            v = [q(float(z)) for z in toks[i:i + 6]]; i += 6
            out.append("c" + join([v[0] - px, v[1] - py, v[2] - px, v[3] - py, v[4] - px, v[5] - py])); px, py = v[4], v[5]
    # Drop repeated command letters (SVG repeats the previous command implicitly).
    s, prev = "", None
    for seg in out:
        c, body = seg[0], seg[1:]
        if c == prev and c in "lc":
            s += body if body.startswith("-") else " " + body
        else:
            s += seg
        prev = c
    # Absolute first moveto (followers keep their explicit "l"/"c"), so paths can be concatenated safely.
    return "M" + s[1:] if s.startswith("m") else s


def geom_to_d(g):
    polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
    out = []
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.coords)[:-1]
            out.append("M" + "L".join(f"{num(x)} {num(y)}" for x, y in pts) + "Z")
    return round_path("".join(out))


def box(b):
    """Bounds rounded outward (covers bezier control hull, so it is conservative)."""
    return f"[{math.floor(b[0])}, {math.floor(b[1])}, {math.ceil(b[2])}, {math.ceil(b[3])}]"


def cell_of(x, y):
    r = math.hypot(x - CX, y - CY)
    for k in range(len(SECTORS)):
        if r < RINGS[k + 1] or k == len(SECTORS) - 1:
            th = (math.atan2(y - CY, x - CX) - TWIST * r) % (2 * math.pi)
            return (k, int(th / (2 * math.pi) * SECTORS[k]) % SECTORS[k])


def brush(k, j):
    rnd = random.Random(k * 101 + j * 7 + 3)
    r0, r1 = RINGS[k], RINGS[k + 1]
    if SECTORS[k] == 1:
        ph = [rnd.uniform(0, 6.28) for _ in range(3)]
        return [(CX + r1 * 1.25 * (1 + 0.08 * math.sin(3 * a + ph[0]) + 0.05 * math.sin(5 * a + ph[1])) * math.cos(a),
                 CY + r1 * 1.25 * (1 + 0.08 * math.sin(3 * a + ph[0]) + 0.05 * math.sin(5 * a + ph[1])) * math.sin(a))
                for a in (2 * math.pi * q / 48 for q in range(48))]
    span = 2 * math.pi / SECTORS[k]
    a0 = span * j - span * EXT * rnd.uniform(0.85, 1.15)
    a1 = span * (j + 1) + span * EXT * rnd.uniform(0.85, 1.15)
    rm = (r0 + r1) / 2 + rnd.uniform(-0.6, 0.6)
    half = (r1 - r0) / 2 * WID
    bend = rnd.uniform(-0.12, 0.12) * (r1 - r0)
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    top, bot = [], []
    n = 28
    for q in range(n + 1):
        t = q / n
        a = a0 + (a1 - a0) * t
        c = rm + bend * math.sin(math.pi * t)
        w = half * math.sin(math.pi * t) ** 0.45 * (1.0 + 0.18 * (1 - t) - 0.1 * t)
        wob1 = 1 + 0.10 * math.sin(2 * math.pi * 2.3 * t + ph[0]) + 0.06 * math.sin(2 * math.pi * 5.1 * t + ph[1])
        wob2 = 1 + 0.10 * math.sin(2 * math.pi * 2.7 * t + ph[2]) + 0.06 * math.sin(2 * math.pi * 4.6 * t + ph[3])
        for rr, lst in ((c + w * wob1, top), (c - w * wob2, bot)):
            aa = a + TWIST * rr
            lst.append((CX + rr * math.cos(aa), CY + rr * math.sin(aa)))
    return top + bot[::-1]


def light_blob():
    def jitter(i):
        v = math.sin(i * 12.9898 + 78.233) * 43758.5453
        return (v - math.floor(v)) * 2 - 1
    steps = 140
    pts = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        r = LIGHT_R * (1 + 0.11 * math.sin(3 * a + 1.3) + 0.07 * math.sin(5 * a + 0.4) + 0.05 * math.sin(11 * a + 2.1)
                       + 0.04 * math.sin(19 * a + 0.7) + 0.03 * math.sin(29 * a + 1.9) + 0.05 * jitter(i))
        pts.append((CX + r * math.cos(a), CY + r * math.sin(a)))
    # midpoint quadratic smoothing, sampled
    out = []
    for i in range(steps):
        p0 = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2]
        c = pts[i]
        p1 = [(pts[i][0] + pts[(i + 1) % steps][0]) / 2, (pts[i][1] + pts[(i + 1) % steps][1]) / 2]
        for k in range(4):
            s = k / 4
            out.append(((1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p1[0],
                        (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p1[1]))
    return out


svg = open(SRC, encoding="utf8").read()
P = []
for i, (d, fill) in enumerate(re.findall(r'<path d="([^"]+)" fill="([^"]+)"', svg)):
    polys = flatten(d)
    a, cx, cy = area_centroid(polys)
    P.append(dict(i=i, d=d, c=fill, a=a, cx=cx, cy=cy, polys=polys))

core = max(P, key=lambda p: p["a"])
disk = Polygon(core["polys"][0]).buffer(0)

frags = {}
for k in range(len(SECTORS)):
    for j in range(SECTORS[k]):
        g = Polygon(brush(k, j)).buffer(0).intersection(disk)
        if g.is_empty or g.area < 2:
            continue
        frags[(k, j)] = dict(i=core["i"], cx=g.centroid.x, cy=g.centroid.y, kids=[], geom=g)
# Fold any sliver the brushes miss into the stroke it touches most, so the disk is whole at rest.
gaps = disk.difference(unary_union([f["geom"] for f in frags.values()]))
for g in ([] if gaps.is_empty else [gaps] if gaps.geom_type == "Polygon" else list(gaps.geoms)):
    host = max(frags.values(), key=lambda f: f["geom"].buffer(0.05).intersection(g).area - 1e-6 * f["geom"].distance(g))
    host["geom"] = unary_union([host["geom"], g.buffer(0.05)]).intersection(disk)
gap = disk.difference(unary_union([f["geom"] for f in frags.values()])).area
print(f"disk uncovered area: {gap:.4f} of {disk.area:.1f}")

movers = [p for p in P if p["a"] >= BIG and p is not core]
for m in movers:
    m["kids"] = [m]
dropped = 0
for p in P:
    if p is core or p["a"] >= BIG:
        continue
    hosts = [b for b in movers if inside(p["cx"], p["cy"], b["polys"])]
    if hosts:
        min(hosts, key=lambda b: b["a"])["kids"].append(p)
    elif inside(p["cx"], p["cy"], core["polys"]):
        key = cell_of(p["cx"], p["cy"])
        if key not in frags:
            key = min(frags, key=lambda q: math.hypot(frags[q]["cx"] - p["cx"], frags[q]["cy"] - p["cy"]))
        frags[key]["kids"].append(p)
    elif p["a"] >= DROP:
        p["kids"] = [p]
        movers.append(p)
    else:
        dropped += 1

light = Polygon(light_blob()).buffer(0).intersection(disk).simplify(0.03)

items = [("core", f) for _, f in sorted(frags.items())] + [("stroke", m) for m in sorted(movers, key=lambda m: m["i"])]
R = max(math.hypot(m["cx"] - CX, m["cy"] - CY) for _, m in items)
with open(OUT, "w", encoding="utf8", newline="\n") as f:
    f.write("// Generated by scripts/ai-star/generate_pieces.py from the Yeobek AI star mark SVG (viewBox 0 0 171 155).\n")
    f.write("// Each piece moves on its own; specks painted on top of a stroke ride along in `paths`.\n")
    f.write("// The background disk is pre-cut into overlapping brush strokes that follow the swirl (cover the disk at rest).\n")
    f.write(f"// x/y: piece centroid offset from the swirl center, normalized by the farthest piece ({R:.1f} units); r: normalized distance.\n")
    f.write(f"// {len(P)} source paths -> {len(frags)} disk strokes + {len(movers)} strokes, {dropped} isolated specks dropped.\n\n")
    f.write("export type AiStarPath = { d: string; fill: string };\n")
    f.write("export type AiStarBox = readonly [x0: number, y0: number, x1: number, y1: number];\n")
    f.write("export type AiStarPiece = { x: number; y: number; r: number; box: AiStarBox; paths: readonly AiStarPath[] };\n\n")
    f.write(f"export const AI_STAR_CENTER = {{ x: {CX}, y: {CY} }} as const;\nexport const AI_STAR_RADIUS = {R:.1f};\n")
    f.write(f"/** Ragged light blob behind the swirl, already trimmed to the disk so it never shows at rest. */\n")
    f.write(f"export const AI_STAR_LIGHT = {json.dumps(geom_to_d(light))};\n")
    f.write(f"export const AI_STAR_LIGHT_BOX: AiStarBox = {box(light.bounds)};\n\n")
    f.write("export const AI_STAR_PIECES: readonly AiStarPiece[] = [\n")
    for kind, m in items:
        paths = []
        if kind == "core":
            paths.append((geom_to_d(m["geom"]), core["c"]))
        paths += [(round_path(k["d"]), k["c"]) for k in sorted(m["kids"], key=lambda k: k["i"]) if k is not core]
        merged = []
        for d, c in paths:  # consecutive same-colour paths become one path element
            if merged and merged[-1][1] == c:
                merged[-1] = (merged[-1][0] + d, c)
            else:
                merged.append((d, c))
        paths = merged
        ps = ", ".join(f'{{ d: {json.dumps(d)}, fill: "{c}" }}' for d, c in paths)
        dx, dy = (m["cx"] - CX) / R, (m["cy"] - CY) / R
        pts = [q for k in m["kids"] if k is not core for poly in k["polys"] for q in poly]
        if kind == "core":
            b = m["geom"].bounds
            pts += [(b[0], b[1]), (b[2], b[3])]
        bb = (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts))
        f.write(f"  {{ x: {dx:.3f}, y: {dy:.3f}, r: {math.hypot(dx, dy):.3f}, box: {box(bb)}, paths: [{ps}] }},\n")
    f.write("];\n")
print(len(frags), len(movers), dropped, round(R, 2))
