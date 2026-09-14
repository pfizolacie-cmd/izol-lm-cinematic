import * as THREE from 'three';
import { PIPE, TANK, PLATES, PLATE_W, PLATE_H, F_PX } from '../journey.js';

// ---------------------------------------------------------------------------------------------
// One material for everything that is sheet metal: the laser sheet, the pipe cladding, the tank.
// Surface coordinates st = (s across/around, t along) in metres drive seams, screws and grain.
// ---------------------------------------------------------------------------------------------

const common = /* glsl */ `
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
  // the current plate used as a light probe (perspective photo folded into a pseudo lat-long)
  vec3 envAt(sampler2D t, vec3 r, float bias) {
    float yaw = atan(r.x, -r.z);
    float pitch = atan(r.y, length(r.xz));
    vec2 uv = vec2(0.5 + yaw / 2.2, 0.47 + pitch / 1.3);
    uv.x = 1.0 - abs(1.0 - mod(uv.x, 2.0));
    // steep reflections leave the photo: fade to its blurred ceiling instead of smearing the top row
    // the fade must be complete before the clamp, or the top row smears into vertical streaks
    float out_ = smoothstep(0.76, 0.95, uv.y);
    uv.y = clamp(uv.y, 0.02, 0.97);
    vec3 c = texture2D(t, uv, bias).rgb;
    return mix(c, texture2D(t, vec2(0.5, 0.9), 9.0).rgb * 0.7, out_);
  }
  uniform vec3 uFog;
  uniform float uFogK;
`;

const varyings = /* glsl */ `
  varying vec2 vST;
  varying vec3 vN;
  varying vec3 vT;
  varying vec3 vB;
  varying vec3 vWorld;
  #ifdef TANK
  varying vec3 vLocal;
  varying vec3 vLocalN;
  #endif
`;

