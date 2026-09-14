// Scripted browser test: real Chrome, real scroll, screenshots at given progress values,
// forward/backward sweep with frame timing, resize checks, console errors.
// Usage: node scripts/shoot.mjs '{"w":1920,"h":1080,"shots":[0,0.1],"out":"C:/tmp/shots"}'
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const o = JSON.parse(process.argv[2] || '{}');
const {
  url = 'http://localhost:5173/', query = '?debug', w = 1920, h = 1080, mobile = false, reduced = false,
  shots = [], out = 'shots', prefix = '', sweep = false, resize = [], backShots = [], headless = true,
} = o;
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless,
  defaultViewport: null,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', `--window-size=${w},${h}`],
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => ['error', 'warn', 'warning'].includes(m.type()) && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

const t0 = Date.now();
await page.goto(url + query, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.loader')?.classList.contains('done'), { timeout: 30000 });
const readyMs = Date.now() - t0;
await page.waitForNetworkIdle({ idleTime: 500, timeout: 20000 }).catch(() => {});
const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { mode: document.documentElement.dataset.mode, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a' };
});
console.log(`ready in ${readyMs} ms · mode=${info.mode} · ${info.gpu} · ${w}x${h}${reduced ? ' reduced' : ''}${mobile ? ' mobile' : ''}`);

async function goTo(p) {
  await page.evaluate((p) => window.scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)), p);
  // wait for the target to reach p first: right after scrollTo, value == target can still hold at the old position
  await page
    .waitForFunction(
      (p) => { const pr = window.__izolP; return pr && Math.abs(pr.target - p) < 0.002 && Math.abs(pr.value - pr.target) < 0.0004; },
      { timeout: 20000, polling: 50 },
      p,
    )
    .catch(() => logs.push(`[test] progress did not settle at ${p}`));
  await new Promise((r) => setTimeout(r, 350));
}
const shoot = (name) => page.screenshot({ path: `${out}/${prefix}${name}.jpg`, type: 'jpeg', quality: 78 });

for (const p of shots) {
  await goTo(p);
  await shoot(`p${String(p).replace('.', '_')}`);
}
// backward: approach the same points from above
for (const p of backShots) {
  await goTo(Math.min(1, p + 0.08));
  await goTo(p);
  await shoot(`back_p${String(p).replace('.', '_')}`);
}
for (const [rw, rh] of resize) {
  await page.setViewport({ width: rw, height: rh, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 900));
  const m = await page.evaluate(() => ({ mode: document.documentElement.dataset.mode, p: window.__izolP?.value, canvas: [document.querySelector('canvas')?.width, document.querySelector('canvas')?.height] }));
  console.log(`resize ${rw}x${rh} →`, JSON.stringify(m));
  await shoot(`resize_${rw}x${rh}`);
}

if (sweep) {
  await goTo(0);
  const res = await page.evaluate(async () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const frames = [];
    let last = performance.now(), run = true;
    const loop = (t) => { frames.push(t - last); last = t; if (run) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    const glide = (from, to, dur) => new Promise((done) => {
      const s = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - s) / dur);
        window.scrollTo(0, (from + (to - from) * k) * max);
        k < 1 ? requestAnimationFrame(step) : done();
      };
      step();
    });
    await glide(0, 1, 12000);
    await new Promise((r) => setTimeout(r, 1500));
    const pEnd = window.__izolP.value;
    await glide(1, 0, 12000);
    await new Promise((r) => setTimeout(r, 1500));
    run = false;
    frames.shift();
    const sorted = [...frames].sort((a, b) => a - b);
    const q = (x) => sorted[Math.floor(sorted.length * x)];
    return {
      frames: frames.length, avgMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2),
      p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), worst: +sorted[sorted.length - 1].toFixed(1),
      over33ms: frames.filter((f) => f > 33.4).length, pAtEnd: +pEnd.toFixed(4), pAtStart: +window.__izolP.value.toFixed(4),
      engineMs: window.__izol?.stats?.ms,
    };
  });
  console.log('sweep fwd+back:', JSON.stringify(res));
}

console.log(logs.length ? logs.join('\n') : 'console: no errors or warnings');
await browser.close();
