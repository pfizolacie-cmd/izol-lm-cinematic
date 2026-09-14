# IZOL L&M — Technical plan (Phase 1)

## Decision: projected 2.5D plates + targeted true 3D

A fully modelled 3D factory would take weeks and would still look like a game next to the
reference photography. The references already contain the lighting, materials and
composition we want. The efficient route is a **"tour into the picture"**:

* each reference becomes a **camera plate**: the image is projected from its own
  estimated camera onto simple proxy geometry (floor, walls, ceiling, back wall,
  a few boxes and cylinders), giving correct perspective and parallax for a moving camera;
* **true 3D is used only where the camera gets closer than a photo can hold or where
  surfaces must transform**: the sheet that bends into pipe cladding, the pipe rail
  itself, and the tank we pass beside;
* **shaders** handle the plate handoffs (feathered, depth-gated insets), the metal
  surface, the grade, glow, grain and the handoff motion blur.

| Portion | Technique | Why |
|---|---|---|
| ULTRA-CUT wide + approach | 2.5D plate (`entry`): sheet plane, front panel with opening, head box, gantry beam, back wall | Dolly along the optical axis, so parallax is small and the proxy is sufficient |
| Laser detail | 2.5D plate (`laser`) + additive glow + ~30 spark particles | Reference quality; the warm light stays restrained |
| Dive + metal + bend | **True 3D**: procedural brushed stainless sheet → cladding cylinder (vertex-shader bend) | Camera is at 4 cm, where no photo resolves; the surface must physically transform |
| Pull-away + pipe rail | **True 3D** pipe (same material) with elbow, clamp bands, supports | Continuity object across two plates |
| Mechanical room | 2.5D plates (`threshold`, `corridor`) | Straight-ahead travel, proxy boxes |
| Tank + pass-beside | 2.5D plate (`tank`, with the tank inpainted out) + **true 3D tank** (lathe) that carries the photo by projective texturing and blends to procedural cladding at grazing angles and close range | Lateral motion around a round object is where flat projection breaks |
| Handoffs | Shader: inset feather × depth gate × presence, plus radial handoff blur | Continuous space without a crossfade |
| Brand on machine | HTML/CSS projected with a per-frame homography (`matrix3d`) | "All typography HTML/CSS", and the brand stays locked to the surface |

## Architecture

```
index.html
src/main.jsx            mode detection (webgl | fallback | reduced), mounts App
src/App.jsx             HTML shell: brand, menu, labels, loader, scroll track
src/scroll.js           master progress: target from scrollY, critically damped value
src/journey.js          THE timeline: camera keyframes, plate placements, windows, labels
src/engine/Stage.jsx    R3F <Canvas>; owns the frame loop (useFrame priority 1)
src/engine/camera.js    keyframe spline sampling + off-axis (lens-shift) projection
src/engine/plates.js    proxy depth (ray vs primitives) → displaced mesh + plate shader
src/engine/metal.js     shared cladding/sheet GLSL, bending strip, pipe, tank
src/engine/post.js      composite: grade, glow, handoff blur, vignette, grain → sRGB
src/engine/Tracked.js   HTML-on-surface homography
src/Fallback.jsx        mobile / reduced-motion experience (CSS only)
scripts/build-plates.mjs  reference → web plates (text removal, clean tank plate, WebP)
```

### One master progress
`scroll.js` maps `scrollY / (scrollHeight − innerHeight)` to `target`, and each frame
`p += (target − p)·(1 − e^(−4.2·dt))`. Everything reads `p`, so forward and backward are
symmetric, and speed only changes how quickly `p` arrives, never where it goes. No GSAP:
ScrollTrigger would add a second source of truth for a single number.

### Camera
Keyframes carry position, yaw, pitch and the plate principal point `(cx, cy)`.
Positions use centripetal Catmull-Rom, and the remaining channels use Catmull-Rom on
scalars. The projection is built by hand: vertical FOV 42° (matched to all plates,
f = 1225.7 px at 941 px) with **lens shift**, so each plate's off-centre vanishing point is
reproduced while verticals stay vertical. The frame covers the viewport: for aspect >
16:9 the vertical FOV narrows, for < 16:9 the sides crop.

### Plates
For each plate, a (161×91) grid spanning uv −0.18…1.18 is displaced to the proxy depth
(ray from the plate's native camera, nearest hit among planes, boxes and vertical
cylinders). The fragment shader:
* samples the plate (sRGB → linear), clamps outside 0…1, and blurs and darkens the
  overscan so lateral moves never show a hard edge;
