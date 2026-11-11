// Timeline of "The Volcano That Invented the Bicycle": shots timed to the voice words (~/shorts/tambora/voice/words.json),
// story physics none (this film has no falling bridge — it has a rising one), and the camera grammar measured in the
// reference study: continuous slow push-ins; symmetric ease-in-out glides ~20-40 f; peak ~15 px/f at 720p; big reframes
// are cuts; impacts land on the word with 7-frame kicks. No hand-held float.
// 30 fps, 2224 frames (74.1 s). Voice ends at 73.62 s.
export const FPS = 30;
export const TOTAL = 2224;
export const D0 = 0; // ground level (world is built on y = 0)
export type V3 = [number, number, number];
export type Light = "day" | "golden" | "ash";

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- shots ----------------
// crowd field: which cast stage() block runs during the shot (or "none"). towns = extras cheer/halt too.
export type Crowd = "flee" | "market" | "marketBare" | "hearth" | "bench" | "stable" | "workshop" | "hero" | "stride" | "ride" |
  "gate" | "crash" | "halt" | "penny" | "fixie" | "lane" | "horse" | "stroll" | "flyby" | "road" | "none";
export type ShotDef = { id: number; a: number; b: number; light: Light; crowd: Crowd; sun?: boolean };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 166, light: "golden", crowd: "none", sun: true },        // the hook: Tambora before the end of the world
  { id: 2, a: 166, b: 315, light: "golden", crowd: "none", sun: false },     // looking straight up the column
  { id: 3, a: 315, b: 462, light: "ash", crowd: "flee", sun: true },         // the longest shadow on Earth
  { id: 4, a: 462, b: 530, light: "ash", crowd: "none" },                    // 1816: snowed in June (village wide)
  { id: 5, a: 530, b: 558, light: "ash", crowd: "stroll", sun: false }, // a June umbrella walk-by
  { id: 6, a: 558, b: 616, light: "ash", crowd: "none", sun: true },         // the wheat gives up, the plume watches
  { id: 7, a: 616, b: 678, light: "ash", crowd: "hearth" },                  // eighteen hundred and froze to death
  { id: 8, a: 678, b: 731, light: "ash", crowd: "market" },                  // oats, eight times
  { id: 9, a: 731, b: 883, light: "golden", crowd: "none", sun: false },     // Villa Diodati, rained in
  { id: 10, a: 883, b: 976, light: "day", crowd: "bench" },                  // Baden, a forester and a baron
  { id: 11, a: 976, b: 1053, light: "day", crowd: "stable" },                // the oats were gone
  { id: 12, a: 1053, b: 1143, light: "day", crowd: "workshop" },             // two wheels, a beam, a saddle
  { id: 13, a: 1143, b: 1164, light: "day", crowd: "hero" },                 // No pedals.
  { id: 14, a: 1164, b: 1192, light: "day", crowd: "hero" },                 // The Laufmaschine.
  { id: 15, a: 1192, b: 1236, light: "day", crowd: "stride" },               // you push off the ground with your feet
  { id: 16, a: 1236, b: 1426, light: "golden", crowd: "ride", sun: true },   // 12 June 1817, Mannheim -> Schwetzingen
  { id: 17, a: 1426, b: 1465, light: "golden", crowd: "gate", sun: true },   // Luckily, it worked.
  { id: 18, a: 1465, b: 1515, light: "golden", crowd: "crash", sun: true },  // Unluckily, the riders didn't.
  { id: 19, a: 1515, b: 1563, light: "ash", crowd: "halt" },                 // Mannheim banned them from the pavements
  { id: 20, a: 1563, b: 1584, light: "ash", crowd: "halt" },                 // Milan
  { id: 21, a: 1584, b: 1605, light: "day", crowd: "halt" },                 // London
  { id: 22, a: 1605, b: 1627, light: "golden", crowd: "halt", sun: true },   // New York
  { id: 23, a: 1627, b: 1707, light: "golden", crowd: "none", sun: true },   // a chimney that burps a parasol
  { id: 24, a: 1707, b: 1764, light: "ash", crowd: "none", sun: true },      // Dim the sun — the wheat gives up
  { id: 25, a: 1764, b: 1790, light: "ash", crowd: "marketBare" }, // the oats give up
  { id: 26, a: 1790, b: 1845, light: "day", crowd: "horse", sun: true },     // the horse gives up — the road is yours
  { id: 27, a: 1845, b: 1903, light: "day", crowd: "penny" },                // pedals came in the eighteen sixties
  { id: 28, a: 1903, b: 1930, light: "day", crowd: "fixie" },                // then chains, then gears
  { id: 29, a: 1930, b: 2023, light: "day", crowd: "lane" },                 // the most-ridden vehicle on Earth
  { id: 30, a: 2023, b: 2088, light: "golden", crowd: "flyby", sun: true }, // someone flies past
  { id: 31, a: 2088, b: 2115, light: "golden", crowd: "none", sun: true },   // that's Mount Tambora's fault
  { id: 32, a: 2115, b: 2142, light: "ash", crowd: "none" },                 // One eruption.
  { id: 33, a: 2142, b: 2172, light: "ash", crowd: "none" },                 // One lost summer.
  { id: 34, a: 2172, b: TOTAL, light: "golden", crowd: "road", sun: true }, // One man, no horse.
];
/** crossfades (frames) at place/time changes; the eruption covers the cuts elsewhere */
export const XFADE: Record<number, number> = { 4: 10, 10: 10 };
/** full-frame flashes (Tambora overlay): the 1815 eruption, the last lightning beat */
export const FLASHES: { f: number; a: number; warm?: boolean }[] = [
  { f: 147, a: 0.42, warm: true }, { f: 148, a: 0.3, warm: true }, { f: 149, a: 0.18, warm: true },
  { f: 2133, a: 0.5 }, { f: 2134, a: 0.3 }, { f: 2135, a: 0.14 },
];

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
/** layers to draw at frame f: base shot, plus the next shot fading in during a crossfade */
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
// Grammar (motion.md): every move is a symmetric smootherstep glide of 18-40 f (peak speed = 1.875 x distance / dur, so
// dur >= 0.075 x the move in 720p px keeps the peak near the reference 14-25 px/f); a reframe bigger than about half a
// frame width or 40 % zoom is a hard cut on its key frame. Glides are centred on the old key frame (the whoosh in the
// sound mix peaks there), so a glide key starts dur/2 earlier. Holds push in (dolly toward the look point or a fov zoom
// near walls/towers): 0.15-0.35 %/f, ~0.6 %/f for ~35 f on the punch words. Rolls of 4-8 deg over >= 18 f on emphasis
// beats; held tilt <= 0.07 rad. Impacts: 7-frame kicks that flip sign every frame (~3 px at 720p per unit).
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
/** reference camera ease: symmetric smootherstep (attack = release, ~10 f each on a 23 f move) */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (with 8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
/** dolly push: camera slides toward the look point by factor k */
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
/** zoom push (camera stays put): tan(fov/2) shrinks by k */
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });

