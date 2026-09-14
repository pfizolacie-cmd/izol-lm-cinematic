// THE timeline. Every animated value in the experience is a pure function of master progress p ∈ [0, 1].
// World units are metres; the camera always travels toward −Z.
// Each plate is a reference image projected from its own estimated camera ("native pose") onto proxy
// geometry. Plates are placed in the world so that their native pose lies on the camera path.
// See STORYBOARD.md for intent and TECHNICAL_PLAN.md for the method.

export const PLATE_W = 1672;
export const PLATE_H = 941;
export const FOV_V = 42; // vertical FOV shared by all plates
export const F_PX = PLATE_H / 2 / Math.tan(((FOV_V / 2) * Math.PI) / 180); // 1225.7 px

// Proxy primitives are in plate-local metres (native camera at origin, looking −Z).
//   { plane: 'x'|'y'|'z', at, x?, y?, z?: [min,max], holes?: [{x,y}] }
//   { box: [[minX,minY,minZ],[maxX,maxY,maxZ]] }
//   { vcyl: [x, z], r, y: [min,max] }   vertical cylinder
export const PLATES = [
  {
    id: 'entry', src: 'plates/entry.webp', cx: 836, cy: 537,
    pos: [0, 0, 0], scale: 1, fadeIn: null, window: [0, 0.2], exposure: 1,
    prims: [
      { plane: 'y', at: -0.06 }, // the sheet: first navigation rail
      { plane: 'z', at: -14 },
      { plane: 'x', at: -2.45 }, { plane: 'x', at: 2.45 }, { plane: 'y', at: 4 },
      // gantry front panel + blue columns, with the working opening cut out
      { plane: 'z', at: -3.6, x: [-2.34, 2.34], y: [-0.06, 1.4], holes: [{ x: [-1.69, 1.69], y: [-1, 0.784] }] },
      { plane: 'z', at: -5, x: [-1.7, 1.7], y: [0.5, 1.4] }, // machine interior above the beam
      { box: [[-1.6, 0.17, -4.4], [1.6, 0.53, -4.1]] }, // cross beam
      { box: [[-0.21, -0.03, -4.25], [0.21, 1.2, -3.85]] }, // cutting head
    ],
  },
  {
    id: 'laser', src: 'plates/laser.webp', cx: 830, cy: 455,
    pos: [0, 0.12, -1.9], scale: 1, fadeIn: [0.13, 0.185], window: [0.13, 0.41], exposure: 1,
    prims: [
      { plane: 'y', at: -0.18 },
      { plane: 'z', at: -12 },
      { plane: 'x', at: -3 }, { plane: 'x', at: 3 }, { plane: 'y', at: 3 },
      { plane: 'z', at: -2.4, y: [0.19, 5] }, // dark gantry behind the head
      { plane: 'z', at: -4.5, y: [-0.18, 0.19] }, // rollers / table end, out of focus
      { box: [[-0.22, 0.18, -2.5], [0.2, 1.5, -2.1]] }, // head plate
      { vcyl: [-0.005, -2.25], r: 0.15, y: [0, 0.19] }, // nozzle body
      { vcyl: [-0.005, -2.18], r: 0.085, y: [-0.15, 0] }, // nozzle tip
    ],
  },
  {
    id: 'threshold', src: 'plates/threshold.webp', cx: 830, cy: 480,
    pos: [-1.4, -0.96, -8.5], scale: 1, fadeIn: [0.44, 0.585], window: [0.44, 0.76], exposure: 1,
    prims: [
      { plane: 'y', at: -0.3 },
      { plane: 'y', at: 4.2 },
      { plane: 'x', at: -2.8 }, { plane: 'x', at: 2.6 },
      { plane: 'z', at: -26 },
      { plane: 'z', at: -1.9, x: [-10, -0.55] }, // shelves + door jamb on the production side
      { plane: 'y', at: -0.24, x: [-3, 0.15], z: [-1.8, -0.15] }, // the cut part lying in the doorway
    ],
  },
  {
    id: 'corridor', src: 'plates/corridor.webp', cx: 908, cy: 560,
    pos: [-1.4, -0.86, -15.5], scale: 0.91, fadeIn: [0.67, 0.735], window: [0.67, 0.895], exposure: 1,
    prims: [
      { plane: 'y', at: -0.44 },
      { plane: 'y', at: 4.0 },
      { plane: 'x', at: -2.6 }, { plane: 'x', at: 2.9 },
      { plane: 'z', at: -14 },
    ],
  },
  {
    // background with the tank removed; the tank itself is a 3D object (TANK) carrying the photo
    id: 'tank', src: 'plates/tank-bg.webp', photo: 'plates/tank.webp', cx: 820, cy: 480,
    pos: [-1.4, -0.66, -21.5], scale: 0.465, fadeIn: [0.815, 0.87], window: [0.815, 1.01], exposure: 1,
    prims: [
      { plane: 'y', at: -1.29 },
      { plane: 'y', at: 3.6 },
      { plane: 'x', at: -2.5 }, { plane: 'x', at: 2.3 },
      { plane: 'z', at: -11 },
    ],
  },
];

