import * as THREE from 'three';
import { range } from '../journey.js';
import { trackedEls } from '../tracked-els.js';

// HTML typography pinned to surfaces in the plates (all type stays HTML/CSS).
// Corners are world metres: top-left, top-right, bottom-left, bottom-right.
const DEFS = {
  // ULTRA-CUT gantry panel, where the reference had (misspelled) baked-in lettering
  panel: {
    w: 1000, h: 200,
    corners: [[-0.364, 1.26, -3.6], [1.633, 1.26, -3.6], [-0.364, 0.861, -3.6], [1.633, 0.861, -3.6]],
    opacity: (p) => 1 - range([0.12, 0.175], p),
  },
  // front plate of the cutting head in the close-up
  head: {
    w: 404, h: 212,
    corners: [[-0.175, 0.711, -4.0], [0.171, 0.711, -4.0], [-0.175, 0.5295, -4.0], [0.171, 0.5295, -4.0]],
    opacity: (p) => range([0.172, 0.19], p) * (1 - range([0.3, 0.345], p)),
  },
};

function adj(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}
function mulMM(a, b) {
  const c = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
    c[3 * i + j] = s;
  }
  return c;
}
function mulMV(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
function basis(x1, y1, x2, y2, x3, y3, x4, y4) {
  const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1];
  const v = mulMV(adj(m), [x4, y4, 1]);
  return mulMM(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function quad(w, h, pts) {
  const s = basis(0, 0, w, 0, 0, h, w, h);
  const d = basis(...pts.flat());
  const t = mulMM(d, adj(s));
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  return `matrix3d(${t[0]},${t[3]},0,${t[6]},${t[1]},${t[4]},0,${t[7]},0,0,1,0,${t[2]},${t[5]},0,${t[8]})`;
}

const v = new THREE.Vector3();

export function updateTracked(camera, p, W, H) {
  for (const id in DEFS) {
    const el = trackedEls[id];
    if (!el) continue;
    const def = DEFS[id];
    const o = def.opacity(p);
    let ok = o > 0.01;
    const pts = [];
    if (ok) {
      for (const c of def.corners) {
        v.fromArray(c).applyMatrix4(camera.matrixWorldInverse);
        if (v.z > -0.05) { ok = false; break; }
        v.applyMatrix4(camera.projectionMatrix);
        pts.push([(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H]);
      }
    }
    if (!ok) {
      if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
      continue;
    }
    el.style.visibility = 'visible';
    el.style.opacity = o.toFixed(3);
    el.style.transform = quad(def.w, def.h, pts);
  }
}

export function hideTracked() {
  for (const id in trackedEls) if (trackedEls[id]) trackedEls[id].style.visibility = 'hidden';
}