// world anchor points (world.ts builds against the same numbers)
export const CRATER: V3 = [0, 96, 140];           // Tambora crater rim, centre
export const CONE: V3 = [0, 0, 140];              // volcano axis at ground level
export const VILLA: V3 = [0, 6.5, 52];            // Villa Diodati, first-floor centre (candle floor)
export const ROAD_Z: V3 = [0, 0, 0];              // the Mannheim road runs along z through origin
export const CASTLE: V3 = [58, 14, 95];           // Burg Katz-ish silhouette across the Rhine
export const MANNHEIM: V3 = [0, 0, -235];         // rooftops behind the ride's start

/** the rider's world position during the Mannheim->Schwetzingen shot (cast.ts and the cameras read it) */
export const rideZ = (t: number) => -25 + (t - 41.19) * 9.3;

// ---- framings (f -> camera) ----
// S1 hook: wide 3/4 from the plain, Tambora against the low sun; the push never stops
const S1 = (f: number) => dolly([-36, 10.5, -70], [0, 58, 140], pushK(f, 0, 0.0026, 0.0016, 60), { fov: 46 });
// S2 straight up the column: the sky eats it
const S2a = (f: number) => zoom([-6, 2.5, 40], [0, 118, 142], 52, pushK(f, 166, 0.0016), { });
const S2b = (f: number) => zoom([-6, 2.5, 40], [0, 165, 142], 52, pushK(f, 250, 0.0016), { roll: 0.02 });
// S3 devastation aerial: the apron, the tiny village, the red disc
const S3 = (f: number) => dolly([82, 46, -14], [-8, 6, 118], pushK(f, 315, 0.0022), { fov: 44, roll: -0.02 });
// S4 snow in June, village wide
const S4 = (f: number) => dolly([0.4, 2.7, -17], [-1.2, 2.0, 8], pushK(f, 462, 0.0024), { fov: 45 });
// S5 closer: an umbrella goes by under ash-grey June
const S5 = (f: number) => dolly([3.3, 1.7, -8.6], [-1.4, 1.35, 4.2], pushK(f, 530, 0.0022), { fov: 40, roll: 0.02 });
// S6 low in the failed field; the plume owns the horizon
const S6 = (f: number) => dolly([2.1, 1.2, -11], [-4, 7, 150], pushK(f, 558, 0.0018), { fov: 46 });
// S7 the hearth corner: froze to death, but at least the soup is warm
const S7 = (f: number) => dolly([2.7, 1.6, -4.4], [-0.5, 0.95, 1.0], pushK(f, 616, 0.002, 0.005, 40), { fov: 42, roll: -0.02 });
// S8 oat stall: the price of breathing just went up eight times
const S8 = (f: number) => dolly([2.5, 1.8, -5.4], [-0.4, 1.3, 3.5], pushK(f, 678, 0.002, 0.005, 38), { fov: 42 });
// S9 Villa Diodati across the lake, rain, one candle
const S9 = (f: number) => dolly([0.5, 1.7, -7], [0, 5.8, 55], pushK(f, 731, 0.0019), { fov: 41 });
// S10 Baden: a forester and a baron on a bench, the sack at his feet
const S10a = (f: number) => dolly([6.8, 2.8, -3.5], [0.9, 1.5, 21], pushK(f, 883, 0.0022));
const S10b = (f: number) => dolly([4.4, 2.1, 3.2], [1.4, 1.25, 18], pushK(f, 940, 0.0022), { fov: 41 });
// S11 the stable that used to have a horse in it
const S11 = (f: number) => dolly([1.6, 1.55, -1.8], [-4.6, 1.35, 24.2], pushK(f, 976, 0.0022, 0.0045, 34), { fov: 42 });
// S12 the workshop: two wheels, a beam, a saddle
const S12 = (f: number) => dolly([2.9, 1.95, 6.1], [0.55, 1.1, 13.6], pushK(f, 1053, 0.0024, 0.004, 36), { fov: 40 });
// S13 No pedals. (punch on the word)
const S13 = (f: number) => dolly([1.15, 1.32, 10.7], [0.42, 1.02, 13.35], pushK(f, 1143, 0.002, 0.005, 20), { fov: 33 });
// S14 the hero shot: the Laufmaschine, low and proud
const S14 = (f: number) => dolly([1.85, 0.8, 9.0], [0.5, 1.0, 13.5], pushK(f, 1164, 0.0028, 0.004, 28), { fov: 37, roll: 0.02 });
// S15 walking it out of the shed: first push-offs
const S15 = (f: number) => dolly([0.2, 1.5, 9.3], [0.3, 0.95, 13.3], pushK(f, 1192, 0.002), { fov: 40 });
// S16a the start: he rides away from Mannheim, rooftops hazy behind (rear 3/4)
const S16a = (f: number) => { const D = rideZ(T(f)); return { pos: [2.7, 2.35, D - 7.4] as V3, look: [-0.5, 1.0, D - 0.5] as V3, fov: 43, roll: 0.02 }; };
// S16b the Rhine alongside: side tracking, castle gliding by
// S16b low chase behind-left inside the lane corridor (clear of the workshop west gable and the gate pavilions), riding into the sun
const S16b = (f: number) => { const D = rideZ(T(f)); return { pos: [-0.45, 1.1, D - 3.1] as V3, look: [-0.45, 1.4, D + 6.8] as V3, fov: 46 }; };
// S17 Schwetzingen: the dome gate; Luckily, it worked
const S17 = (f: number) => dolly([3.9, 2.0, -10.5], [0, 2.5, 15], pushK(f, 1426, 0.0016, 0.005, 36), { fov: 41 });
// S18 and unluckily: the dandy, the bonnet, the stars
const S18 = (f: number) => dolly([2.4, 1.7, -6.8], [0, 1.25, 2.8], pushK(f, 1465, 0.0022, 0.0055, 30), { fov: 40, roll: 0.025 });
// S19 Mannheim, the first ban, one palm held up
const S19 = (f: number) => dolly([2.7, 1.8, -3.9], [-0.5, 1.3, 3.7], pushK(f, 1515, 0.0018), { fov: 42 });
// S20 Milan: the arcade says no
const S20 = (f: number) => dolly([2.3, 1.75, -3.6], [-0.2, 1.3, 8.5], pushK(f, 1563, 0.0015), { fov: 41 });
// S21 London: the terrace says no
const S21 = (f: number) => dolly([2.5, 1.75, -3.7], [-0.2, 1.35, 9.5], pushK(f, 1584, 0.0015), { fov: 41 });
// S22 New York: the water tower says no
const S22 = (f: number) => dolly([2.7, 1.85, -4.3], [0.6, 1.35, 10.5], pushK(f, 1605, 0.0015), { fov: 41, roll: -0.02 });
// S23 the chimney burps a parasol into space
const S23 = (f: number) => dolly([64, 33, -78], [0, 108, 140], pushK(f, 1627, 0.0017), { fov: 42 });
// S24 low in the wheat; the plume owns the sky
const S24 = (f: number) => dolly([1.7, 0.95, -8.5], [-4.5, 6.5, 150], pushK(f, 1707, 0.0018), { fov: 47 });
// S25 the bare stall; the vendor has given up too
const S25 = (f: number) => dolly([2.4, 1.65, -4.7], [-0.3, 1.1, 3.3], pushK(f, 1764, 0.002), { fov: 41 });
// S26 the last horse walks off; the road ahead is suddenly free
const S26 = (f: number) => dolly([2.1, 1.4, -2.2], [0.1, 1.15, 26], pushK(f, 1790, 0.0019), { fov: 44 });
// S27 the penny-farthing (1860s): whip pan with the wheel
const S27 = (f: number) => { const u = glide((f - 1845) / 14); return { pos: [0.4, 1.6, -6.2] as V3, look: [-9 + 18 * u, 1.5, 8] as V3, fov: 41 }; };
// S28 the safety bicycle: chains, then gears
const S28 = (f: number) => dolly([1.2, 1.5, -5.6], [-0.6, 1.1, 7], pushK(f, 1903, 0.0022), { fov: 41 });
// S29 high over the packed lane: the most-ridden machine on Earth
const S29 = (f: number) => dolly([0.4, 8.2, -7.5], [0.2, 0, 15], pushK(f, 1930, 0.0022), { fov: 47 });
// S30 the flyby: someone rockets past at sunrise
const S30 = (f: number) => dolly([1.1, 0.55, -2.4], [0, 0.95, 7], pushK(f, 2023, 0.0016), { fov: 40 });
// S31 cut to the far volcano: that's Mount Tambora's fault
const S31 = (f: number) => zoom([0, 2.1, -35], [0, 42, 290], 30, pushK(f, 2088, 0.003));
// S32 One eruption. Crater MCU, lightning in the column
const S32 = (f: number) => dolly([-10.5, 99.5, 116], [0, 101.5, 140], pushK(f, 2115, 0.003, 0.005, 22), { fov: 36 });
// S33 One lost summer. A rose, snowing June
const S33 = (f: number) => dolly([1.45, 1.0, -1.35], [0, 0.42, 0.18], pushK(f, 2142, 0.0022, 0.004, 16), { fov: 34 });
// S34 One man, no horse. The road to the sun; crane up and away
const S34 = (f: number) => { const u = glide((f - 2172) / 52); return { pos: [0, 2.6 + 8.5 * u, -15 - 3 * u] as V3, look: [0, 3 + 26 * u, 120] as V3, fov: 44 }; };

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1 }],
  2: [{ f: 166, s: S2a }, { f: 250, dur: 42, s: S2b }],
  3: [{ f: 315, s: S3 }],
  4: [{ f: 462, s: S4 }],
  5: [{ f: 530, s: S5 }],
  6: [{ f: 558, s: S6 }],
  7: [{ f: 616, s: S7 }],
  8: [{ f: 678, s: S8 }],
  9: [{ f: 731, s: S9 }],
  10: [{ f: 883, s: S10a }, { f: 940, dur: 34, s: S10b }],
  11: [{ f: 976, s: S11 }],
  12: [{ f: 1053, s: S12 }],
  13: [{ f: 1143, s: S13 }],
  14: [{ f: 1164, s: S14 }],
  15: [{ f: 1192, s: S15 }],
  16: [{ f: 1236, s: S16a }, { f: 1317, cut: true, s: S16b }],
  17: [{ f: 1426, s: S17 }],
  18: [{ f: 1465, s: S18 }],
  19: [{ f: 1515, s: S19 }],
  20: [{ f: 1563, s: S20 }],
  21: [{ f: 1584, s: S21 }],
  22: [{ f: 1605, s: S22 }],
  23: [{ f: 1627, s: S23 }],
  24: [{ f: 1707, s: S24 }],
  25: [{ f: 1764, s: S25 }],
  26: [{ f: 1790, s: S26 }],
  27: [{ f: 1845, s: S27 }],
  28: [{ f: 1903, s: S28 }],
  29: [{ f: 1930, s: S29 }],
  30: [{ f: 2023, s: S30 }],
  31: [{ f: 2088, s: S31 }],
  32: [{ f: 2115, s: S32 }],
  33: [{ f: 2142, s: S33 }],
  34: [{ f: 2172, s: S34 }],
};

