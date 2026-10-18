/* motion.js - the parts of the site's motion that CSS cannot do alone.

   1. Headings: split into words so each can rise out of its own clipped line
      (the styling is .rt-split / .rt-w / .rt-i in studio.css). The existing
      reveal observer still decides WHEN, by adding .in; this only prepares the
      words, so nothing about timing or accessibility changes.
   2. Magnetic buttons: a primary button leans a few pixels toward the pointer
      as it approaches, and eases back when it leaves.
   3. A hairline scroll-progress bar at the top of the page.

   Skipped entirely under prefers-reduced-motion. Nothing here is required to
   read or use the page; without it headings reveal with the plain fade. */
(function () {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* ---- 1. word-split headings ----------------------------------------- */
  function splitHeading(h) {
    if (h.classList.contains("rt-split")) return;
    var idx = 0;
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {                       // text
          var parts = n.nodeValue.split(/(\s+)/);
          if (parts.length === 1 && !parts[0].trim()) return;
          var frag = document.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            var w = document.createElement("span"), i = document.createElement("span");
            w.className = "rt-w"; i.className = "rt-i";
            i.style.setProperty("--rt", idx++);
            i.textContent = p;
            w.appendChild(i);
            frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") {
          walk(n);                                    // <em> etc.
        }
      });
    })(h);
    h.classList.add("rt-split");
  }
  [].slice.call(document.querySelectorAll(".reveal-type")).forEach(splitHeading);

  /* ---- 2. magnetic buttons -------------------------------------------- */
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (fine) {
    var targets = [].slice.call(document.querySelectorAll(
      ".btn-primary, .btn-ghost, .xp-link--main, .nav-project-link, .work-btn"));
    var state = targets.map(function (el) { return { el: el, x: 0, y: 0, tx: 0, ty: 0 }; });
    var RADIUS = 78, PULL = 0.26, MAXPX = 9, raf = 0, px = -1e4, py = -1e4;

    function step() {
      var live = false;
      state.forEach(function (s) {
        s.x += (s.tx - s.x) * 0.16;
        s.y += (s.ty - s.y) * 0.16;
        if (Math.abs(s.tx - s.x) > 0.02 || Math.abs(s.ty - s.y) > 0.02) live = true;
        else { s.x = s.tx; s.y = s.ty; }
        s.el.style.setProperty("--mag-x", s.x.toFixed(2) + "px");
        s.el.style.setProperty("--mag-y", s.y.toFixed(2) + "px");
      });
      raf = live ? requestAnimationFrame(step) : 0;
    }
    function aim() {
      state.forEach(function (s) {
        var r = s.el.getBoundingClientRect();
        if (r.bottom < -RADIUS || r.top > window.innerHeight + RADIUS || s.el.disabled) { s.tx = s.ty = 0; return; }
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var dx = px - cx, dy = py - cy;
        var near = px > r.left - RADIUS && px < r.right + RADIUS && py > r.top - RADIUS && py < r.bottom + RADIUS;
        if (near) {
          s.tx = Math.max(-MAXPX, Math.min(MAXPX, dx * PULL));
          s.ty = Math.max(-MAXPX, Math.min(MAXPX, dy * PULL));
        } else { s.tx = s.ty = 0; }
      });
      if (!raf) raf = requestAnimationFrame(step);
    }
    var pending = false;
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      px = e.clientX; py = e.clientY;
      if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; aim(); }); }
    }, { passive: true });
    document.addEventListener("pointerleave", function () { px = py = -1e4; aim(); });
  }

  /* ---- 3. scroll progress --------------------------------------------- */
  var bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  var ticking = false;
  function paintBar() {
    ticking = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    bar.classList.toggle("on", window.scrollY > 24);
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(paintBar); } }
  window.addEventListener("scroll", req, { passive: true });
  window.addEventListener("resize", req);
  if (window.__asterLenis && window.__asterLenis.on) window.__asterLenis.on("scroll", req);
  paintBar();
})();
