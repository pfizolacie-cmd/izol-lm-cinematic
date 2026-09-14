import * as THREE from 'three';

// Final composite: handoff blur, highlight glow, laser glow, grade, vignette, grain → sRGB.
export function createComposite() {
  const uniforms = {
    tScene: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBlur: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uGlowPos: { value: new THREE.Vector2(0.5, 0.5) },
    uGlowAmt: { value: 0 },
    uGlowSize: { value: 0.02 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform vec2 uRes, uCenter, uGlowPos;
      uniform float uTime, uBlur, uGlowAmt, uGlowSize;
      varying vec2 vUv;

      vec3 tex(vec2 uv) { return texture2D(tScene, uv).rgb; }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      vec3 toSRGB(vec3 c) {
        c = max(c, 0.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      void main() {
        vec2 uv = vUv;
        vec3 col;
        vec2 dir = uv - uCenter;
        if (uBlur > 0.0005) {
          // radial blur toward the optical axis — the "weight" of the camera during handoffs
          col = vec3(0.0);
          float ws = 0.0;
          for (int i = 0; i < 12; i++) {
            float f = float(i) / 11.0;
            float w = 1.0 - f * 0.55;
            col += tex(uv - dir * uBlur * f) * w;
            ws += w;
          }
          col /= ws;
        } else {
          col = tex(uv);
        }

        // highlight glow (cheap two-ring gather)
        vec2 px = 1.0 / uRes;
        vec3 b = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398 + 0.39;
          vec2 o = vec2(cos(a), sin(a));
          b += max(tex(uv + o * px * 7.0) - 0.8, 0.0);
          b += max(tex(uv + o * px * 22.0) - 0.8, 0.0) * 0.6;
        }
        col += b * 0.07;

        // laser: warm, small, flickering — restrained
        vec2 gd = (uv - uGlowPos) * vec2(uRes.x / uRes.y, 1.0);
        float gl = length(gd);
        float flick = 0.86 + 0.14 * sin(uTime * 37.0) * sin(uTime * 23.1 + 1.3);
        float g = uGlowAmt * (exp(-gl / uGlowSize) * 0.85 + exp(-gl / (uGlowSize * 7.0)) * 0.12) * flick;
        col += vec3(1.0, 0.5, 0.18) * g;

        // grade: cold steel, blue-black shadows, warm kept only where it is already warm
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float warm = clamp((col.r - col.b) / (lum + 0.03), 0.0, 1.0);
        col = mix(vec3(lum), col, mix(0.74, 1.0, warm));
        col *= mix(vec3(0.92, 0.98, 1.07), vec3(1.0), smoothstep(0.0, 0.5, lum));
        col += vec3(0.0025, 0.004, 0.008) * (1.0 - smoothstep(0.0, 0.15, lum));
        // soft shoulder for HDR glow
        col = mix(col, 0.85 + 0.15 * (1.0 - exp(-(col - 0.85) * 3.0)), step(0.85, col));

        vec3 s = toSRGB(col);
        s = mix(s, s * s * (3.0 - 2.0 * s), 0.16);
        float asp = uRes.x / uRes.y;
        float v = length((uv - 0.5) * vec2(asp, 1.0));
        s *= mix(1.0, smoothstep(1.2, 0.3, v), 0.5);
        s += (hash(uv * uRes + fract(uTime * 7.1) * 173.0) - 0.5) * 0.028;
        gl_FragColor = vec4(s, 1.0);
      }
    `,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return { scene, camera, uniforms, material, geo };
}
