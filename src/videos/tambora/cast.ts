// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, townsfolk, fxStars, fxCreak, fxShadow, fxContact, fxPuff,
  rideSide, modernRide, highWheeler, wearyHorse, fxUmbrella, fxStreak, fxSparkle, fxRain, fxBurst, KID,
  Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import { FPS, V3, rideZ, smooth, clamp01, SHOTS } from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing" | "ride" | "modern" | "farthing" | "horse"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const FOLK = [0, 1, 2, 3, 4, 5].map((v) => townsfolk(v));
const vOf = (i: number) => (i * 7 + (i >> 2)) % 4;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" | "ash" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
/** expression swap times per shot (lid covers the swap); only the crash beat swaps faces */
const SWAPS: Record<number, number[]> = { 18: [49.4] };
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden" | "ash", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], ash: [0.31, 0.31, 0.4] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};


// ---------------- the cast of this film ----------------
/** Karl Friedrich Christian Ludwig Freiherr Drais von Sauerbronn, baron and Forstmeister: dark green coat, buff breeches,
 *  beaver hat, a forester's moustache. Unimpressed by everything, including this story. */
export const DRAIS: Outfit = { jacket: "#20402f", pants: "#8f7f5a", boots: "#3a2a1c", hat: "tophat", buttons: "#d9b25f", moustache: "#33241a", skin: "#ecd0b6", build: "adult" };
/** a Mannheim city beadle: navy coat, no-nonsense. Palm first, questions never. */
export const CONSTABLE: Outfit = { jacket: "#2e3d5c", pants: "#23232b", boots: "#1f1a16", hat: "tophat", buttons: "#c9cdd4", skin: "#f5c9a0", build: "adult" };
/** an 1817 dandy, owner of the machine nobody can park */
export const DANDY: Outfit = { jacket: "#5a3b6e", pants: "#3f3f4a", boots: "#26201a", hat: "tophat", buttons: "#e8d45a", moustache: "#241a12", skin: "#ecd0b6", build: "adult" };
/** a Bonnet granny with opinions */
export const GRANNY: Outfit = { jacket: "#6e3a4a", pants: "#3b3f52", boots: "#26201a", hat: "bonnet", dress: "#6e3a4a", skin: "#ecd0b6", build: "stout" };
/** modern commuters: a red fixie, a blue roadie, and the dark silhouettes of the Saturday-morning peloton */
export const MOD_RED: Outfit = { jacket: "#cf4632", pants: "#23232b", boots: "#1a1a1e", hat: "cap", cap: "#23232b", skin: "#c99067", build: "adult" };
export const MOD_BLUE: Outfit = { jacket: "#3d6fe0", pants: "#2c3440", boots: "#1a1a1e", hat: "hair", hair: "#241a12", skin: "#f5c9a0", build: "adult" };
export const MOD_DARK: Outfit = { jacket: "#1d1d22", pants: "#1d1d22", boots: "#101014", hat: "cap", cap: "#101014", skin: "#1d1d22", build: "adult" };
/** the quiet forester beside the baron on the Baden bench: ash-grey beard, corduroy, no opinions out loud */
const FORESTER: Outfit = { jacket: "#4c443a", pants: "#37332d", boots: "#26201a", hat: "hair", hair: "#b8b4ac", moustache: "#b8b4ac", skin: "#c99067", build: "stout" };

const SU_RIDE = 0.0019;   // ride composites: 1000 units tall = 1.9 m
const SU_HORSE = 0.0024;  // wearyHorse: 820 x 820
const RIDE_GEO = new THREE.PlaneGeometry(880 * SU_RIDE, 1000 * SU_RIDE); RIDE_GEO.translate(0, 500 * SU_RIDE, 0);
const MODERN_GEO = new THREE.PlaneGeometry(760 * SU_RIDE, 1000 * SU_RIDE); MODERN_GEO.translate(0, 500 * SU_RIDE, 0);
const FARTHING_GEO = new THREE.PlaneGeometry(800 * SU_RIDE, 1000 * SU_RIDE); FARTHING_GEO.translate(0, 500 * SU_RIDE, 0);
const HORSE_GEO = new THREE.PlaneGeometry(820 * SU_HORSE, 820 * SU_HORSE); HORSE_GEO.translate(0, 410 * SU_HORSE, 0);
export const SPEC_GEO = { ride: RIDE_GEO, modern: MODERN_GEO, farthing: FARTHING_GEO, horse: HORSE_GEO } as const;
export type SpecKind = keyof typeof SPEC_GEO;

