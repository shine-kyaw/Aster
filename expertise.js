/* expertise.js - the "From first idea. To what's next." section.

   1. A faint line-drawn aster behind the heading. It draws itself in as the
      section arrives, then turns very slowly with scroll and leans a few
      pixels toward the pointer, so the empty right side has something alive
      in it without anything competing with the type.
   2. One vine under the three disciplines. It grows left to right with
      scroll, and each discipline's glyph (sprout, bud, bloom) draws itself
      when the vine reaches it - the process section's seed-to-bloom story,
      told again in one line.
   3. A soft light that follows the pointer inside the hovered discipline.

   Everything here only ever moves CSS custom properties (--draw, --fill,
   --mx, --my) and one transform. The CSS defaults every one of them to the
   finished state, so with no JS, or reduced motion, the section is simply
   drawn. */
(function () {
  "use strict";

  var section = document.getElementById("expertise");
  if (!section) return;
  var grid = section.querySelector(".expertise-grid");
  var vine = section.querySelector(".exp-vine");
  var vinePath = section.querySelector(".exp-vine-path");
  var aster = section.querySelector(".exp-aster");
  var items = [].slice.call(section.querySelectorAll(".expertise-item"));
  var glyphs = items.map(function (it) { return it.querySelector(".exp-glyph"); });
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { t = clamp(t); return t * t * (3 - 2 * t); }

  /* ---- the faint aster: strap petals in two rings plus a dotted disc ---- */
  (function buildAster() {
    if (!aster) return;
    var seed = 7177;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var frag = document.createDocumentFragment();
    [[30, 176, 8.5, 0], [22, 124, 7.5, 8]].forEach(function (ring) {
      var n = ring[0], step = 360 / n;
      for (var i = 0; i < n; i++) {
        var a = ring[3] + step * i + (rnd() - 0.5) * step * 0.3;
        var L = ring[1] * (0.93 + rnd() * 0.12), W = ring[2] * (0.85 + rnd() * 0.3);
        var lean = (rnd() - 0.5) * W;
        var b = W * 0.38, r = 44;
        var d = "M " + (-b) + " " + (-r) +
          " C " + (-W) + " " + (-r - L * 0.18) + ", " + (-W) + " " + (-r - L * 0.62) + ", " + (-W * 0.7 + lean) + " " + (-r - L * 0.9) +
          " Q " + lean + " " + (-r - L * 1.02) + ", " + (W * 0.7 + lean) + " " + (-r - L * 0.9) +
          " C " + W + " " + (-r - L * 0.62) + ", " + W + " " + (-r - L * 0.18) + ", " + b + " " + (-r);
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        p.setAttribute("transform", "rotate(" + a.toFixed(2) + ")");
        p.setAttribute("pathLength", "1");
        frag.appendChild(p);
      }
    });
    [40, 26].forEach(function (rad, k) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("r", rad);
      c.setAttribute("pathLength", "1");
      if (k) c.setAttribute("class", "a-disc");
      frag.appendChild(c);
    });
    aster.appendChild(frag);
  })();

  if (reduce) return;   // drawn, still, and done
  section.classList.add("exp-live");

  /* ---- vine geometry, rebuilt for the grid's real width ---------------- */
  var nodes = [0, 0, 0], total = 1, vertical = false;
  function layout() {
    var gw = grid.clientWidth;
    vertical = window.getComputedStyle(grid).gridTemplateColumns.split(" ").length < 2;
    if (vertical || !vinePath) return;
    var gr = grid.getBoundingClientRect();
    nodes = items.map(function (it) { return it.getBoundingClientRect().left - gr.left; });
    total = gw;
    vine.setAttribute("viewBox", "0 0 " + gw + " 28");
    // A gentle wave that passes exactly through each node on the line, so
    // every glyph's stem stands on the vine, and finishes in a small curl.
    var y = 14, d = "M 0 " + y, amp = 5.5;
    var pts = nodes.slice(1).concat([gw - 30]);
    var x0 = 0;
    pts.forEach(function (x1, i) {
      var s = i % 2 ? 1 : -1, w = x1 - x0;
      d += " C " + (x0 + w * 0.3).toFixed(1) + " " + (y + amp * s) + ", " +
        (x0 + w * 0.7).toFixed(1) + " " + (y - amp * s) + ", " + x1.toFixed(1) + " " + y;
      x0 = x1;
    });
    d += " C " + (gw - 12) + " " + y + ", " + (gw - 4) + " " + (y - 8) + ", " + (gw - 11) + " " + (y - 12) +
      " C " + (gw - 17) + " " + (y - 15) + ", " + (gw - 21) + " " + (y - 8) + ", " + (gw - 15) + " " + (y - 6);
    vinePath.setAttribute("d", d);
  }

  /* ---- state -> custom properties -------------------------------------- */
  var pVine = 0, pAster = 0, lastV = -1, lastA = -1;
  function paint() {
    if (pVine !== lastV) {
      lastV = pVine;
      if (vertical) {
        // Phone: no vine; each glyph draws as its own column comes up.
        glyphs.forEach(function (g) {
          var r = g.getBoundingClientRect(), vh = window.innerHeight;
          var t = clamp((vh * 0.92 - r.top) / (vh * 0.35));
          g.style.setProperty("--draw", t.toFixed(3));
          g.style.setProperty("--fill", ease((t - 0.55) / 0.45).toFixed(3));
        });
      } else {
        vine.style.setProperty("--draw", ease(pVine).toFixed(4));
        var reach = ease(pVine) * total;
        glyphs.forEach(function (g, i) {
          var t = clamp((reach - nodes[i]) / (total * 0.22) + (i === 0 ? 0.15 : 0));
          g.style.setProperty("--draw", t.toFixed(3));
          g.style.setProperty("--fill", ease((t - 0.55) / 0.45).toFixed(3));
        });
      }
    }
    if (aster && pAster !== lastA) {
      lastA = pAster;
      aster.style.setProperty("--draw", ease(pAster * 1.8).toFixed(3));
    }
  }

  // Start everything undrawn.
  if (vine) vine.style.setProperty("--draw", 0);
  glyphs.forEach(function (g) { g.style.setProperty("--draw", 0); g.style.setProperty("--fill", 0); });
  if (aster) aster.style.setProperty("--draw", 0);

  /* ---- scroll: ScrollTrigger if present (it is fed by Lenis), else a plain
     listener. Either way only while the section is near the viewport. */
  var tx = 0, ty = 0, cx = 0, cy = 0, rot = 0, raf = 0;
  function frame() {
    raf = 0;
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    if (aster) {
      aster.style.transform = "translate3d(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px,0) rotate(" + rot.toFixed(2) + "deg)";
    }
    paint();
    if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function measure() {
    var r = section.getBoundingClientRect(), vh = window.innerHeight;
    var g = grid.getBoundingClientRect();
    pVine = clamp((vh * 0.95 - g.top) / (vh * 0.45));
    pAster = clamp((vh - r.top) / (vh * 0.9));
    rot = (vh - r.top) / (r.height + vh) * 22 - 6;   // about 22deg across the whole pass
    kick();
  }

  var near = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      near = e[0].isIntersecting;
      if (near) measure();
    }, { rootMargin: "20% 0px" }).observe(section);
  } else { near = true; }
  function onScroll() { if (near) measure(); }
  if (window.__asterLenis && window.__asterLenis.on) window.__asterLenis.on("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { layout(); lastV = -1; measure(); });

  /* ---- pointer: the aster leans, the hovered discipline gets a light ---- */
  if (window.matchMedia("(hover: hover)").matches) {
    section.addEventListener("pointermove", function (e) {
      var r = section.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -12;
      kick();
    });
    section.addEventListener("pointerleave", function () { tx = 0; ty = 0; kick(); });
    items.forEach(function (it) {
      it.addEventListener("pointermove", function (e) {
        var r = it.getBoundingClientRect();
        it.style.setProperty("--mx", (e.clientX - r.left + 28) + "px");
        it.style.setProperty("--my", (e.clientY - r.top + 6) + "px");
      });
    });
  }

  layout();
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); lastV = -1; measure(); });
})();
