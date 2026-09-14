# IZOL L&M — Storyboard (Phase 1)

One camera. One direction (world −Z). One master value `p ∈ [0, 1]` driven by scroll.
Nothing autoplays; every pixel on screen is a pure function of `p` (plus a sub‑second
flicker on the laser glow and film grain).

## 1. What the references are

Six 1672×941 frames in `/references`. File names are generation timestamps. The
timestamp order does **not** match the story order: the close-up (19:47:50) was made
before the wide shot (19:48:05). In story order they are:

| # | File (timestamp) | Plate id | Camera | Vanishing point / horizon (px) | What it establishes |
|---|---|---|---|---|---|
| 01 | `19_48_05` | `entry` | ~6 cm above the sheet, head ~4 m away, dead centre | VP (836, 537) | ULTRA-CUT gantry, sheet as a rail toward the head |
| 03 | `19_47_50` | `laser` | ~18 cm above the sheet, ~2.1 m from the head | VP (830, 455) | Cutting zone, kerf line running to camera |
| — | `19_52_13` | *(art direction only)* | Downstream of the machine, **facing back toward the laser**, turned right toward a doorway | — | Shows that production and the mechanical room are adjacent and the cut part travels on rollers toward the door. Not rendered: using it would turn the camera around, and the brief forbids that. |
| 05/06 | `19_52_49` | `threshold` | ~30 cm above the floor, in the doorway, cut part in the lower-left foreground | VP (830, 480) | The ambiguous frame: a production part still in view, installation ahead |
| 06/07 | `19_53_41` | `corridor` | ~44 cm above the floor, inside the room, drain grating on the axis | VP (908, 560) | Insulated pipework, pumps, valves, cable trays, small tank far away |
| 08 | `19_55_58` | `tank` | ~1.3 m (plate scale), tank ~5.7 m ahead | VP (820, 480) | Monumental clad tank: panel seams, rivets, manway |

Baked-in lettering is removed from `entry` and `laser` at build time
(`scripts/build-plates.mjs`). The `entry` panel even says **"IZOLL&M"**, which is
misspelled. The brand is set again in HTML/CSS and projected onto the machine panel
and the head plate, so it moves with the camera.

## 2. Beat sheet → progress

Every range is master progress `p`. The camera keyframes (world metres) are listed in
`src/journey.js`, which is the single source of truth. This table describes intent.

| p | Beat | Plate(s) on screen | Camera | Label (HTML) |
|---|---|---|---|---|
| 0.00 | **01 ULTRA-CUT ENTRY.** Exact reference framing. The sheet runs from the lower frame edge to the nozzle, and the reflected laser line is the rail. | `entry` | native pose of `entry` | VLASTNÁ VÝROBA |
| 0.00–0.19 | **02 APPROACH.** Heavy dolly a few cm over the sheet, rising 12 cm. Lens shift keeps the head on the axis while it grows ~2×. | `entry` → `laser` fades in inside it from 0.13 | (0,0,0) → (0,.12,−1.9) | VLASTNÁ VÝROBA |
| 0.19 | Camera arrives exactly at `laser`'s native pose, so the reference frame is reproduced. | `laser` | native | PRESNOSŤ |
| 0.19–0.34 | **03 LASER DETAIL.** Push to ~1 m from the nozzle. Restrained warm glow and a few sparks against the cold metal. | `laser` | → (0,.035,−3.05) | PRESNOSŤ |
| 0.34–0.40 | **04 DIVE.** Camera pitches down −38° and drops to 4 cm. The photographic sheet is replaced by the procedural sheet on the same plane, so reflective metal fills the viewport. | `laser` → procedural sheet | → (0,−.015,−3.35) | — |
| 0.40–0.53 | **04/05 THE METAL.** Skim forward along the glowing kerf. Part contours fade, and the sheet **bends around the travel axis** into a Ø600 mm cladding shell. The kerf becomes the lap seam, and band joints and screws appear. There is never a black frame or cut. | procedural sheet → pipe | → (0,−.02,−6.2) | OPLECHOVANIE |
| 0.50–0.63 | **05 PULL AWAY.** Camera slides down-left off the pipe and levels out. The mechanical room assembles around the pipe, which now runs forward along the upper right. | pipe + `threshold` | → (−1.4,−.96,−8.5) = `threshold` native | — |
| 0.63–0.745 | **06 ENTER MACHINE ROOM.** Same direction, same pace. The 3D pipe is the rail on the right. | `threshold` → `corridor` fades in from 0.67 | → `corridor` native | PRIEMYSELNÉ IZOLÁCIE |
| 0.745–0.885 | **07 PIPE JOURNEY.** Travel under the pipe. At its elbow the camera tilts up slightly with the bend, then settles. | `corridor` → `tank` fades in inside it from 0.80 | → `tank` native | PRIEMYSELNÉ IZOLÁCIE |
| 0.885–0.93 | **08 TANK.** Tank centred, and grows until it dominates the frame. | `tank` + 3D tank | push | TEPELNÉ · CHLADOVÉ · PROTIPOŽIARNE |
| 0.93–1.00 | Camera **passes beside** the tank (tank on the right) and yaws with it. Close up, the photo projection hands over to procedural cladding. The journey ends in motion, not on a stop frame. | `tank` + 3D tank | → beside and past | — |

## 2b. Copy (from izollm.sk, 2026-09-13)

All on-screen text comes from izollm.sk. It lives in `src/journey.js` (`CHAPTERS`, `STATS`, `CONTACT`).

| p | Label | Sub |
|---|---|---|
| 0.00–0.18 | VLASTNÁ VÝROBA | Oplechovanie z vlastnej laserovej výroby |
| 0.20–0.35 | PRESNOSŤ | Laserové rezanie plechov |
| 0.45–0.56 | OPLECHOVANIE | Vzduchotechnika · tepelné a chladové potrubia · technológie |
| 0.64–0.745 | PRIEMYSELNÉ IZOLÁCIE | Tepelné · chladové · protipožiarne |
| 0.755–0.875 | CERTIFIKOVANÁ MONTÁŽ | K-FLEX · ISOVER |
| 0.89–0.94 | NÁDRŽE A ZARIADENIA | Potrubia, nádrže, kotly, klimatizačné jednotky |
| 0.94–1.00 | *closing frame* | 1000+ projektov · 10+ rokov · 200+ zákazníkov · 25+ členov firmy · IZOL L&M s.r.o., Okružná, 972 41 Koš · +421 949 373 175 · izollm@izollm.sk |

The machine carries no model name. "ULTRA-CUT" came from the AI reference, and izollm.sk only
says the laser technology is from Schwartmanns. The site gives the experience both as
"10+ rokov" and as "viac ako 9 rokov"; we use 10+.

## 3. Continuity rules

1. **No resets.** Every plate is placed in one world so that its native camera sits on
   the path at the moment it becomes dominant. The camera only moves forward.
2. **No fades to black and no crossfades between full frames.** A new plate appears as a
   feathered *inset* inside the previous one: it is geometrically aligned and seen from
   behind its native position, with its near geometry held back. It grows until it fills
   the frame exactly when the camera reaches its native pose.
3. **The sheet → the pipe.** The same surface bends: the kerf becomes the lap seam, and
   the sheet's plane is the laser plate's floor.
4. **The pipe → the rooms.** The pipe persists across `threshold` and `corridor`, then
   turns up at an elbow before the tank.
5. **Scale is invisible.** Plates are scaled so floor height and camera height match at
   each handoff (the tank plate is scaled 0.465).
