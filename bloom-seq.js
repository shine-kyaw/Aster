/* bloom-seq.js - the four-step bloom, driven by real footage.

   Loaded ONLY when <html data-bloom-seq="assets/bloom.json"> is present, which
   scripts/build-bloom.py sets when you process footage. Without that
   attribute this file is never requested and the SVG flower is untouched.

   HOW IT STAYS IN STEP WITH THE TEXT
   The section's GSAP timeline already smooths scroll into one number,
   zoomTl.progress() (1.0s of glide on desktop, 0.25s on touch), and the four
   phase texts are timed against it: they reach full strength at 0.44 / 0.60 /
   0.76 / 0.92. This player reads that same number every tick and maps it to a
   frame through the manifest's anchors:

       progress   0 ........ 0.44 ..... 0.60 ..... 0.76 ..... 0.92 .... 1
       frame      hold K1    K1 Bulb    K2 Sprout  K3 Bud     K4 Bloom   end

   K1..K4 are your four keyframes (the clip boundaries), so when "Phase 02 -
   Sprouting" is fully on screen, the sprout is what is on screen. Between
   anchors the footage plays linearly at the speed it was generated.

   WHY CANVAS, AND WHY A SLIDING WINDOW
   Decoded, a 960px frame is ~3.7MB. Ninety-six of them is a third of a
   gigabyte - the thing that makes frame-sequence sites crash phones. So the
   compressed WebPs (~30KB each) are kept as Blobs, and only a window of
   frames around the current position is decoded into ImageBitmaps off the
   main thread; the rest are closed. Memory stays around 50MB.

   WHY THE ALPHA IS BAKED INTO THE FRAMES
   The stage is position:sticky, which makes it its own stacking context, so a
   CSS mix-blend-mode on the canvas has no backdrop to blend with and would
   leave a black square. The build script turns the black ground into real
   alpha instead, so it composites correctly over anything.

   FAILURE IS SILENT AND SAFE
   No manifest, a bad manifest, too many missing frames, no timeline (reduced
   motion, GSAP blocked): the player never activates and the SVG flower keeps
   doing what it always did. */
