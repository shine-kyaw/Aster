// aster-3d.js — Interactive 3D Aster flower (sleek edition)
//
// Stripped back to its essentials. Two rings of pale, slightly cupped petals
// around a small honey center. Soft ivory → faint blush. No twist, no
// transmission tricks, no instanced florets — restraint over flourish.
//
// Public: window.AsterFlower3D.mount(container, opts?)

(function () {
  const T = window.THREE;
  if (!T) { console.error('[Aster3D] three.js not loaded'); return; }

  // ────────────────────────────────────────────────────────────────────────
  // Petal — one shape, used by both rings.
  // Lies in XY, grows along +X from origin. Strap silhouette, soft cup,
  // a touch of lift at the tip. Vertex colors carry a faint base→tip blush.
  // ────────────────────────────────────────────────────────────────────────
  function makePetalGeo({ length, maxWidth, cup, tipLift }) {
    const segU = 12;
    const segV = 6;
    const geo = new T.PlaneGeometry(1, 1, segU, segV);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Lighter, airier palette to match the brand asters (aster-light →
    // aster-mist). The base keeps just enough depth to read 3D form;
    // the tip lifts to a near-white lavender mist for a luminous edge.
    const cBase = new T.Color(0xb79ed8);  // soft lavender — gentle base shadow
    const cMid  = new T.Color(0xceb4e8);  // aster-light, airy
    const cTip  = new T.Color(0xf6f1fc);  // near-white lavender mist

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;     // 0..1 along length
      const v = pos.getY(i) + 0.5;     // 0..1 across width
      const cv = (v - 0.5) * 2;        // -1..1

      // Strap silhouette — quick ramp from base, soft tapered tip
      let wf = Math.min(1, u * 6);
      wf *= 1 - Math.pow(u, 3.2) * 0.78;

      const x = u * length;
      const y = cv * wf * maxWidth;

      // Gentle U-channel cup + soft tip lift
      const cupZ  = -(cv * cv) * cup * wf;
      const liftZ = Math.pow(u, 1.8) * tipLift;

      pos.setX(i, x);
      pos.setY(i, y);
      pos.setZ(i, cupZ + liftZ);

      // Vertex color — base → mid → tip gives each petal real form against
      // the pale ground without saturating the palette.
      if (u < 0.5) {
        const k = u / 0.5;
        colors[i * 3 + 0] = cBase.r + (cMid.r - cBase.r) * k;
        colors[i * 3 + 1] = cBase.g + (cMid.g - cBase.g) * k;
        colors[i * 3 + 2] = cBase.b + (cMid.b - cBase.b) * k;
      } else {
        const k = (u - 0.5) / 0.5;
        colors[i * 3 + 0] = cMid.r + (cTip.r - cMid.r) * k;
        colors[i * 3 + 1] = cMid.g + (cTip.g - cMid.g) * k;
        colors[i * 3 + 2] = cMid.b + (cTip.b - cMid.b) * k;
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Soft radial canvas — used only for the ground shadow.
  // ────────────────────────────────────────────────────────────────────────
  function makeRadialTexture(stops, size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [t, color] of stops) g.addColorStop(t, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Build the bloom.
  // ────────────────────────────────────────────────────────────────────────
  function buildFlower() {
    const bloomGroup = new T.Group();

    // ── Material — one petal material, shared. Soft, matte, premium.
    // Pale lavender-blush base color paints the body; vertex colors carry
    // the base→tip falloff that gives each petal form.
    const petalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.58,                       // silkier satin (was 0.72)
      metalness: 0.0,
      side: T.DoubleSide,
      sheen: 0.95,                           // luminous petal sheen (was 0.7)
      sheenColor: new T.Color(0xfff0f4),     // delicate warm-pink sheen edge
      sheenRoughness: 0.5,
      clearcoat: 0.16,                       // subtle refined glow (was 0.08)
      clearcoatRoughness: 0.55,
    });

    // ── Petals — two rings, deliberately understated counts.
    function addRing({ count, length, width, cup, tipLift, tiltBack,
                       angleOffset, baseRadius, jitterSeed }) {
      const geo = makePetalGeo({ length, maxWidth: width, cup, tipLift });
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const ang = angleOffset + t * Math.PI * 2;
        // Deterministic micro-jitter — slight asymmetry, never showy
        const r = (Math.sin((i + jitterSeed) * 12.9898) * 43758.5453) % 1;
        const jr = r - Math.floor(r);
        const lenJit  = 1 + (jr - 0.5) * 0.05;
        const angJit  = (jr - 0.5) * 0.035;
        const tiltJit = (jr - 0.5) * 0.06;

        const wrap = new T.Group();
        wrap.rotation.z = ang + angJit;

        const tilt = new T.Group();
        tilt.rotation.y = tiltBack + tiltJit;

        const m = new T.Mesh(geo, petalMat);
        m.position.set(baseRadius, 0, 0);
        m.scale.set(lenJit, 1, 1);
        tilt.add(m);
        wrap.add(tilt);
        bloomGroup.add(wrap);
      }
    }

    // Three layered rings give the bloom a lush, full aster silhouette
    // (real asters have many fine rays). Counts kept tasteful so it reads
    // refined, not busy.
    // Back ring — longest, leans back a touch
    addRing({
      count: 24, length: 2.0, width: 0.155, cup: 0.16, tipLift: 0.14,
      tiltBack: 0.34, angleOffset: 0,
      baseRadius: 0.30, jitterSeed: 11,
    });
    // Mid ring — medium, half-offset
    addRing({
      count: 20, length: 1.66, width: 0.145, cup: 0.19, tipLift: 0.20,
      tiltBack: 0.05, angleOffset: Math.PI / 20,
      baseRadius: 0.24, jitterSeed: 37,
    });
    // Inner ring — short rays cupping inward toward the center, the
    // detail that makes it read as a real, full bloom rather than a
    // simple two-ring daisy.
    addRing({
      count: 16, length: 1.18, width: 0.115, cup: 0.24, tipLift: 0.30,
      tiltBack: -0.20, angleOffset: Math.PI / 12,
      baseRadius: 0.15, jitterSeed: 53,
    });

    // ── Center — a warm coral dome, matching the brand asters (hero /
    // process flowers all use a coral center, deepening outward:
    // #d97757 → #e89a7c). Replaces the prior honey-gold for cohesion.
    const centerGeo = new T.SphereGeometry(0.26, 36, 22, 0, Math.PI * 2, 0, Math.PI / 2.1);
    const centerMat = new T.MeshStandardMaterial({
      color: 0xd97757,        // bloom-deep coral (outer dome)
      roughness: 0.55,
      metalness: 0.0,
      emissive: 0x6e2f18,     // soft warm glow from within
      emissiveIntensity: 0.24,
    });
    const center = new T.Mesh(centerGeo, centerMat);
    center.rotation.x = -Math.PI / 2;
    center.scale.set(1.0, 0.55, 1.0);
    center.position.z = 0.04;
    bloomGroup.add(center);

    // Brighter coral pip at the very center — lifts the focal point and
    // gives the disc dimensional depth without dense floret meshes.
    const innerGeo = new T.SphereGeometry(0.15, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2.1);
    const innerMat = new T.MeshStandardMaterial({
      color: 0xe89a7c,        // bloom coral (lighter, the lit center)
      roughness: 0.5,
      metalness: 0.0,
      emissive: 0x7a3a22,
      emissiveIntensity: 0.28,
    });
    const inner = new T.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.scale.set(1.0, 0.5, 1.0);
    inner.position.z = 0.055;
    bloomGroup.add(inner);

    return bloomGroup;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mount.
  // ────────────────────────────────────────────────────────────────────────
  function mount(container, opts = {}) {
    const reducedMotion = opts.reducedMotion ??
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const idleRotateSpeed = opts.idleRotate ?? 0.0012;

    const scene = new T.Scene();
    if (opts.background) scene.background = new T.Color(opts.background);

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 800;

    const camera = new T.PerspectiveCamera(30, width / height, 0.1, 50);
    camera.position.set(0, 0.3, 8.8);
    camera.lookAt(0, 0, 0);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;   // a touch brighter — luminous petals
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    // ── Lights — three-point, soft but with enough rim/key contrast that
    // the petals read against the pale ground.
    const hemi = new T.HemisphereLight(0xfff6f2, 0x6a5878, 0.62);
    scene.add(hemi);

    const key = new T.DirectionalLight(0xfff6ec, 1.55);
    key.position.set(-2.5, 4.5, 4.0);
    scene.add(key);

    const fill = new T.DirectionalLight(0xd8c8e4, 0.60);   // soft lavender fill
    fill.position.set(3.5, 1.2, 2.5);
    scene.add(fill);

    // Rim — the most important light. Soft warm backlight lifts every petal
    // edge into a luminous halo against the cream background.
    const rim = new T.DirectionalLight(0xffe6dc, 1.5);     // brighter (was 1.25)
    rim.position.set(-0.8, 1.2, -4.0);
    scene.add(rim);

    // ── Soft ground shadow on a fixed plane.
    const shadowTex = makeRadialTexture([
      [0.00, 'rgba(58,40,52,0.42)'],
      [0.40, 'rgba(58,40,52,0.16)'],
      [0.80, 'rgba(58,40,52,0.03)'],
      [1.00, 'rgba(58,40,52,0)'],
    ], 384);
    const shadowMat = new T.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false,
    });
    const shadowMesh = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -1.6;
    scene.add(shadowMesh);

    // ── The user-rotated group, with a child float group that bobs and
    // sways gently regardless of input. User drag lives on `root`; idle
    // motion lives on `floatGroup` so the two compose cleanly.
    const root = new T.Group();
    const floatGroup = new T.Group();
    const bloom = buildFlower();
    floatGroup.add(bloom);
    root.add(floatGroup);
    scene.add(root);

    // Initial pose — slight three-quarter tilt so the form reads at rest.
    root.rotation.x = -0.20;
    root.rotation.y = 0.18;

    // ── Pointer interaction (custom; no OrbitControls — feel matters).
    let dragging = false;
    let lastX = 0, lastY = 0;
    let velX = 0, velY = 0;
    let pendingVX = 0, pendingVY = 0;
    let hovered = false;

    const SENS = 0.0060;
    const X_CLAMP = 1.10;

    const canvas = renderer.domElement;

    canvas.addEventListener('pointerenter', () => {
      hovered = true;
      if (!dragging) canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('pointerleave', () => {
      hovered = false;
      if (!dragging) canvas.style.cursor = 'default';
    });
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      velX = 0; velY = 0; pendingVX = 0; pendingVY = 0;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      const dRy = dx * SENS;
      const dRx = dy * SENS;
      root.rotation.y += dRy;
      root.rotation.x += dRx;
      root.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, root.rotation.x));

      // Smooth release velocity — release feels measured, not spiky
      pendingVX = pendingVX * 0.55 + dRx * 0.45;
      pendingVY = pendingVY * 0.55 + dRy * 0.45;
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      velX = pendingVX; velY = pendingVY;
      pendingVX = 0; pendingVY = 0;
      canvas.style.cursor = hovered ? 'grab' : 'default';
      try { if (e && e.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ── Resize.
    function resize() {
      width = container.clientWidth;
      height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Loop.
    let hoverLift = 0;
    let shadowScale = 1;
    let lastFrame = performance.now();
    const startTime = performance.now();

    function tick(now) {
      const dt = Math.min(50, now - lastFrame);
      lastFrame = now;
      const f = dt / 16.6667;
      const t = (now - startTime) / 1000;  // seconds since mount

      if (!dragging) {
        const damp = Math.pow(0.93, f);
        velX *= damp; velY *= damp;
        root.rotation.x += velX * f;
        root.rotation.y += velY * f;
        root.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, root.rotation.x));

        const settled = Math.abs(velX) + Math.abs(velY) < 0.0008;
        if (settled && !reducedMotion) {
          root.rotation.y += idleRotateSpeed * f;
        }
      }

      // ── Idle float — gentle position bob and slow rotational sway on the
      // floatGroup so it composes cleanly with whatever the user has done
      // to `root`. Multiple incommensurate frequencies → never repeats,
      // never feels mechanical.
      if (!reducedMotion) {
        // vertical bob, ~5s period
        const bobY = Math.sin(t * 1.20) * 0.07
                   + Math.sin(t * 0.47 + 1.3) * 0.025;
        // tiny horizontal drift
        const driftX = Math.sin(t * 0.65 + 0.7) * 0.025;

        floatGroup.position.set(driftX, bobY, 0);

        // sway — petals tip toward whichever way the bloom is drifting
        floatGroup.rotation.x = Math.sin(t * 0.55) * 0.04
                              + Math.sin(t * 1.10 + 0.9) * 0.015;
        floatGroup.rotation.z = Math.sin(t * 0.43 + 2.1) * 0.05;
        // gentle yaw breathing
        floatGroup.rotation.y = Math.sin(t * 0.31 + 0.4) * 0.03;
      }

      // Hover lift — additive on root (separate from idle float)
      const targetLift = (hovered || dragging) ? 0.08 : 0.0;
      hoverLift += (targetLift - hoverLift) * 0.10 * f;
      root.position.y = hoverLift;

      const targetShadow = (hovered || dragging) ? 1.14 : 1.0;
      shadowScale += (targetShadow - shadowScale) * 0.10 * f;
      shadowMesh.scale.set(shadowScale, shadowScale, 1);
      shadowMesh.material.opacity = 1.0 - (shadowScale - 1.0) * 0.5;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    let rafId = requestAnimationFrame(tick);

    return {
      dispose() {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        renderer.dispose();
        canvas.remove();
      },
      scene, camera, renderer, root, bloom,
    };
  }

  window.AsterFlower3D = { mount };
})();