* `alpha = presence × insetFeather(uv) × depthGate(localDepth)`, where
  `depthGate` hides geometry nearer than `k·behind`, and `behind` is how far the camera
  still is from the plate's native pose. From behind, a plate's near floor would collapse
  toward the centre; the gate removes it, and it returns as the camera arrives.

Plates are drawn in journey order (later over earlier), with depth cleared between them;
3D objects are drawn last.

### Metal
A single GLSL material serves both the flat sheet and the cladding. It includes panel
lattice seams with overlap shading, screw heads, fine brushing, scratches, oil-canning
(low-frequency normal waviness, which gives cladding its characteristic warped
reflections), smudges, Fresnel, reflections from the current plate used as a light probe,
and overhead strip highlights. The sheet adds laser-cut part contours and the kerf,
which glows near the nozzle. The bend is done in the vertex shader:
`θ = s·k, x = sin θ / k, y = y₀ − (1 − cos θ)/k`, where `k = bend / R`. The top line stays
fixed, so the camera never leaves the surface while it bends.

### Loading and performance
* three.js and R3F are code-split: the fallback never downloads them.
* Plates are WebP, 120–240 KB at desktop size and 45–90 KB for mobile. The loader
  waits only for `entry` + `laser`; the rest stream in afterwards.
* Plates outside their window are not rendered: at most 2 plates plus the objects per
  frame. DPR is capped at 1.5, and the post pass uses 1 RT.

### Fallbacks
* **Mobile** (< 820 px wide, or a coarse pointer under 1100 px) and **no WebGL2**: a
  CSS experience with the same plates, the same `p` and chapters. It uses a gentle zoom
  toward each plate's vanishing point, a brushed-metal CSS layer as the production →
  installation bridge, and the same labels.
* **prefers-reduced-motion**: the same CSS stage with no zoom, no smoothing and no blur.
  Each chapter is a still, cross-dissolved over 500 ms when the chapter changes.

## What changed once it was running
* **Entry floor:** the entry plate's camera sits 6 cm above the sheet, so any forward move
  stretches the far, compressed floor rows into an orange smear. The procedural sheet now
  carries the first ~2 m in front of the camera from the first scroll onward
  (distance-faded), and the photo only carries the distance.
* **Env lookups** fade to a blurred ceiling before clamping; clamping first smeared the
  photo's top row into vertical "curtains". Room light-strip reflections appear only once
  the sheet has become cladding.
* **Tank:** photo vs. procedural is decided by how closely the current view direction
  agrees with the native camera's, not by facing angle alone. Facing alone produced a glassy
  halo at the native pose. The plate behind the tank is filled by mirroring the room from
  both sides (not a Coons patch) and is softened.
* **Backdrop:** a heavily blurred room plate sits behind everything while the camera is on
  the metal, so the pull-away never exposes black.
* **Performance:** MSAA 2× on the HDR target, plus an adaptive render scale
  (1.0 → 0.6, hysteresis) when frames exceed ~22 ms. `?q` locks full quality.
* **Resize** preserves journey progress (the track is in vh).

## Test results (Chrome 1920×1080 · 1440×900 · 390×844, AMD Radeon 820M iGPU)
`scripts/shoot.mjs` drives real Chrome through real scrolling and captures screenshots,
frame timing and console output.
* WebGL, 1920×1080, 12 s forward + 12 s backward sweep: avg 20.5 ms, median 16.7 ms,
  p95 33.6 ms, 112 of 1321 frames > 33 ms, worst 159 ms. Reaches p = 1 and returns to
  p = 0. At 1440×900: avg 18.3 ms, p95 25 ms.
* No console errors or warnings in the webgl, fallback or reduced modes.
* Resize 1920→1440→1280 keeps p; the canvas and render target follow.
* 390×844: CSS fallback, 50 KB gz JS (three.js is never downloaded).
* prefers-reduced-motion: stills with 500 ms dissolves, full-res plates on desktop.

## Run / test
```
npm install
npm run plates     # rebuild /public/plates from /references
npm run dev        # http://localhost:5173  (?debug  readout, ?p=0.45 jump, ?mode=fallback|reduced, ?q full quality)
node scripts/shoot.mjs '{"shots":[0,0.5,1],"sweep":true,"out":"shots"}'
```

## Known limits of this prototype
* The plates are 1672 px AI images. A ~2× push is the practical ceiling, and the handoffs
  are timed so that no plate is pushed further. Production needs 4–6K plates (renders or
  photography) of the same shots.
* The rooms in the references don't share one geometry (the corridor tank is elevated;
  the hero tank stands on the floor). Handoffs align floor and axis, and the difference is
  absorbed inside the inset feather.