/** composite side-view card: machine + rider in one drawing; tier by distance */
const rideCard = (cam: CamInfo, x: number, y: number, z: number, kind: SpecKind, draw: (p: Pen) => void, baseKey: string, phase: number, mirror = false): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.0, z));
  const [w, h, k] = d < 7 ? [900, 1020, 1.16] : d < 15 ? [600, 680, 0.77] : [320, 364, 0.41];
  const key = `${kind}|${baseKey}|${q(phase, 26)}`;
  return { key, draw, x, y, z, mirror, tierKey: `${w}`, geo: kind, size: [w, h, k] };
};
const dust = (out: Stage, x: number, y: number, z: number, k: number) => {
  const u = q((k * 0.37) % 1, 8);
  out.fx.push({ key: `dust${u}`, cw: 180, ch: 180, draw: (p) => fxPuff(p, u), x, y: y + 0.22, z, w: 0.55, h: 0.45, soft: true });
};
/** dust kicked up while the machine rolls, behind the rear wheel */
const rollDust = (t0: number, t1: number, t: number, pos: (tt: number) => [number, number], out: Stage) => {
  for (let tp = t0, k = 0; tp < Math.min(t1, t); tp += 0.85, k++) {
    const age = t - tp;
    if (age < 0 || age > 0.9) continue;
    const [x, z] = pos(tp);
    const u = age / 0.9;
    dust(out, x - 1.1 + u * 0.35, 0.04, z + 0.25, k);
  }
};
const stars = (out: Stage, t: number, spots: [number, number, number, number][]) =>
  spots.forEach(([x, y, z, w], i) =>
    out.fx.push({ key: `stars${q((t * 0.85 + i * 0.31) % 1, 12)}`, cw: 420, ch: 230, draw: (p) => fxStars(p, (t * 0.85 + i * 0.31) % 1), x, y, z, w, h: w * 0.55 }));
const sparkle = (out: Stage, t: number, x: number, y: number, z: number, w: number) =>
  out.fx.push({ key: `spark${q((t * 1.6) % 1, 12)}`, cw: 200, ch: 200, draw: (p) => fxSparkle(p, (t * 1.6) % 1), x, y, z, w, h: w });
const burstAt = (out: Stage, t: number, at: number[], x: number, y: number, z: number, w: number) => {
  for (const ta of at) {
    const u = (t - ta) / 0.42;
    if (u < 0 || u >= 1) continue;
    out.fx.push({ key: `burst${q(u, 16)}`, cw: 420, ch: 420, draw: (p) => fxBurst(p, q(u, 16), "#e8d9a8", 8, 30, 150), x, y, z, w, h: w });
  }
};
/** umbrella held over a strolling figure (anchored above the head) */
const brolly = (out: Stage, x: number, y: number, z: number, alt: boolean) =>
  out.fx.push({ key: `umbrella${alt ? 1 : 0}`, cw: 320, ch: 260, draw: (p) => fxUmbrella(p, alt ? "#37506e" : "#7e3b46"), x, y: y + 2.02, z, w: 1.02, h: 0.85 });
const streaks = (out: Stage, x: number, y: number, z: number, t: number) => {
  for (let i = 0; i < 3; i++) {
    const u = (t * 3.1 + i * 0.31) % 1;
    out.fx.push({ key: `streak${i}${q(u, 8)}`, cw: 420, ch: 64, draw: (p) => fxStreak(p, i + 1), x: x - 1.7 - i * 0.55 - u * 0.5, y: y + 0.25 + i * 0.34, z, w: 2.4, h: 0.36, soft: true });
  }
};

// hammer timing for the workshop (hits land on "wheels" / "beam" / "saddle" in seg14)
const WORKER_HITS = [36.69, 37.19, 37.58];
const workerK = (t: number) => {
  let k = 1;
  for (const th of WORKER_HITS) {
    const n = (t - th) * FPS;
    if (n >= -11 && n < -7) k = Math.min(k, 1 - smooth((n + 11) / 4));
    else if (n >= -7 && n < 0) k = 0;
  }
  return k;
};

