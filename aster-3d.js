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
  function makePetalGeo({ length, maxWidth, cup, curl, twist }) {
    const segU = 20;   // smoother lengthwise curve
    const segV = 7;
    const geo = new T.PlaneGeometry(1, 1, segU, segV);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Botanical gradient: a real ray petal is deeper/cooler at the shadowed
    // throat where petals overlap, and pales to a luminous, almost translucent
    // edge at the tip where light passes through. This falloff (not gloss) is
    // what makes a petal read as a living membrane.
    // Periwinkle blue-violet to match the watercolor logo: deep at the
    // shadowed throat, periwinkle through the body, cool pale at the sunlit edge.
    const cBase = new T.Color(0x6857bf);  // deep periwinkle-violet (throat)
    const cMid  = new T.Color(0x9385da);  // periwinkle body
    const cTip  = new T.Color(0xe7e2f8);  // cool, near-white translucent edge

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;     // 0..1 along length
      const v = pos.getY(i) + 0.5;     // 0..1 across width
      const cv = (v - 0.5) * 2;        // -1..1

      // Width profile — narrow claw at the base, a soft belly through the
      // middle, gently rounded taper to the tip. Reads as a petal, not a strap.
      let wf = Math.min(1, u * 4.5);
      wf *= 1 - Math.pow(u, 3.0) * 0.80;
      wf *= 0.82 + 0.30 * Math.sin(Math.min(1, u) * Math.PI);

      const x = u * length;
      const y0 = cv * wf * maxWidth;

      // Cross-section cup (U-channel) + lengthwise recurve (the petal arcs
      // forward toward the light, the way ray florets curve out of the disc).
      let z0 = -(cv * cv) * cup * wf;
      z0 += Math.pow(u, 1.6) * curl;

      // Gentle twist along the length — no two edges catch the light the same.
      const tw = twist * u;
      const ct = Math.cos(tw), st = Math.sin(tw);
      const y = y0 * ct - z0 * st;
      const z = y0 * st + z0 * ct;

      pos.setX(i, x);
      pos.setY(i, y);
      pos.setZ(i, z);

      // base → mid → tip falloff
      let r, g, b;
      if (u < 0.5) {
        const k = u / 0.5;
        r = cBase.r + (cMid.r - cBase.r) * k;
        g = cBase.g + (cMid.g - cBase.g) * k;
        b = cBase.b + (cMid.b - cBase.b) * k;
      } else {
        const k = (u - 0.5) / 0.5;
        r = cMid.r + (cTip.r - cMid.r) * k;
        g = cMid.g + (cTip.g - cMid.g) * k;
        b = cMid.b + (cTip.b - cMid.b) * k;
      }
      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
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
  // Soft studio environment (equirectangular gradient) — fed through PMREM so
  // the physical petal material has something real to reflect. This is what
  // gives the sheen + clearcoat their premium, light-catching satin quality
  // instead of a flat matte. Warm sky above, lavender mid, deep base, plus a
  // single soft key highlight for a believable specular glint.
  // ────────────────────────────────────────────────────────────────────────
  function makeStudioEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#fff7f1');   // warm light from above
    g.addColorStop(0.42, '#f4e9f8');   // soft lavender sky
    g.addColorStop(0.66, '#ddccea');   // horizon
    g.addColorStop(1.00, '#4d3c5e');   // shadowed ground
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // Soft key-light bloom (upper-left) → crisp but gentle specular highlight
    const rg = ctx.createRadialGradient(150, 64, 0, 150, 64, 170);
    rg.addColorStop(0.0, 'rgba(255,252,244,0.95)');
    rg.addColorStop(1.0, 'rgba(255,252,244,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 512, 256);
    // Faint cool counter-glow (lower-right) for dimensional fill
    const rg2 = ctx.createRadialGradient(400, 200, 0, 400, 200, 150);
    rg2.addColorStop(0.0, 'rgba(214,196,230,0.55)');
    rg2.addColorStop(1.0, 'rgba(214,196,230,0)');
    ctx.fillStyle = rg2;
    ctx.fillRect(0, 0, 512, 256);
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Build the bloom.
  // ────────────────────────────────────────────────────────────────────────
  function buildFlower() {
    const bloomGroup = new T.Group();

    // ── Material — a thin, living petal membrane.
    // The defining quality of a real petal is TRANSLUCENCY: it is thin enough
    // that light passes through and glows from within (most visible when
    // backlit). We model that with transmission + thickness + a warm rosy
    // attenuation, kept rough so the transmitted light is *diffuse* (a frosted,
    // luminous petal — never clear glass). Surface is matte-velvety with a
    // soft sheen at the edge; deliberately NO clearcoat and NO iridescence —
    // those read as wet plastic, not flora. Vertex colors carry the
    // throat→tip falloff; a whisper of emissive fakes subsurface self-glow.
    const petalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.0,
      roughness: 0.62,                          // soft, diffuse — matte petal
      side: T.DoubleSide,
      transmission: 0.55,                       // light passes through the membrane
      thickness: 0.45,                          // absorption depth → SSS feel
      ior: 1.40,
      attenuationColor: new T.Color(0xf0c8df),  // warm rosy glow of backlit petals
      attenuationDistance: 1.1,
      sheen: 0.7,                               // velvety, light-catching edge
      sheenColor: new T.Color(0xffe9f0),
      sheenRoughness: 0.65,
      clearcoat: 0.0,
      specularIntensity: 0.35,                  // gentle, soft highlights (not plastic)
      emissive: new T.Color(0xb692d8),          // faint lit-from-within glow
      emissiveIntensity: 0.05,
      envMapIntensity: 0.4,
    });

    // ── Petals — radiating ray florets, layered like a real aster. Density +
    // natural per-petal variation (length, spacing, droop, roll) is what makes
    // it read as grown rather than manufactured.
    function addRing({ count, length, width, cup, curl, twist, tiltBack,
                       angleOffset, baseRadius, jitterSeed }) {
      const geo = makePetalGeo({ length, maxWidth: width, cup, curl, twist });
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const ang = angleOffset + t * Math.PI * 2;
        // Two deterministic pseudo-randoms per petal for varied, organic asymmetry
        const ra = (Math.sin((i + jitterSeed) * 12.9898) * 43758.5453) % 1;
        const jr = ra - Math.floor(ra);
        const rb = (Math.sin((i + jitterSeed) * 78.2330) * 12543.1230) % 1;
        const jr2 = rb - Math.floor(rb);

        const lenJit   = 1 + (jr  - 0.5) * 0.12;   // varied petal lengths
        const widJit   = 1 + (jr2 - 0.5) * 0.10;
        const angJit   = (jr2 - 0.5) * 0.05;        // uneven spacing
        const pitchJit = (jr  - 0.5) * 0.13;        // some droop, some lift
        const rollJit  = (jr2 - 0.5) * 0.10;        // slight roll — catches light unevenly

        const wrap = new T.Group();
        wrap.rotation.z = ang + angJit;

        const tilt = new T.Group();
        tilt.rotation.y = tiltBack + pitchJit;

        const m = new T.Mesh(geo, petalMat);
        m.position.set(baseRadius, 0, 0);
        m.rotation.x = rollJit;
        m.scale.set(lenJit, widJit, 1);
        tilt.add(m);
        wrap.add(tilt);
        bloomGroup.add(wrap);
      }
    }

    // Outer ring — long, open, leaning gently back; the silhouette of the bloom.
    addRing({
      count: 26, length: 2.05, width: 0.145, cup: 0.16, curl: 0.26, twist: 0.22,
      tiltBack: 0.36, angleOffset: 0,
      baseRadius: 0.30, jitterSeed: 11,
    });
    // Inner ring — shorter, more recurved, half-offset to fill the gaps so the
    // bloom layers densely toward the disc (overlap → translucent inner glow).
    addRing({
      count: 20, length: 1.62, width: 0.135, cup: 0.22, curl: 0.40, twist: -0.18,
      tiltBack: 0.12, angleOffset: Math.PI / 20,
      baseRadius: 0.22, jitterSeed: 37,
    });

    // ── Center — a warm coral dome, matching the brand asters (hero /
    // process flowers all use a coral center, deepening outward:
    // #d97757 → #e89a7c). Replaces the prior honey-gold for cohesion.
    const centerGeo = new T.SphereGeometry(0.27, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2.1);
    const centerMat = new T.MeshStandardMaterial({
      color: 0xd79a3c,        // golden-amber disc (the aster's pollen eye)
      roughness: 0.88,        // matte, powdery — like packed pollen, not a bead
      metalness: 0.0,
      side: T.DoubleSide,     // never cull to a hole
      emissive: 0x4a2f0c,     // faint warm depth
      emissiveIntensity: 0.14,
    });
    const center = new T.Mesh(centerGeo, centerMat);
    center.rotation.x = Math.PI / 2;    // dome apex faces the camera (+Z)
    center.scale.set(1.0, 0.62, 1.0);   // flatten the dome height → a low pollen mound
    center.position.z = 0.05;
    bloomGroup.add(center);

    // ── Stippled pollen — a tight cluster of tiny grains mounded over the
    // dome, the way a real aster disc reads. Deterministic placement with
    // size + colour variation so it looks packed and organic, never patterned.
    const grainGeo = new T.SphereGeometry(1, 8, 6);
    const grainMats = [0xf3d070, 0xe6b248, 0xcf9234, 0xf7e09a].map((c) =>
      new T.MeshStandardMaterial({
        color: c, roughness: 0.72, metalness: 0.0,
        emissive: 0x4a3110, emissiveIntensity: 0.12,
      })
    );
    const frac = (x) => x - Math.floor(x);
    const DR = 0.27, DH = 0.62, cz = 0.05;
    for (let k = 0; k < 64; k++) {
      const a = frac(Math.sin((k + 1) * 12.9898) * 43758.5453);
      const b = frac(Math.sin((k + 1) * 78.2330) * 12543.1230);
      const c = frac(Math.sin((k + 1) * 37.7190) *  9871.2310);
      const rr  = Math.sqrt(a) * DR * 0.95;        // sqrt → even area density
      const ang = b * Math.PI * 2;
      const gx  = Math.cos(ang) * rr;
      const gy  = Math.sin(ang) * rr;
      const gz  = Math.sqrt(Math.max(0, DR * DR - rr * rr)) * DH + cz;  // ride the dome
      const grain = new T.Mesh(grainGeo, grainMats[k & 3]);
      grain.position.set(gx, gy, gz);
      grain.scale.setScalar(0.020 + c * 0.016);
      bloomGroup.add(grain);
    }

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

    // ── Image-based lighting — soft studio env via PMREM. The single biggest
    // lift to the material's realism: sheen, clearcoat and iridescence now
    // reflect a real gradient world rather than rendering flat.
    let envRT = null;
    try {
      const pmrem = new T.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envSrc = makeStudioEnvTexture();
      envRT = pmrem.fromEquirectangular(envSrc);
      scene.environment = envRT.texture;
      envSrc.dispose();
      pmrem.dispose();
    } catch (e) { /* env is an enhancement; render proceeds without it */ }

    // ── Lights — naturalistic garden daylight. A real bloom is lit by a warm
    // sun, a cool sky, and a soft green bounce off the foliage below — and,
    // crucially, a strong warm light from BEHIND that pushes through the thin
    // petals and makes them glow (the effect the transmission material exists
    // for). This warm-key / cool-fill / hot-backlight balance is what sells it.
    const hemi = new T.HemisphereLight(0xfff3e8, 0x7d8a5e, 0.55);  // warm sky / green ground bounce
    scene.add(hemi);

    // Sun — warm key, high and to the side.
    const key = new T.DirectionalLight(0xfff1de, 2.2);
    key.position.set(-2.6, 4.8, 3.4);
    scene.add(key);

    // Sky fill — cool, soft, opposite the sun, opening the shadows.
    const fill = new T.DirectionalLight(0xcdd9ee, 0.45);
    fill.position.set(3.6, 1.0, 2.2);
    scene.add(fill);

    // Backlight — THE light for petal glow: strong, warm, low and behind, so it
    // rakes through the translucent membranes and lights every overlapping edge.
    const back = new T.DirectionalLight(0xffe2c6, 2.6);
    back.position.set(-0.6, 1.6, -4.2);
    scene.add(back);

    // A softer cool rim from upper-right-behind for crisp dimensional edges.
    const rim = new T.DirectionalLight(0xffe8f0, 1.1);
    rim.position.set(2.4, 2.6, -3.0);
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

    // ── Entrance / reveal state.
    // "Front" pose: face-on to the camera with a whisper of top-down tilt so
    // the bloom reads as 3D rather than a flat disc. Every time the section
    // scrolls into view we home back to this, hold a beat, then ease the idle
    // float in — the bloom always greets you face-first, then drifts.
    const FRONT_X = -0.10;
    const FRONT_Y = 0.0;
    root.rotation.x = FRONT_X;
    root.rotation.y = FRONT_Y;

    let revealed = false;
    let revealStart = 0;
    let homing = false;        // actively easing back toward FRONT
    let userInteracted = false;

    function triggerReveal(now) {
      revealed = true;
      revealStart = now;
      homing = true;
      velX = 0; velY = 0; pendingVX = 0; pendingVY = 0;
    }

    // Watch the container; greet front-first on every entry into view.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) triggerReveal(performance.now());
      });
    }, { threshold: 0.3 });
    io.observe(container);

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
      homing = false;          // user takes over — stop auto-homing to front
      userInteracted = true;
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

      // Float phase + amplitude are anchored to the reveal (not to mount), so
      // the bloom always starts from a still, face-on front pose and the drift
      // grows in afterward.
      const ft = revealed ? (now - revealStart) / 1000 : 0;
      let amp = 0;
      if (revealed && !reducedMotion) {
        const lin = Math.min(1, Math.max(0, (ft - 0.35) / 1.5));  // brief front-hold, then ease in
        amp = lin * lin * (3 - 2 * lin);                          // smoothstep
      }

      if (homing) {
        // Ease back to the face-on front pose — the front greeting.
        root.rotation.x += (FRONT_X - root.rotation.x) * 0.085 * f;
        root.rotation.y += (FRONT_Y - root.rotation.y) * 0.085 * f;
        if (Math.abs(root.rotation.x - FRONT_X) < 0.004 &&
            Math.abs(root.rotation.y - FRONT_Y) < 0.004) {
          root.rotation.x = FRONT_X;
          root.rotation.y = FRONT_Y;
          homing = false;
        }
      } else if (!dragging) {
        // Spin-down from release momentum (a flick still glides to rest).
        const damp = Math.pow(0.93, f);
        velX *= damp; velY *= damp;
        root.rotation.x += velX * f;
        root.rotation.y += velY * f;
        root.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, root.rotation.x));
      }

      // ── Idle float — gentle bob + sway on floatGroup, scaled by `amp` so it
      // blooms in after the front greeting. Bounded and built from
      // incommensurate frequencies, so it floats *around* the front view and
      // always returns — it never turns its back to you.
      if (!reducedMotion) {
        const bobY   = (Math.sin(ft * 1.10) * 0.075 + Math.sin(ft * 0.47 + 1.3) * 0.03) * amp;
        const driftX = (Math.sin(ft * 0.63 + 0.7) * 0.05) * amp;
        floatGroup.position.set(driftX, bobY, 0);
        floatGroup.rotation.x = (Math.sin(ft * 0.55) * 0.05 + Math.sin(ft * 1.05 + 0.9) * 0.02) * amp;
        floatGroup.rotation.z = (Math.sin(ft * 0.43 + 2.1) * 0.06) * amp;
        floatGroup.rotation.y = (Math.sin(ft * 0.37 + 0.4) * 0.13) * amp;  // gentle turn — "floating around"
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
        io.disconnect();
        if (envRT) envRT.dispose();
        renderer.dispose();
        canvas.remove();
      },
      reveal() { triggerReveal(performance.now()); },
      scene, camera, renderer, root, bloom,
    };
  }

  window.AsterFlower3D = { mount };
})();
