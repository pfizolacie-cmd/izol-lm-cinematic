import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS, CONTACT, FINALE_AT, STATS } from './journey.js';
import { measureScroll, onProgress, progress, scrollToProgress } from './scroll.js';
import { trackedEls } from './tracked-els.js';
import Fallback from './Fallback.jsx';

const Stage = lazy(() => import('./engine/Stage.jsx'));

export default function App({ mode }) {
  const webgl = mode === 'webgl';
  const [ready, setReady] = useState(false);
  const [loadFrac, setLoadFrac] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [menu, setMenu] = useState(false);
  const [finale, setFinale] = useState(false);
  const railRef = useRef(null);
  const hintRef = useRef(null);
  const dbgRef = useRef(null);
  const debug = useMemo(() => new URLSearchParams(location.search).has('debug'), []);

  useEffect(() => {
    if (debug) document.documentElement.dataset.debug = '';
    measureScroll();
    // the track is in vh, so a resize changes its length: keep the journey position, not the pixels
    const onResize = () => {
      const p = progress.target;
      measureScroll();
      window.scrollTo(0, p * Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
    };
    window.addEventListener('resize', onResize);
    const q = new URLSearchParams(location.search).get('p');
    const start = q !== null ? Math.min(1, Math.max(0, parseFloat(q) || 0)) : progress.value;
    requestAnimationFrame(() => scrollToProgress(start, { instant: true }));

    let last = -2;
    let lastFin = null;
    const off = onProgress((pr) => {
      const p = pr.value;
      const fin = p >= FINALE_AT;
      if (fin !== lastFin) {
        lastFin = fin;
        setFinale(fin);
      }
      if (railRef.current) railRef.current.style.transform = `scaleY(${p.toFixed(4)})`;
      if (hintRef.current) hintRef.current.classList.toggle('gone', p > 0.012);
      const i = CHAPTERS.findIndex((c) => p >= c.from && p < c.to);
      if (i !== last) {
        last = i;
        setChapter(i);
      }
      if (dbgRef.current) {
        const s = window.__izol?.stats;
        dbgRef.current.textContent = `p ${p.toFixed(4)} → ${pr.target.toFixed(4)}${s ? `  ${s.fps} fps  ${s.ms.toFixed(1)} ms  [${window.__izol.plates().join(', ')}]` : ''}`;
      }
    });
    return () => {
      off();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const jump = (p) => {
    setMenu(false);
    scrollToProgress(p, { instant: mode === 'reduced' });
  };

  return (
    <>
      <div className="track" style={{ height: webgl ? '1100vh' : '800vh' }} />

      {webgl ? (
        <Suspense fallback={null}>
          <Stage onReady={() => setReady(true)} onLoad={setLoadFrac} />
        </Suspense>
      ) : (
        <Fallback reduced={mode === 'reduced'} onReady={() => setReady(true)} />
      )}

      {webgl && (
        <div className="tracked" aria-hidden="true">
          <div className="trk trk-panel" ref={(el) => (trackedEls.panel = el)}>
            <span className="trk-word">IZOL L&amp;M</span>
            <span className="trk-claim">PRIEMYSELNÉ IZOLÁCIE</span>
          </div>
          <div className="trk trk-head" ref={(el) => (trackedEls.head = el)}>
            <span className="trk-word">IZOL L&amp;M</span>
          </div>
        </div>
      )}

      <header className="hud-top">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); jump(0); }} aria-label="IZOL L&M — na začiatok">
          <span className="brand-word">IZOL L&amp;M</span>
          <span className="brand-sub">PRIEMYSELNÉ IZOLÁCIE</span>
        </a>
        <button className={`menu-btn${menu ? ' open' : ''}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-controls="menu">
          <span>{menu ? 'ZAVRIEŤ' : 'MENU'}</span>
          <i aria-hidden="true" />
        </button>
      </header>

      <nav id="menu" className={`menu${menu ? ' open' : ''}`} aria-hidden={!menu}>
        <ol>
          {CHAPTERS.map((c) => (
            <li key={c.n}>
              <button onClick={() => jump(c.jump)} tabIndex={menu ? 0 : -1}>
                <em>{c.n}</em>
                {c.label}
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => jump(1)} tabIndex={menu ? 0 : -1}>
              <em>—</em>
              KONTAKT
            </button>
          </li>
        </ol>
      </nav>

      <div className={`finale-scrim${finale ? ' on' : ''}`} aria-hidden="true" />
      <section className={`finale${finale ? ' on' : ''}`} aria-label="IZOL L&M v číslach a kontakt">
        <dl className="stats">
          {STATS.map((s) => (
            <div key={s.k}>
              <dt>{s.v}</dt>
              <dd>{s.k}</dd>
            </div>
          ))}
        </dl>
        <address className="contact">
          <strong>{CONTACT.name}</strong>
          <span>{CONTACT.address}</span>
          <a href={`tel:${CONTACT.phone.replace(/\s/g, '')}`} tabIndex={finale ? 0 : -1}>{CONTACT.phone}</a>
          <a href={`mailto:${CONTACT.email}`} tabIndex={finale ? 0 : -1}>{CONTACT.email}</a>
        </address>
      </section>

      {/* the journey as text, for screen readers and search engines */}
      <main className="sr">
        <h1>IZOL L&amp;M — priemyselné izolácie a oplechovanie</h1>
        <p>Profesionálne návrhy, dodávka a montáž chladových, tepelných a protipožiarnych izolácií a oplechovania.</p>
        {CHAPTERS.map((c) => (
          <section key={c.n}>
            <h2>{c.label}</h2>
            <p>{c.sub}</p>
          </section>
        ))}
        <section>
          <h2>Služby</h2>
          <h3>Klampiarske práce</h3>
          <p>Oplechovanie vzduchotechnického potrubia, tepelných a chladových potrubí a technológií. Plechy spracúvame laserovou technológiou.</p>
          <h3>Chladové izolácie</h3>
          <p>Tepelná ochrana zariadení a inštalácií, ktoré pracujú v nízkych teplotách. Certifikovaná montáž kaučukovej izolácie K-FLEX.</p>
          <h3>Tepelné a protipožiarne izolácie</h3>
          <p>Izolácia potrubí, nádrží, kotlov, klimatizačných jednotiek a vzduchotechniky. Certifikovaná montáž ISOVER a K-FLEX.</p>
        </section>
      </main>

      <div className="chapters" aria-live="polite">
        {CHAPTERS.map((c, i) => (
          <div key={c.n} className={`chapter${i === chapter ? ' on' : ''}`} aria-hidden={i !== chapter}>
            <span className="chapter-n">{c.n}</span>
            <span className="chapter-label">{c.label}</span>
            <span className="chapter-sub">{c.sub}</span>
          </div>
        ))}
      </div>

      <div className="rail" aria-hidden="true">
        <i ref={railRef} />
      </div>

      <div className="hint" ref={hintRef} aria-hidden="true">
        <span>POSÚVAJTE</span>
        <i />
      </div>

      <div className={`loader${ready ? ' done' : ''}`} role="status" aria-label="Načítava sa">
        <span className="brand-word">IZOL L&amp;M</span>
        <i style={{ transform: `scaleX(${webgl ? loadFrac : ready ? 1 : 0.5})` }} />
      </div>

      {debug && <div className="debug" ref={dbgRef} />}
    </>
  );
}
