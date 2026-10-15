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
  // Throat -> body -> margin (procedural fallback palette). The throat is
  // genuinely dark: petals overlap there and the light never reaches it, which
  // is what makes the bloom read as layered rather than printed. The margin
  // pales but never goes white — white tips are what made the old bloom look
  // like cut plastic.
  // The photo maps start at the claw (a whitish stub that should hide under the
  // disc). Sample from PHOTO_U0 and stretch the rest over the petal, so the
  // visible petal begins in the deep-violet throat.
  const PHOTO_U0 = 0.05, PHOTO_U1 = 0.95;
  const PHOTO_TINT = 0xc4aef0;
  const PETAL_THROAT = new T.Color(0x4a3a8e);
  const PETAL_BODY   = new T.Color(0x8578cf);
  const PETAL_EDGE   = new T.Color(0xbfb6ea);

  function makePetalGeo(o) {
    const segU = 26, segV = 10;
    const geo = new T.PlaneGeometry(1, 1, segU, segV);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

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

    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    paintPetalColours(geo, false);
    geo.computeVertexNormals();
    return geo;
  }

  // The petal's vertex colours. Two modes:
  //   procedural  the colour ramp itself (throat -> body -> margin), used
  //               until / unless the photographic maps arrive;
  //   photo       the photo colour map now carries the real tint, so the vertex
  //               colour must NOT double it — it becomes a neutral occlusion
  //               term only (dim in the throat where petals overlap and the
  //               light never reaches, plus the margin lap shade).
  function paintPetalColours(geo, photo) {
    const uv = geo.attributes.uv;
    const col = geo.attributes.color;
    const tmp = new T.Color();
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const cv = uv.getY(i) * 2 - 1;
      // Fake the self-occlusion along each petal's own margins, where the
      // neighbouring petal laps over it.
      const edgeShade = 1 - Math.pow(Math.abs(cv), 4) * 0.12;
      if (photo) {
        const ao = (0.64 + 0.36 * smooth(Math.min(1, u / 0.38))) * edgeShade;
        tmp.setRGB(ao, ao, ao);
      } else {
        if (u < 0.28) tmp.copy(PETAL_THROAT).lerp(PETAL_BODY, smooth(u / 0.28));
        else tmp.copy(PETAL_BODY).lerp(PETAL_EDGE, Math.pow((u - 0.28) / 0.72, 1.35));
        tmp.multiplyScalar(edgeShade);
      }
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
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

  // One disc floret: a slim tube that flares into a lobed mouth with a dark
  // throat. Axis is +Z, height 1. A baked ambient-occlusion ramp rides in the
  // `color` attribute (dark at the buried base and down the throat, bright at
  // the lip), so 800 instances read as individual tubes with depth between
  // them instead of a dotted plate — at about 40 triangles each.
  function makeFloretGeo() {
    const SEG = 6;
    // [height, radius, lobe depth, ao]
    const rings = [
      [0.00, 0.30, 0.00, 0.40],
      [0.58, 0.26, 0.00, 0.72],
      [1.00, 0.56, 0.22, 1.00],   // the lip, scalloped
      [0.88, 0.20, 0.00, 0.34],   // the throat, sunk below the lip
    ];
    const pos = [], col = [], idx = [];
    rings.forEach(function (r) {
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const rad = r[1] * (1 - r[2] * (k % 2));
        pos.push(Math.cos(a) * rad, Math.sin(a) * rad, r[0]);
        col.push(r[3], r[3], r[3]);
      }
    });
    pos.push(0, 0, 0.84); col.push(0.20, 0.20, 0.20);   // floor of the throat
    for (let b = 0; b < rings.length - 1; b++) {
      for (let k = 0; k < SEG; k++) {
        const a0 = b * SEG + k, a1 = b * SEG + (k + 1) % SEG;
        const c0 = (b + 1) * SEG + k, c1 = (b + 1) * SEG + (k + 1) % SEG;
        idx.push(a0, a1, c1, a0, c1, c0);
      }
    }
    const last = (rings.length - 1) * SEG, centre = rings.length * SEG;
    for (let k = 0; k < SEG; k++) idx.push(last + k, last + (k + 1) % SEG, centre);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Surface detail, drawn once into canvases. The texture's U runs along the
  // petal and V across it, and the geometry narrows toward claw and tip — so
  // nerves drawn as straight rows here come out PARALLEL through the body of
  // the ray and converge at the tip, which is how a real strap-shaped ray
  // floret is veined. (Fanning them out in UV space gets it backwards.)
  //
  //   bump    a midrib plus ~10 fine nerves and striations. It gives the
  //           highlights something to break over, so a petal stops reading as
  //           a colour ramp.
  //   colour  a multiplier over the vertex-colour ramp: nerves a shade deeper,
  //           a pale midrib, faint long blotches, a lighter margin. Subtle on
  //           purpose — real rays, not a cartoon.
  // ────────────────────────────────────────────────────────────────────────
  const NERVES = 5;   // nerves either side of the midrib
  function nerveY(k, H) {
    // Slightly irregular spacing, never a ruled grid.
    const j = (hash(Math.abs(k), 4.4) - 0.5) * 0.10;
    return H * (0.5 + (k / (NERVES + 0.9)) * 0.5 * (1 + j));
  }

  function makeVeinBump() {
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';

    function line(y, wob, wid, alpha, x0) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.bezierCurveTo(W * 0.30, y + wob, W * 0.62, y - wob * 0.7, W - 6, y + wob * 0.3);
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.lineWidth = wid;
      ctx.stroke();
    }
    // Midrib: a soft ridge with a brighter core.
    line(H / 2, 0, 11, 0.20, 6);
    line(H / 2, 0, 5, 0.34, 6);
    for (let k = -NERVES; k <= NERVES; k++) {
      if (k === 0) continue;
      const y = nerveY(k, H);
      const wob = (hash(k + 20, 2.7) - 0.5) * 5;
      const fade = 1 - Math.abs(k) / (NERVES + 2.2);
      line(y, wob, 6.5, 0.07 * fade, 30);
      line(y, wob, 2.6, 0.16 * fade, 30);
    }
    // Fine longitudinal striations — the tissue between the nerves.
    for (let i = 0; i < 120; i++) {
      const y = hash(i, 91.7) * H;
      ctx.beginPath();
      ctx.moveTo(hash(i, 33.1) * 220, y);
      ctx.lineTo(W, y + (hash(i, 17.9) - 0.5) * 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function makePetalColourMap() {
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8ddf6';
    ctx.fillRect(0, 0, W, H);

    // Long soft blotches of deeper / pinker pigment — the uneven tone a real
    // ray has, laid along its length so it never reads as noise.
    for (let i = 0; i < 16; i++) {
      const y = hash(i, 8.1) * H;
      const x = hash(i, 3.3) * W * 0.8;
      const len = 120 + hash(i, 6.6) * 240;
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      const col = hash(i, 1.9) > 0.5 ? '176,120,210' : '120,96,205';
      const a = 0.06 + hash(i, 12.2) * 0.07;
      g.addColorStop(0, 'rgba(' + col + ',0)');
      g.addColorStop(0.5, 'rgba(' + col + ',' + a + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y - 9 - hash(i, 5.5) * 12, len, 18 + hash(i, 5.5) * 24);
    }
    // Nerves: a shade deeper, with a paler halo either side.
    ctx.lineCap = 'round';
    for (let k = -NERVES; k <= NERVES; k++) {
      if (k === 0) continue;
      const y = nerveY(k, H);
      const fade = 1 - Math.abs(k) / (NERVES + 2.2);
      ctx.beginPath();
      ctx.moveTo(24, y); ctx.lineTo(W - 4, y);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.14 * fade) + ')';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, y); ctx.lineTo(W - 4, y);
      ctx.strokeStyle = 'rgba(112,72,176,' + (0.40 * fade) + ')';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }
    // Pale midrib, thinning toward the tip.
    const mg = ctx.createLinearGradient(0, 0, W, 0);
    mg.addColorStop(0, 'rgba(255,250,255,0.50)');
    mg.addColorStop(1, 'rgba(255,250,255,0.12)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, H / 2 - 4, W, 8);
    // Margin: slightly paler and more translucent than the body.
    const eg = ctx.createLinearGradient(0, 0, 0, H);
    eg.addColorStop(0.00, 'rgba(255,255,255,0.20)');
    eg.addColorStop(0.16, 'rgba(255,255,255,0)');
    eg.addColorStop(0.84, 'rgba(255,255,255,0)');
    eg.addColorStop(1.00, 'rgba(255,255,255,0.20)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, W, H);

    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
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
  // Shader patches (onBeforeCompile — core three only, no addons).
  //
  // Petals keep ONE draw call per whorl; everything per-petal rides on an
  // instanced `aVar` attribute (x: extra droop/curl, y: extra cupping,
  // z: extra twist, w: phase). The vertex patch applies it, plus a tiny idle
  // flutter, plus a head-space "lag" that bends petal tips behind the rotation
  // of the head (driven by a spring in the tick — see uSwing). The depth
  // material gets the same patch so the shadow follows the deformed petal.
  //
  // The fragment patch fakes light passing THROUGH the membrane: where a
  // directional light sits behind the petal, relative to the viewer, the thin
  // outer half and margins glow in a paler, warmer tint of the petal's own
  // colour. It is a cheap term, not transmission: no extra pass, no refracted
  // backbuffer, so nothing washes out to grey.
  // ────────────────────────────────────────────────────────────────────────
  function patchPetalVertex(sh, U, withNormals) {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uSwing = U.uSwing;
    sh.uniforms.uFlutter = U.uFlutter;
    let vs = sh.vertexShader.replace('#include <common>',
      '#include <common>\n' +
      'attribute vec4 aVar;\nuniform float uTime;\nuniform vec2 uSwing;\nuniform float uFlutter;\nvarying vec2 vPU;\n');
    if (withNormals) {
      vs = vs.replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n' +
        '{\n' +
        '  float nu = uv.x, ncv = uv.y * 2.0 - 1.0;\n' +
        '  objectNormal = normalize(objectNormal + vec3(-aVar.x * 0.29 * nu, aVar.y * 0.50 * ncv, 0.0));\n' +
        '  float nt = aVar.z * 0.45 * nu, nc = cos(nt), ns = sin(nt);\n' +
        '  objectNormal.yz = vec2(nc * objectNormal.y - ns * objectNormal.z, ns * objectNormal.y + nc * objectNormal.z);\n' +
        '}\n');
    }
    vs = vs.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n' +
      '{\n' +
      '  float pu = uv.x, pcv = uv.y * 2.0 - 1.0;\n' +
      '  float tw = aVar.z * 0.45 * pu, pc = cos(tw), ps = sin(tw);\n' +
      '  transformed.z += aVar.x * 0.22 * pu * pu - aVar.y * 0.03 * pcv * pcv;\n' +
      '  transformed.yz = vec2(pc * transformed.y - ps * transformed.z, ps * transformed.y + pc * transformed.z);\n' +
      '  float ph = aVar.w * 6.2832;\n' +
      '  transformed.z += (sin(uTime * 1.25 + ph) * 0.020 + sin(uTime * 0.62 + ph * 2.0) * 0.014) * pu * pu * uFlutter;\n' +
      '  transformed.y += sin(uTime * 0.90 + ph * 1.7) * 0.012 * pu * uFlutter;\n' +
      '  vPU = uv;\n' +
      '}\n');
    vs = vs.replace('#include <project_vertex>',
      'vec4 mvPosition = vec4(transformed, 1.0);\n' +
      '#ifdef USE_INSTANCING\n' +
      '  mvPosition = instanceMatrix * mvPosition;\n' +
      '#endif\n' +
      '{\n' +
      '  float sw = smoothstep(0.35, 2.1, length(mvPosition.xy));\n' +
      '  mvPosition.z += sw * sw * (mvPosition.x * uSwing.y - mvPosition.y * uSwing.x) * (0.7 + 0.6 * aVar.w);\n' +
      '}\n' +
      'mvPosition = modelViewMatrix * mvPosition;\n' +
      'gl_Position = projectionMatrix * mvPosition;\n');
    sh.vertexShader = vs;
  }

  // thinExpr is a GLSL float expression for how thin the membrane is here.
  // `extra` (optional) carries the petal's glow map: { uGlowMap, uGlowPhoto }.
  function patchBackGlow(sh, tint, amount, thinExpr, usesPetalUv, extra) {
    sh.uniforms.uGlowCol = { value: tint };
    sh.uniforms.uGlowAmt = { value: amount };
    if (extra) { sh.uniforms.uGlowMap = extra.uGlowMap; sh.uniforms.uGlowPhoto = extra.uGlowPhoto; }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>',
        '#include <common>\nuniform vec3 uGlowCol;\nuniform float uGlowAmt;\n' +
        (usesPetalUv ? 'varying vec2 vPU;\n' : '') +
        (extra ? 'uniform sampler2D uGlowMap;\nuniform float uGlowPhoto;\n' : ''))
      .replace('#include <opaque_fragment>',
        '#if NUM_DIR_LIGHTS > 0\n' +
        '{\n' +
        '  vec3 gV = normalize(vViewPosition);\n' +
        '  float gThin = ' + thinExpr + ';\n' +
        '  vec3 gAcc = vec3(0.0);\n' +
        '  for (int gi = 0; gi < NUM_DIR_LIGHTS; gi++) {\n' +
        '    vec3 gL = directionalLights[gi].direction;\n' +
        '    float gB = saturate(-dot(gL, gV));\n' +
        '    gAcc += directionalLights[gi].color * (gB * gB) * saturate(0.3 - dot(normal, gL));\n' +
        '  }\n' +
        '  outgoingLight += gAcc * gThin * uGlowAmt * mix(diffuseColor.rgb, uGlowCol, 0.55);\n' +
        '}\n' +
        '#endif\n' +
        '#include <opaque_fragment>');
  }

  // ────────────────────────────────────────────────────────────────────────
  // Build the plant.
  // ────────────────────────────────────────────────────────────────────────
  function buildFlower(store) {
    const plant = new T.Group();
    const head = new T.Group();
    plant.add(head);

    const U = store.U;
    const veinTex = makeVeinBump();
    const glowTex = makeGlowMap();
    const petalTex = makePetalColourMap();
    store.textures.push(veinTex, glowTex, petalTex);

    // A thin, matte, velvety membrane. Sheen (not clearcoat, not gloss) is what
    // reads as petal — clearcoat reads as wet plastic. envMap gives the sheen
    // something to pick up; the emissive map plus the back-glow patch fake the
    // light coming through the outer half of the blade without paying for a
    // transmission pass.
    const petalMat = new T.MeshPhysicalMaterial({
      color: 0xffffff,
      map: petalTex,
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
      emissiveIntensity: 0.18,
      envMapIntensity: 0.85,
    });
    petalMat.shadowSide = T.DoubleSide;
    // The photographic maps (see loadPhotoMaps below) start the petal's life as
    // the canvas maps above. uGlowPhoto flips the back-light term from the
    // procedural thin-membrane ramp to the photographed transmission map.
    const glowUniforms = { uGlowMap: { value: glowTex }, uGlowPhoto: { value: 0 } };
    petalMat.onBeforeCompile = function (sh) {
      patchPetalVertex(sh, U, true);
      // Thin toward the tip and the margins; the throat stays opaque. In photo
      // mode the map itself says where light gets through: bright thin
      // membrane and margins, darker veins and claw — so the veins show as
      // dark lines inside the glow, as on a real backlit petal.
      patchBackGlow(sh, new T.Color(0xc29aea), 0.20,
        'mix(mix(0.05, 1.0, smoothstep(0.30, 0.92, vPU.x)) * mix(0.55, 1.0, pow(abs(vPU.y * 2.0 - 1.0), 2.0)),' +
        ' pow(texture2D(uGlowMap, vec2(' + PHOTO_U0.toFixed(3) + ' + vPU.x * ' + PHOTO_U1.toFixed(3) + ', vPU.y)).r, 1.5), uGlowPhoto)',
        true, glowUniforms);
    };
    petalMat.customProgramCacheKey = function () { return 'aster-petal'; };
    // The shadow pass must see the same deformed petal, or the shadows drift
    // off the shapes that cast them.
    const petalDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
    petalDepth.side = T.DoubleSide;
    petalDepth.onBeforeCompile = function (sh) { patchPetalVertex(sh, U, false); };
    petalDepth.customProgramCacheKey = function () { return 'aster-petal-depth'; };
    store.materials.push(petalDepth);

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
    // Leaves and bracts are thin enough to glow when backlit; the stem and
    // receptacle are not, so they keep the plain material.
    const leafMat = greenMat.clone();
    leafMat.onBeforeCompile = function (sh) {
      patchBackGlow(sh, new T.Color(0xcfe58a), 0.20, '0.6', false);
    };
    leafMat.customProgramCacheKey = function () { return 'aster-leaf'; };
    store.materials.push(petalMat, greenMat, stemMat, leafMat);

    // ── One whorl, as a single InstancedMesh.
    const m1 = new T.Matrix4(), m2 = new T.Matrix4(), m3 = new T.Matrix4(), out = new T.Matrix4();
    const q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s = new T.Vector3();
    const tint = new T.Color();

    const petalGeos = [];
    function addWhorl(parent, mat, o) {
      const geo = makePetalGeo(o);
      store.geometries.push(geo);
      if (mat === petalMat) petalGeos.push(geo);
      const im = new T.InstancedMesh(geo, mat, o.count);
      im.castShadow = true;
      im.receiveShadow = true;
      im.customDepthMaterial = petalDepth;
      const step = (Math.PI * 2) / o.count;
      // Per-petal shape drift, applied in the vertex shader (see aVar above) so
      // the whorl stays one instanced draw: x extra droop(-)/curl(+), y extra
      // cupping, z extra twist, w phase for the idle flutter.
      const aVar = new Float32Array(o.count * 4);
      for (let i = 0; i < o.count; i++) {
        const a = hash(i, o.seed);
        const b = hash(i, o.seed + 17.3);
        const d = hash(i, o.seed + 91.7);
        // Uneven spacing, uneven droop, uneven roll and uneven length. Any one
        // of these left uniform and the ring snaps back to looking machined.
        m1.makeRotationZ(o.angleOffset + i * step + (b - 0.5) * step * 0.34);
        m2.makeRotationY(o.tiltBack + (a - 0.5) * 0.20);
        e.set((b - 0.5) * 0.30, 0, 0);
        q.setFromEuler(e);
        v.set(o.baseRadius, 0, 0);
        s.set(1 + (a - 0.5) * 0.20, 1 + (d - 0.5) * 0.24, 1);
        m3.compose(v, q, s);
        out.multiplyMatrices(m1, m2).multiply(m3);
        im.setMatrixAt(i, out);
        // Hue / value jitter: some rays a touch pinker, some bluer, some paler.
        const hue = hash(i, o.seed + 41.9) * 2 - 1;
        const val = 0.93 + hash(i, o.seed + 53.1) * 0.14;
        tint.setRGB((1 + hue * 0.085) * val, (1 - Math.abs(hue) * 0.03) * val, (1 - hue * 0.075) * val);
        im.setColorAt(i, tint);
        aVar[i * 4]     = (hash(i, o.seed + 3.1) - 0.5) * 2;
        aVar[i * 4 + 1] = (hash(i, o.seed + 7.7) - 0.5) * 2;
        aVar[i * 4 + 2] = (hash(i, o.seed + 13.3) - 0.5) * 2;
        aVar[i * 4 + 3] = hash(i, o.seed + 29.9);
      }
      geo.setAttribute('aVar', new T.InstancedBufferAttribute(aVar, 4));
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
      // Dark, so the gaps between the florets read as depth, not as a tan plate.
      color: 0x573817, roughness: 0.92, metalness: 0.0, side: T.DoubleSide,
    });
    store.geometries.push(discGeo);
    store.materials.push(discMat);
    const disc = new T.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.scale.set(1, 0.34, 1);
    disc.position.z = 0.02;
    disc.receiveShadow = true;
    head.add(disc);

    // ── Disc florets, on the golden angle, standing on a dome. A composite
    // flower's disc really is a phyllotactic spiral of tubular florets, and the
    // eye knows the difference between that and scattered dots even when it
    // can't name it. They open from the rim inward: the centre is still tight,
    // tall, greenish-yellow buds; the outer ring has flared open, gone golden
    // and then amber, and a few of those carry specks of pollen on the lip.
    // Each floret leans out along the dome's normal.
    const GA = Math.PI * (3 - Math.sqrt(5));
    const N = 820;
    const floretGeo = makeFloretGeo();
    // r160 only folds instanceColor into diffuse under USE_COLOR — i.e. only
    // when the material has vertexColors on. The geometry's `color` attribute
    // is therefore doing double duty: baked ambient occlusion, which the
    // per-instance colour multiplies against.
    const floretMat = new T.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0.0,
      side: T.DoubleSide,
      emissive: new T.Color(0x5a3408), emissiveIntensity: 0.34,
    });
    store.geometries.push(floretGeo);
    store.materials.push(floretMat);
    const florets = new T.InstancedMesh(floretGeo, floretMat, N);
    // Deliberately NOT a shadow caster. At this scale each floret shadows its
    // own neighbours into a single muddy tan disc — the baked AO does that job
    // without the mud.
    florets.castShadow = false;
    florets.receiveShadow = false;
    const cBud   = new T.Color(0xb8b44a);   // unopened: greenish yellow
    const cGold  = new T.Color(0xf3c04a);
    const cAmber = new T.Color(0xea9a30);   // fully open, outer ring
    const cRim   = new T.Color(0xdc8c2e);
    const axis = new T.Vector3(), zAxis = new T.Vector3(0, 0, 1), q2 = new T.Quaternion();
    const specks = [];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const f = Math.sqrt(t);                // 0 at the centre, 1 at the rim
      const rr = f * DR;
      const ang = i * GA;
      const j = hash(i, 5.1), k2 = hash(i, 23.7), k3 = hash(i, 61.3);
      const open = smooth(Math.min(1, Math.max(0, (f - 0.16) / 0.62)));
      const zz = 0.03 + 0.17 * (1 - f * f) - 0.012 + (j - 0.5) * 0.006;
      const sxy = (0.58 + 0.42 * open) * 0.037 * (1 + (k2 - 0.5) * 0.22);
      const sz  = (0.062 - 0.022 * open) * (1 + (j - 0.5) * 0.22);
      // Lean out along the dome's normal (slope of the dome at this radius).
      axis.set(-Math.sin(ang), Math.cos(ang), 0);
      q.setFromAxisAngle(axis, Math.atan(0.74 * f) + (k3 - 0.5) * 0.16);
      q2.setFromAxisAngle(zAxis, k3 * 6.2832);
      q.multiply(q2);
      v.set(Math.cos(ang) * rr, Math.sin(ang) * rr, zz);
      s.set(sxy, sxy, sz);
      out.compose(v, q, s);
      florets.setMatrixAt(i, out);
      if (f < 0.45) tint.copy(cBud).lerp(cGold, smooth(f / 0.45));
      else if (f < 0.85) tint.copy(cGold).lerp(cAmber, smooth((f - 0.45) / 0.40));
      else tint.copy(cAmber).lerp(cRim, smooth((f - 0.85) / 0.15));
      tint.multiplyScalar(1.0 + j * 0.24);
      florets.setColorAt(i, tint);
      // A few specks of pollen caught on the lips of the opened florets.
      if (open > 0.5 && hash(i, 77.7) > 0.80) {
        v.set((hash(i, 8.8) - 0.5) * 0.5, (hash(i, 9.9) - 0.5) * 0.5, 1.02).applyMatrix4(out);
        specks.push(v.x, v.y, v.z, 0.0070 + hash(i, 10.1) * 0.0060);
      }
    }
    florets.instanceMatrix.needsUpdate = true;
    if (florets.instanceColor) florets.instanceColor.needsUpdate = true;
    head.add(florets);

    if (specks.length) {
      const speckGeo = new T.IcosahedronGeometry(1, 0);
      const speckMat = new T.MeshStandardMaterial({
        color: 0xffd65c, roughness: 0.8, metalness: 0.0,
        emissive: new T.Color(0xffb830), emissiveIntensity: 0.3,
      });
      store.geometries.push(speckGeo);
      store.materials.push(speckMat);
      const pollen = new T.InstancedMesh(speckGeo, speckMat, specks.length / 4);
      for (let i = 0; i < specks.length; i += 4) {
        v.set(specks[i], specks[i + 1], specks[i + 2]);
        s.setScalar(specks[i + 3]);
        out.compose(v, q.identity(), s);
        pollen.setMatrixAt(i / 4, out);
      }
      pollen.instanceMatrix.needsUpdate = true;
      head.add(pollen);
    }

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
    const bracts = new T.InstancedMesh(bractGeo, leafMat, total);
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
      const leaf = new T.Mesh(leafGeo, leafMat);
      path.getPointAt(L.t, centre);
      leaf.position.copy(centre);
      leaf.rotation.set(L.roll, L.lift, L.spin, 'ZYX');
      leaf.scale.set(L.len, L.wid, L.wid);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      plant.add(leaf);
    });

    // ── The photographed petal. Three maps made from two real photos of one
    // aster ray (scripts/build-petal-maps.py): colour, vein relief, and how
    // much light passes through. The petal starts on the canvas maps above and
    // swaps to these only once ALL three have arrived, so it never shows a
    // half-textured state; if any fails it simply keeps the procedural look.
    // The maps begin at the photo's whitish claw, which belongs under the
    // disc, so they are sampled from PHOTO_U0 and stretched over the petal.
    (function loadPhotoMaps() {
      const loader = new T.TextureLoader();
      const names = ['petal-color', 'petal-bump', 'petal-glow'];
      const got = {};
      let left = names.length, failed = false;
      names.forEach(function (n) {
        const url = new URL('assets/flower/' + n + '.webp', document.baseURI).href;
        loader.load(url, function (tex) {
          tex.colorSpace = n === 'petal-color' ? T.SRGBColorSpace : T.NoColorSpace;
          tex.anisotropy = 8;
          tex.offset.set(PHOTO_U0, 0);
          tex.repeat.set(PHOTO_U1, 1);
          got[n] = tex;
          if (--left === 0 && !failed) apply();
        }, undefined, function () { failed = true; });
      });
      function apply() {
        [petalTex, veinTex, glowTex].forEach(function (t) { t.dispose(); });
        petalMat.map = got['petal-color'];
        petalMat.bumpMap = got['petal-bump'];
        petalMat.bumpScale = 0.9;
        petalMat.emissiveMap = got['petal-glow'];
        petalMat.emissive.set(0x9a80d4);
        petalMat.emissiveIntensity = 0.10;
        // The photo is lit flat on white, so its outer half is a pale
        // lilac; under this rig's key light plus sheen it went near white.
        // A violet multiply brings it back to the brand lavender without
        // losing the photo's own shading.
        petalMat.color.set(PHOTO_TINT);
        petalMat.sheen = 0.65;
        petalMat.envMapIntensity = 0.7;
        glowUniforms.uGlowMap.value = got['petal-glow'];
        glowUniforms.uGlowPhoto.value = 1;
        petalGeos.forEach(function (g) { paintPetalColours(g, true); });
        names.forEach(function (n) { store.textures.push(got[n]); });
        petalMat.needsUpdate = true;
        if (store.onPhotoMaps) store.onPhotoMaps();
      }
    })();

    return plant;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mount.
  // ────────────────────────────────────────────────────────────────────────
  function mount(container, opts) {
    opts = opts || {};
    const reducedMotion = opts.reducedMotion != null ? opts.reducedMotion :
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Shared uniform objects, handed to every patched material by reference so
    // the tick updates them once per frame with no allocation.
    const U = {
      uTime: { value: 0 },
      uSwing: { value: new T.Vector2() },
      uFlutter: { value: reducedMotion ? 0 : 1 },
    };
    const store = { geometries: [], materials: [], textures: [], U: U };

    // Pixel-ratio budget: the canvas is large and the page also runs smooth
    // scroll, so cap hard — 2 on desktop, 1.5 on phones and tablets.
    const smallMQ = window.matchMedia ? window.matchMedia('(max-width: 820px), (pointer: coarse)') : null;
    const isSmall = function () { return !!(smallMQ && smallMQ.matches); };
    const pixelRatio = function () { return Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 2); };

    const scene = new T.Scene();
    if (opts.background) scene.background = new T.Color(opts.background);

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 800;

    const camera = new T.PerspectiveCamera(33, width / height, 0.1, 50);
    camera.position.set(0, 0, 9.4);
    camera.lookAt(0, 0, 0);

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(pixelRatio());
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
    key.shadow.mapSize.set(isSmall() ? 512 : 1024, isSmall() ? 512 : 1024);
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

    // ── A few faint pollen motes drifting up through the light. One Points
    // draw; the whole drift is computed in the vertex shader from a time
    // uniform, so there is no per-frame buffer work. Skipped entirely under
    // reduced motion.
    let motes = null;
    function syncMotes() {
      if (!motes) return;
      motes.material.uniforms.uPx.value = (renderer.domElement.height * 0.5) / Math.tan(camera.fov * Math.PI / 360);
    }
    if (!reducedMotion) {
      const count = isSmall() ? 16 : 34;
      const mg = new T.BufferGeometry();
      const mp = new Float32Array(count * 3);
      const ms = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        mp[i * 3]     = (hash(i, 1.1) - 0.5) * 5.4;
        mp[i * 3 + 1] = 0;
        mp[i * 3 + 2] = -1.4 + hash(i, 3.3) * 3.4;
        ms[i * 4]     = hash(i, 4.4);                    // phase
        ms[i * 4 + 1] = 0.018 + hash(i, 5.5) * 0.030;    // cycles per second
        ms[i * 4 + 2] = 0.016 + hash(i, 6.6) * 0.026;    // size, world units
      }
      mg.setAttribute('position', new T.BufferAttribute(mp, 3));
      mg.setAttribute('aSeed', new T.BufferAttribute(ms, 4));
      const mm = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uCol: { value: new T.Color(0xffe3a2) } },
        vertexShader:
          'uniform float uTime; uniform float uPx; attribute vec4 aSeed; varying float vA;\n' +
          'void main() {\n' +
          '  float c = fract(uTime * aSeed.y + aSeed.x);\n' +
          '  vec3 p = position;\n' +
          '  p.y += (c - 0.5) * 5.4;\n' +
          '  p.x += sin(uTime * 0.35 + aSeed.x * 6.2832) * 0.22;\n' +
          '  p.z += cos(uTime * 0.28 + aSeed.x * 9.0) * 0.20;\n' +
          '  vec4 mv = modelViewMatrix * vec4(p, 1.0);\n' +
          '  gl_Position = projectionMatrix * mv;\n' +
          '  gl_PointSize = max(1.5, aSeed.z * uPx / -mv.z);\n' +
          '  vA = sin(c * 3.14159) * (0.55 + 0.45 * sin(uTime * (0.8 + aSeed.y * 20.0) + aSeed.x * 30.0));\n' +
          '}',
        fragmentShader:
          'uniform vec3 uCol; varying float vA;\n' +
          'void main() {\n' +
          '  float d = length(gl_PointCoord - 0.5);\n' +
          '  gl_FragColor = vec4(uCol, smoothstep(0.5, 0.04, d) * vA * 0.55);\n' +
          '  #include <tonemapping_fragment>\n' +
          '  #include <colorspace_fragment>\n' +
          '}',
      });
      motes = new T.Points(mg, mm);
      motes.frustumCulled = false;
      store.geometries.push(mg);
      store.materials.push(mm);
      scene.add(motes);
      syncMotes();
    }

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
    // frame of the page it was nowhere near; the render is now skipped when the
    // section is off screen.
    //
    // Deliberately NOT gated on an IntersectionObserver alone. Cancelling the
    // rAF and waiting for the observer to restart it means anything that stops
    // the observer reporting an intersection — a zero-size viewport being the
    // one I hit — leaves the canvas permanently blank with no way back. The
    // loop therefore always schedules; only the GPU work is conditional, and
    // the test is a rect read (throttled to 10/s, since it flushes layout) that
    // falls back to "assume visible" when the viewport measures as nothing.
    let onScreen = true;
    let wasOnScreen = false;
    let lastVisCheck = -1e9;

    function checkVisible(now) {
      if (now - lastVisCheck < 100) return;
      lastVisCheck = now;
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      if (!vh || !vw) { onScreen = true; return; }
      const r = container.getBoundingClientRect();
      if (!r.width || !r.height) { onScreen = false; return; }
      onScreen = r.bottom > -80 && r.top < vh + 80 && r.right > -80 && r.left < vw + 80;
    }

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
      renderer.setPixelRatio(pixelRatio());
      renderer.setSize(width, height);
      syncMotes();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── Loop.
    let hoverLift = 0;
    const t0 = performance.now();
    let lastFrame = t0;
    let rafId = null;

    // Petal inertia: a damped spring per axis that is fed the head's angular
    // velocity. Under-damped on purpose, so petals trail a drag, overshoot a
    // touch and settle, rather than being welded to the head.
    let prevRX = root.rotation.x, prevRY = root.rotation.y;
    let swX = 0, swY = 0, swVX = 0, swVY = 0;

    function tick(now) {
      rafId = requestAnimationFrame(tick);

      checkVisible(now);
      if (!onScreen) {
        wasOnScreen = false;
        lastFrame = now;   // so returning to view doesn't arrive with a huge dt
        return;
      }
      // Greet front-first on every entry into view, as before.
      if (!wasOnScreen) { wasOnScreen = true; triggerReveal(now); }

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

      // Per-frame shader inputs (no allocation: shared uniform objects).
      U.uTime.value = (now - t0) / 1000;
      if (reducedMotion) {
        prevRX = root.rotation.x; prevRY = root.rotation.y;
      } else {
        const wx = Math.max(-0.6, Math.min(0.6, (root.rotation.x - prevRX) / f * 7));
        const wy = Math.max(-0.6, Math.min(0.6, (root.rotation.y - prevRY) / f * 7));
        prevRX = root.rotation.x; prevRY = root.rotation.y;
        swVX += ((wx - swX) * 0.12 - swVX * 0.16) * f;
        swVY += ((wy - swY) * 0.12 - swVY * 0.16) * f;
        swX += swVX * f; swY += swVY * f;
        U.uSwing.value.set(swX, swY);
        // The head breathes: a very slow, very small swell.
        floatGroup.scale.setScalar(1 + Math.sin(ft * 1.35) * 0.0055 * amp);
      }
      if (motes) motes.material.uniforms.uTime.value = U.uTime.value;

      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(tick);

    return {
      dispose: function () {
        if (rafId != null) cancelAnimationFrame(rafId);
        ro.disconnect();
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