export type Stage = { places: Place[]; fx: FxPlace[] };
const pedantic = (v: number): Outfit => FOLK[v % 6];

/** everything with a face in shot `id` at time t (seconds) */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  LNAME = SHOTS[id - 1].light;
  findSun(cam, SUN);
  const blinkFor = (i: number) => lidAt(t, i);
  const folk = (i: number, x: number, z: number, expr: Expr, extra: Partial<FrontOpts> = {}, scale = 1, o?: Outfit): void => {
    const who: Who = { i: i + 300, o: o ?? pedantic(i), okey: o ? "x" + o.jacket.slice(1) : `f${i % 6}` };
    out.places.push(person(cam, who, x, 0, z, { side: false, mirror: false }, { mode: "stand", expr, blink: blinkFor(i), ...extra }, {}, scale));
  };

  // --- Villa Diodati: the rain comes in sheets ---
  if (id === 9) {
    const depths: [number, number, number, number, number][] = [
      [-2.2, 2.6, 3.4, 4.6, 8.2],
      [1.8, 6.0, 5.2, 6.2, 11.0],
      [-0.6, 10.5, 7.0, 8.6, 15.2],
    ];
    depths.forEach(([x, z, y, w, h], i) => {
      const u = (t * 0.9 + i * 0.37) % 1;
      out.fx.push({ key: `rain${i}${q(u, 5)}`, cw: 460, ch: 800, draw: (p) => fxRain(p, u), x, y, z, w, h, soft: true });
    });
  }
  // --- Tambora, the morning of April 10th: tiny figures fleeing the apron ---
  if (id === 3) {
    const N = [[-22, 74, 1], [-8, 68, 0.85], [6, 76, 0.72], [20, 71, 0.6]] as const;
    N.forEach(([x, z, sc], i) => {
      const who: Who = { i: i + 340, o: pedantic(i + 1), okey: `flee${i}` };
      const fo: FrontOpts = { mode: "march", phase: (t * 2.6 + i * 0.33) % 1, expr: "shock", blink: lidAt(t, 340 + i) };
      out.places.push(person(cam, who, x - (t - 10.5) * 2.2, 0, z + (t - 10.5) * 3.1, { side: false, mirror: false }, fo, {}, sc));
    });
  }
  // --- June, under the ash veil: two brollies crossing the drowned square ---
  if (id === 5) {
    const ax = -9 + (t - 17.68) * 1.05, bx = 7.2 - (t - 17.68) * 0.9;
    [[ax, 2.1, GRANNY, true], [bx, 6.0, pedantic(2), false]].forEach(([x, z, o, alt], i) => {
      const who: Who = { i: i + 350, o: o as Outfit, okey: alt ? "granny" : "f2" };
      out.places.push(person(cam, who, x as number, 0, z as number, { side: false, mirror: (o as Outfit).dress === undefined ? false : i === 0, }, { mode: "stroll", phase: (t * 1.15 + i * 0.5) % 1, expr: "nervous", blink: lidAt(t, 350 + i) }, {}, 1));
      brolly(out, x as number, 0, z as number, !alt);
    });
    blob(out, ax, 0, 2.1, 1); blob(out, bx, 0, 6.0, 1);
  }
  // --- hearth corner, 1816: three backs, one fire, no summer ---
  if (id === 7) {
    const spots: [number, number, Expr][] = [[-1.15, 1.45, "nervous"], [0.55, 2.0, "neutral"], [-0.35, 2.85, "dazed"]];
    spots.forEach(([x, z, expr], i) => {
      const who: Who = { i: i + 360, o: pedantic(i + 3), okey: `hearth${i}` };
      out.places.push(person(cam, who, x, 0, z, { side: false, mirror: false }, { mode: "sit", expr, headTilt: 14, blink: lidAt(t, 360 + i) }, {}));
    });
    folk(9, 1.6, 0.55, "neutral");
    blob(out, -1.15, 0, 1.45, 1); blob(out, 0.55, 0, 2.0, 1); blob(out, -0.35, 0, 2.85, 1); blob(out, 1.6, 0, 0.55, 1);
  }
  // --- the oat stall: the price is whatever it needs to be ---
  if (id === 8 || id === 25) {
    const bare = id === 25;
    if (bare) {
      const who: Who = { i: 370, o: pedantic(3), okey: "vendor" };
      out.places.push(person(cam, who, -0.75, 0, 4.35, { side: false, mirror: false }, { mode: "sit", expr: "dazed", headTilt: 26, blink: 0.6 }, {}));
      // breath-dragon snores, one per ~1.8 s
      const u = (t * 0.55) % 1;
      if (u < 0.5) out.fx.push({ key: `snore${q(u * 2, 8)}`, cw: 180, ch: 180, draw: (p) => fxPuff(p, q(u * 2, 8)), x: -0.5, y: 1.28, z: 4.15, w: 0.34, h: 0.3, soft: true });
    } else {
      const who: Who = { i: 370, o: pedantic(3), okey: "vendor" };
      out.places.push(person(cam, who, -0.75, 0, 4.35, { side: false, mirror: false }, { mode: "stand", expr: "stern", wave: q(Math.sin(t * 5.2) * 0.5 + 0.5, 8), blink: lidAt(t, 370) }, {}, 1.02));
      folk(1, -1.9, 0.95, "shock");
      folk(2, 0.95, 0.35, "nervous");
      folk(4, 2.15, 2.1, "neutral");
      blob(out, -0.75, 0, 4.35, 1.05); blob(out, -1.9, 0, 0.95, 1); blob(out, 0.95, 0, 0.35, 1); blob(out, 2.15, 0, 2.1, 1);
    }
  }
  // --- Baden, 1817: a forester and a baron, a bench, an empty sack ---
  if (id === 10) {
    const who: Who = { i: 371, o: DRAIS, okey: "drais" };
    out.places.push(person(cam, who, 2.0, 0, 14.55, { side: false, mirror: false }, { mode: "sit", expr: "neutral", headTilt: 13, blink: lidAt(t, 371) }, {}));
    const fo: Who = { i: 376, o: FORESTER, okey: "forester" };
    out.places.push(person(cam, fo, 2.78, 0, 14.55, { side: false, mirror: false }, { mode: "sit", expr: "neutral", headTilt: -9, blink: lidAt(t, 376) }, {}));
    blob(out, 2.0, 0, 14.55, 1.1); blob(out, 2.78, 0, 14.55, 1.2); blob(out, 1.5, 0, 14.6, 0.7);
  }
  if (id === 11) {
    const who: Who = { i: 371, o: DRAIS, okey: "drais" };
    out.places.push(person(cam, who, -2.9, 0, 22.3, { side: true, mirror: false }, {}, { mode: "stand", expr: "neutral", blink: lidAt(t, 371) }));
    blob(out, -2.9, 0, 22.3, 1.1);
    // the sack tips over on "the horses." (~33.05 s)
    if (t > 33.0) {
      const u = clamp01((t - 33.0) / 0.42);
      out.fx.push({ key: `dustsack${q(u, 10)}`, cw: 180, ch: 180, draw: (p) => fxPuff(p, q(u, 10)), x: -4.55, y: 0.16 + 0.25 * (1 - u), z: 24.35, w: 0.8 * u + 0.3, h: 0.6 * u + 0.2, soft: true });
    }
  }
  // --- the workshop: two wheels, a beam, a saddle ---
  if (id === 12) {
    const who: Who = { i: 371, o: DRAIS, okey: "drais" };
    out.places.push(person(cam, who, 1.02, 0, 12.55, { side: false, mirror: false }, { mode: "stand", expr: "stern", prop: ["hammer", q(workerK(t), 20)], blink: lidAt(t, 371) }, {}));
    blob(out, 1.78, 0, 13.35, 1.1);
    out.places.push(rideCard(cam, 0.5, 0.8, 13.6, "ride", (p) => rideSide(p, DRAIS, { noRider: true, light: light2D(cam, true), seed: 7 }), "draisbare", 0));
    burstAt(out, t, WORKER_HITS, 1.28, 1.02, 13.6, 0.62);
  }
  // --- No pedals. ---
  if (id === 13) {
    const who: Who = { i: 371, o: DRAIS, okey: "drais" };
    out.places.push(person(cam, who, 0.98, 0, 12.35, { side: false, mirror: false }, { mode: "stand", expr: "stern", blink: lidAt(t, 371) }, {}));
    out.places.push(rideCard(cam, 0.42, 0, 13.4, "ride", (p) => rideSide(p, DRAIS, { noRider: true, light: light2D(cam, true), seed: 7 }), "draisbare", 0));
  }
  // --- the Laufmaschine, beauty shot: one glint when he says it ---
  if (id === 14) {
    out.places.push(rideCard(cam, 0.5, 0, 13.5, "ride", (p) => rideSide(p, DRAIS, { noRider: true, light: light2D(cam, true), seed: 7 }), "draisbare", 0));
    if (t > 38.95 && t < 39.7) sparkle(out, t, 0.52, 1.28, 13.55, 0.4);
  }
  // --- first push-offs: he walks it out of the shed ---
  if (id === 15) {
    const x = -3.5 + (t - 39.74) * 4.7;
    const phase = (t - 39.74) * 1.5;
    if (x < 4.2) {
      const who: Who = { i: 371, o: DRAIS, okey: "drais" };
      const back: Who = who;
      out.places.push(person(cam, back, x - 1.42, 0, 13.3, { side: true, mirror: false }, {}, { mode: "march", phase, expr: "grin", blink: lidAt(t, 371) }));
      if (x > -4.4) blob(out, x - 1.42, 0, 13.3, 1.1);
      out.places.push(rideCard(cam, x, 0, 13.3, "ride", (p) => rideSide(p, DRAIS, { noRider: true, phase, light: light2D(cam, false), seed: 7 }), "draisbare", phase));
      if (x < 3.4) blob(out, x, 0, 13.3, 1.35);
    }
  }
  // --- 12 June 1817, Mannheim -> Schwetzingen ---
  if (id === 16) {
    const z = rideZ(t), phase = ((t - 41.19) * 2.3) % 1;
    out.places.push(rideCard(cam, -0.45, 0, z, "ride", (p) => rideSide(p, DRAIS, { phase, expr: "grin", blink: lidAt(t, 371), light: light2D(cam, true), seed: 7 }), "draiscal", phase));
    blob(out, -0.45, 0, z, 1.35);
    if (t < 47.3) rollDust(41.35, 47.3, t, (tt) => [-0.45, rideZ(tt)], out);
  }
  // --- Schwetzingen: Luckily, it worked. ---
  if (id === 17) {
    const u = clamp01((t - 47.53) * 1.28), z = -8.5 + (1 - Math.exp(-(t - 47.53) * 2.1)) * 11.6;
    const rolling = clamp01(1 - (t - 47.53) * 1.75);
    const phase = (t - 47.53) * 2.3 * rolling;
    out.places.push(rideCard(cam, -0.4, 0, Math.min(z, 2.6), "ride", (p) => rideSide(p, DRAIS, { phase, expr: rolling > 0.25 ? "grin" : "neutral", blink: lidAt(t, 371), light: light2D(cam, true), seed: 7 }), "draiscal", phase % 1));
    blob(out, -0.4, 0, Math.min(z, 2.6), 1.35);
    if (rolling > 0.05) rollDust(47.53, 48.4, t, (tt) => [-0.4, -8.5 + (1 - Math.exp(-(tt - 47.53) * 2.1)) * 11.6], out);
    // the town turns out: waves on the gate pilasters, one kid doing this to everybody
    folk(1, -3.05, 15.4, "grin", { wave: q(Math.sin(t * 6.0) * 0.5 + 0.5, 8) });
    folk(2, 3.15, 15.5, "laugh", { wave: q(Math.sin(t * 6.0 + 2) * 0.5 + 0.5, 8) });
    folk(4, 4.6, 12.2, "grin", { wave: q(Math.sin(t * 6.0 + 4) * 0.5 + 0.5, 8) }, 1, GRANNY);
    const hopper = Math.max(0, Math.sin(t * 7.4)) * 0.2;
    const who: Who = { i: 378, o: KID, okey: "kid" };
    out.places.push(person(cam, who, -4.3, hopper, 12.6, { side: false, mirror: false }, { mode: "stand", expr: "laugh", wave: q(Math.sin(t * 8.2) * 0.5 + 0.5, 8), blink: lidAt(t, 378) }, {}, 0.72));
    blob(out, -3.05, 0, 15.4, 1); blob(out, 3.15, 0, 15.5, 1); blob(out, 4.6, 0, 12.2, 0.85); blob(out, -4.3, 0, 12.6, 0.75, hopper > 0.02 ? 0.7 : 1);
  }
  // --- and unluckily: the dandy, the bonnet, the stars ---
  if (id === 18) {
    const enter = clamp01((t - 48.83) * 1.9), x = -11.5 + (1 - Math.exp(-(t - 48.83) * 2.6)) * 13.1;
    const crashed = t >= 49.35, tipped = clamp01((t - 49.35) * 2.4);
    const roll = -0.52 * (1 - (1 - tipped) ** 3);
    out.places.push({ ...rideCard(cam, x, 0, 3.05, "ride", (p) => rideSide(p, DANDY, { phase: crashed ? 0.62 : ((t - 48.83) * 2.5) % 1, expr: crashed ? "shock" : "grin", blink: lidAt(t, 372), light: light2D(cam, true), seed: 9 }), "dandy", (t - 48.83) * 2.5), roll });
    const who: Who = { i: 373, o: GRANNY, okey: "granny" };
    out.places.push(person(cam, who, 1.75, 0, 2.5, { side: false, mirror: false }, { mode: "stand", expr: crashed ? "shock" : "neutral", wave: crashed ? q(Math.sin(t * 9.1) * 0.5 + 0.5, 8) : undefined, blink: lidAt(t, 373) }, {}));
    if (crashed) stars(out, t, [[0.85, 2.15, 2.9, 0.62], [1.75, 2.45, 2.4, 0.5], [0.3, 1.6, 3.2, 0.4]]);
    blob(out, x, 0, 3.05, 1.3); blob(out, 1.75, 0, 2.5, 1);
  }
  // --- the ban, and its three sequels: one palm, everywhere ---
  if (id === 19 || id === 20 || id === 21 || id === 22) {
    const spots: Record<number, { c: [number, number]; d: [number, number]; g: [number, number] }> = {
      19: { c: [0.95, 4.8], d: [-1.7, 3.7], g: [2.55, 6.1] },
      20: { c: [1.15, 5.2], d: [-1.35, 4.3], g: [2.7, 6.6] },
      21: { c: [1.05, 5.3], d: [-1.45, 4.4], g: [2.6, 6.7] },
      22: { c: [1.2, 5.4], d: [-1.3, 4.5], g: [2.8, 6.8] },
    };
    const { c, d, g } = spots[id];
    const cw: Who = { i: 374, o: CONSTABLE, okey: "constable" };
    out.places.push(person(cam, cw, c[0], 0, c[1], { side: false, mirror: false }, { mode: "stand", expr: "stern", wave: q(0.75 + Math.sin(t * 2.1) * 0.12, 8), blink: lidAt(t, 374) }, {}, 1.06));
    const dw: Who = { i: 372, o: DANDY, okey: "dandy" };
    out.places.push({ ...rideCard(cam, d[0], 0, d[1], "ride", (p) => rideSide(p, DANDY, { phase: 0.62, expr: "nervous", blink: lidAt(t, 372), light: light2D(cam, false), seed: 9 }), "dandyhalt", 0.62), roll: -0.09 });
    folk(6, g[0], g[1], "stern", {}, 1, GRANNY);
    blob(out, c[0], 0, c[1], 1.15); blob(out, d[0], 0, d[1], 1.3); blob(out, g[0], 0, g[1], 1);
  }
  // --- the horse gives up; the road is yours ---
  if (id === 26) {
    const u = clamp01((t - 59.7) / 1.85);
    const hx = 5.3 - 10.6 * u, phase = (t * 0.95) % 1;
    out.places.push(rideCard(cam, hx, 0, 5.1, "horse", (p) => wearyHorse(p, { phase, light: light2D(cam, false) }), "weary", phase, false));
    blob(out, hx, 0, 5.1, 1.5);
    // and very far ahead, a small rider owns the empty road
    const dz = 24 + (t - 59.7) * 9;
    out.places.push({ ...rideCard(cam, 0.55, 0, dz, "ride", (p) => rideSide(p, DRAIS, { phase: (t * 2.1) % 1, expr: "grin", blink: 0, light: light2D(cam, false), seed: 7 }), "draisfar", (t * 2.1) % 1), scale: 0.62 });
  }
  // --- the eighteen sixties: the penny-farthing (hub cranks spin) ---
  if (id === 27) {
    const x = -13.5 + (t - 61.5) * 11.4;
    if (x < 9.5) {
      const phase = (t * 3.1) % 1;
      out.places.push(rideCard(cam, x, 0, 3.4, "farthing", (p) => highWheeler(p, DANDY, { phase, expr: "grin", blink: lidAt(t, 372), light: light2D(cam, true), seed: 13 }), "farthing", phase));
      blob(out, x, 0, 3.4, 1.6);
    }
  }
  // --- then chains, then gears: the safety bicycle, businesslike
  if (id === 28) {
    const x = -9.5 + (t - 63.1) * 9.2;
    if (x < 8.6) {
      const phase = (t * 2.55) % 1;
      out.places.push(rideCard(cam, x, 0, 2.6, "modern", (p) => modernRide(p, MOD_RED, { phase, expr: "smile_closed", blink: lidAt(t, 375), light: light2D(cam, true), seed: 11 }), "fixie", phase));
      blob(out, x, 0, 2.6, 1.3);
    }
  }
  // --- the most-ridden machine on Earth: the packed lane, both directions
  if (id === 29) {
    const riders = [
      { z: 1.6, dir: 0, scale: 1.05, x0: -9, o: MOD_RED, key: "laneRed", spd: 6.2, t0: 64.6 },
      { z: 3.3, dir: 1, scale: 0.8, x0: 9, o: MOD_BLUE, key: "laneBlue", spd: 4.6, t0: 64.9 },
      { z: 4.75, dir: 1, scale: 0.62, x0: 8.2, o: MOD_DARK, key: "laneD1", spd: 5.1, t0: 65.6 },
      { z: 6.15, dir: 0, scale: 0.48, x0: -7.4, o: MOD_DARK, key: "laneD2", spd: 4.2, t0: 66.6 },
      { z: 9.3, dir: 1, scale: 0.34, x0: 6.9, o: MOD_DARK, key: "laneD3", spd: 3.4, t0: 67.2 },
      { z: 7.6, dir: 0, scale: 0.4, x0: -6.1, o: MOD_DARK, key: "laneD4", spd: 3.6, t0: 65.8 },
    ];
    riders.forEach((r, i) => {
      if (t < r.t0) return;
      const x = r.dir ? r.x0 - r.spd * (t - r.t0) : r.x0 + r.spd * (t - r.t0);
      if (Math.abs(x) > 15) return;
      const phase = (t * 2.4 + i * 0.31) % 1;
      out.places.push({ ...rideCard(cam, x, 0, r.z, "modern", (p) => modernRide(p, r.o, { phase, expr: r.dir ? "smile_closed" : "grin", blink: 0, light: light2D(cam, !r.dir), seed: 11 + i }), r.key, phase, !!r.dir), scale: r.scale });
    });
  }
  // --- someone flies past on a bicycle ---
  if (id === 30) {
    const u = clamp01((t - 67.92) / 1.22);
    const xx = -16 + 29.5 * Math.pow(u, 1.55);
    if (t > 67.9 && t < 69.35) {
      const phase = (t * 4.4) % 1;
      out.places.push({ ...rideCard(cam, xx, 0, 2.0, "modern", (p) => modernRide(p, MOD_DARK, { phase, expr: "grin", blink: 0, light: light2D(cam, true), seed: 17 }), "flyby", phase), scale: 1.28 });
      streaks(out, xx, 0.9, 2.0, t);
    }
  }
  // --- one man, no horse: he crests the rise into the light ---
  if (id === 34) {
    const z = 27 + (t - 72.37) * 16;
    out.places.push(rideCard(cam, 0.4, 0, z, "ride", (p) => rideSide(p, DRAIS, { phase: (t * 2.15) % 1, expr: "grin", blink: lidAt(t, 371), light: light2D(cam, false), seed: 7 }), "draisfin", (t * 2.15) % 1));
  }
  // contact + water-line blobs handled by the caller via `globs`
  return { places: out.places, fx: out.fx };
};
export { FPS };