// impact kicks: eruption, workshop hammer hits, the bonnet bump, the flyby, the lightning
const KICKS: [number, number][] = [[4.9, 1.3], [36.69, 0.5], [37.19, 0.5], [37.58, 0.5], [49.35, 0.8], [68.3, 0.7], [71.1, 0.9]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a; // metres at the look distance for 3 px x a
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
/** frame at which the current key's move has finished (for picking billboard views per key, not per frame) */
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens: depth of field + foreground framing ----------------
/** Lens blur per shot (thin lens). cInf = blur-disc radius in px at 1080x1920 for things at infinity; 0 = all sharp. */
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 15 },               // hook: volcano ramp sharp, plain soft
  { f: 166, cInf: 0 },              // column look-up (all sharp)
  { f: 315, cInf: 0 },              // devastation aerial
  { f: 462, cInf: 12, focus: () => [0, 2, 6] },   // snow village: near house
  { f: 530, cInf: 12, focus: () => [-1.4, 1.4, 4] }, // umbrella walker
  { f: 558, cInf: 8 },              // wheat field, plume soft
  { f: 616, cInf: 12, focus: () => [-0.3, 1.0, 1.2] }, // the faces by the fire
  { f: 678, cInf: 12, focus: () => [-0.3, 1.3, 3.6] }, // the oat stall
  { f: 731, cInf: 6 },              // Villa Diodati across the water
  { f: 883, cInf: 10, focus: () => [2.2, 1.2, 14.5] }, // bench
  { f: 976, cInf: 12, focus: () => [-4.6, 1.4, 24.2] }, // the empty stable
  { f: 1053, cInf: 14, focus: () => [0.55, 1.15, 13.6] }, // the machine on the trestles
  { f: 1143, cInf: 16, focus: () => [0.42, 1.1, 13.35] }, // No pedals. (his eyes)
  { f: 1164, cInf: 15, focus: () => [0.5, 1.0, 13.5] },  // the hero shot
  { f: 1192, cInf: 10 },            // push-offs
  { f: 1236, cInf: 0 },             // the ride: all sharp
  { f: 1426, cInf: 12, focus: () => [0, 1.6, 4] }, // Schwetzingen gate
  { f: 1465, cInf: 12, focus: () => [0, 1.3, 2.6] }, // the bonnet bump
  { f: 1515, cInf: 0 },             // the three bans (kept sharp)
  { f: 1627, cInf: 0 },             // parasol volcano
  { f: 1707, cInf: 10 },            // wheat, foreground soft
  { f: 1764, cInf: 12, focus: () => [-0.3, 1.2, 3.3] }, // the bare stall
  { f: 1790, cInf: 12, focus: () => [0, 1.1, 8] },      // the last horse
  { f: 1845, cInf: 10 },            // penny-farthing
  { f: 1903, cInf: 10 },            // the safety bicycle
  { f: 1930, cInf: 0 },             // the packed lane
  { f: 2023, cInf: 6 },             // the flyby
  { f: 2088, cInf: 0 },             // the far volcano
  { f: 2115, cInf: 14 },            // crater MCU
  { f: 2142, cInf: 16, focus: () => [0, 0.45, 0.2] },   // the rose
  { f: 2172, cInf: 0 },             // the long road out
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
/** what the lens focuses on (DOF): the DOF table's focus point, else the camera look point */
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects: visible while a <= f < b; kit = a GLB name accepted by build.ts prop() */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  { a: 530, b: 558, kit: "plant_bushDetailed", pos: [2.75, 0, -6.6], s: 0.7, yaw: 0.5 },   // snowy shrub, bottom-right (June street)
  { a: 1192, b: 1236, kit: "plant_bush", pos: [2.5, 0, 10.4], s: 0.85, yaw: 0.2 },          // lodge-side shrub, bottom-right
  { a: 1236, b: 1317, kit: "grass_large", pos: [-3.6, 0, -13.5], s: 1.0, yaw: 0.1 },        // near-lens grass blades, S16a
  { a: 1790, b: 1845, kit: "plant_bushDetailed", pos: [1.9, 0, 3.4], s: 0.8, yaw: 2.2 },    // roadside shrub, bottom-right
  { a: 2172, b: TOTAL, kit: "plant_bushLarge", pos: [2.6, 0, -8.5], s: 1.1, yaw: 3.6 },     // the long road, bottom-right
];
