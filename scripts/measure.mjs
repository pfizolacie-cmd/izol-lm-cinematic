// Usage: node crops.mjs <src> <out> x y w h [gridStep]
// Crops a region, scales 2x, and overlays a pixel grid with coordinates to measure features.
import sharp from 'sharp';
const [src, out, x, y, w, h, stepArg] = process.argv.slice(2);
const X = +x, Y = +y, W = +w, H = +h, step = +(stepArg || 50), S = 2;
let svg = `<svg width="${W * S}" height="${H * S}" xmlns="http://www.w3.org/2000/svg">`;
for (let gx = Math.ceil(X / step) * step; gx < X + W; gx += step) {
  const px = (gx - X) * S;
  svg += `<line x1="${px}" y1="0" x2="${px}" y2="${H * S}" stroke="#0ff" stroke-width="1" opacity="0.6"/>`;
  svg += `<text x="${px + 2}" y="14" fill="#0ff" font-size="13" font-family="monospace">${gx}</text>`;
}
for (let gy = Math.ceil(Y / step) * step; gy < Y + H; gy += step) {
  const py = (gy - Y) * S;
  svg += `<line x1="0" y1="${py}" x2="${W * S}" y2="${py}" stroke="#f0f" stroke-width="1" opacity="0.6"/>`;
  svg += `<text x="2" y="${py - 2}" fill="#f0f" font-size="13" font-family="monospace">${gy}</text>`;
}
svg += '</svg>';
await sharp(src).extract({ left: X, top: Y, width: W, height: H }).resize(W * S, H * S)
  .composite([{ input: Buffer.from(svg) }]).png().toFile(out);
console.log('wrote', out);