(function () {
  "use strict";

  var manifestUrl = document.documentElement.getAttribute("data-bloom-seq");
  if (!manifestUrl) return;
  var section = document.querySelector(".bloom-zoom");
  var stage = section && section.querySelector(".bloom-zoom-stage");
  if (!stage || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var WIN_BACK = 6, WIN_FWD = 10, KEEP = 18;      // decoded-frame window
  var CONCURRENCY = 6;
  var FADE_MS = 450;

  var M = null, N = 0, pts = null, dir = "", naturalSize = 960;
  var blobs = [], bitmaps = {}, pending = {}, failed = {};
  var canvas = null, ctx = null, cw = 0;
  var active = false, activating = false, shown = false, fadeStart = 0, dirty = true;
  var lastPos = -1, lastP = -1, lastFade = -1;
  var hasBitmap = typeof window.createImageBitmap === "function";

  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function pad(n) { return ("0000" + n).slice(-4); }
  function abs(u) { return new URL(u, document.baseURI).href; }

  /* progress -> fractional frame index, piecewise linear through the anchors */
  function buildPoints() {
    var a = (M.anchors && M.anchors.length === 4) ? M.anchors : [0.44, 0.60, 0.76, 0.92];
    var p = [[0, 0]];
    for (var i = 0; i < 4; i++) p.push([a[i], Math.max(0, Math.min(N - 1, M.marks[i]))]);
    p.push([1, N - 1]);
    return p;
  }
  function frameFor(p) {
    if (p <= 0) return 0;
    if (p >= 1) return N - 1;
    for (var i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i], span = b[0] - a[0];
        return a[1] + (b[1] - a[1]) * (span > 0 ? (p - a[0]) / span : 1);
      }
    }
    return N - 1;
  }

  /* ---- loading -------------------------------------------------------- */
  function frameUrl(i) { return dir + "f" + pad(i + 1) + ".webp"; }

  function loadOrder(coarse) {
    var seen = {}, order = [];
    function add(i) { if (i >= 0 && i < N && !seen[i]) { seen[i] = 1; order.push(i); } }
    M.marks.forEach(add);
    add(N - 1);
    [8, 4, 2, 1].forEach(function (step) {
      for (var i = 0; i < N; i += step) { add(i); if (step === 8) coarse.push(i); }
    });
    M.marks.forEach(function (m) { if (coarse.indexOf(m) < 0) coarse.push(m); });
    if (coarse.indexOf(N - 1) < 0) coarse.push(N - 1);
    return order;
  }

  function fetchFrames(order, coarse) {
    var idx = 0, inflight = 0, decided = 0;
    function coarseReady() {
      var ok = 0, bad = 0;
      for (var k = 0; k < coarse.length; k++) {
        var i = coarse[k];
        if (blobs[i]) ok++; else if (failed[i]) bad++; else return 0;
      }
      return bad > coarse.length * 0.3 ? -1 : 1;
    }
    function pump() {
      while (inflight < CONCURRENCY && idx < order.length) {
        (function (i) {
          inflight++;
          fetch(frameUrl(i))
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
            .then(function (b) { blobs[i] = b; dirty = true; })
            .catch(function () { failed[i] = true; })
            .then(function () {
              inflight--; decided++;
              if (!active) {
                var c = coarseReady();
                if (c === 1) activate();
                else if (c === -1) { idx = order.length; }    // give up, SVG stays
              }
              pump();
            });
        })(order[idx++]);
      }
    }
    pump();
  }

  /* ---- decoded-frame window ------------------------------------------ */
  function want(i) {
    if (bitmaps[i] || pending[i] || !blobs[i]) return;
    pending[i] = true;
    if (hasBitmap) {
      createImageBitmap(blobs[i]).then(function (bm) {
        pending[i] = false; bitmaps[i] = bm; dirty = true;
      }).catch(function () { pending[i] = false; failed[i] = true; });
    } else {
      var img = new Image(), url = URL.createObjectURL(blobs[i]);
      img.onload = function () { URL.revokeObjectURL(url); pending[i] = false; bitmaps[i] = img; dirty = true; };
      img.onerror = function () { URL.revokeObjectURL(url); pending[i] = false; failed[i] = true; };
      img.src = url;
    }
  }
  function ensureWindow(center) {
    var lo = Math.max(0, Math.floor(center) - WIN_BACK);
    var hi = Math.min(N - 1, Math.ceil(center) + WIN_FWD);
    for (var i = lo; i <= hi; i++) want(i);
    for (var k in bitmaps) {
      var j = +k;
      if (j < center - KEEP || j > center + KEEP) {
        try { if (bitmaps[j].close) bitmaps[j].close(); } catch (e) { /* already gone */ }
        delete bitmaps[j];
      }
    }
  }
  function nearest(i) {
    if (bitmaps[i]) return i;
    for (var d = 1; d < N; d++) {
      if (bitmaps[i - d]) return i - d;
      if (bitmaps[i + d]) return i + d;
    }
    return -1;
  }

  /* ---- drawing -------------------------------------------------------- */
  function draw(pos) {
    var i0 = Math.floor(pos), f = pos - i0, i1 = Math.min(N - 1, i0 + 1);
    var a = nearest(i0), b = nearest(i1);
    if (a < 0 && b < 0) return false;
    if (a < 0) a = b;
    if (b < 0) b = a;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, cw);
    if (a === b || f < 0.03) {
      ctx.drawImage(bitmaps[a], 0, 0, cw, cw);
    } else if (f > 0.97) {
      ctx.drawImage(bitmaps[b], 0, 0, cw, cw);
    } else {
      /* Exact crossfade of two premultiplied frames: weight each, then ADD
         ("lighter"). source-over twice would double-count soft edges. */
      ctx.globalAlpha = 1 - f;
      ctx.drawImage(bitmaps[a], 0, 0, cw, cw);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = f;
      ctx.drawImage(bitmaps[b], 0, 0, cw, cw);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    return true;
  }

  function render(p) {
    if (!canvas) return;
    var pos = frameFor(p);
    var q = Math.round(pos * 50) / 50;              // 1/50 of a frame is invisible
    if (q !== lastPos || dirty) {
      ensureWindow(pos);
      if (draw(pos)) {
        lastPos = q; dirty = false;
        if (!shown) { shown = true; fadeStart = performance.now(); }
      }
    }
    var fade = shown ? Math.min(1, (performance.now() - fadeStart) / FADE_MS) : 0;
    if (Math.abs(p - lastP) > 0.0005 || fade !== lastFade) {
      lastP = p; lastFade = fade;
      var o = smooth(p / 0.12) * smooth(fade);
      var s = 0.94 + 0.10 * smooth(p);                // a slow push-in
      var y = 22 * smooth((p - 0.94) / 0.06);         // matches the section's final drift
      canvas.style.opacity = o.toFixed(3);
      canvas.style.transform = "translate(-50%,-50%) translate3d(0," + y.toFixed(1) +
        "px,0) scale(" + s.toFixed(4) + ")";
      /* Hand over from the SVG only once the footage has fully faded in. */
      if (fade >= 1 && !section.classList.contains("bloom-seq-on")) section.classList.add("bloom-seq-on");
    }
  }

  function tick() {
    var tl = window.__asterBloomTl;
    if (active && tl) render(tl.progress());
  }

  /* ---- canvas --------------------------------------------------------- */
  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var css = canvas.offsetWidth || 600;
    var px = Math.max(256, Math.min(Math.round(css * dpr), naturalSize));
    if (px !== cw) { cw = px; canvas.width = cw; canvas.height = cw; dirty = true; }
  }
  function mountCanvas() {
    var st = document.createElement("style");
    st.textContent =
      ".bloom-seq{position:absolute;left:50%;top:50%;width:min(96vmin,1000px);" +
      "height:min(96vmin,1000px);transform:translate(-50%,-50%);z-index:2;" +
      "pointer-events:none;opacity:0;will-change:transform,opacity}" +
      ".bloom-seq-on .zoom-flower{visibility:hidden!important}";
    document.head.appendChild(st);
    canvas = document.createElement("canvas");
    canvas.className = "bloom-seq";
    canvas.setAttribute("aria-hidden", "true");
    stage.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener("resize", resize);
  }

  function activate() {
    if (active || activating) return;
    activating = true;
    var tries = 0;
    (function wait() {
      if (window.__asterBloomTl) { go(); return; }
      if (++tries > 40) return;                     // 10s: leave the SVG in charge
      setTimeout(wait, 250);
    })();
    function go() {
      if (active) return;
      active = true;
      mountCanvas();
      dirty = true;
      if (window.gsap && window.gsap.ticker) window.gsap.ticker.add(tick);
      else (function loop() { tick(); requestAnimationFrame(loop); })();
    }
  }

  /* ---- start: only when the section is close -------------------------- */
  function start() {
    fetch(abs(manifestUrl), { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (m) {
        N = m.frames | 0;
        if (N < 8 || !m.marks || m.marks.length !== 4 || !m.base) return;
        M = m;
        var small = window.matchMedia("(max-width: 760px)").matches ||
          (navigator.connection && navigator.connection.saveData);
        dir = abs(m.base + (small ? "m/" : ""));
        naturalSize = small ? (m.msize || 600) : (m.size || 960);
        pts = buildPoints();
        var coarse = [];
        fetchFrames(loadOrder(coarse), coarse);
      })
      .catch(function () { /* no footage yet: the SVG flower is the experience */ });
  }

  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) { io.disconnect(); start(); }
  }, { rootMargin: "150% 0px" });
  io.observe(section);

  /* Test/debug handle. */
  window.__asterBloomSeq = {
    render: render,
    state: function () {
      return { active: active, shown: shown, frames: N, cw: cw, decoded: Object.keys(bitmaps).length,
               blobs: blobs.filter(Boolean).length, failed: Object.keys(failed).length, marks: M && M.marks };
    },
    frameFor: function (p) { return pts ? frameFor(p) : null; },
    canvas: function () { return canvas; }
  };
})();