const stripVS = /* glsl */ `
  attribute vec2 aST;
  uniform float uBend;
  uniform float uR;
  uniform float uY0;
  ${varyings}
  void main() {
    // bend the flat sheet around the travel axis; the top line (s = 0) never moves
    float k = max(uBend, 0.0001) / uR;
    float th = aST.x * k;
    float sh = sin(th * 0.5);
    vec3 p = vec3(sin(th) / k, uY0 - 2.0 * sh * sh / k, aST.y);
    vN = vec3(sin(th), cos(th), 0.0);
    vB = vec3(cos(th), -sin(th), 0.0);
    vT = vec3(0.0, 0.0, -1.0);
    vST = vec2(aST.x, -aST.y);
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const staticVS = /* glsl */ `
  attribute vec2 aST;
  attribute vec3 aTan;
  ${varyings}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    mat3 m = mat3(modelMatrix);
    vN = normalize(m * normal);
    vT = normalize(m * aTan);
    vB = cross(vT, vN);
    vST = aST;
    #ifdef TANK
    vLocal = position;
    vLocalN = normal;
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const metalFS = /* glsl */ `
  uniform sampler2D uEnvA;
  uniform sampler2D uEnvB;
  uniform float uEnvMix;
  uniform float uEnvGain;
  uniform float uBias;      // base reflection blur (mip bias): brushed, not mirror
  uniform float uDiffuse;
  uniform vec2 uPanel;      // seam period (s, t)
  uniform float uSeams;     // cladding seams + screws
  uniform float uSheet;     // laser-cut part contours
  uniform float uKerf;      // kerf glow
  uniform float uKerfCut;   // kerf as an open cut
  uniform float uKerfRefl;  // the laser reflected along the sheet (first rail)
  uniform float uHotT;      // t of the cutting point
  uniform float uWave;      // oil canning
  uniform float uAlpha;
  uniform vec3 uFade;       // near-camera window: (full until, gone at, amount)
  uniform float uEdgeFade;
  uniform float uLightY;
  uniform float uLightGain;
  uniform float uTopFade;
  uniform float uF0;
  #ifdef TANK
  uniform sampler2D uPhoto;
  uniform float uPhotoW;
  uniform vec3 uCamLocal;
  uniform vec3 uPlate;      // cx, cy, f of the native camera
  #endif
  ${common}
  ${varyings}

  vec3 strips(vec3 P, vec3 r, float soft) {
    if (r.y < 0.03) return vec3(0.0);
    float d = (uLightY - P.y) / r.y;
    if (d < 0.0) return vec3(0.0);
    vec3 h = P + r * d;
    float lx = abs(fract(h.x / 2.4 + 0.5) - 0.5) * 2.4;
    float lz = fract(h.z / 3.2);
    float w = 0.09 + soft + d * 0.01;
    float line = (1.0 - smoothstep(w * 0.25, w, lx)) * smoothstep(0.0, 0.2, lz) * (1.0 - smoothstep(0.78, 1.0, lz));
    return vec3(0.9, 0.96, 1.0) * line * exp(-d * 0.08);
  }
  float bead(float x) { return 0.0007 * exp(-pow((x - 0.012) / 0.004, 2.0)); }
  float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

  void main() {
    vec2 st = vST;
    vec2 pert = vec2(0.0);   // normal tilt along (s, t)
    float cav = 0.0;
    vec3 emit = vec3(0.0);

    // oil canning: the slow waviness that warps reflections in real cladding
    vec2 w = vec2(fbm(st * vec2(2.3, 1.2)), fbm(st * vec2(2.3, 1.2) + vec2(5.2, 1.3))) - 0.5;
    pert += w * uWave;

    float brush = vnoise(vec2(st.x * 1500.0, st.y * 4.0));
    float brush2 = vnoise(vec2(st.x * 260.0, st.y * 1.2));
    float smudge = mix(0.86, 1.04, vnoise(st * vec2(3.1, 2.4) + 11.0));
    float tone = (0.94 + 0.08 * brush) * smudge;
    // every cladding panel is a separate sheet: slightly different tone and grain direction
    vec2 panelId = floor(st / uPanel);
    float ph = hash21(panelId + 17.0);
    tone *= mix(1.0, mix(0.88, 1.08, ph), uSeams);
    pert += (vec2(hash21(panelId + 3.0), hash21(panelId + 9.0)) - 0.5) * 0.02 * uSeams;

    // circumferential lap seams (constant t) with swage bead
    float e = 0.0005;
    float aT = fract(st.y / uPanel.y) * uPanel.y;
    float bT = uPanel.y - aT;
    pert.y -= (bead(aT + e) - bead(aT)) / e * uSeams;
    pert.y += exp(-aT / 0.0012) * 0.16 * uSeams;
    cav += (1.0 - smoothstep(0.0, 0.0012, bT)) * 0.55 * uSeams;
    // longitudinal lap seams (constant s)
    float aS = fract(st.x / uPanel.x) * uPanel.x;
    float bS = uPanel.x - aS;
    pert.x -= (bead(aS + e) - bead(aS)) / e * uSeams;
    pert.x += exp(-aS / 0.0012) * 0.16 * uSeams;
    cav += (1.0 - smoothstep(0.0, 0.0012, bS)) * 0.55 * uSeams;
    // self-tapping screws along both seam families
    {
      float sc = (floor(st.x / 0.14) + 0.5) * 0.14;
      vec2 q = vec2(st.x - sc, aT - 0.022);
      float r = length(q);
      float m = 1.0 - smoothstep(0.0034, 0.0044, r);
      pert += q / 0.0044 * m * 0.6 * uSeams;
      cav += (smoothstep(0.0032, 0.004, r) - smoothstep(0.0044, 0.0056, r)) * 0.45 * uSeams;
      tone *= 1.0 - m * 0.1 * uSeams;
    }
    {
      float tc = (floor(st.y / 0.15) + 0.5) * 0.15;
      vec2 q = vec2(aS - 0.022, st.y - tc);
      float r = length(q);
      float m = 1.0 - smoothstep(0.0034, 0.0044, r);
      pert += q / 0.0044 * m * 0.6 * uSeams;
      cav += (smoothstep(0.0032, 0.004, r) - smoothstep(0.0044, 0.0056, r)) * 0.45 * uSeams;
      tone *= 1.0 - m * 0.1 * uSeams;
    }

    // the kerf along s = 0: a cut on the sheet, later the lap seam of the cladding
    float kerfD = abs(st.x);
    cav += (1.0 - smoothstep(0.00035, 0.0008, kerfD)) * (1.0 - uSeams) * 0.9 * uKerfCut;
    float dt = abs(st.y - uHotT);
    emit += vec3(1.0, 0.36, 0.08) * (1.0 - smoothstep(0.0002, 0.0009, kerfD)) * exp(-dt * 3.0) * 2.6 * uKerf * uKerfCut;
    emit += vec3(1.0, 0.45, 0.15) * exp(-kerfD / 0.006) * exp(-dt * 6.0) * 0.22 * uKerf;
    emit += vec3(1.0, 0.55, 0.25) * exp(-kerfD / 0.012) * 0.16 * uKerfRefl;

    // laser-cut part contours on the sheet
    if (uSheet > 0.001) {
      vec2 cell = vec2(0.42, 0.62);
      vec2 id = floor(vec2(st.x / cell.x, st.y / cell.y + 0.3));
      vec2 lp = vec2(st.x - (id.x + 0.5) * cell.x, st.y - (id.y + 0.5 - 0.3) * cell.y);
      float h = hash21(id);
      float d = abs(sdBox(lp, vec2(0.195, 0.295), 0.035));
      vec2 hp = vec2(0.09 * sign(h - 0.5), 0.17);
      // not every part has holes; keep them small (they read as dark discs from a few cm)
      float hole = h > 0.45 ? length(lp - hp) - (0.018 + 0.012 * h) : 1.0;
      float hole2 = h > 0.75 ? length(lp + vec2(hp.x, 0.19)) - 0.016 : 1.0;
      float slot = sdBox(lp - vec2(0.0, -0.02), vec2(0.07 + 0.04 * h, 0.011), 0.011);
      float cut = min(hole, min(hole2, slot));
      d = min(d, min(abs(hole), min(abs(hole2), abs(slot))));
      cav += (1.0 - smoothstep(0.0003, 0.0008, d)) * 0.8 * uSheet;
      // through-cuts: dark table below, with the cut edge catching light
      tone *= mix(1.0, 0.22, step(cut, 0.0) * uSheet);
      tone *= 1.0 + (1.0 - smoothstep(0.0006, 0.0025, abs(cut))) * step(0.0, cut) * 0.35 * uSheet;
    }

    // fine scratches
    {
      vec2 c = floor(st / 0.09);
      vec2 f = st - (c + 0.5) * 0.09;
      float h = hash21(c);
      float ang = h * 6.2831;
      vec2 dl = vec2(cos(ang), sin(ang));
      float dd = abs(dot(f, vec2(-dl.y, dl.x)));
      float al = abs(dot(f, dl));
      float scr = (1.0 - smoothstep(0.0001, 0.00028, dd)) * (1.0 - smoothstep(0.02, 0.035 + 0.02 * h, al)) * step(0.5, hash21(c + 3.7));
      tone *= 1.0 + scr * 0.35;
    }

    vec3 N = normalize(vN);
    vec3 n = normalize(N + normalize(vB) * pert.x + normalize(vT) * pert.y);
    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) { n = -n; N = -N; }
    vec3 R = reflect(-V, n);
    float ndv = clamp(dot(n, V), 0.0, 1.0);
    float rough = brush2;
    float bias = uBias + rough * 1.5;
    vec3 spec = mix(envAt(uEnvA, R, bias), envAt(uEnvB, R, bias), uEnvMix);
    vec3 diff = mix(envAt(uEnvA, n, 7.5), envAt(uEnvB, n, 7.5), uEnvMix);
    vec3 F0 = vec3(uF0) * vec3(0.97, 0.99, 1.0);
    vec3 Fr = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
    vec3 col = (spec * Fr + diff * uDiffuse) * uEnvGain;
    col += strips(vWorld, R, rough * 0.06) * Fr * uLightGain;
    col += vec3(0.01, 0.012, 0.016);
    col *= tone;
    col *= 1.0 - clamp(cav, 0.0, 0.9);

    #ifdef TANK
    {
      // the reference photo, projected from its own camera, wherever the current view agrees with it
      vec3 lp = vLocal;
      vec2 puv = vec2((uPlate.x + uPlate.z * lp.x / -lp.z) / ${PLATE_W.toFixed(1)},
                      1.0 - (uPlate.y - uPlate.z * lp.y / -lp.z) / ${PLATE_H.toFixed(1)});
      float facing = dot(normalize(vLocalN), normalize(-lp));
      float agree = dot(normalize(uCamLocal - lp), normalize(-lp));
      float inFrame = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
      float dCam = length(uCamLocal - lp);
      float wp = smoothstep(0.0, 0.1, facing) * smoothstep(0.93, 0.995, agree) * smoothstep(0.9, 2.2, dCam) * inFrame * uPhotoW;
      col = mix(col, texture2D(uPhoto, puv).rgb, wp);
    }
    #endif

    col += emit;
    float dist = length(cameraPosition - vWorld);
    col = mix(col, uFog, 1.0 - exp(-dist * uFogK));
    float a = uAlpha * (1.0 - smoothstep(uTopFade - 0.7, uTopFade, vWorld.y));
    a *= mix(1.0, 1.0 - smoothstep(uFade.x, uFade.y, dist), uFade.z);
    a *= 1.0 - smoothstep(0.6, 0.92, abs(st.x)) * uEdgeFade;
    gl_FragColor = vec4(col, a);
  }
`;

