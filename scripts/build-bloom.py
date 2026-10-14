#!/usr/bin/env python
"""
build-bloom.py - turn AI-generated bloom footage into the scroll-scrubbed
frame sequence that drives the four-step section on the homepage.

    py scripts/build-bloom.py                 # reads assets/incoming/bloom/
    py scripts/build-bloom.py --src some/dir  # or any folder
    py scripts/build-bloom.py --frames 120 --size 1024

WHAT TO DROP IN THE SOURCE FOLDER (either, not both)
  * 1-3 video clips (.mp4/.mov/.webm). Three clips, named so they sort in
    order, is the recommended shape: seed->sprout, sprout->bud, bud->bloom,
    each clip starting on the last frame of the one before. The two clip
    boundaries become the Sprouting and Budding anchors, so the flower on
    screen IS the step being described.
  * or a folder of numbered still frames (png/jpg/webp).

WHAT IT DOES
  1. Extracts frames with a bundled ffmpeg (imageio-ffmpeg), centre-cropped
     square, so a 16:9 clip with the flower in the middle just works.
  2. Resamples to N evenly spaced frames (default 96) - the length of the
     clip stops mattering.
  3. Keys the black ground into real alpha. The flower is lit on pure black,
     so alpha is derived from brightness with a soft knee and the colour is
     un-premultiplied. This is done in the data, not with CSS mix-blend-mode,
     because the sticky stage is its own stacking context with no backdrop
     for a blend mode to see - a blend would leave a visible black square.
  4. Writes WebP at desktop and mobile sizes, a manifest, and (unless
     --no-wire) switches the page on via <html data-bloom-seq="...">.

Needs: Pillow, numpy, imageio-ffmpeg
       py -m pip install --user pillow numpy imageio-ffmpeg
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
# Where the four phase texts reach full strength on the section's timeline
# (index.html: phase starts 0.32/0.48/0.64/0.80, each entering over 0.12).
DEFAULT_ANCHORS = [0.44, 0.60, 0.76, 0.92]


def natural_key(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", p.name)]


def say(msg):
    print(msg, flush=True)


def get_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg not available. Run:  py -m pip install --user imageio-ffmpeg")


def extract_clip(ffmpeg, clip, out_dir, size, crop):
    """Decode one clip to square PNGs at `size`. Returns the ordered paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if crop == "center":
        vf = "crop='min(iw,ih)':'min(iw,ih)',scale=%d:%d:flags=lanczos" % (size, size)
    else:  # x,y,w,h in source pixels
        x, y, w, h = [int(v) for v in crop.split(",")]
        vf = "crop=%d:%d:%d:%d,scale=%d:%d:flags=lanczos" % (w, h, x, y, size, size)
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(clip),
           "-vf", vf, "-fps_mode", "passthrough", str(out_dir / "%05d.png")]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ffmpeg failed on %s:\n%s" % (clip.name, r.stderr))
    return sorted(out_dir.glob("*.png"))


def load_square(path, size):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    im = im.crop((left, top, left + s, top + s))
    if s != size:
        im = im.resize((size, size), Image.LANCZOS)
    return im


def thumb_diff(a, b):
    ta = np.asarray(Image.open(a).convert("L").resize((48, 48)), dtype=np.float32)
    tb = np.asarray(Image.open(b).convert("L").resize((48, 48)), dtype=np.float32)
    return float(np.abs(ta - tb).mean())


