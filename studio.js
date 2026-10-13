/* Aster: navigation and accessible interaction primitives. */
(function () {
  "use strict";
  const focusable = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const toggle = document.getElementById("navToggle");
  const menu = document.getElementById("navMenu");
  const overlay = document.getElementById("overlay");
  const drawer = document.getElementById("drawer");
  const closeButton = document.getElementById("drawerClose");
  let returnFocus = null;
  let background = [];
  let scrollState = null;

  function closeMenu(restoreFocus) {
    if (!menu || !toggle) return;
    document.body.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    menu.setAttribute("aria-hidden", "true");
    menu.inert = true;
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }
  if (menu && toggle) {
    menu.inert = true;
    toggle.addEventListener("click", function () {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      if (!open) { closeMenu(true); return; }
      document.body.classList.add("menu-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      menu.inert = false;
      menu.setAttribute("aria-hidden", "false");
      const first = menu.querySelector("a[href]");
      if (first) first.focus({ preventScroll: true });
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) closeMenu(false);
    });
    document.addEventListener("focusin", function (event) {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) closeMenu(false);
    });
  }

  // Move the existing overlay out of main so the page behind it can be inert.
  if (overlay && drawer) {
    document.body.appendChild(overlay);
    overlay.inert = true;
    drawer.tabIndex = -1;
    drawer.setAttribute("data-lenis-prevent", "");
  }

  function closeDrawer(restoreFocus = true) {
    if (!overlay || !overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    overlay.inert = true;
    overlay.setAttribute("aria-hidden", "true");
    background.forEach(function (entry) { entry.node.inert = entry.wasInert; });
    background = [];
    if (scrollState) {
      document.body.style.overflow = scrollState.body;
      document.documentElement.style.overflow = scrollState.root;
      if (scrollState.lenis && !scrollState.lenisWasStopped) scrollState.lenis.start();
      scrollState = null;
    }
    if (restoreFocus && returnFocus && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = text || "";
  }
  function openDrawer(data) {
    if (!overlay || !drawer) return;
    if (!overlay.classList.contains("open")) returnFocus = document.activeElement;
    closeMenu(false);
    setText("drawerEyebrow", data.eyebrow);
    // Titles are authored in this repository, never supplied by a visitor.
    document.getElementById("drawerTitle").innerHTML = data.title || "";
    setText("drawerLede", data.lede);
    setText("drawerListLabel", data.listLabel || "Included");
    setText("drawerFootnote", data.footnote);
    setText("drawerCtaLabel", data.ctaLabel || "Begin a conversation");
    const stats = document.getElementById("drawerStats");
    stats.replaceChildren();
    (data.stats || []).forEach(function (stat) {
      const item = document.createElement("div");
      item.className = "drawer-stat";
      ["v", "k"].forEach(function (key) {
        const part = document.createElement("div");
        part.className = key;
        part.textContent = stat[key] || "";
        item.appendChild(part);
      });
      stats.appendChild(item);
    });
    const list = document.getElementById("drawerList");
    list.replaceChildren();
    (data.list || []).forEach(function (text) {
      const item = document.createElement("li");
      item.textContent = text;
      list.appendChild(item);
    });
    if (!overlay.classList.contains("open")) {
      background = Array.from(document.body.children)
        .filter(function (node) { return node !== overlay && !node.matches("script, style, link"); })
        .map(function (node) { const wasInert = node.inert; node.inert = true; return { node, wasInert }; });
      const lenis = window.__asterLenis;
      scrollState = {
        body: document.body.style.overflow,
        root: document.documentElement.style.overflow,
        lenis: lenis,
        lenisWasStopped: lenis ? lenis.isStopped : false
      };
      if (lenis) lenis.stop();
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    overlay.inert = false;
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.add("open");
    (closeButton || drawer).focus({ preventScroll: true });
  }

  if (closeButton) closeButton.addEventListener("click", function () { closeDrawer(); });
  if (overlay) overlay.addEventListener("click", function (event) {
    if (event.target === overlay) closeDrawer();
  });
  document.addEventListener("keydown", function (event) {
    if (overlay && overlay.classList.contains("open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDrawer();
        return;
      }
      if (event.key === "Tab") {
        const items = Array.from(drawer.querySelectorAll(focusable))
          .filter(function (node) { return !node.inert && node.getClientRects().length; });
        const first = items[0] || drawer;
        const last = items[items.length - 1] || drawer;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    } else if (event.key === "Escape" && menu && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault(); closeMenu(true);
    }
  });
  document.addEventListener("focusin", function (event) {
    if (overlay && overlay.classList.contains("open") && !drawer.contains(event.target)) {
      (closeButton || drawer).focus({ preventScroll: true });
    }
  });

  // Keep the browser's hash/history behavior and put keyboard focus at the destination.
  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
    let target;
    try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (_) { return; }
    if (!target) return;
    closeMenu(false);
    if (overlay && overlay.contains(link)) closeDrawer(false);
    const temporaryTabIndex = !target.hasAttribute("tabindex") && !target.matches(focusable);
    if (temporaryTabIndex) target.tabIndex = -1;
    event.preventDefault();
    if (location.hash !== url.hash) history.pushState(null, "", url.hash);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.__asterLenis && !reduce) {
      window.__asterLenis.scrollTo(target.getBoundingClientRect().top + window.scrollY - 96);
    } else {
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    window.setTimeout(function () { target.focus({ preventScroll: true }); }, 0);
    if (temporaryTabIndex) target.addEventListener("blur", function () { target.removeAttribute("tabindex"); }, { once: true });
  });

  const mobileCta = document.getElementById("mobileCta");
  if (mobileCta) {
    function syncMobileCta() {
      const visible = mobileCta.classList.contains("is-up");
      mobileCta.inert = !visible;
      mobileCta.setAttribute("aria-hidden", String(!visible));
    }
    syncMobileCta();
    new MutationObserver(syncMobileCta).observe(mobileCta, { attributes: true, attributeFilter: ["class"] });
  }

  const form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (event) {
      const submit = document.getElementById("contactSend");
      if (submit && submit.disabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (form.checkValidity()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const invalid = form.querySelector(":invalid");
      form.querySelectorAll("input[required], textarea[required]").forEach(function (field) {
        field.setAttribute("aria-invalid", String(!field.validity.valid));
      });
      const status = document.getElementById("contactStatus");
      if (status) {
        status.className = "form-status is-error";
        status.textContent = invalid ? invalid.validationMessage : "Please complete the required fields.";
      }
      if (invalid) {
        invalid.setAttribute("aria-describedby", "contactStatus");
        invalid.focus();
      }
    }, true);
    form.addEventListener("input", function (event) {
      if (event.target.matches("input, textarea")) {
        event.target.removeAttribute("aria-invalid");
        if (event.target.getAttribute("aria-describedby") === "contactStatus") event.target.removeAttribute("aria-describedby");
      }
    });
  }

  window.AsterStudio = Object.freeze({ openDrawer, closeDrawer });
})();
