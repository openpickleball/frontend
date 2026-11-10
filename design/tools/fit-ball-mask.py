"""Fit the ball's outline in each horizon render, for the ivory-theme masks in site/src/input.css.

The renders show a lit ball on black, so the first bright pixel down each column traces the crest.
A least-squares circle through those points (dropping the worst fifth, twice more) gives the
outline. Paste each result into the matching mask in the hero-green utility, with r about 1.5px
smaller so no dark fringe shows at the crest.

Run from the repository root: python3 design/tools/fit-ball-mask.py (needs numpy and Pillow).
"""

import numpy as np
from PIL import Image

RENDERS = ["tall-2048", "land-3840", "wide-3840"]
THRESHOLD = 60  # luminance, 0 to 255, where the black ends and the crest starts


def fit(xs, ys):
    a = np.c_[xs, ys, np.ones_like(xs)]
    d, e, f = np.linalg.lstsq(a, -(xs**2 + ys**2), rcond=None)[0]
    cx, cy = -d / 2, -e / 2
    return cx, cy, np.sqrt(cx * cx + cy * cy - f)


for name in RENDERS:
    image = np.asarray(Image.open(f"site/public/assets/img/horizon-{name}.jpg").convert("L"))
    h, w = image.shape
    xs, ys = [], []
    for x in range(0, w, max(1, w // 400)):
        column = image[:, x]
        y = int(np.argmax(column > THRESHOLD))
        if column[y] > THRESHOLD:
            xs.append(x)
            ys.append(y)
    xs, ys = np.array(xs, float), np.array(ys, float)
    cx, cy, r = fit(xs, ys)
    for _ in range(3):
        residual = np.abs(np.hypot(xs - cx, ys - cy) - r)
        keep = residual < np.percentile(residual, 80)
        cx, cy, r = fit(xs[keep], ys[keep])
    print(f"{name}: {w}x{h} cx={cx:.1f} cy={cy:.1f} r={r:.1f}")
