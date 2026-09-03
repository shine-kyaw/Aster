// aster-3d.js — Interactive 3D Aster
//
// A grown flower, not a pinwheel: four whorls of round-tipped ray florets over
// a phyllotactic disc, wrapped underneath by a green involucre, on a tapering
// stem with two leaves. Petals are drawn as INSTANCED whorls (one draw call
// each) so the bloom can afford real shadow-mapped self-occlusion — which is
// what gives it depth. No transmission: a flat plane refracts nothing, it just
// costs a full backbuffer pass and washes the colour out to grey.
//
// Public: window.AsterFlower3D.mount(container, opts?)

(function () {
  const T = window.THREE;
  if (!T) { console.error('[Aster3D] three.js not loaded'); return; }

  const frac = function (x) { return x - Math.floor(x); };
  // Deterministic per-index noise — the bloom must look grown, but identically
  // grown on every load and every machine.
  const hash = function (i, seed) {
    return frac(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453);
  };
  const smooth = function (k) { return k * k * (3 - 2 * k); };

  // ────────────────────────────────────────────────────────────────────────
  // Petal — one whorl's shape. Lies in XY, grows along +X from the origin.
  //
  // The silhouette is the whole game. A ray floret is NOT a needle: it leaves
  // the disc as a narrow claw, widens fast, runs nearly parallel through the
  // body and finishes in a BLUNT ROUNDED tip. Taper it to a point instead and
  // the bloom reads as a firework.
  // ────────────────────────────────────────────────────────────────────────
  function makePetalGeo(o) {
    const segU = 26, segV = 10;
    const geo = new T.PlaneGeometry(1, 1, segU, segV);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    // Throat -> body -> margin. The throat is genuinely dark: petals overlap
    // there and the light never reaches it, which is what makes the bloom read
    // as layered rather than printed. The margin pales but never goes white —
    // white tips are what made the old bloom look like cut plastic.
    const cThroat = new T.Color(0x4a3a8e);
    const cBody   = new T.Color(0x8578cf);
    const cEdge   = new T.Color(0xbfb6ea);
    const tmp = new T.Color();

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;      // 0..1 along the length
      const cv = pos.getY(i) * 2;       // -1..1 across the width

      // Width profile: fast rise out of the claw, gentle belly, rounded cap.
      // The cap uses a circular falloff so the outline meets the tip with a
      // vertical tangent — blunt to the eye, even though the mesh closes.
      let wf = Math.pow(Math.min(1, u / 0.14), 0.6);
      wf *= 0.86 + 0.20 * Math.sin(Math.pow(u, 0.85) * Math.PI);
      if (u > 0.88) {
        const k = (u - 0.88) / 0.12;
        wf *= Math.sqrt(Math.max(0, 1 - k * k));
      }

      const x = u * o.length;
      const y0 = cv * wf * o.width;

      // Cross-section cup (a U-channel), lengthwise recurve toward the light,
      // and a rippled margin — real petal edges are never straight.
      let z0 = -(cv * cv) * o.cup * o.width * 3.2;
      z0 += Math.pow(u, 1.75) * o.curl;
      z0 += Math.sin(u * 7.4 + o.seed) * Math.pow(Math.abs(cv), 3) * o.ripple;

      const tw = o.twist * u;
      const ct = Math.cos(tw), st = Math.sin(tw);
      pos.setXYZ(i, x, y0 * ct - z0 * st, y0 * st + z0 * ct);

      if (u < 0.28) tmp.copy(cThroat).lerp(cBody, smooth(u / 0.28));
      else tmp.copy(cBody).lerp(cEdge, Math.pow((u - 0.28) / 0.72, 1.35));
      // Fake the self-occlusion along each petal's own margins, where the
      // neighbouring petal laps over it.
      const edgeShade = 1 - Math.pow(Math.abs(cv), 4) * 0.12;
      colors[i * 3]     = tmp.r * edgeShade;
      colors[i * 3 + 1] = tmp.g * edgeShade;
      colors[i * 3 + 2] = tmp.b * edgeShade;
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // A bract / leaf blade — lanceolate and genuinely pointed (unlike a petal),
  // with a shallow keel down the middle.
  function makeBladeGeo(keel) {
    const geo = new T.PlaneGeometry(1, 1, 14, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5;
      const cv = pos.getY(i) * 2;
      const wf = Math.pow(Math.min(1, u / 0.18), 0.7) * Math.pow(1 - u, 0.62);
      pos.setXYZ(i, u, cv * wf * 0.62, -(cv * cv) * keel * wf);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Surface detail. A midrib and a fan of secondary veins, drawn once into a
  // canvas and used as a bump map. At this scale the midrib is far too fine to
  // model in geometry, but it is the single detail that stops a petal reading
  // as a coloured ramp — it gives the surface a highlight to break over.
  // ────────────────────────────────────────────────────────────────────────
  function makeVeinBump() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 128);

    const mid = ctx.createLinearGradient(0, 56, 0, 72);
    mid.addColorStop(0.0, 'rgba(255,255,255,0)');
    mid.addColorStop(0.5, 'rgba(255,255,255,0.80)');
    mid.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = mid;
    ctx.fillRect(0, 56, 512, 16);

    ctx.lineCap = 'round';
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue;
      ctx.beginPath();
      ctx.moveTo(8, 64);
      ctx.bezierCurveTo(150, 64 + i * 1.9, 330, 64 + i * 5.0, 510, 64 + i * 7.0);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.20 - Math.abs(i) * 0.011) + ')';
      ctx.lineWidth = 2.0 - Math.abs(i) * 0.09;
      ctx.stroke();
    }
    // Fine longitudinal striations — the tissue between the veins.
    for (let i = 0; i < 90; i++) {
      const y = frac(Math.sin(i * 91.7) * 4193.7) * 128;
      ctx.beginPath();
      ctx.moveTo(frac(Math.sin(i * 33.1) * 771.3) * 200, y);
      ctx.lineTo(512, y + (frac(Math.sin(i * 17.9) * 2311.7) - 0.5) * 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  // Where the membrane is thin enough for light to come through — the outer
  // half of the blade, never the throat.
  function makeGlowMap() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 8;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.00, '#000000');
    g.addColorStop(0.30, '#161616');
    g.addColorStop(0.62, '#c8c8c8');
    g.addColorStop(0.86, '#ffffff');
    g.addColorStop(1.00, '#8c8c8c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 8);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Soft studio environment (equirectangular gradient) fed through PMREM, so
  // the sheen has a real gradient world to catch rather than rendering flat.
  // ────────────────────────────────────────────────────────────────────────
  function makeStudioEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#fff7f1');
    g.addColorStop(0.42, '#f2e7f6');
    g.addColorStop(0.66, '#d6c6e4');
    g.addColorStop(1.00, '#3f3150');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    const rg = ctx.createRadialGradient(150, 60, 0, 150, 60, 175);
    rg.addColorStop(0.0, 'rgba(255,252,244,0.95)');
    rg.addColorStop(1.0, 'rgba(255,252,244,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 512, 256);
    const rg2 = ctx.createRadialGradient(404, 198, 0, 404, 198, 150);
    rg2.addColorStop(0.0, 'rgba(206,188,226,0.55)');
    rg2.addColorStop(1.0, 'rgba(206,188,226,0)');
    ctx.fillStyle = rg2;
    ctx.fillRect(0, 0, 512, 256);
    const tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Build the plant.
  // ────────────────────────────────────────────────────────────────────────
  function buildFlower(store) {
    const plant = new T.Group();
    const head = new T.Group();
    plant.add(head);

    const veinTex = makeVeinBump();
    const glowTex = makeGlowMap();
    store.textures.push(veinTex, glowTex);

    // A thin, matte, velvety membrane. Sheen (not clearcoat, not gloss) is what
    // reads as petal — clearcoat reads as wet plastic. envMap gives the sheen
    // something to pick up; the emissive map fakes the light coming through the
    // outer half of the blade without paying for a transmission pass.
    const petalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.0,
      roughness: 0.50,
      side: T.DoubleSide,
      bumpMap: veinTex,
      bumpScale: 0.22,
      sheen: 1.0,
      sheenColor: new T.Color(0xfff0f6),
      sheenRoughness: 0.42,
      clearcoat: 0.0,
      specularIntensity: 0.45,
      emissive: new T.Color(0x8f74cf),
      emissiveMap: glowTex,
      emissiveIntensity: 0.22,
      envMapIntensity: 0.85,
    });
    petalMat.shadowSide = T.DoubleSide;

    const greenMat = new T.MeshPhysicalMaterial({
      color: 0x74915c,
      metalness: 0.0,
      roughness: 0.68,
      side: T.DoubleSide,
      sheen: 0.5,
      sheenColor: new T.Color(0xe6f0d2),
      sheenRoughness: 0.6,
      envMapIntensity: 0.5,
    });
    const stemMat = new T.MeshPhysicalMaterial({
      color: 0x6c8a55,
      metalness: 0.0,
      roughness: 0.62,
      sheen: 0.4,
      sheenColor: new T.Color(0xdcecc6),
      envMapIntensity: 0.5,
    });
    store.materials.push(petalMat, greenMat, stemMat);

    // ── One whorl, as a single InstancedMesh.
    const m1 = new T.Matrix4(), m2 = new T.Matrix4(), m3 = new T.Matrix4(), out = new T.Matrix4();
    const q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3();
    const tint = new T.Color();

    function addWhorl(parent, mat, o) {
      const geo = makePetalGeo(o);
      store.geometries.push(geo);
      const im = new T.InstancedMesh(geo, mat, o.count);
      im.castShadow = true;
      im.receiveShadow = true;
      const step = (Math.PI * 2) / o.count;
      for (let i = 0; i < o.count; i++) {
        const a = hash(i, o.seed);
        const b = hash(i, o.seed + 17.3);
        const d = hash(i, o.seed + 91.7);
        // Uneven spacing, uneven droop, uneven roll and uneven length. Any one
        // of these left uniform and the ring snaps back to looking machined.
        m1.makeRotationZ(o.angleOffset + i * step + (b - 0.5) * step * 0.34);
        m2.makeRotationY(o.tiltBack + (a - 0.5) * 0.17);
        e.set((b - 0.5) * 0.24, 0, 0);
        q.setFromEuler(e);
        v.set(o.baseRadius, 0, 0);
        s.set(1 + (a - 0.5) * 0.15, 1 + (d - 0.5) * 0.16, 1);
        m3.compose(v, q, s);
        out.multiplyMatrices(m1, m2).multiply(m3);
        im.setMatrixAt(i, out);
        tint.setRGB(1 + (d - 0.5) * 0.10, 1 + (a - 0.5) * 0.06, 1 + (b - 0.5) * 0.10);
        im.setColorAt(i, tint);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      parent.add(im);
      return im;
    }

    // Four whorls. Each is shorter, tighter and more upright than the one
    // outside it, so the face domes gently instead of lying flat, and the rings
    // overlap enough that you never see through the bloom to the background.
    addWhorl(head, petalMat, { count: 34, length: 2.02, width: 0.150, cup: 0.16, curl: 0.10, twist: 0.20, ripple: 0.030, tiltBack: 0.30, baseRadius: 0.30, angleOffset: 0.00, seed: 11 });
    addWhorl(head, petalMat, { count: 28, length: 1.72, width: 0.148, cup: 0.19, curl: 0.18, twist: -0.16, ripple: 0.026, tiltBack: 0.20, baseRadius: 0.26, angleOffset: 0.11, seed: 37 });
    addWhorl(head, petalMat, { count: 22, length: 1.38, width: 0.138, cup: 0.23, curl: 0.27, twist: 0.22, ripple: 0.022, tiltBack: 0.11, baseRadius: 0.21, angleOffset: 0.07, seed: 59 });
    addWhorl(head, petalMat, { count: 16, length: 1.02, width: 0.124, cup: 0.27, curl: 0.36, twist: -0.20, ripple: 0.018, tiltBack: 0.04, baseRadius: 0.16, angleOffset: 0.19, seed: 83 });

    // ── Disc. Radius 0.40 — deliberately WIDER than every whorl's baseRadius,
    // so the petal claws pass underneath it and the ring of daylight that used
    // to sit between the rays and the centre is gone.
    const DR = 0.46;
    const discGeo = new T.SphereGeometry(DR * 1.02, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2.05);
    const discMat = new T.MeshStandardMaterial({
      color: 0x8a5a22, roughness: 0.92, metalness: 0.0, side: T.DoubleSide,
    });
    store.geometries.push(discGeo);
    store.materials.push(discMat);
    const disc = new T.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.scale.set(1, 0.30, 1);
    disc.position.z = 0.02;
    disc.receiveShadow = true;
    head.add(disc);

    // ── Disc florets, on the golden angle. A composite flower's disc really is
    // a phyllotactic spiral, and the eye knows the difference between that and
    // scattered dots even when it can't name it. Outer florets are open and
    // larger; the centre is still packed buds.
    const GA = Math.PI * (3 - Math.sqrt(5));
    const N = 640;
    const floretGeo = new T.SphereGeometry(1, 6, 5);
    // r160 only folds instanceColor into diffuse under USE_COLOR — i.e. only
    // when the material has vertexColors on. And USE_COLOR without a `color`
    // attribute reads the generic default (0,0,0), which would render every
    // floret black. So the material opts in AND the geometry carries a flat
    // white attribute for the per-instance colour to multiply against.
    floretGeo.setAttribute('color', new T.BufferAttribute(
      new Float32Array(floretGeo.attributes.position.count * 3).fill(1), 3));
    const floretMat = new T.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.74, metalness: 0.0,
      emissive: new T.Color(0x5c3a0e), emissiveIntensity: 0.16,
    });
    store.geometries.push(floretGeo);
    store.materials.push(floretMat);
    const florets = new T.InstancedMesh(floretGeo, floretMat, N);
    // Deliberately NOT a shadow caster. At this scale each floret shadows its
    // own neighbours into a single muddy tan disc — the granularity that makes
    // the eye read "pollen" disappears and you get a flat brown button.
    florets.castShadow = false;
    florets.receiveShadow = false;
    const cCore = new T.Color(0xd98a2c);   // warm amber at the packed centre
    const cMidD = new T.Color(0xf2b544);
    const cRim  = new T.Color(0xffe9a8);
    const sv = new T.Vector3();
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const rr = Math.sqrt(t) * DR;
      const ang = i * GA;
      const j = hash(i, 5.1);
      const zz = 0.160 * (1 - (rr / DR) * (rr / DR)) + 0.03 + (j - 0.5) * 0.008;
      const sc = 0.0180 + 0.0100 * t + (hash(i, 23.7) - 0.5) * 0.005;
      out.makeTranslation(Math.cos(ang) * rr, Math.sin(ang) * rr, zz);
      sv.set(sc, sc, sc * 0.82);
      out.scale(sv);
      florets.setMatrixAt(i, out);
      if (t < 0.55) tint.copy(cCore).lerp(cMidD, smooth(t / 0.55));
      else tint.copy(cMidD).lerp(cRim, smooth((t - 0.55) / 0.45));
      tint.multiplyScalar(0.92 + j * 0.16);
      florets.setColorAt(i, tint);
    }
    florets.instanceMatrix.needsUpdate = true;
    if (florets.instanceColor) florets.instanceColor.needsUpdate = true;
    head.add(florets);

    // ── Receptacle: the green underside of the head. Without this, turning the
    // bloom showed a hollow shell — which is most of why the old one fell apart
    // the moment you dragged it.
    const recGeo = new T.SphereGeometry(0.53, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    store.geometries.push(recGeo);
    const receptacle = new T.Mesh(recGeo, greenMat);
    receptacle.rotation.x = -Math.PI / 2;
    receptacle.scale.set(1, 0.48, 1);
    receptacle.position.z = -0.02;
    receptacle.castShadow = true;
    receptacle.receiveShadow = true;
    head.add(receptacle);

    // ── Involucre: three rows of bracts wrapping the back, each row shorter and
    // laid further back than the one below it.
    const bractGeo = makeBladeGeo(0.34);
    store.geometries.push(bractGeo);
    const ROWS = [
      { count: 14, len: 0.66, wid: 0.30, tilt: 1.16, rad: 0.36, off: 0.00, seed: 3 },
      { count: 12, len: 0.54, wid: 0.27, tilt: 1.44, rad: 0.30, off: 0.22, seed: 29 },
      { count: 10, len: 0.42, wid: 0.24, tilt: 1.70, rad: 0.22, off: 0.41, seed: 47 },
    ];
    let total = 0;
    ROWS.forEach(function (r) { total += r.count; });
    const bracts = new T.InstancedMesh(bractGeo, greenMat, total);
    bracts.castShadow = true;
    bracts.receiveShadow = true;
    let bi = 0;
    ROWS.forEach(function (r) {
      const step = (Math.PI * 2) / r.count;
      for (let i = 0; i < r.count; i++) {
        const a = hash(i, r.seed), b = hash(i, r.seed + 13.7);
        m1.makeRotationZ(r.off + i * step + (b - 0.5) * step * 0.3);
        m2.makeRotationY(r.tilt + (a - 0.5) * 0.14);
        e.set((b - 0.5) * 0.2, 0, 0);
        q.setFromEuler(e);
        v.set(r.rad, 0, 0);
        s.set(r.len * (1 + (a - 0.5) * 0.18), r.wid, r.wid);
        m3.compose(v, q, s);
        out.multiplyMatrices(m1, m2).multiply(m3);
        bracts.setMatrixAt(bi++, out);
      }
    });
    bracts.instanceMatrix.needsUpdate = true;
    head.add(bracts);

    // ── Stem. Emerges from behind and below the receptacle and falls out of the
    // bottom of the frame; tapers thicker downward, the way a real pedicel does.
    const path = new T.CatmullRomCurve3([
      new T.Vector3(0.00, -0.14, -0.12),
      new T.Vector3(0.07, -0.90, -0.28),
      new T.Vector3(-0.05, -1.72, -0.42),
      // Runs past the bottom of the frame on purpose. Ending it just inside
      // read as an amputated stub with the bloom balanced on a nub.
      new T.Vector3(0.06, -3.70, -0.62),
    ]);
    const TSEG = 44, RSEG = 12;
    const stemGeo = new T.TubeGeometry(path, TSEG, 0.058, RSEG, false);
    const sp = stemGeo.attributes.position;
    const ring = RSEG + 1;
    const centre = new T.Vector3(), pt = new T.Vector3();
    for (let i = 0; i < sp.count; i++) {
      const t = Math.floor(i / ring) / TSEG;
      path.getPointAt(t, centre);
      pt.fromBufferAttribute(sp, i).sub(centre).multiplyScalar(0.72 + 0.62 * t).add(centre);
      sp.setXYZ(i, pt.x, pt.y, pt.z);
    }
    sp.needsUpdate = true;
    stemGeo.computeVertexNormals();
    store.geometries.push(stemGeo);
    const stem = new T.Mesh(stemGeo, stemMat);
    stem.castShadow = true;
    stem.receiveShadow = true;
    plant.add(stem);

    // ── Two leaves, seated on the stem and angled apart.
    const leafGeo = makeBladeGeo(0.22);
    store.geometries.push(leafGeo);
    [
      { t: 0.66, len: 0.92, wid: 0.42, spin: 0.46, lift: -0.34, roll: 0.30 },
      { t: 0.86, len: 0.76, wid: 0.36, spin: -2.68, lift: -0.28, roll: -0.26 },
    ].forEach(function (L) {
      const leaf = new T.Mesh(leafGeo, greenMat);
      path.getPointAt(L.t, centre);
      leaf.position.copy(centre);
      leaf.rotation.set(L.roll, L.lift, L.spin, 'ZYX');
      leaf.scale.set(L.len, L.wid, L.wid);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      plant.add(leaf);
    });

    return plant;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mount.
  // ────────────────────────────────────────────────────────────────────────
  function mount(container, opts) {
    opts = opts || {};
    const reducedMotion = opts.reducedMotion != null ? opts.reducedMotion :
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const store = { geometries: [], materials: [], textures: [] };

    const scene = new T.Scene();
    if (opts.background) scene.background = new T.Color(opts.background);

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 800;

    const camera = new T.PerspectiveCamera(33, width / height, 0.1, 50);
    camera.position.set(0, 0, 9.4);
    camera.lookAt(0, 0, 0);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    // pan-y, NOT none: `none` swallowed vertical swipes and left a dead zone
    // the height of the canvas that mobile visitors could not scroll past.
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.cursor = 'grab';

    let envRT = null;
    try {
      const pmrem = new T.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envSrc = makeStudioEnvTexture();
      envRT = pmrem.fromEquirectangular(envSrc);
      scene.environment = envRT.texture;
      envSrc.dispose();
      pmrem.dispose();
    } catch (err) { /* env is an enhancement; render proceeds without it */ }

    // ── Lights. Warm sun as the key (and the only shadow caster — one crisp
    // shadow direction reads; several read as mud), cool sky fill, a warm rake
    // from behind for the petal edges, and a cool rim to separate the
    // silhouette from a dark page.
    scene.add(new T.HemisphereLight(0xfff3e8, 0x76855a, 0.46));

    const key = new T.DirectionalLight(0xfff1de, 2.5);
    key.position.set(-3.4, 3.6, 2.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3.0;
    key.shadow.camera.right = 3.0;
    key.shadow.camera.top = 3.0;
    key.shadow.camera.bottom = -4.4;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = 0.0;
    key.shadow.normalBias = 0.035;   // thin double-sided blades acne badly without this
    key.shadow.radius = 3;
    scene.add(key);

    const fill = new T.DirectionalLight(0xcdd9ee, 0.50);
    fill.position.set(3.6, 1.0, 2.2);
    scene.add(fill);

    const back = new T.DirectionalLight(0xffe2c6, 1.45);
    back.position.set(-0.6, 1.6, -4.2);
    scene.add(back);

    const rim = new T.DirectionalLight(0xf0e4ff, 0.95);
    rim.position.set(2.6, 2.4, -3.2);
    scene.add(rim);

    // ── User drag lives on `root`; idle drift lives on `floatGroup`, so the two
    // compose without fighting.
    const root = new T.Group();
    const floatGroup = new T.Group();
    const bloom = buildFlower(store);
    floatGroup.add(bloom);
    root.add(floatGroup);
    scene.add(root);

    const FRONT_X = -0.10;
    const FRONT_Y = 0.0;
    root.rotation.x = FRONT_X;
    root.rotation.y = FRONT_Y;

    let revealed = false;
    let revealStart = 0;
    let homing = false;
    let velX = 0, velY = 0, pendingVX = 0, pendingVY = 0;

    function triggerReveal(now) {
      revealed = true;
      revealStart = now;
      homing = true;
      velX = 0; velY = 0; pendingVX = 0; pendingVY = 0;
    }

    // ── Visibility. The old build kept a WebGL context churning through every
    // frame of the page it was nowhere near; now the loop only runs on screen.
    let onScreen = false;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        onScreen = en.isIntersecting;
        if (en.isIntersecting) {
          triggerReveal(performance.now());
          if (rafId == null) { lastFrame = performance.now(); rafId = requestAnimationFrame(tick); }
        }
      });
    }, { threshold: 0.08 });
    io.observe(container);

    // ── Pointer (custom, not OrbitControls — the feel matters).
    let dragging = false;
    let lastX = 0, lastY = 0;
    let hovered = false;
    let leanX = 0, leanY = 0, leanTX = 0, leanTY = 0;

    const SENS = 0.0060;
    const X_CLAMP = 1.10;
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerenter', function () {
      hovered = true;
      if (!dragging) canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('pointerleave', function () {
      hovered = false;
      leanTX = 0; leanTY = 0;
      if (!dragging) canvas.style.cursor = 'default';
    });
    canvas.addEventListener('pointerdown', function (ev) {
      dragging = true;
      homing = false;
      lastX = ev.clientX; lastY = ev.clientY;
      velX = 0; velY = 0; pendingVX = 0; pendingVY = 0;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(ev.pointerId); } catch (err) {}
      if (ev.pointerType !== 'touch') ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!dragging) {
        // Idle: the bloom leans a little toward the cursor. Small enough to
        // register as attention rather than as a second animation.
        const r = canvas.getBoundingClientRect();
        leanTY = ((ev.clientX - r.left) / r.width - 0.5) * 0.26;
        leanTX = ((ev.clientY - r.top) / r.height - 0.5) * 0.16;
        return;
      }
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      const dRy = dx * SENS;
      const dRx = dy * SENS;
      root.rotation.y += dRy;
      root.rotation.x += dRx;
      root.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, root.rotation.x));
      pendingVX = pendingVX * 0.55 + dRx * 0.45;
      pendingVY = pendingVY * 0.55 + dRy * 0.45;
    });
    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      velX = pendingVX; velY = pendingVY;
      pendingVX = 0; pendingVY = 0;
      canvas.style.cursor = hovered ? 'grab' : 'default';
      try { if (ev && ev.pointerId != null) canvas.releasePointerCapture(ev.pointerId); } catch (err) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

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
    let lastFrame = performance.now();
    let rafId = null;

    function tick(now) {
      const dt = Math.min(50, now - lastFrame);
      lastFrame = now;
      const f = dt / 16.6667;

      const ft = revealed ? (now - revealStart) / 1000 : 0;
      let amp = 0;
      if (revealed && !reducedMotion) {
        const lin = Math.min(1, Math.max(0, (ft - 0.35) / 1.5));
        amp = lin * lin * (3 - 2 * lin);
      }

      if (homing) {
        root.rotation.x += (FRONT_X - root.rotation.x) * 0.085 * f;
        root.rotation.y += (FRONT_Y - root.rotation.y) * 0.085 * f;
        if (Math.abs(root.rotation.x - FRONT_X) < 0.004 &&
            Math.abs(root.rotation.y - FRONT_Y) < 0.004) {
          root.rotation.x = FRONT_X;
          root.rotation.y = FRONT_Y;
          homing = false;
        }
      } else if (!dragging) {
        const damp = Math.pow(0.93, f);
        velX *= damp; velY *= damp;
        root.rotation.x += velX * f;
        root.rotation.y += velY * f;
        root.rotation.x = Math.max(-X_CLAMP, Math.min(X_CLAMP, root.rotation.x));
      }

      // Idle float — incommensurate frequencies, so it drifts around the front
      // view and always comes back rather than slowly turning its back on you.
      // Drift and pointer-lean are summed into locals and ASSIGNED once: `+=`
      // on rotation here would compound the lean every frame the drift block
      // was skipped (reduced motion), and quietly spin the bloom away.
      if (!dragging) {
        leanX += (leanTX - leanX) * 0.055 * f;
        leanY += (leanTY - leanY) * 0.055 * f;
      }
      if (!reducedMotion) {
        const bobY   = (Math.sin(ft * 1.10) * 0.070 + Math.sin(ft * 0.47 + 1.3) * 0.028) * amp;
        const driftX = (Math.sin(ft * 0.63 + 0.7) * 0.048) * amp;
        floatGroup.position.set(driftX, bobY, 0);
        floatGroup.rotation.x = (Math.sin(ft * 0.55) * 0.046 + Math.sin(ft * 1.05 + 0.9) * 0.018) * amp + leanX;
        floatGroup.rotation.z = (Math.sin(ft * 0.43 + 2.1) * 0.055) * amp;
        floatGroup.rotation.y = (Math.sin(ft * 0.37 + 0.4) * 0.120) * amp + leanY;
      } else {
        floatGroup.rotation.x = leanX;
        floatGroup.rotation.y = leanY;
      }

      const targetLift = (hovered || dragging) ? 0.075 : 0.0;
      hoverLift += (targetLift - hoverLift) * 0.10 * f;
      root.position.y = hoverLift;

      renderer.render(scene, camera);

      if (onScreen) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;   // parked; the observer restarts it on re-entry
      }
    }
    rafId = requestAnimationFrame(tick);

    return {
      dispose: function () {
        if (rafId != null) cancelAnimationFrame(rafId);
        ro.disconnect();
        io.disconnect();
        if (envRT) envRT.dispose();
        store.geometries.forEach(function (g) { g.dispose(); });
        store.materials.forEach(function (m) { m.dispose(); });
        store.textures.forEach(function (t) { t.dispose(); });
        renderer.dispose();
        canvas.remove();
      },
      reveal: function () { triggerReveal(performance.now()); },
      scene: scene, camera: camera, renderer: renderer, root: root, bloom: bloom,
    };
  }

  window.AsterFlower3D = { mount: mount };
})();
