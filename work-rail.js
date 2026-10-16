/* work-rail.js - the optional sideways gallery in "Sites we've grown".

   The gallery is a plain horizontal scroll container (see .work-scroller): it
   never pins the page and never takes over the wheel. This file only adds the
   conveniences around it:
     - previous / next buttons that move by one project
     - a progress line and edge fades that say whether there is more
     - click-and-drag with a mouse (touch and trackpads scroll natively)
     - arrow keys when the gallery itself has focus
   Without it the container still scrolls; nothing here is required to see
   every project. */
(function () {
  "use strict";

  var rail = document.querySelector(".work-rail");
  if (!rail) return;
  var scroller = rail.querySelector(".work-scroller");
  var track = rail.querySelector(".work-track");
  var prev = rail.querySelector('[data-work="prev"]');
  var next = rail.querySelector('[data-work="next"]');
  var progress = rail.querySelector(".work-progress span");
  if (!scroller || !track) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var cards = [].slice.call(track.children);

  function max() { return Math.max(0, scroller.scrollWidth - scroller.clientWidth); }

  function update() {
    var m = max(), x = scroller.scrollLeft;
    var canPrev = x > 4, canNext = x < m - 4;
    rail.classList.toggle("can-prev", canPrev);
    rail.classList.toggle("can-next", canNext);
    if (prev) prev.disabled = !canPrev;
    if (next) next.disabled = !canNext;
    if (progress) {
      // The line shows how much of the row is in view and where it sits.
      var vis = m ? scroller.clientWidth / scroller.scrollWidth : 1;
      var pos = m ? x / m : 0;
      progress.style.transformOrigin = "0 50%";
      progress.style.transform = "translateX(" + (pos * (1 - vis) * 100).toFixed(2) + "%) scaleX(" + vis.toFixed(3) + ")";
    }
  }

  function inset() {
    var v = parseFloat(window.getComputedStyle(scroller).scrollPaddingLeft);
    return isNaN(v) ? 0 : v;
  }
  function stops() { return cards.map(function (c) { return Math.max(0, c.offsetLeft - inset()); }); }

  function go(dir) {
    var xs = stops(), x = scroller.scrollLeft, target = x, i;
    if (dir > 0) {
      for (i = 0; i < xs.length; i++) if (xs[i] > x + 8) { target = xs[i]; break; }
      if (target === x) target = max();
    } else {
      for (i = xs.length - 1; i >= 0; i--) if (xs[i] < x - 8) { target = xs[i]; break; }
      if (target === x) target = 0;
    }
    scroller.scrollTo({ left: Math.min(max(), target), behavior: reduce ? "auto" : "smooth" });
  }
  if (prev) prev.addEventListener("click", function () { go(-1); });
  if (next) next.addEventListener("click", function () { go(1); });

  scroller.addEventListener("keydown", function (e) {
    if (e.target !== scroller) return;           // let links keep their own keys
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { e.preventDefault(); scroller.scrollTo({ left: 0, behavior: reduce ? "auto" : "smooth" }); }
    else if (e.key === "End") { e.preventDefault(); scroller.scrollTo({ left: max(), behavior: reduce ? "auto" : "smooth" }); }
  });

  /* ---- click and drag with a mouse ------------------------------------ */
  var down = false, moved = false, startX = 0, startLeft = 0, lastX = 0, lastT = 0, vel = 0, glide = 0;
  scroller.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    cancelAnimationFrame(glide);
    down = true; moved = false; startX = lastX = e.clientX; startLeft = scroller.scrollLeft; lastT = performance.now(); vel = 0;
  });
  window.addEventListener("pointermove", function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 5) { moved = true; scroller.classList.add("is-dragging"); }
    if (!moved) return;
    scroller.scrollLeft = startLeft - dx;
    var now = performance.now(), dt = Math.max(1, now - lastT);
    vel = 0.8 * vel + 0.2 * ((lastX - e.clientX) / dt * 16);
    lastX = e.clientX; lastT = now;
  });
  function release() {
    if (!down) return;
    down = false;
    if (!moved) return;
    // A little momentum, then let scroll-snap settle on a card.
    // Capped, and bounded in frames, so no input can make it run away.
    var v = Math.max(-48, Math.min(48, vel)), frames = 0;
    (function step() {
      if (Math.abs(v) < 0.4 || reduce || ++frames > 90) { scroller.classList.remove("is-dragging"); return; }
      scroller.scrollLeft += v; v *= 0.93;
      glide = requestAnimationFrame(step);
    })();
    // The drag must not also count as a click on the card under the pointer.
    var swallow = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
    scroller.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(function () { scroller.removeEventListener("click", swallow, true); }, 80);
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
  // Dragging an <a> or <img> would start the browser's own drag ghost instead.
  scroller.addEventListener("dragstart", function (e) { e.preventDefault(); });

  scroller.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  if ("ResizeObserver" in window) new ResizeObserver(update).observe(track);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
  window.addEventListener("load", update);
  update();
})();