// Camera path (world). yaw: + = look right, pitch: + = look up (degrees).
// cx, cy: principal point in plate pixels (lens shift). Unset values carry over from the previous key.
export const KEYS = [
  { p: 0.0, pos: [0, 0, 0], cx: 836, cy: 537 }, // 01 entry = reference framing
  { p: 0.1, pos: [0, 0.05, -1.0], cx: 834, cy: 505 },
  { p: 0.19, pos: [0, 0.12, -1.9], cx: 830, cy: 455 }, // 03 laser = reference framing
  { p: 0.27, pos: [0, 0.075, -2.55], cy: 470 },
  { p: 0.335, pos: [0, 0.035, -3.02], pitch: -10, cx: 836, cy: 470 },
  { p: 0.395, pos: [0, -0.015, -3.36], pitch: -38 }, // 04 dive: metal fills the frame
  { p: 0.465, pos: [0, -0.02, -4.55], pitch: -30 },
  { p: 0.53, pos: [0, -0.01, -6.1], pitch: -20 }, // sheet is now cladding
  { p: 0.58, pos: [-0.55, -0.38, -7.35], pitch: -7, yaw: 6, cx: 832, cy: 478 }, // 05 pull away
  { p: 0.63, pos: [-1.4, -0.96, -8.5], pitch: 0, yaw: 0, cx: 830, cy: 480 }, // threshold = reference
  { p: 0.7, pos: [-1.4, -0.92, -12.6], cx: 850, cy: 500 },
  { p: 0.745, pos: [-1.4, -0.86, -15.5], cx: 908, cy: 560 }, // corridor = reference
  { p: 0.8, pos: [-1.38, -0.8, -18.0], pitch: 2, yaw: 1.5, cx: 880, cy: 540 },
  { p: 0.85, pos: [-1.4, -0.72, -20.1], pitch: 3.5, yaw: 2, cx: 850, cy: 510 }, // follow the elbow
  { p: 0.885, pos: [-1.4, -0.66, -21.5], pitch: 0, yaw: 0, cx: 820, cy: 480 }, // tank = reference
  { p: 0.93, local: [0, 0.15, -2.9], cy: 470 },
  { p: 0.97, local: [-1.65, 0.1, -4.9], yaw: 17 }, // pass beside
  { p: 1.0, local: [-1.9, 0.05, -6.2], yaw: 26 },
];

// the 3D pipe: the laser sheet's plane bends into this cylinder (top line fixed at y0).
// The strip starts under the entry camera: near the camera it carries the sheet the photo cannot.
export const PIPE = { r: 0.3, y0: -0.06, stripZ: [0.8, -12.0], elbowZ: -20.4, elbowR: 0.6, topY: 3.3, supports: [-9, -12, -15, -18] };
export const NOZZLE = [0, -0.035, -4.0];
// in `tank` plate-local metres
export const TANK = { x: -0.03, z: -6.8, r: 1.27, floor: -1.29 };

export const T = {
  sheetIn: [0.335, 0.375],
  bend: [0.43, 0.53],
  contoursOut: [0.42, 0.49],
  kerfGlowOut: [0.45, 0.51],
  seamsIn: [0.46, 0.53],
  nozzleGlowOut: [0.37, 0.43],
  laserDefocus: [0.34, 0.4],
  thresholdFocus: [0.5, 0.61], // rack focus from the metal to the room
  envMix: [0.47, 0.58],
  supportsIn: [0.5, 0.56],
  pipeOut: [0.94, 0.99],
};

// radial handoff blur: [centre, half-width, amount]
export const BLUR_BUMPS = [
  [0.16, 0.035, 0.03],
  [0.375, 0.035, 0.018],
  [0.56, 0.04, 0.012],
  [0.705, 0.035, 0.03],
  [0.842, 0.04, 0.034],
];

// Copy: izollm.sk (home, O spoločnosti, Služby, Klampiarske práce, Chladové / Tepelné izolácie, Kontakt), 2026-09-13.
export const CHAPTERS = [
  { n: '01', from: 0.0, to: 0.18, label: 'VLASTNÁ VÝROBA', sub: 'Oplechovanie z vlastnej laserovej výroby', jump: 0 },
  { n: '02', from: 0.2, to: 0.35, label: 'PRESNOSŤ', sub: 'Laserové rezanie plechov', jump: 0.19 },
  { n: '03', from: 0.45, to: 0.56, label: 'OPLECHOVANIE', sub: 'Vzduchotechnika · tepelné a chladové potrubia · technológie', jump: 0.45 },
  { n: '04', from: 0.64, to: 0.745, label: 'PRIEMYSELNÉ IZOLÁCIE', sub: 'Tepelné · chladové · protipožiarne', jump: 0.63 },
  { n: '05', from: 0.755, to: 0.875, label: 'CERTIFIKOVANÁ MONTÁŽ', sub: 'K-FLEX · ISOVER', jump: 0.76 },
  { n: '06', from: 0.89, to: 0.94, label: 'NÁDRŽE A ZARIADENIA', sub: 'Potrubia, nádrže, kotly, klimatizačné jednotky', jump: 0.885 },
];

// closing frame (scroll end), numbers as published on izollm.sk / O spoločnosti
export const FINALE_AT = 0.94;
export const STATS = [
  { v: '1000+', k: 'dokončených projektov' },
  { v: '10+', k: 'rokov skúseností' },
  { v: '200+', k: 'spokojných zákazníkov' },
  { v: '25+', k: 'členov firmy' },
];
export const CONTACT = {
  name: 'IZOL L&M s.r.o.',
  address: 'Okružná, 972 41 Koš',
  phone: '+421 949 373 175',
  email: 'izollm@izollm.sk',
};

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const range = (r, p) => smooth(r[0], r[1], p);
