import * as THREE from 'three';
import { PLATE_W, PLATE_H, F_PX } from '../journey.js';

const AX = { x: 0, y: 1, z: 2 };
const within = (v, r) => !r || (v >= r[0] && v <= r[1]);

// Depth along the native camera's ray d (d.z = −1, so t is view depth) against proxy primitives.
export function trace(d, prims) {
  let best = Infinity;
  for (const pr of prims) {
    let t = Infinity;
    if (pr.plane) {
      const a = AX[pr.plane];
      if (Math.abs(d[a]) < 1e-9) continue;
      const tt = pr.at / d[a];
      if (tt <= 1e-4) continue;
      const h = [d[0] * tt, d[1] * tt, d[2] * tt];
      if (!within(h[0], pr.x) || !within(h[1], pr.y) || !within(h[2], pr.z)) continue;
      if (pr.holes && pr.holes.some((o) => within(h[0], o.x) && within(h[1], o.y) && within(h[2], o.z))) continue;
      t = tt;
    } else if (pr.box) {
      const [mn, mx] = pr.box;
      let t0 = -Infinity, t1 = Infinity;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (mn[a] > 0 || mx[a] < 0) { t0 = Infinity; break; }
          continue;
        }
        let ta = mn[a] / d[a], tb = mx[a] / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
      if (t0 <= t1 && t0 > 1e-4) t = t0;
    } else if (pr.vcyl) {
      const [cx, cz] = pr.vcyl;
      const A = d[0] * d[0] + d[2] * d[2];
      const B = -2 * (d[0] * cx + d[2] * cz);
      const C = cx * cx + cz * cz - pr.r * pr.r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      const tt = (-B - Math.sqrt(disc)) / (2 * A);
      if (tt <= 1e-4 || !within(d[1] * tt, pr.y)) continue;
      t = tt;
    }
    if (t < best) best = t;
  }
  return Math.min(best, 80);
}

// Grid over the plate (plus overscan) displaced to proxy depth.
export function plateGeometry(plate, nx = 160, ny = 90, ov = 0.18) {
  const count = (nx + 1) * (ny + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let k = 0;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = -ov + ((1 + 2 * ov) * i) / nx;
      const v = -ov + ((1 + 2 * ov) * j) / ny; // image rows, top = 0
      const d = [(u * PLATE_W - plate.cx) / F_PX, -(v * PLATE_H - plate.cy) / F_PX, -1];
      const t = trace(d, plate.prims);
      pos[k * 3] = d[0] * t;
      pos[k * 3 + 1] = d[1] * t;
      pos[k * 3 + 2] = -t;
      uv[k * 2] = u;
      uv[k * 2 + 1] = 1 - v;
      k++;
    }
  }
  const index = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vDepth = -position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uPresence;   // global presence of this plate
  uniform float uInset;      // 1 while the camera is still behind the native pose → feathered inset
  uniform float uNearCut;    // hide geometry nearer than this (plate-local metres)
  uniform float uBlur;       // defocus as mip bias
  uniform float uExposure;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec2 c = clamp(vUv, 0.0, 1.0);
    float outside = length(vUv - c);
    // overscan: stretched edge, blurred and darkened, so lateral moves never reveal a hard border
    vec3 col = texture2D(uTex, c, uBlur + outside * 45.0).rgb;
    col *= 1.0 - smoothstep(0.0, 0.18, outside) * 0.6;

    vec2 e = min(vUv, 1.0 - vUv);
    float edge = min(e.x, e.y);
    float feather = mix(1.0, smoothstep(0.0, 0.17, edge), uInset);
    float gate = uNearCut > 0.0 ? smoothstep(uNearCut * 0.55, uNearCut, vDepth) : 1.0;
    float a = uPresence * feather * gate;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * uExposure, a);
  }
`;

export function plateMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: tex },
      uPresence: { value: 1 },
      uInset: { value: 0 },
      uNearCut: { value: 0 },
      uBlur: { value: 0 },
      uExposure: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}
