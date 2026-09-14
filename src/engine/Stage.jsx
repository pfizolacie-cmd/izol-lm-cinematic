import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createEngine } from './index.js';

// R3F hosts the renderer and lifecycle; the engine owns the frame (useFrame priority 1 disables
// R3F's own render so plates can be layered and composited).
function Engine({ onReady, onLoad }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const engine = useRef(null);

  // created and disposed by the same effect, so StrictMode's double mount gets a fresh engine
  useEffect(() => {
    const e = createEngine(gl);
    engine.current = e;
    e.resize(size.width, size.height, gl.getPixelRatio());
    let alive = true;
    e.load((f) => alive && onLoad?.(f))
      .then(() => alive && onReady())
      .catch((err) => console.error('[izol] load failed', err));
    return () => {
      alive = false;
      engine.current = null;
      e.dispose();
    };
  }, [gl]);

  useEffect(() => {
    engine.current?.resize(size.width, size.height, gl.getPixelRatio());
  }, [size, gl]);

  useFrame((state, dt) => engine.current?.frame(dt, state.clock.elapsedTime), 1);
  return null;
}

export default function Stage({ onReady, onLoad }) {
  return (
    <Canvas
      className="stage"
      style={{ position: 'fixed', inset: 0 }}
      dpr={[1, 1.5]}
      flat
      linear
      frameloop="always"
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      <Engine onReady={onReady} onLoad={onLoad} />
    </Canvas>
  );
}
