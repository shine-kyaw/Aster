/* expertise.js - the "Everything your site needs, grown in one place" section.

   One vine runs down the left edge of the three chapters and grows with
   scroll. As it reaches each chapter a branch reaches out to that chapter's
   plant (sprout, bud, bloom), which draws itself, and the chapter's list
   unfolds. A soft light follows the pointer inside the hovered chapter.

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
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;                       // drawn, still, done

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { t = clamp(t); return t * t * (3 - 2 * t); }

  section.classList.add("exp-live");

  var attach = [], branches = [], vineLen = 1, vertical = false, laidOut = false;

  /* ---- vine geometry, rebuilt for the real row positions -------------- */
  function layout() {
    vertical = !window.matchMedia("(min-width: 861px)").matches;
    if (vertical || !vinePath) { laidOut = true; return; }
    var base = rowsEl.getBoundingClientRect();
    var X = 14;
    attach = glyphs.map(function (g) {
      var r = g.getBoundingClientRect();
      return { y: r.bottom - base.top - 5, x: r.left - base.left + r.width * 0.16 };
    });
    // clear old branches
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
    // finish with a small curl past the last chapter
    var ly = py + 40;
    d += " C " + (X - 4) + " " + (py + 14) + ", " + (X + 4) + " " + (py + 28) + ", " + X + " " + ly +
         " c 0 7 7 11 11 6 c 3 -4 0 -9 -5 -7";
    vinePath.setAttribute("d", d);
    vineLen = ly + 12;
    laidOut = true;
  }

  /* ---- state -> custom properties -------------------------------------- */
  var last = "";
  function paint() {
    var vh = window.innerHeight;
    var out = [];
    if (vertical) {
      glyphs.forEach(function (g, i) {
        var r = g.getBoundingClientRect();
        var t = clamp((vh * 0.9 - r.top) / (vh * 0.32));
        out.push(t.toFixed(3));
        g.style.setProperty("--draw", t.toFixed(3));
        g.style.setProperty("--fill", ease((t - 0.55) / 0.45).toFixed(3));
      });
    } else {
      var rect = rowsEl.getBoundingClientRect();
      var p = clamp((vh * 0.82 - rect.top) / Math.max(1, rect.height * 0.92));
      var reach = ease(p) * vineLen;
      out.push(p.toFixed(4));
      vine.style.setProperty("--draw", ease(p).toFixed(4));
      attach.forEach(function (a, i) {
        var tb = clamp((reach - (a.y - 90)) / 90);
        branches[i] && branches[i].style.setProperty("--draw", tb.toFixed(3));
        var tg = clamp((reach - (a.y - 70)) / 200);
        out.push(tg.toFixed(3));
        glyphs[i].style.setProperty("--draw", tg.toFixed(3));
        glyphs[i].style.setProperty("--fill", ease((tg - 0.55) / 0.45).toFixed(3));
      });
    }
    // chapter lists unfold once their row is comfortably on screen
    rows.forEach(function (row) {
      if (!row.classList.contains("xp-in") && row.getBoundingClientRect().top < vh * 0.78) row.classList.add("xp-in");
    });
    last = out.join(",");
  }

  // Start undrawn.
  if (vine) vine.style.setProperty("--draw", 0);
  glyphs.forEach(function (g) { g.style.setProperty("--draw", 0); g.style.setProperty("--fill", 0); });

  var raf = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (!laidOut) layout(); paint(); }); }
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