function metalUniforms(extra = {}) {
  return {
    uEnvA: { value: null },
    uEnvB: { value: null },
    uEnvMix: { value: 0 },
    uEnvGain: { value: 1.1 },
    uBias: { value: 4.4 },
    uDiffuse: { value: 0.22 },
    uPanel: { value: new THREE.Vector2(2 * Math.PI * PIPE.r, 1.0) },
    uSeams: { value: 0 },
    uSheet: { value: 1 },
    uKerf: { value: 1 },
    uKerfCut: { value: 0 },
    uKerfRefl: { value: 1 },
    uHotT: { value: 4.0 },
    uWave: { value: 0.012 },
    uAlpha: { value: 0 },
    uFade: { value: new THREE.Vector3(0.7, 1.9, 0) },
    uEdgeFade: { value: 1 },
    uLightY: { value: 3.0 },
    uLightGain: { value: 0.45 },
    uTopFade: { value: 100 },
    uF0: { value: 0.7 },
    uFog: { value: new THREE.Color(0.02, 0.025, 0.032) },
    uFogK: { value: 0.03 },
    uBend: { value: 0 },
    uR: { value: PIPE.r },
    uY0: { value: PIPE.y0 },
    ...extra,
  };
}

function metalMaterial(uniforms, vertexShader, defines = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: metalFS,
    defines,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

// The laser sheet, which bends into the first metres of the pipe.
export function buildStrip(uniforms) {
  const ns = 120, nt = 300;
  const [z0, z1] = PIPE.stripZ;
  const sMax = Math.PI * PIPE.r;
  const count = (ns + 1) * (nt + 1);
  const st = new Float32Array(count * 2);
  const pos = new Float32Array(count * 3);
  let k = 0;
  for (let j = 0; j <= nt; j++) {
    const z = z0 + ((z1 - z0) * j) / nt;
    for (let i = 0; i <= ns; i++) {
      const s = -sMax + (2 * sMax * i) / ns;
      st[k * 2] = s;
      st[k * 2 + 1] = z;
      pos.set([s, PIPE.y0, z], k * 3);
      k++;
    }
  }
  const idx = [];
  for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) {
    const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aST', new THREE.BufferAttribute(st, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, metalMaterial(uniforms, stripVS));
  mesh.frustumCulled = false;
  return mesh;
}

// Rings along a path → tube with surface coordinates continuing the strip's.
function tubeFromRings(rings, r, nA = 72) {
  const pos = [], nrm = [], tan = [], st = [], idx = [];
  const W = new THREE.Vector3(1, 0, 0);
  const U = new THREE.Vector3(), T = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (const ring of rings) {
    c.fromArray(ring.c); U.fromArray(ring.U); T.fromArray(ring.T);
    for (let j = 0; j <= nA; j++) {
      const th = -Math.PI + (2 * Math.PI * j) / nA;
      n.copy(U).multiplyScalar(Math.cos(th)).addScaledVector(W, Math.sin(th));
      pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
      nrm.push(n.x, n.y, n.z);
      tan.push(T.x, T.y, T.z);
      st.push(th * r, ring.t);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < nA; j++) {
    const a = i * (nA + 1) + j, b = a + 1, cc = a + nA + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute('aST', new THREE.Float32BufferAttribute(st, 2));
  g.setIndex(idx);
  return g;
}

// The rest of the pipe: straight run into the rooms, a gored elbow, then up into the ceiling.
export function buildPipe(uniforms) {
  const { r, y0, stripZ, elbowZ, elbowR, topY } = PIPE;
  const axisY = y0 - r;
  const rings = [];
  const zA = stripZ[1];
  const nS = 70;
  for (let i = 0; i <= nS; i++) {
    const z = zA + ((elbowZ - zA) * i) / nS;
    rings.push({ c: [0, axisY, z], T: [0, 0, -1], U: [0, 1, 0], t: -z });
  }
  const t0 = -elbowZ;
  const nE = 36;
  for (let i = 1; i <= nE; i++) {
    const a = (Math.PI / 2) * (i / nE);
    rings.push({
      c: [0, axisY + elbowR - elbowR * Math.cos(a), elbowZ - elbowR * Math.sin(a)],
      T: [0, Math.sin(a), -Math.cos(a)],
      U: [0, Math.cos(a), Math.sin(a)],
      t: t0 + (a / (Math.PI / 12)) * 1.0, // 6 gores in the elbow, one seam period each
    });
  }
  const yStart = axisY + elbowR;
  const t1 = t0 + 6;
  const nV = 30;
  for (let i = 1; i <= nV; i++) {
    const y = yStart + ((topY - yStart) * i) / nV;
    rings.push({ c: [0, y, elbowZ - elbowR], T: [0, 1, 0], U: [0, 0, 1], t: t1 + (y - yStart) });
  }
  const mesh = new THREE.Mesh(tubeFromRings(rings, r), metalMaterial(uniforms, staticVS));
  mesh.frustumCulled = false;
  return mesh;
}

const darkFS = /* glsl */ `
  uniform sampler2D uEnv;
  uniform float uAlpha;
  varying vec3 vN;
  varying vec3 vWorld;
  ${common}
  void main() {
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 R = reflect(-V, n);
    float up = n.y * 0.5 + 0.5;
    vec3 col = vec3(0.018, 0.022, 0.028) * (0.5 + 0.8 * up) + envAt(uEnv, R, 6.0) * 0.07;
    col = mix(col, uFog, 1.0 - exp(-length(cameraPosition - vWorld) * uFogK));
    gl_FragColor = vec4(col, uAlpha);
  }
`;
const darkVS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Galvanised supports: floor post, saddle, clamp band.
export function buildSupports(fogUniforms) {
  const uniforms = { uEnv: { value: null }, uAlpha: { value: 0 }, ...fogUniforms };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: darkVS, fragmentShader: darkFS, transparent: true });
  const group = new THREE.Group();
  const axisY = PIPE.y0 - PIPE.r;
  const floorY = -1.26;
  const bottom = axisY - PIPE.r;
  for (const z of PIPE.supports) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, bottom - floorY, 0.07), mat);
    post.position.set(0, (bottom + floorY) / 2 - 0.02, z);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.09), mat);
    saddle.position.set(0, bottom - 0.03, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.2), mat);
    base.position.set(0, floorY + 0.007, z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(PIPE.r + 0.007, PIPE.r + 0.007, 0.045, 64, 1, true), mat);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, axisY, z);
    group.add(post, saddle, base, band);
  }
  group.traverse((o) => (o.frustumCulled = false));
  return { group, uniforms };
}

