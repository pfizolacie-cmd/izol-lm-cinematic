import * as THREE from 'three';
import { KEYS, PLATES, PLATE_W, PLATE_H, F_PX, FOV_V } from '../journey.js';

const DEG = Math.PI / 180;

// Resolve keys: carry values forward, convert tank-local keys to world.
const tankPlate = PLATES.find((p) => p.id === 'tank');
const resolved = [];
{
  let last = { yaw: 0, pitch: 0, cx: PLATE_W / 2, cy: PLATE_H / 2 };
  for (const k of KEYS) {
    const pos = k.pos
      ? k.pos
      : k.local.map((v, i) => tankPlate.pos[i] + v * tankPlate.scale);
    last = { p: k.p, pos, yaw: k.yaw ?? last.yaw, pitch: k.pitch ?? last.pitch, cx: k.cx ?? last.cx, cy: k.cy ?? last.cy };
    resolved.push(last);
  }
}

const curve = new THREE.CatmullRomCurve3(resolved.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
const n = resolved.length;

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

const out = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, cx: 0, cy: 0 };

export function sampleCamera(p) {
  let i = 0;
  while (i < n - 2 && p > resolved[i + 1].p) i++;
  const k1 = resolved[i], k2 = resolved[i + 1];
  const t = Math.min(1, Math.max(0, (p - k1.p) / (k2.p - k1.p)));
  curve.getPoint((i + t) / (n - 1), out.pos);
  const k0 = resolved[Math.max(0, i - 1)], k3 = resolved[Math.min(n - 1, i + 2)];
  for (const ch of ['yaw', 'pitch', 'cx', 'cy']) out[ch] = catmull(k0[ch], k1[ch], k2[ch], k3[ch], t);
  return out;
}

// Off-axis projection: vertical FOV shared with the plates, principal point (cx, cy) reproduced as
// lens shift so verticals stay vertical. The frame always covers the viewport.
const tanHalf = Math.tan((FOV_V / 2) * DEG);
const plateAspect = PLATE_W / PLATE_H;

export function frameFor(aspect) {
  let halfW = tanHalf * plateAspect, halfH = tanHalf;
  if (aspect >= plateAspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;
  return { halfW, halfH };
}

export function applyCamera(camera, s, aspect, near = 0.008, far = 220) {
  camera.position.copy(s.pos);
  camera.rotation.set(s.pitch * DEG, -s.yaw * DEG, 0, 'YXZ');
  camera.updateMatrixWorld(true);

  const { halfW, halfH } = frameFor(aspect);
  const ox = (s.cx - PLATE_W / 2) / F_PX;
  const oy = -(s.cy - PLATE_H / 2) / F_PX;
  const m = camera.projectionMatrix.elements;
  m.fill(0);
  m[0] = 1 / halfW;
  m[5] = 1 / halfH;
  m[8] = -ox / halfW;
  m[9] = -oy / halfH;
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = (-2 * far * near) / (far - near);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  // screen position of the optical axis (radial blur centre), in uv
  return { x: 0.5 + (0.5 * ox) / halfW, y: 0.5 + (0.5 * oy) / halfH };
}
