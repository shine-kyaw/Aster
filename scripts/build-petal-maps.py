#!/usr/bin/env python
"""
build-petal-maps.py - turn two photos of one aster petal into the texture maps
the 3D flower (aster-3d.js) wraps onto every ray.

    py scripts/build-petal-maps.py
    py scripts/build-petal-maps.py --front a.png --back b.png

INPUT (assets/incoming/, not committed)
  petal-front.png   the petal flat, shot straight down on white, base at the
                    bottom and tip at the top, evenly lit
  petal-back.png    the same petal in the same position, backlit on black

OUTPUT (assets/flower/)
  petal-color.webp  colour map
  petal-bump.webp   vein relief (greyscale height, 0.5 = flat)
  petal-glow.webp   how much light comes through each point (greyscale)

WHY "RECTIFIED"
The 3D petal is a strip: u runs 0 -> 1 from base to tip and v runs 0 -> 1
across the full width at every u, however narrow the strip is there. A photo
pasted straight on would put white background in the corners of every petal.
So each row of the photo is resampled from the petal's own left edge to its
own right edge: the map fills the strip edge to edge, and the photo's veins,
which converge at the tip, converge with the geometry. Texture x = u (length,
base on the left), texture y = v (width).
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent


def petal_mask(rgb, on_black):
    a = rgb.astype(np.float32)
    if on_black:
        return a.max(axis=2) > 22
    # On white: anything clearly darker or more saturated than the paper.
    return (255 - a.min(axis=2)) > 26


def extents(mask):
    """Per-row [left, right] of the widest run, NaN where empty."""
    H = mask.shape[0]
    L = np.full(H, np.nan)
    R = np.full(H, np.nan)
    for y in range(H):
        xs = np.flatnonzero(mask[y])
        if xs.size > 3:
            L[y], R[y] = xs[0], xs[-1]
    return L, R


def bilinear(img, xs, ys):
    """Sample img (H,W[,C]) at float coords."""
    H, W = img.shape[:2]
    xs = np.clip(xs, 0, W - 1.001)
    ys = np.clip(ys, 0, H - 1.001)
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int)
    fx = xs - x0; fy = ys - y0
    if img.ndim == 3:
        fx = fx[..., None]; fy = fy[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def rectify(img, L, R, top, bot, out_len, out_w, inset):
    u = np.linspace(0, 1, out_len)              # base -> tip
    v = np.linspace(0, 1, out_w)                # across
    rows = bot - u * (bot - top)                # image row for each u
    ri = np.clip(np.round(rows).astype(int), top, bot)
    l = L[ri]; r = R[ri]
    w = r - l
    l = l + w * inset; r = r - w * inset
    xs = l[None, :] + v[:, None] * (r - l)[None, :]     # (out_w, out_len)
    ys = np.broadcast_to(rows[None, :], xs.shape)
    return bilinear(img.astype(np.float32), xs, ys)


def fill_nan(a):
    idx = np.arange(a.size)
    ok = ~np.isnan(a)
    return np.interp(idx, idx[ok], a[ok])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--front", default=str(ROOT / "assets/incoming/petal-front.png"))
    ap.add_argument("--back", default=str(ROOT / "assets/incoming/petal-back.png"))
    ap.add_argument("--out", default=str(ROOT / "assets/flower"))
    ap.add_argument("--len", type=int, default=1024)
    ap.add_argument("--width", type=int, default=256)
    args = ap.parse_args()

    front = np.asarray(Image.open(args.front).convert("RGB"))
    back = np.asarray(Image.open(args.back).convert("RGB"))
    if back.shape != front.shape:
        back = np.asarray(Image.open(args.back).convert("RGB").resize(front.shape[1::-1], Image.LANCZOS))

    mf = petal_mask(front, on_black=False)
    mb = petal_mask(back, on_black=True)
    # Shapes should agree; report how well so a mismatched pair is obvious.
    inter = (mf & mb).sum(); union = (mf | mb).sum()
    print("petal outline agreement (IoU): %.3f" % (inter / max(union, 1)))

    rows = np.flatnonzero(mf.any(axis=1))
    top, bot = int(rows[0]), int(rows[-1])
    Lf, Rf = extents(mf); Lb, Rb = extents(mb)
    Lf, Rf, Lb, Rb = [fill_nan(a) for a in (Lf, Rf, Lb, Rb)]
    # Trim the very last rows: a 2px-wide tip and claw sample nothing useful.
    top += 4; bot -= 4

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    N, W = args.len, args.width

    col = rectify(front, Lf, Rf, top, bot, N, W, inset=0.035)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").save(out / "petal-color.webp", "WEBP", quality=88, method=6)

    # Vein relief: high-pass of the front photo's luminance. Veins are darker,
    # so they come out as grooves; the blur radius is about one vein spacing.
    # The veins run along x (base -> tip), so the signal is smoothed hard
    # ALONG x and barely across: vein lines survive, the photo's grain and
    # cell texture (which point every way) average out instead of turning
    # into a sandpaper bump.
    lum = col.mean(axis=2)
    k = np.hanning(31); k /= k.sum()
    along = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, lum)
    along = np.asarray(Image.fromarray(np.clip(along, 0, 255).astype(np.uint8), "L")
                       .filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32)
    low = np.asarray(Image.fromarray(np.clip(along, 0, 255).astype(np.uint8), "L")
                     .filter(ImageFilter.GaussianBlur(7)), dtype=np.float32)
    hp = along - low
    hp = hp / (np.percentile(np.abs(hp), 99.5) + 1e-3)
    bump = np.clip(0.5 + 0.45 * hp, 0, 1) * 255
    Image.fromarray(bump.astype(np.uint8), "L").save(out / "petal-bump.webp", "WEBP", quality=90, method=6)

    # Glow: how bright the backlit photo is at each point, normalised so the
    # brightest membrane is 1.0. Thin tissue and margins glow, veins and the
    # thick claw stay darker - exactly the translucency map the shader wants.
    bk = rectify(back, Lb, Rb, top, bot, N, W, inset=0.035)
    g = bk.max(axis=2)
    g = np.clip(g / (np.percentile(g, 99.5) + 1e-3), 0, 1) * 255
    Image.fromarray(g.astype(np.uint8), "L").save(out / "petal-glow.webp", "WEBP", quality=88, method=6)

    for f in ("petal-color.webp", "petal-bump.webp", "petal-glow.webp"):
        print("  %-18s %5.1f KB" % (f, (out / f).stat().st_size / 1024))
    print("rows %d..%d -> %dx%d (x = base->tip, y = across)" % (top, bot, N, W))


if __name__ == "__main__":
    main()