// The monumental tank: lathe in `tank` plate-local metres, photo projected + procedural cladding.
function latheGeometry(profile, cx, cz, nA = 128) {
  const pos = [], nrm = [], tan = [], st = [], idx = [];
  const len = [0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    len.push(len[i - 1] + Math.hypot(r1 - r0, y1 - y0));
  }
  const sRadius = Math.max(...profile.map((p) => p[0]));
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(profile.length - 1, i + 1)];
    let dr = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    dr /= l; dy /= l;
    for (let j = 0; j <= nA; j++) {
      const ph = -Math.PI + (2 * Math.PI * j) / nA; // φ = 0 faces the native camera (+Z)
      const sp = Math.sin(ph), cp = Math.cos(ph);
      pos.push(cx + r * sp, y, cz + r * cp);
      nrm.push(dy * sp, -dr, dy * cp);
      tan.push(dr * sp, dy, dr * cp);
      st.push(ph * sRadius, len[i]);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) for (let j = 0; j < nA; j++) {
    const a = i * (nA + 1) + j, b = a + 1, c = a + nA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aTan', new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute('aST', new THREE.Float32BufferAttribute(st, 2));
  g.setIndex(idx);
  return g;
}

export function buildTank(fogUniforms) {
  const plate = PLATES.find((p) => p.id === 'tank');
  const uniforms = metalUniforms({
    uPhoto: { value: null },
    uPhotoW: { value: 1 },
    uCamLocal: { value: new THREE.Vector3() },
    uPlate: { value: new THREE.Vector3(plate.cx, plate.cy, F_PX) },
    ...fogUniforms,
  });
  uniforms.uPanel.value.set(0.36, 0.45);
  uniforms.uSeams.value = 1;
  uniforms.uSheet.value = 0;
  uniforms.uKerf.value = 0;
  uniforms.uKerfRefl.value = 0;
  uniforms.uEdgeFade.value = 0;
  uniforms.uWave.value = 0.03;
  uniforms.uBias.value = 5.0;
  uniforms.uDiffuse.value = 0.3;
  uniforms.uLightY.value = plate.pos[1] + 3.4 * plate.scale;
  uniforms.uLightGain.value = 0.35;
  uniforms.uFogK.value = 0.02;

  // body matched to the photo's silhouette; low dome so nothing extends above the real tank
  const profile = [[0, -1.0], [0.55, -0.98], [0.95, -0.9], [1.17, -0.78], [1.26, -0.62], [1.27, -0.45]];
  for (let i = 1; i <= 20; i++) profile.push([TANK.r, -0.45 + (1.9 * i) / 20]);
  profile.push([1.2, 1.6], [0.95, 1.7], [0.5, 1.77], [0, 1.79]);
  const mat = metalMaterial(uniforms, staticVS, { TANK: '' });
  const group = new THREE.Group();
  group.position.fromArray(plate.pos);
  group.scale.setScalar(plate.scale);
  group.add(new THREE.Mesh(latheGeometry(profile, TANK.x, TANK.z), mat));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const leg = [[0.09, TANK.floor], [0.09, -0.8]];
    group.add(new THREE.Mesh(latheGeometry(leg, TANK.x + 0.82 * Math.sin(a), TANK.z + 0.82 * Math.cos(a), 24), mat));
  }
  group.traverse((o) => (o.frustumCulled = false));
  group.updateMatrixWorld(true);
  return { group, uniforms };
}

// A restrained handful of sparks at the nozzle.
export function buildSparks(origin) {
  const n = 36;
  const seeds = new Float32Array(n).map((_, i) => (i + 0.5) / n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uOrigin: { value: new THREE.Vector3(...origin) }, uPx: { value: 1000 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uAmt, uPx;
      uniform vec3 uOrigin;
      varying float vA;
      void main() {
        float life = fract(uTime * 1.7 + aSeed * 7.13);
        float a = aSeed * 6.2831 * 3.7;
        vec3 dir = normalize(vec3(cos(a), 0.25 + fract(aSeed * 13.1) * 0.45, sin(a) * 0.7));
        float sp = 0.35 + fract(aSeed * 5.3) * 0.55;
        vec3 p = uOrigin + dir * sp * life * 0.22 - vec3(0.0, 0.35 * life * life * 0.22, 0.0);
        p.y = max(p.y, uOrigin.y - 0.02);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.0035 * uPx / -mv.z, 1.0, 5.0);
        vA = (1.0 - life) * (1.0 - life) * uAmt;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float m = 1.0 - smoothstep(0.15, 0.5, d);
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * 3.0 * m * vA, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  return { points, uniforms };
}

export { metalUniforms };
