// Master progress: one number, 0 → 1, drives the whole journey.
// `target` is where the scrollbar is; `value` follows it with critically-damped easing,
// so direction and speed of scrolling only change how fast `value` arrives — never where.

export const progress = { target: 0, value: 0, speed: 0 };
window.__izolP = progress; // read-only handle for the test runner (scripts/shoot.mjs)

const listeners = new Set();
let damping = 4.2;
let maxScroll = 1;

export function measureScroll() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

export function setDamping(d) {
  damping = d;
}

function readTarget() {
  const t = window.scrollY / maxScroll;
  progress.target = t < 0 ? 0 : t > 1 ? 1 : t;
}

// Called once per rendered frame by whichever loop owns the frame (WebGL stage or CSS fallback).
export function stepProgress(dt) {
  readTarget();
  const prev = progress.value;
  if (damping <= 0) {
    progress.value = progress.target;
  } else {
    const k = 1 - Math.exp(-damping * Math.min(dt, 0.1));
    progress.value += (progress.target - progress.value) * k;
    if (Math.abs(progress.target - progress.value) < 1e-5) progress.value = progress.target;
  }
  progress.speed = dt > 0 ? (progress.value - prev) / dt : 0;
  for (const fn of listeners) fn(progress);
}

export function onProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function scrollToProgress(p, { instant = false } = {}) {
  measureScroll();
  window.scrollTo({ top: p * maxScroll, behavior: instant ? 'instant' : 'smooth' });
  if (instant) {
    progress.target = progress.value = p;
  }
}
