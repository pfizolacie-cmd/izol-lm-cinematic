import * as THREE from 'three';
import { PLATES, NOZZLE, T, BLUR_BUMPS, range, clamp01 } from '../journey.js';
import { progress, stepProgress } from '../scroll.js';
import { sampleCamera, applyCamera, frameFor } from './camera.js';
import { plateGeometry, plateMaterial } from './plates.js';
import { buildStrip, buildPipe, buildSupports, buildTank, buildSparks, metalUniforms } from './metal.js';
import { createComposite } from './post.js';
import { updateTracked, hideTracked } from './Tracked.js';

const BASE = import.meta.env.BASE_URL;
const LOCK_QUALITY = new URLSearchParams(location.search).has('q');

export function createEngine(gl) {
  gl.autoClear = false;
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.008, 220);
  const maxAniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();
  const loadTex = (url) =>
    new Promise((resolve, reject) =>
      loader.load(BASE + url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        resolve(t);
      }, undefined, reject),
    );

  // plates: one scene each so they can be layered in journey order
  const plates = PLATES.map((def) => {
    const group = new THREE.Group();
    group.position.fromArray(def.pos);
    group.scale.setScalar(def.scale);
    const mat = plateMaterial(null);
    mat.uniforms.uExposure.value = def.exposure;
    const mesh = new THREE.Mesh(plateGeometry(def), mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    const scene = new THREE.Scene();
    scene.add(group);
    group.updateMatrixWorld(true);
    return { def, group, mat, scene, tex: null, active: false, presence: 0, local: new THREE.Vector3() };
  });
  const byId = Object.fromEntries(plates.map((p) => [p.def.id, p]));

  // blurred room behind everything while the camera is on the metal (no black holes, no fade to black)
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uAmt: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D uTex; uniform float uAmt; varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(uTex, 0.5 + (vUv - 0.5) * 0.85, 6.5).rgb * 0.62 * uAmt, 1.0); }`,
    depthTest: false,
    depthWrite: false,
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const backdrop = new THREE.Mesh(tri, backdropMat);
  backdrop.frustumCulled = false;
  const backdropScene = new THREE.Scene();
  backdropScene.add(backdrop);

  // 3D objects, always drawn over the plates
  const objScene = new THREE.Scene();
  const fog = { uFog: { value: new THREE.Color(0.02, 0.025, 0.032) }, uFogK: { value: 0.03 } };
  const pipeU = metalUniforms(fog);
  const strip = buildStrip(pipeU);
  const pipe = buildPipe(pipeU);
  const supports = buildSupports(fog);
  const tank = buildTank(fog);
  const sparks = buildSparks(NOZZLE);
  objScene.add(strip, pipe, supports.group, tank.group, sparks.points);
  let tankReady = false;

  const post = createComposite();
  const coarse = matchMedia('(pointer: coarse)').matches;
  // half-float needs a renderable float colour buffer; GPUs without one get 8-bit instead of a black frame
  const canHalf = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: coarse ? 0 : 2, // MSAA on a phone GPU costs more than it shows
    depthBuffer: true,
  });
  const Q_MIN = coarse ? 0.5 : 0.6;
  post.uniforms.tScene.value = rt.texture;

  let aspect = 16 / 9, cssW = 1, cssH = 1, dprNow = 1;
  // adaptive render scale: keeps weak GPUs smooth, returns to full resolution when there is headroom
  let quality = 1, qAcc = 0, qN = 0;
  const nozzle = new THREE.Vector3(...NOZZLE);
  const tmp = new THREE.Vector3();
  const stats = { frames: 0, ms: 0, fps: 0, quality: 1, _acc: 0, _n: 0 };
  window.__izol = { progress, stats, plates: () => plates.filter((p) => p.active).map((p) => p.def.id) };

  function applySize() {
    const w = Math.max(2, Math.round(cssW * dprNow * quality));
    const h = Math.max(2, Math.round(cssH * dprNow * quality));
    rt.setSize(w, h);
    post.uniforms.uRes.value.set(w, h);
    sparks.uniforms.uPx.value = h / (2 * frameFor(aspect).halfH);
    stats.quality = quality;
  }

  function resize(w, h, dpr) {
    cssW = w; cssH = h; aspect = w / h; dprNow = dpr;
    applySize();
  }

  async function load(onFraction) {
    const assign = (id, t) => {
      const P = byId[id];
      P.tex = t;
      P.mat.uniforms.uTex.value = t;
    };
    let done = 0;
    await Promise.all(
      ['entry', 'laser'].map((id) =>
        loadTex(byId[id].def.src).then((t) => {
          assign(id, t);
          onFraction?.(++done / 2);
        }),
      ),
    );
    supports.uniforms.uEnv.value = byId.laser.tex;
    backdropMat.uniforms.uTex.value = byId.laser.tex;
    // compile everything now instead of stalling when an object first appears
    for (const P of plates) gl.compile(P.scene, camera);
    gl.compile(objScene, camera);
    gl.compile(post.scene, post.camera);
    gl.compile(backdropScene, post.camera);

    // the rest of the journey streams in behind the first two plates
    (async () => {
      try {
        for (const id of ['threshold', 'corridor', 'tank']) {
          const t = await loadTex(byId[id].def.src);
          assign(id, t);
          if (id === 'threshold') {
            supports.uniforms.uEnv.value = t;
            backdropMat.uniforms.uTex.value = t;
          }
        }
        const photo = await loadTex(byId.tank.def.photo);
        tank.uniforms.uPhoto.value = photo;
        tank.uniforms.uEnvA.value = photo;
        tank.uniforms.uEnvB.value = photo;
        tankReady = true;
      } catch (e) {
        console.warn('[izol] plate stream failed', e);
      }
    })();
  }

  function frame(dt, time, forceP) {
    const t0 = performance.now();
    if (forceP === undefined) stepProgress(dt);
    else {
      progress.target = progress.value = forceP;
      progress.speed = 0;
    }
    const p = progress.value;
    const s = sampleCamera(p);
    const center = applyCamera(camera, s, aspect);

    // plates
    for (const P of plates) {
      const [w0, w1] = P.def.window;
      P.active = !!P.tex && p >= w0 && p <= w1;
      if (!P.active) continue;
      P.presence = P.def.fadeIn ? range(P.def.fadeIn, p) : 1;
      P.local.copy(camera.position);
      P.group.worldToLocal(P.local);
      const z = P.local.z;
      // how far the camera still is from the plate's native pose (only counts while behind it)
      const behind = Math.max(0, z) + 0.5 * Math.hypot(P.local.x, P.local.y) * range([0, 0.5], z);
      const u = P.mat.uniforms;
      u.uPresence.value = P.presence;
      u.uInset.value = clamp01(behind / 1.6);
      u.uNearCut.value = behind * 0.6;
      u.uBlur.value =
        P.def.id === 'laser' ? range(T.laserDefocus, p) * 3.5
        : P.def.id === 'threshold' ? (1 - range(T.thresholdFocus, p)) * 4.5
        : 0;
    }

    // the sheet → the pipe. Before the dive the procedural sheet only carries the few metres in
    // front of the camera, where the low reference camera cannot hold detail.
    const bend = range(T.bend, p);
    const metalAlpha = range([0.005, 0.05], p) * (1 - range(T.pipeOut, p));
    strip.visible = metalAlpha > 0.001;
    pipe.visible = bend > 0.9;
    pipeU.uAlpha.value = metalAlpha;
    pipeU.uFade.value.set(0.55, 1.9, 1 - range(T.sheetIn, p));
    pipeU.uEdgeFade.value = 1 - bend;
    pipeU.uBend.value = bend;
    // the entry sheet is still uncut; cut parts belong to the laser close-up and after
    pipeU.uSheet.value = range([0.17, 0.24], p) * (1 - range(T.contoursOut, p));
    pipeU.uKerf.value = 1 - range(T.kerfGlowOut, p);
    pipeU.uKerfCut.value = range([0.3, 0.37], p);
    pipeU.uKerfRefl.value = 1 - range([0.3, 0.36], p);
    pipeU.uSeams.value = range(T.seamsIn, p);
    pipeU.uWave.value = 0.008 + 0.03 * bend;
    pipeU.uBias.value = 3.8 + 0.8 * bend;
    // room lights only reflect once we are on the cladding, not on the machine table
    pipeU.uLightGain.value = 0.45 * range([0.5, 0.58], p);
    pipeU.uTopFade.value = 2.9;
    if (p < 0.25) {
      pipeU.uEnvA.value = byId.entry.tex;
      pipeU.uEnvB.value = byId.laser.tex;
      pipeU.uEnvMix.value = range([0.14, 0.2], p);
    } else {
      pipeU.uEnvA.value = byId.laser.tex;
      pipeU.uEnvB.value = byId.threshold.tex || byId.laser.tex;
      pipeU.uEnvMix.value = range(T.envMix, p);
    }
    supports.group.visible = p > T.supportsIn[0];
    supports.uniforms.uAlpha.value = range(T.supportsIn, p) * metalAlpha;
    const backAmt = range([0.37, 0.44], p) * (1 - range([0.62, 0.66], p));

    // tank
    const tp = byId.tank;
    tank.group.visible = tankReady && tp.active;
    if (tank.group.visible) {
      tank.uniforms.uAlpha.value = tp.presence;
      tank.uniforms.uCamLocal.value.copy(tp.local);
    }

    // laser glow + sparks
    const glowAmt = 1 - range(T.nozzleGlowOut, p);
    sparks.points.visible = glowAmt > 0.01;
    sparks.uniforms.uAmt.value = glowAmt * range([0.12, 0.2], p);
    sparks.uniforms.uTime.value = time;
    tmp.copy(nozzle).applyMatrix4(camera.matrixWorldInverse);
    const dist = -tmp.z;
    if (dist > 0.05 && glowAmt > 0.01) {
      tmp.applyMatrix4(camera.projectionMatrix);
      post.uniforms.uGlowPos.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      post.uniforms.uGlowAmt.value = glowAmt * 0.9;
      post.uniforms.uGlowSize.value = Math.min(0.04, Math.max(0.006, 0.045 / dist));
    } else {
      post.uniforms.uGlowAmt.value = 0;
    }

    // handoff blur (by progress) + a touch of motion blur from actual camera speed
    let blur = 0;
    for (const [c, w, a] of BLUR_BUMPS) blur += a * Math.exp(-(((p - c) / w) ** 2));
    blur += Math.min(0.008, Math.abs(progress.speed) * 0.03);
    post.uniforms.uBlur.value = blur;
    post.uniforms.uCenter.value.set(center.x, center.y);
    post.uniforms.uTime.value = time;

    // render
    gl.setRenderTarget(rt);
    gl.setClearColor(0x06080b, 1);
    gl.clear(true, true, false);
    if (backAmt > 0.002 && backdropMat.uniforms.uTex.value) {
      backdropMat.uniforms.uAmt.value = backAmt;
      gl.render(backdropScene, post.camera);
    }
    for (const P of plates) {
      if (!P.active) continue;
      gl.render(P.scene, camera);
      gl.clearDepth();
    }
    gl.render(objScene, camera);
    gl.setRenderTarget(null);
    gl.render(post.scene, post.camera);

    updateTracked(camera, p, cssW, cssH);

    stats.frames++;
    stats.ms = performance.now() - t0;
    stats._acc += dt; stats._n++;
    if (stats._acc > 0.5) { stats.fps = Math.round(stats._n / stats._acc); stats._acc = 0; stats._n = 0; }
    if (forceP === undefined && !LOCK_QUALITY) {
      qAcc += dt; qN++;
      if (qAcc > 1.2) {
        const avg = qAcc / qN;
        if (avg > 1 / 45 && quality > Q_MIN) { quality = Math.max(Q_MIN, quality - 0.1); applySize(); }
        else if (avg < 1 / 58 && quality < 1) { quality = Math.min(1, quality + 0.05); applySize(); }
        qAcc = 0; qN = 0;
      }
    }
  }

  function dispose() {
    hideTracked();
    for (const P of plates) {
      P.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      P.tex?.dispose();
    }
    objScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    tank.uniforms.uPhoto.value?.dispose();
    backdropMat.dispose();
    tri.dispose();
    post.material.dispose();
    post.geo.dispose();
    rt.dispose();
    delete window.__izol;
  }

  // test hook: render one frame at an exact progress (works even when rAF is throttled)
  window.__izol.renderAt = (p, time = 1) => frame(0.016, time, p);

  return { load, frame, resize, dispose };
}
