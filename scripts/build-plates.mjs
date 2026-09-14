// Builds web-ready camera plates from /references.
// - removes baked-in typography (all final type must be HTML/CSS) with a Coons-patch fill + matched grain
// - exports desktop (native 1672px) and mobile (960px) WebP
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const REF = 'references/ChatGPT Image 12. 9. 2026, ';
const PLATES = [
  // storyboard order, see STORYBOARD.md
  { name: 'entry', src: '19_48_05', erase: [
    { x: 712, y: 108, w: 680, h: 136 },   // panel wordmark, claim, ULTRA-CUT
    { x: 98, y: 128, w: 124, h: 116 },    // left column list
    { x: 1486, y: 128, w: 72, h: 116 },   // right column list
  ] },
  { name: 'laser', src: '19_47_50', erase: [
    { x: 728, y: 110, w: 202, h: 106 },   // head plate wordmark + ULTRA-CUT
  ] },
  { name: 'threshold', src: '19_52_49', erase: [] },
  { name: 'corridor', src: '19_53_41', erase: [] },
  { name: 'tank', src: '19_55_58', erase: [] },
  // clean background for the tank shot: the tank itself is a 3D object carrying the photo,
  // so the plate behind it must not contain a second tank when the camera passes beside it
  { name: 'tank-bg', src: '19_55_58', erase: [{ x: 578, y: 95, w: 480, h: 617, mode: 'mirror' }], noMobile: true },
];

// Fill a region with the room on either side of it, mirrored inward and cross-blended, then
// softened: behind the tank there should be more room, not a hole.
function mirrorFill(px, W, C, r) {
  const L = r.x, R = r.x + r.w;
  const out = new Float32Array(r.w * r.h * 3);
  for (let j = 0; j < r.h; j++) {
    const y = r.y + j;
    for (let i = 0; i < r.w; i++) {
      const u = (i + 0.5) / r.w;
      const k = u * u * (3 - 2 * u);
      const xl = Math.max(0, L - 1 - i);
      const xr = Math.min(W - 1, R + (r.w - 1 - i));
      for (let c = 0; c < 3; c++) {
        out[(j * r.w + i) * 3 + c] = (px[(y * W + xl) * C + c] * (1 - k) + px[(y * W + xr) * C + c] * k) * 0.82;
      }
    }
  }
  // separable box blur (radius 4) — it sits behind the tank, slightly out of focus
  const rad = 4;
  const tmp = new Float32Array(out.length);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? out : tmp, dst = pass === 0 ? tmp : out;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) for (let c = 0; c < 3; c++) {
      let s = 0, n = 0;
      for (let d = -rad; d <= rad; d++) {
        const ii = pass === 0 ? Math.min(r.w - 1, Math.max(0, i + d)) : i;
        const jj = pass === 1 ? Math.min(r.h - 1, Math.max(0, j + d)) : j;
        s += src[(jj * r.w + ii) * 3 + c]; n++;
      }
      dst[(j * r.w + i) * 3 + c] = s / n;
    }
  }
  for (let j = 0; j < r.h; j++) {
    const ev = Math.min(1, Math.min(j, r.h - 1 - j) / 6);
    for (let i = 0; i < r.w; i++) {
      const eh = Math.min(1, Math.min(i, r.w - 1 - i) / 6);
      const k = Math.min(ev, eh);
      for (let c = 0; c < 3; c++) {
        const idx = ((r.y + j) * W + r.x + i) * C + c;
        px[idx] = px[idx] * (1 - k) + out[(j * r.w + i) * 3 + c] * k;
      }
    }
  }
}

mkdirSync('public/plates', { recursive: true });

// deterministic PRNG so rebuilds are identical
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 0.866; };

function erase(px, W, C, r) {
  const band = 3, smooth = 6;
  const at = (x, y, c) => px[(y * W + x) * C + c];
  // boundary samples averaged over a band just outside the rect, then smoothed along the edge
  const edge = (len, sample) => {
    const raw = Array.from({ length: len }, (_, i) => sample(i));
    return raw.map((_, i) => {
      const acc = [0, 0, 0]; let n = 0;
      for (let k = -smooth; k <= smooth; k++) {
        const j = Math.min(len - 1, Math.max(0, i + k));
        for (let c = 0; c < 3; c++) acc[c] += raw[j][c]; n++;
      }
      return acc.map((v) => v / n);
    });
  };
  const avg = (fn) => { const a = [0, 0, 0]; for (let b = 1; b <= band; b++) { const p = fn(b); for (let c = 0; c < 3; c++) a[c] += p[c]; } return a.map((v) => v / band); };
  const pix = (x, y) => [at(x, y, 0), at(x, y, 1), at(x, y, 2)];
  const T = edge(r.w, (i) => avg((b) => pix(r.x + i, r.y - b)));
  const B = edge(r.w, (i) => avg((b) => pix(r.x + i, r.y + r.h - 1 + b)));
  const L = edge(r.h, (j) => avg((b) => pix(r.x - b, r.y + j)));
  const R = edge(r.h, (j) => avg((b) => pix(r.x + r.w - 1 + b, r.y + j)));
  // grain amplitude measured from the ring around the rect
  let sum = 0, sq = 0, n = 0;
  for (let i = 0; i < r.w; i++) for (const y of [r.y - 5, r.y + r.h + 4]) { const v = at(r.x + i, y, 1); sum += v; sq += v * v; n++; }
  const sigma = Math.min(6, Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) * 0.5 + 1.2);
  const c00 = T[0], c10 = T[r.w - 1], c01 = B[0], c11 = B[r.w - 1];
  const streak = Array.from({ length: r.h }, () => gauss() * sigma * 0.6); // horizontal brushing
  for (let j = 0; j < r.h; j++) {
    const v = (j + 0.5) / r.h;
    for (let i = 0; i < r.w; i++) {
      const u = (i + 0.5) / r.w;
      const g = gauss() * sigma + streak[j];
      // feather into the original over 3px
      const e = Math.min(i, j, r.w - 1 - i, r.h - 1 - j);
      const k = Math.min(1, (e + 1) / 3);
      for (let c = 0; c < 3; c++) {
        const coons = (1 - v) * T[i][c] + v * B[i][c] + (1 - u) * L[j][c] + u * R[j][c]
          - ((1 - u) * (1 - v) * c00[c] + u * (1 - v) * c10[c] + (1 - u) * v * c01[c] + u * v * c11[c]);
        const idx = ((r.y + j) * W + r.x + i) * C + c;
        px[idx] = Math.max(0, Math.min(255, px[idx] * (1 - k) + (coons + g) * k));
      }
    }
  }
}

for (const p of PLATES) {
  const { data, info } = await sharp(`${REF}${p.src}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const r of p.erase) (r.mode === 'mirror' ? mirrorFill : erase)(data, info.width, info.channels, r);
  const img = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  await img().webp({ quality: 84, effort: 5 }).toFile(`public/plates/${p.name}.webp`);
  if (!p.noMobile) await img().resize(960).webp({ quality: 78, effort: 5 }).toFile(`public/plates/${p.name}-m.webp`);
  console.log('plate', p.name, info.width + 'x' + info.height, p.erase.length ? `(${p.erase.length} type regions removed)` : '');
}