def key_black(im, crush, knee):
    """Black ground -> alpha. alpha ramps 0..1 between `crush` and `knee` on
    the brightest channel; above the knee the pixel is fully opaque and keeps
    its own colour. Colour is un-premultiplied below the knee so compositing
    over the dark room reproduces the original light."""
    rgb = np.asarray(im, dtype=np.float32)
    mx = rgb.max(axis=2)
    a = np.clip((mx - crush) / max(knee - crush, 1.0), 0.0, 1.0)
    safe = np.maximum(a, 1e-3)[..., None]
    col = np.clip(rgb / safe, 0, 255)
    col[a <= 0] = 0
    out = np.dstack([col, a * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def corner_brightness(im):
    s = im.size[0]
    k = max(4, s // 32)
    px = []
    for (x, y) in ((0, 0), (s - k, 0), (0, s - k), (s - k, s - k)):
        px.append(np.asarray(im.crop((x, y, x + k, y + k)), dtype=np.float32).mean())
    return float(np.mean(px))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=str(ROOT / "assets" / "incoming" / "bloom"))
    ap.add_argument("--frames", type=int, default=96, help="frames in the final sequence")
    ap.add_argument("--size", type=int, default=960, help="desktop frame edge, px")
    ap.add_argument("--msize", type=int, default=600, help="mobile frame edge, px")
    ap.add_argument("--quality", type=int, default=78, help="WebP colour quality")
    ap.add_argument("--crop", default="center", help="'center' or x,y,w,h in source pixels (video only)")
    ap.add_argument("--key", default="8,56", help="crush,knee for the black key (0-255)")
    ap.add_argument("--ground", choices=["black", "none"], default="black",
                    help="'none' keeps opaque frames (page falls back to mix-blend-mode)")
    ap.add_argument("--marks", default="", help="4 comma-separated fractions 0..1 for Bulb,Sprouting,Budding,Bloom")
    ap.add_argument("--no-wire", action="store_true", help="do not touch index.html")
    ap.add_argument("--out", default=str(ROOT / "assets" / "bloom"), help="frame output root")
    ap.add_argument("--manifest", default=str(ROOT / "assets" / "bloom.json"))
    args = ap.parse_args()

    t0 = time.time()
    src = Path(args.src)
    if not src.is_dir():
        sys.exit("Source folder not found: %s\nCreate it and drop the clips (or frames) inside." % src)
    videos = sorted([p for p in src.iterdir() if p.suffix.lower() in VIDEO_EXT], key=natural_key)
    images = sorted([p for p in src.iterdir() if p.suffix.lower() in IMAGE_EXT], key=natural_key)
    if not videos and not images:
        sys.exit("Nothing to process in %s (looking for video clips or image frames)." % src)

    crush, knee = [float(v) for v in args.key.split(",")]
    tmp = Path(tempfile.mkdtemp(prefix="bloom-"))
    try:
        # ---- 1. gather source frames, remember clip boundaries ------------
        frames, boundaries = [], []
        if videos:
            say("Found %d clip(s): %s" % (len(videos), ", ".join(v.name for v in videos)))
            ff = get_ffmpeg()
            for n, clip in enumerate(videos):
                ex = extract_clip(ff, clip, tmp / ("clip%02d" % n), args.size, args.crop)
                say("  %s -> %d frames" % (clip.name, len(ex)))
                if not ex:
                    sys.exit("No frames decoded from %s" % clip.name)
                if n > 0 and frames and thumb_diff(frames[-1], ex[0]) < 2.5:
                    ex = ex[1:]          # chained clip: first frame repeats the last
                if n > 0:
                    boundaries.append(len(frames) - 1)
                frames.extend(ex)
        else:
            say("Found %d still frames" % len(images))
            frames = images
        total = len(frames)
        if total < 8:
            sys.exit("Only %d source frames - need at least 8." % total)

        # ---- 2. resample to N evenly spaced frames ------------------------
        N = min(args.frames, total)
        pick = [round(i * (total - 1) / (N - 1)) for i in range(N)]

        def to_sampled(src_idx):
            return min(range(N), key=lambda i: abs(pick[i] - src_idx))

        # ---- 3. the four anchors ------------------------------------------
        if args.marks:
            fr = [float(v) for v in args.marks.split(",")]
            if len(fr) != 4:
                sys.exit("--marks needs exactly 4 fractions")
            marks = [round(f * (N - 1)) for f in fr]
        elif len(videos) == 3 and len(boundaries) == 2:
            marks = [0, to_sampled(boundaries[0]), to_sampled(boundaries[1]), N - 1]
            say("Anchors from the clip boundaries (Sprouting/Budding): %s" % marks)
        else:
            marks = [round(f * (N - 1)) for f in (0.0, 1 / 3, 2 / 3, 1.0)]
            say("Anchors spaced evenly (%s). Use 3 chained clips, or --marks, to pin them." % marks)
        marks = [int(m) for m in marks]

        # ---- 4. version dirs ----------------------------------------------
        out_root = Path(args.out)
        out_root.mkdir(parents=True, exist_ok=True)
        existing = []
        for d in out_root.iterdir():
            m = re.fullmatch(r"v(\d+)", d.name)
            if m and d.is_dir():
                existing.append(int(m.group(1)))
        ver = (max(existing) + 1) if existing else 1
        d_desk = out_root / ("v%d" % ver)
        d_mob = d_desk / "m"
        d_mob.mkdir(parents=True, exist_ok=True)

        # ---- 5. key + encode ----------------------------------------------
        warned = False
        kb_d = kb_m = 0
        for i, s in enumerate(pick):
            im = load_square(frames[s], args.size)
            if i == 0 and args.ground == "black" and corner_brightness(im) > 28:
                say("WARNING: the corners of frame 1 are not black (avg %.0f/255). Keying will punch holes "
                    "in a lit background. Re-generate on pure #000000, or use --ground none." % corner_brightness(im))
                warned = True
            for target, folder in ((args.size, d_desk), (args.msize, d_mob)):
                fim = im if target == args.size else im.resize((target, target), Image.LANCZOS)
                name = folder / ("f%04d.webp" % (i + 1))
                if args.ground == "black":
                    key_black(fim, crush, knee).save(name, "WEBP", quality=args.quality,
                                                      alpha_quality=90, method=6)
                else:
                    fim.save(name, "WEBP", quality=args.quality, method=6)
                if folder is d_desk:
                    kb_d += name.stat().st_size
                else:
                    kb_m += name.stat().st_size
            if (i + 1) % 16 == 0 or i == N - 1:
                say("  encoded %d/%d" % (i + 1, N))

        # ---- 6. manifest + wiring -----------------------------------------
        manifest = {
            "version": ver,
            "base": "assets/bloom/v%d/" % ver,
            "frames": N,
            "size": args.size,
            "msize": args.msize,
            "alpha": args.ground == "black",
            "marks": marks,
            "anchors": DEFAULT_ANCHORS,
        }
        mpath = Path(args.manifest)
        with open(mpath, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps(manifest, indent=2) + "\n")
        for d in out_root.iterdir():            # drop superseded versions
            if d.is_dir() and re.fullmatch(r"v\d+", d.name) and d.name != "v%d" % ver:
                shutil.rmtree(d)

        wired = "skipped (--no-wire)"
        if not args.no_wire:
            idx = ROOT / "index.html"
            # newline="" on both sides: Path.write_text on Windows would turn
            # every LF in index.html into CRLF and make the whole file a diff.
            with open(idx, encoding="utf-8", newline="") as fh:
                html = fh.read()
            rel = mpath.resolve().relative_to(ROOT).as_posix()
            if "data-bloom-seq" in html:
                html = re.sub(r'data-bloom-seq="[^"]*"', 'data-bloom-seq="%s"' % rel, html, count=1)
            else:
                html = html.replace('<html lang="en">', '<html lang="en" data-bloom-seq="%s">' % rel, 1)
            with open(idx, "w", encoding="utf-8", newline="") as fh:
                fh.write(html)
            wired = "index.html now loads %s" % rel

        say("")
        say("Done in %.0fs - %d frames." % (time.time() - t0, N))
        say("  desktop %dpx: %.2f MB (avg %.0f KB/frame)" % (args.size, kb_d / 1e6, kb_d / N / 1024))
        say("  mobile  %dpx: %.2f MB (avg %.0f KB/frame)" % (args.msize, kb_m / 1e6, kb_m / N / 1024))
        say("  anchors: %s   alpha: %s" % (marks, manifest["alpha"]))
        say("  wiring: %s" % wired)
        if warned:
            say("  (see the background warning above)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
