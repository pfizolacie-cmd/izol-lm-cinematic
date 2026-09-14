import { useEffect, useRef } from 'react';
import { progress, setDamping, stepProgress } from './scroll.js';
import { PLATE_W, PLATE_H, smooth, clamp01 } from './journey.js';

const BASE = import.meta.env.BASE_URL;

// Same plates, same master progress, same chapters — CSS only.
const LAYERS = [
  { id: 'entry', src: 'plates/entry-m.webp', vp: [836, 537], from: 0, to: 0.19 },
  { id: 'laser', src: 'plates/laser-m.webp', vp: [830, 540], from: 0.19, to: 0.4 },
  { id: 'metal', metal: true, from: 0.4, to: 0.56 },
  { id: 'threshold', src: 'plates/threshold-m.webp', vp: [830, 480], from: 0.56, to: 0.745 },
  { id: 'corridor', src: 'plates/corridor-m.webp', vp: [908, 560], from: 0.745, to: 0.885 },
  { id: 'tank', src: 'plates/tank-m.webp', vp: [820, 480], from: 0.885, to: 1.0 },
];

export default function Fallback({ reduced, onReady }) {
  const refs = useRef([]);
  // reduced motion on a desktop screen deserves the full-resolution plates
  const wide = window.innerWidth >= 820;

  useEffect(() => {
    setDamping(reduced ? 0 : 6);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      stepProgress((now - last) / 1000);
      last = now;
      apply(progress.value);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      setDamping(4.2);
    };
  }, [reduced]);

  function apply(p) {
    LAYERS.forEach((L, i) => {
      const el = refs.current[i];
      if (!el) return;
      if (reduced) {
        // still frames, dissolved by CSS transition when the chapter changes
        const on = (i === 0 || p >= L.from) && (i === LAYERS.length - 1 || p < L.to);
        el.classList.toggle('on', on);
        return;
      }
      const o = i === 0 ? 1 : smooth(L.from - 0.03, L.from + 0.01, p);
      const visible = p < L.to + 0.05 && o > 0.001;
      el.style.visibility = visible ? 'visible' : 'hidden';
      el.style.opacity = o.toFixed(3);
      const k = clamp01((p - L.from + 0.03) / (L.to - L.from + 0.03));
      el.style.transform = `scale(${(1 + 0.34 * k).toFixed(4)})`;
      if (L.metal) el.style.setProperty('--travel', (k * 100).toFixed(2));
    });
  }

  return (
    <div className={`fb${reduced ? ' fb-reduced' : ''}`} aria-hidden="true">
      {LAYERS.map((L, i) => {
        const origin = L.vp ? `${((L.vp[0] / PLATE_W) * 100).toFixed(1)}% ${((L.vp[1] / PLATE_H) * 100).toFixed(1)}%` : '50% 50%';
        return (
          <div
            key={L.id}
            ref={(el) => (refs.current[i] = el)}
            className={`fb-layer${L.metal ? ' fb-metal' : ''}`}
            style={{ transformOrigin: origin, zIndex: i }}
          >
            {L.metal ? (
              <div className="fb-metal-surface">
                <span className="fb-kerf" />
              </div>
            ) : (
              // cover-sized box in plate proportions, so HTML can be pinned in plate percentages
              <div className="fb-plate" style={{ '--ox': L.vp[0] / PLATE_W, '--oy': L.vp[1] / PLATE_H }}>
                <img
                  src={BASE + (wide ? L.src.replace('-m.', '.') : L.src)}
                  alt=""
                  crossOrigin="anonymous"
                  decoding="async"
                  fetchpriority={i < 2 ? 'high' : 'low'}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  onLoad={i === 0 ? onReady : undefined}
                />
                {L.id === 'entry' && (
                  <div className="fb-brand">
                    <span className="fb-word">IZOL L&amp;M</span>
                    <span className="fb-claim">PRIEMYSELNÉ IZOLÁCIE</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
