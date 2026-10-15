/* expertise.js - the "Everything your site needs, grown in one place" section.

   One vine runs down the left edge of the three chapters. When the chapters
   come into view it grows once, top to bottom, reaching out to each chapter's
   plant (sprout, bud, bloom), which draws itself as the vine arrives, and the
   chapter's list unfolds. Then it stays drawn. A soft light follows the
   pointer inside the hovered chapter.

   It is TIME-driven, not scroll-driven, on purpose: the bloom section above is
   the page's one scroll-scrubbed moment, and a second one dilutes it. Scrolling
   back and forth over this section changes nothing.

   Everything here only moves CSS custom properties (--draw, --fill, --mx,
   --my) and adds two classes. The CSS defaults every property to the finished
   state, so with no JS, or reduced motion, the section is simply drawn. */
(function () {
  "use strict";

  var section = document.getElementById("expertise");
  if (!section) return;
  var rowsEl = section.querySelector(".xp-rows");
  var vine = section.querySelector(".xp-vine");
  var vinePath = section.querySelector(".xp-vine-path");
  var rows = [].slice.call(section.querySelectorAll(".xp-row"));
  var glyphs = rows.map(function (r) { return r.querySelector(".xp-glyph"); });
  if (!rowsEl || !rows.length) return;
  var NS = "http://www.w3.org/2000/svg";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // drawn, still, done

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { t = clamp(t); return t * t * (3 - 2 * t); }

  section.classList.add("exp-live");

  var VINE_MS = 2600, GLYPH_MS = 1300;
  var attach = [], branches = [], vineLen = 1, vertical = false, laidOut = false;
  var vineStart = 0, glyphStart = [], running = false;

  /* ---- vine geometry, rebuilt for the real row positions -------------- */
  function layout() {
    vertical = !window.matchMedia("(min-width: 861px)").matches;
    laidOut = true;
    if (vertical || !vinePath) return;
    var base = rowsEl.getBoundingClientRect();
    var X = 14;
    attach = glyphs.map(function (g) {
      var r = g.getBoundingClientRect();
      return { y: r.bottom - base.top - 5, x: r.left - base.left + r.width * 0.16 };
    });
    branches.forEach(function (b) { if (b.parentNode) b.parentNode.removeChild(b); });
    branches = [];
    var d = "M " + X + " 0", py = 0;
    attach.forEach(function (a, i) {
      var s = i % 2 ? 1 : -1, dy = a.y - py;
      d += " C " + (X + 5 * s) + " " + (py + dy * 0.33).toFixed(1) + ", " + (X - 5 * s) + " " + (py + dy * 0.66).toFixed(1) + ", " + X + " " + a.y.toFixed(1);
      py = a.y;
      var br = document.createElementNS(NS, "path");
      br.setAttribute("class", "xp-branch");
      br.setAttribute("pathLength", "1");
      br.setAttribute("d", "M " + X + " " + a.y.toFixed(1) + " C " + (X + 10) + " " + (a.y - 3).toFixed(1) + ", " + (a.x - 20).toFixed(1) + " " + (a.y + 3).toFixed(1) + ", " + a.x.toFixed(1) + " " + a.y.toFixed(1));
      vine.appendChild(br);
      branches.push(br);
    });
    var ly = py + 40;
    d += " C " + (X - 4) + " " + (py + 14) + ", " + (X + 4) + " " + (py + 28) + ", " + X + " " + ly +
         " c 0 7 7 11 11 6 c 3 -4 0 -9 -5 -7";
    vinePath.setAttribute("d", d);
    vineLen = ly + 12;
    // Branches/glyphs that already finished must stay finished after a re-layout.
    if (vineStart && performance.now() - vineStart > VINE_MS + 400) paint(performance.now());
  }

  function setGlyph(g, t) {
    g.style.setProperty("--draw", t.toFixed(3));
    g.style.setProperty("--fill", ease((t - 0.55) / 0.45).toFixed(3));
  }

  /* ---- time -> custom properties --------------------------------------- */
  function paint(now) {
    var done = true;
    if (vertical) {
      glyphs.forEach(function (g, i) {
        if (!glyphStart[i]) { done = false; return; }
        var t = ease((now - glyphStart[i]) / GLYPH_MS);
        setGlyph(g, t);
        if (t < 1) done = false;
      });
      return done && glyphStart.every(Boolean);
    }
    if (!vineStart) return false;
    var p = clamp((now - vineStart) / VINE_MS);
    // The glyphs keep drawing for a beat after the vine tip has arrived, so the
    // last plant (which sits near the end of the vine) still finishes.
    var e = ease(p), reach = e * (vineLen + 220);
    vine.style.setProperty("--draw", e.toFixed(4));
    attach.forEach(function (a, i) {
      var tb = clamp((reach - (a.y - 90)) / 90);
      if (branches[i]) branches[i].style.setProperty("--draw", tb.toFixed(3));
      setGlyph(glyphs[i], clamp((reach - (a.y - 70)) / 200));
    });
    return p >= 1;
  }

  function loop(now) {
    if (paint(now)) { running = false; return; }
    requestAnimationFrame(loop);
  }
  function run() { if (!running) { running = true; requestAnimationFrame(loop); } }

  // Start undrawn.
  if (vine) vine.style.setProperty("--draw", 0);
  glyphs.forEach(function (g) { setGlyph(g, 0); });

  /* ---- triggers: arrival starts the drawing; lists unfold per row ------ */
  function check() {
    var vh = window.innerHeight, now = performance.now(), started = false;
    if (!laidOut) layout();
    if (vertical) {
      glyphs.forEach(function (g, i) {
        if (!glyphStart[i] && g.getBoundingClientRect().top < vh * 0.85) { glyphStart[i] = now; started = true; }
      });
    } else if (!vineStart && rowsEl.getBoundingClientRect().top < vh * 0.8) {
      vineStart = now; started = true;
    }
    rows.forEach(function (row) {
      if (!row.classList.contains("xp-in") && row.getBoundingClientRect().top < vh * 0.78) row.classList.add("xp-in");
    });
    if (started) run();
  }
  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; check(); }); }
  function nearViewport() {
    var r = section.getBoundingClientRect(), vh = window.innerHeight;
    return r.bottom > -vh * 0.2 && r.top < vh * 1.2;
  }
  function onScroll() { if (nearViewport()) schedule(); }

  if (window.__asterLenis && window.__asterLenis.on) window.__asterLenis.on("scroll", onScroll);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { laidOut = false; schedule(); });

  /* ---- pointer: a soft light inside the hovered chapter ---------------- */
  if (window.matchMedia("(hover: hover)").matches) {
    rows.forEach(function (row) {
      row.addEventListener("pointermove", function (e) {
        var r = row.getBoundingClientRect();
        row.style.setProperty("--mx", (e.clientX - r.left + 34) + "px");
        row.style.setProperty("--my", (e.clientY - r.top - 14) + "px");
      });
    });
  }

  layout();
  schedule();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { laidOut = false; schedule(); });
  window.addEventListener("load", function () { laidOut = false; schedule(); });
})();
