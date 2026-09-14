import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const forced = new URLSearchParams(location.search).get('mode');
const webgl2 = hasWebGL2();

function detect() {
  if (forced === 'webgl' || forced === 'fallback' || forced === 'reduced') return forced;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
  const w = window.innerWidth;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (w < 820 || (coarse && w < 1100) || !webgl2) return 'fallback';
  return 'webgl';
}

function Root() {
  const [mode, setMode] = useState(detect);
  useEffect(() => {
    let t = 0;
    const update = () => {
      clearTimeout(t);
      t = setTimeout(() => setMode(detect()), 200);
    };
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);
  return <App key={mode} mode={mode} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
