# Builds the logo (D1: indoor pickleball inside segmented spin marks) as static SVGs.
# Geometry matches design/icon-d.html at its defaults (hole size 15°, mark weight 1, gap 4.5).
# Run: python3 design/tools/export-logo.py
# Writes design/assets/mark.svg and design/assets/favicon.svg. Copy them to site/public/assets/img/, then render
# favicon-48.png (48 px, transparent corners) and apple-touch-icon.png (180 px, square tile) from favicon.svg.
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = 50.0
lerp = lambda a, b, t: a + (b - a) * t
fmt = lambda n: f"{n:.2f}".rstrip("0").rstrip(".")
pt = lambda p: f"{fmt(p[0])} {fmt(p[1])}"

# Indoor ball: 26 holes in latitude rings (polar angle, count, azimuth offset).
INDOOR = [(0, 1, 0), (45, 6, 0), (90, 12, 15), (135, 6, 30), (180, 1, 0)]


def holes(R, alpha):
    """Holes seen straight down the pole, as (cx, cy, rx, ry, rotation) ellipses."""
    out = []
    for polar, n, off in INDOOR:
        for i in range(n):
            p, a = math.radians(polar), math.radians(off + 360 / n * i)
            x, y, z = math.sin(p) * math.cos(a), math.sin(p) * math.sin(a), math.cos(p)
            if z <= 0.18:
                continue
            r, k = R * math.sin(math.radians(alpha)), math.cos(math.radians(alpha))
            out.append((C + R * x * k, C - R * y * k, r, max(r * z, 0.6), math.degrees(math.atan2(-y, x)) + 90))
    return out


def ball_path(R, alpha):
    """Disc with the holes cut out; use fill-rule evenodd."""
    d = f"M{pt((C - R, C))}A{fmt(R)} {fmt(R)} 0 1 0 {pt((C + R, C))}A{fmt(R)} {fmt(R)} 0 1 0 {pt((C - R, C))}Z"
    for cx, cy, rx, ry, rot in holes(R, alpha):
        q = math.radians(rot)
        p1 = (cx + rx * math.cos(q), cy + rx * math.sin(q))
        p2 = (cx - rx * math.cos(q), cy - rx * math.sin(q))
        arc = f"A{fmt(rx)} {fmt(ry)} {fmt(rot)} 1 0"
        d += f"M{pt(p1)}{arc} {pt(p2)}{arc} {pt(p1)}Z"
    return d


# Spin marks: a band from A0 (a point) to A1 (flat end), split into three segments, plus its 180° twin.
A0, A1 = -78, -12
SEG = [0.30, 0.27, 0.29]


def marks_path(R, gap, tmax, seg_gap, steps=24):
    total, tot = 1 - 2 * seg_gap, sum(SEG)
    t, d = 0.0, ""
    for w in SEG:
        ln = w / tot * total
        inner, outer = [], []
        for i in range(steps + 1):
            u = lerp(t, t + ln, i / steps)
            a = math.radians(lerp(A0, A1, u))
            ri, th = R + gap, tmax * u ** 0.85
            inner.append((C + ri * math.cos(a), C + ri * math.sin(a)))
            outer.append((C + (ri + th) * math.cos(a), C + (ri + th) * math.sin(a)))
        pts = inner + outer[::-1]
        for ps in (pts, [(100 - x, 100 - y) for x, y in pts]):
            d += "M" + "L".join(pt(p) for p in ps) + "Z"
        t += ln + seg_gap
    return d


def mark(alpha=15, weight=1.0, gap=4.5, favicon=False):
    tmax = 9.5 * weight * (1.2 if favicon else 1)
    gap = gap * (1.15 if favicon else 1)
    R = 49 - gap - tmax
    return f'<path fill-rule="evenodd" d="{ball_path(R, alpha)}"/><path d="{marks_path(R, gap, tmax, 0.09 if favicon else 0.065)}"/>'


with open(ROOT + "/design/assets/mark.svg", "w") as fh:
    fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 104 104" fill="#fff">{mark()}</svg>\n')

# Favicon: the same mark in ivory (#f7f3e8, the ivory theme background) on a black tile, marks heavier and gaps wider so they hold at 16 px.
with open(ROOT + "/design/assets/favicon.svg", "w") as fh:
    fh.write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 110"><rect width="110" height="110" rx="24" fill="#000"/>'
        f'<g transform="translate(12.5 12.5) scale(.85)" fill="#f7f3e8">{mark(favicon=True)}</g></svg>\n'
    )
