// The whole Tambora story as one three.js scene, built once and posed per frame (update(id, f, camera)):
// Tambora and its apron (z = 140), the snow-buried village (the Year Without a Summer), the failed wheat field,
// Villa Diodati across the lake, the Baden bench, the empty stable, the workshop lean-to, the Schwetzingen gate,
// the Mannheim/Milan/London/New York ban walls, the Rhine with the far bank and Burg Katz, the packed modern lane
// and the sun-road out. Time-windowed sets toggle .visible; the rest frames itself by camera.
// update() returns the camera's look point (Tambora.tsx uses it as the DOF fallback).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { staticFile } from "remotion";
import { Batch, boxGeo, V, lam, quad, tri, house, kitClone, Kit } from "./build";
import { beam, cobbleHD, grassHD, stoneHD, waterNear, waterFar, cloudHD, beamHD, rep, ctex, brick } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset, LightKind } from "./lights";
import { TONE, CHAR, twoTone, untone , LFB } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, SPEC_GEO, SpecKind, CamInfo } from "./cast";
import { FPS, SHOTS, camAt, CRATER, smooth, clamp01, V3, FOREGROUND } from "./story";

// ---------------- assets ----------------
const KENNEY = ["tree_oak", "tree_default", "tree_detailed", "tree_cone", "plant_bushLarge", "plant_bushDetailed", "plant_bush",
  "grass_large", "flower_redA"];
let kitP: Promise<Kit> | null = null;
export const loadKit = () => {
  if (!kitP) {
    const loader = new GLTFLoader();
    kitP = Promise.all(KENNEY.map((n) => loader.loadAsync(staticFile(`kenney/nature/${n}.glb`)).then((g) => [n, g.scene] as const).catch(() => [n, null] as const)))
      .then((list) => Object.fromEntries(list.filter((e) => e[1]).map(([n, s]) => [n, s!])) as Kit);
  }
  return kitP;
};

const UP = V(0, 1, 0);
const rad = (d: number) => (d * Math.PI) / 180;
/** flat ground quad with UVs scaled to ~8 m tiles (u along x, v along z), counter-clockwise seen from above */
const quadUp = (x0: number, x1: number, z0: number, z1: number, y: number, tile = 8) => {
  const w = x1 - x0, h = z1 - z0;
  const g = new THREE.PlaneGeometry(w, h, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
};
const beamBetween = (a: THREE.Vector3, b: THREE.Vector3, th: number) => {
  const g = new THREE.BoxGeometry(th, a.distanceTo(b), th);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()), V(1, 1, 1));
  return g.applyMatrix4(m);
};
/** sun disc core */
const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.82, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
/** flat golden halo (lighting.md 6: an unresolved disc with a wide soft rim, no corona) */
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.62 * Math.exp(-((u / 0.22) ** 2)) + 0.34 * Math.exp(-((u / 0.55) ** 2))) * (1 - smooth((u - 0.78) / 0.22));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * clamp01(a));
  }
  g.putImageData(im, 0, 0);
});
/** soft round flake for the snow / ash point sprites */
const softDotTex = () => ctex("softDot", 64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 3, 32, 32, 30);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.65, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
/** chimney-smoke puff (the ash column); drawn lit-facing, alpha in the shape */
const smokeTex = () => ctex("smoke", 256, 256, (g) => {
  const p = new Pen(g);
  for (const [x, y, r, c] of [[88, 150, 62, "#6f6a66"], [152, 118, 74, "#7d7873"], [176, 166, 56, "#6f6a66"], [122, 96, 56, "#8a857f"], [120, 172, 60, "#655f5b"]] as const)
    p.ell(x, y, r, r * 0.88, c, 0);
});
/** a parasol seen edge-on, hanging over the crater: the "chimney" gag */
const parasolTex = () => ctex("parasol", 512, 340, (g) => {
  const p = new Pen(g);
  const cy = 100, rx = 222, ry = 92;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 32; i++) { const a = Math.PI - (Math.PI * i) / 32; pts.push([256 + rx * Math.cos(a), cy - ry * Math.sin(a)]); }
  for (let i = 32; i >= 0; i--) { const a = (Math.PI * i) / 32; pts.push([256 - rx * Math.cos(a), cy + 16 * Math.sin(a * 9) ** 2]); }
  p.poly(pts, "#2c2630", 10);
  for (let i = 1; i < 8; i++) { const a = Math.PI - (Math.PI * i) / 8; p.stroke([[256, cy - ry], [256 + rx * Math.cos(a), cy + 5]], 5, "#453e48"); }
  p.arc(256, cy - ry - 6, 12, 9, 180, 360, 6, "#453e48");              // finial
  p.stroke([[256, cy + 10], [256, 272]], 15, "#241f28");                // the chimney it sits on
  p.stroke([[256, cy + 10], [256, 272]], 5, "#37313d");
  p.arc(256, cy - ry + 12, rx * 0.6, 34, 195, 345, 6, "rgba(255,190,120,0.30)"); // ember rim along the belly
});
/** small hot flame (the hearth) on a 128 x 160 canvas */
const flameTex = () => ctex("flame", 128, 160, (g) => {
  const p = new Pen(g);
  p.poly([[64, 8], [94, 86], [101, 120], [64, 150], [27, 120], [34, 86]], "#f5a33b", 0);
  p.poly([[64, 48], [85, 98], [83, 124], [64, 138], [45, 124], [43, 98]], "#ffd98a", 0);
  p.poly([[64, 90], [75, 110], [64, 126], [53, 110]], "#fff6cf", 0);
});
/** Mannheim's polite prohibition: a horse in a red disc-slash, nailed to a post */
const signTex = () => ctex("nohorse", 256, 256, (g) => {
  const p = new Pen(g);
  p.ell(128, 128, 108, 108, "#efe8da", 10);
  p.ell(128, 128, 84, 84, "#20402f", 0);
  // the horse, in three strokes
  p.stroke([[74, 150], [88, 108], [128, 104], [152, 122], [168, 118]], 13, "#efe8da");
  p.stroke([[128, 104], [124, 84], [142, 74]], 11, "#efe8da");
  p.stroke([[92, 148], [88, 172]], 9, "#efe8da"); p.stroke([[140, 138], [146, 166]], 9, "#efe8da");
  p.line([[40, 40], [216, 216]], "#c8323a", 22);
});
/** Milan: a terracotta arcade, five bays, deep shade — the Lombard way of saying no */
const arcadeTex = () => ctex("arcadeHD", 1024, 512, (g) => {
  g.fillStyle = "#c8a06a"; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#b28a58"; for (let y = 0; y < 512; y += 64) g.fillRect(0, y, 1024, 4);
  for (let i = 0; i < 5; i++) {
    const x = 46 + i * 205;
    g.fillStyle = "#2e2018";
    g.beginPath(); g.moveTo(x, 470); g.lineTo(x, 190); g.arc(x + 78, 190, 78, Math.PI, 0); g.lineTo(x + 156, 470); g.closePath(); g.fill();
    g.strokeStyle = "#e5d3ac"; g.lineWidth = 12; g.beginPath(); g.moveTo(x - 6, 470); g.lineTo(x - 6, 190); g.arc(x + 78, 190, 84, Math.PI, 0); g.lineTo(x + 162, 470); g.stroke();
    g.fillStyle = "#e5d3ac"; g.fillRect(x - 14, 466, 184, 16); // plinth
  }
  g.fillStyle = "#a8552f"; g.fillRect(0, 0, 1024, 46); g.fillStyle = "#8a4227"; g.fillRect(0, 40, 1024, 10); // roof band
});
/** London: brick terrace, sash windows, string course, chimneys on the parapet */
const terraceTex = () => ctex("terraceHD", 1024, 512, (g, r) => {
  g.fillStyle = "#6e4034"; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "rgba(240,220,190,0.12)"; for (let y = 0; y < 512; y += 22) g.fillRect(0, y, 1024, 2);
  for (let i = 0; i < 5; i++) {
    const x = 84 + i * 200;
    for (const y of [96, 280]) {
      g.fillStyle = "#2c2c38"; g.fillRect(x, y, 92, 128);
      g.fillStyle = "#8f97a8"; g.fillRect(x + 6, y + 6, 80, 116);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.moveTo(x + 10, y + 122); g.lineTo(x + 46, y + 6); g.lineTo(x + 62, y + 6); g.lineTo(x + 26, y + 122); g.closePath(); g.fill();
      g.strokeStyle = "#e8e2d2"; g.lineWidth = 7; g.strokeRect(x, y, 92, 128);
      g.beginPath(); g.moveTo(x + 46, y); g.lineTo(x + 46, y + 128); g.moveTo(x, y + 64); g.lineTo(x + 92, y + 64); g.lineWidth = 4; g.stroke();
    }
  }
  g.fillStyle = "#e8e2d2"; g.fillRect(0, 238, 1024, 14);   // string course
  g.fillStyle = "#54483e"; g.fillRect(0, 452, 1024, 60);   // plinth shadow
});
/** New York, 1880s: cast iron, arched bays, a cornice — and the water tower that says no */
const ironTex = () => ctex("ironHD", 1024, 512, (g) => {
  g.fillStyle = "#3a3e46"; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 6; i++) {
    const x = 44 + i * 168;
    g.strokeStyle = "#565b66"; g.lineWidth = 6;
    for (const y of [70, 258]) {
      g.fillStyle = "#23262e"; g.beginPath(); g.moveTo(x, y + 130); g.lineTo(x, y + 34); g.arc(x + 52, y + 34, 52, Math.PI, 0); g.lineTo(x + 104, y + 130); g.closePath(); g.fill();
      g.stroke();
      g.beginPath(); g.moveTo(x, y + 66); g.lineTo(x + 104, y + 66); g.moveTo(x + 52, y); g.lineTo(x + 52, y + 130); g.lineWidth = 3; g.stroke();
    }
  }
  g.fillStyle = "#23262e"; g.fillRect(0, 440, 1024, 72);   // loading bay / shadow
  g.fillStyle = "#565b66"; g.fillRect(0, 428, 1024, 12);   // cornice
});
/** Villa Diodati's street front: stucco, tall arched French windows, a candle in the east room */
const villaTex = () => ctex("villaHD", 1024, 640, (g) => {
  g.fillStyle = "#ddd5c7"; g.fillRect(0, 0, 1024, 640);
  g.fillStyle = "rgba(120,100,90,0.18)"; for (let y = 0; y < 640; y += 4) g.fillRect(0, y, 1024, 1); // faint ashlar
  for (let i = 0; i < 4; i++) {
    const x = 96 + i * 236;
    for (const y of [120, 372]) {
      const lit = i === 2 && y === 120;   // the candle room, upper floor, third bay
      g.fillStyle = lit ? "#f5c568" : "#2c2c38";
      g.beginPath(); g.moveTo(x, y + 150); g.lineTo(x, y + 38); g.arc(x + 62, y + 38, 62, Math.PI, 0); g.lineTo(x + 124, y + 150); g.closePath(); g.fill();
      g.strokeStyle = "#efe8da"; g.lineWidth = 10; g.beginPath(); g.moveTo(x - 6, y + 150); g.lineTo(x - 6, y + 38); g.arc(x + 62, y + 38, 68, Math.PI, 0); g.lineTo(x + 130, y + 150); g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.30)"; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 14, y + 138); g.lineTo(x + 52, y + 14); g.stroke();
    }
  }
  g.fillStyle = "#c9c2b4"; g.fillRect(0, 560, 1024, 80);   // plinth
  g.fillStyle = "#a8552f"; g.fillRect(0, 0, 1024, 26);     // eaves shadow
});
/** wheat head that fails to fill (crossed quads pick it up) */
const wheatTex = () => ctex("wheatHD", 128, 256, (g) => {
  const p = new Pen(g);
  for (const sx of [-18, 0, 18]) {
    p.stroke([[64 + sx, 250], [64 + sx * 1.4, 168], [64 + sx * 2.1, 96]], 5, "#b98a3e");
    for (let k = 0; k < 5; k++) p.ell(64 + sx * (1.1 + 0.24 * k), 108 - k * 14, 7, 12, "#caa24e", 3, 0, 360, sx > 0 ? 25 : sx < 0 ? -25 : 0);
  }
});

/** per-shot sun overrides (world builds the disc/light from these): the blood-red low discs of the catastrophe */
const SUN_SHOT: Record<number, { az?: number; el?: number }> = { 3: { az: -35, el: 9 }, 6: { az: -25, el: 11 }, 24: { az: -15, el: 10 }, 26: { az: 10, el: 8 }, 31: { az: 2, el: 6 }, 34: { az: 2, el: 6.5 } };

// ---------------- water (the lake by Diodati; the Rhine at Mannheim) ----------------
export const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));       // depression angle of the view ray
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);         // 1 at the horizon .. 0 at 24 deg down
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.35 * wTime, 0.0);
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  diffuseColor.rgb = wc;`;

type LightCache = { sky: THREE.Color[]; fog: THREE.Color; wNear: THREE.Color; wMid: THREE.Color; wFar: THREE.Color; wCrest: THREE.Color; wTrough: THREE.Color; wGlint: THREE.Color };

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private spec: Record<SpecKind, Actor[]> = { ride: [], modern: [], farthing: [], horse: [] };
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight; private fill: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private cloudMaps: Record<LightKind, THREE.Texture[]>;
  private cloudMeshes: THREE.Mesh[] = [];
  private cloudLight: LightKind | "" = "";
  private lc = new Map<LightKind, LightCache>();
  private fgs: { o: THREE.Object3D; a: number; b: number }[] = [];
  private setWins: { g: THREE.Object3D; a: number; b: number }[] = [];
  private snowPts: THREE.Points; private ashPts: THREE.Points;
  private snowBase: Float32Array; private ashBase: Float32Array;
  private column: { m: THREE.Sprite; mat: THREE.SpriteMaterial; k: number }[] = [];
  private craterGlow: THREE.Sprite; private parasol: THREE.Mesh;
  private lava: THREE.Mesh[] = [];
  private flames: THREE.Mesh[] = []; private fireGlow: THREE.Sprite | null = null; private candleGlow: THREE.Sprite | null = null;
  private waterM: THREE.MeshLambertMaterial;
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3();
  private target = new THREE.Vector3();

  constructor(kit: Kit) {
    const R = this.root;
    // ---------------- sky dome + sun sprites + lights ----------------
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4(rad(3), rad(8), rad(16), rad(40)) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -2; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), fog: false, depthWrite: false, transparent: true }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -1; this.sunHalo.renderOrder = 4;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.0);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.camera.left = -40; this.sun.shadow.camera.right = 40; this.sun.shadow.camera.top = 40; this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 320;
    this.fill = new THREE.DirectionalLight("#9fb8ff", 0.35);
    R.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    // light caches (untone the sky/fog/water into linear for the post chain)
    for (const k of ["day", "golden", "ash"] as LightKind[]) {
      const L = LOOK[k];
      this.lc.set(k, { sky: L.sky.c.map((c) => untone(c)), fog: untone(LIGHTS[k].fog),
        wNear: untone(L.water.near), wMid: untone(L.water.mid), wFar: untone(L.water.far), wCrest: untone(L.water.crest),
        wTrough: untone(L.water.trough), wGlint: untone(L.water.glint) });
    }
    // clouds: four pre-painted, curated into a ring
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)), ash: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.ash.cloud)) };
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 640 + (i % 3) * 70;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], transparent: true, depthWrite: false, fog: false, opacity: 0.92 }));
      const w = 170 + (i % 4) * 42;
      m.position.set(Math.cos(a) * d, 150 + (i % 4) * 46, Math.sin(a) * d); m.scale.set(w, w / 2.1, 1);
      m.layers.set(NOINK); m.renderOrder = -1;
      this.cloudMeshes.push(m); R.add(m);
    }
    // ---------------- base ground (grass everywhere; a dirt road along z) ----------------
    {
      const b = new Batch();
      b.add(quadUp(-950, 950, -950, 950, 0, 4), lam("grassHD", () => ({ map: grassHD() })));
      // the road: Mannheim (-z) to the gate (z = 6.5); dirt track then, asphalt only in the modern shots
      b.add(quadUp(-2.7, 2.7, -280, 6.5, 0.007, 3), lam("roadDirt", () => ({ color: "#6a5847" })));
      b.build(R, false);
    }
    // ---------------- water: the lake by Villa Diodati, the Rhine at Mannheim ----------------
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    this.waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", WATER_DECL)
        .replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    this.waterM.customProgramCacheKey = () => "tamboraWater";
    const lake = new THREE.Mesh(quadUp(-75, 75, 32, 48, 0.004, 10), this.waterM);
    lake.receiveShadow = true; R.add(lake);
    const rhine = new THREE.Mesh(quadUp(10, 46, -300, 320, 0.004, 10), this.waterM);
    rhine.receiveShadow = true; R.add(rhine);
    // ---------------- the village (permanent bones): lane houses, chapel, well, fences ----------------
    {
      const b = new Batch();
      const snowy = lam("chapelHD", () => ({ map: stoneHD("chapelHD", ["#e0dcd2", "#d6d2c8", "#e8e4da", "#ccc8be"], "#a8a49a") }));
      // lane houses, fronts on the lane (x +-5.5 .. 14), facing it
      house(b, -9.2, 3.4, Math.PI / 2, 7.5, 6.0, 6.4, 3);   // timber, west
      house(b, -9.0, -8.6, Math.PI / 2, 8.0, 6.4, 7.2, 0);  // plaster, west
      house(b, -9.4, -19.6, Math.PI / 2, 7.0, 5.6, 5.8, 6); // brick, west
      house(b, 9.0, 1.6, -Math.PI / 2, 8.5, 7.0, 7.6, 1);   // plaster, east
      house(b, 9.3, -11.0, -Math.PI / 2, 7.0, 5.8, 6.2, 4); // wattle, east
      // chapel at the west end of the square, gable to the lane, ball finial
      b.add(boxGeo(V(-17.5, 0, -7.2), V(-13.0, 5.2, 1.2), 4), snowy);
      b.add(new THREE.ConeGeometry(3.6, 3.4, 4).rotateY(Math.PI / 4).scale(1, 1, 1.35), lam("chapelRoof", () => ({ color: "#e8edf2" })), new THREE.Matrix4().makeTranslation(-15.25, 6.9, -3.0));
      b.add(new THREE.CylinderGeometry(0.5, 0.6, 1.6, 8), snowy, new THREE.Matrix4().makeTranslation(-15.25, 9.15, -3.0));
      b.add(new THREE.SphereGeometry(0.42, 10, 8), lam("chapelBall", () => ({ color: "#c9a84e" })), new THREE.Matrix4().makeTranslation(-15.25, 10.15, -3.0));
      // bell slit (dark) on the gable face
      b.add(quad(V(-15.45, 6.0, 0.99), V(-15.05, 6.0, 0.99), V(-15.05, 7.6, 0.99), V(-15.45, 7.6, 0.99)), lam("bellSlit", () => ({ color: "#241f1c" })));
      // the well, dead centre of the square
      b.add(new THREE.CylinderGeometry(0.9, 1.0, 1.0, 12), lam("wellStone", () => ({ map: stoneHD("wellHD") })), new THREE.Matrix4().makeTranslation(1.6, 0.5, -6.2));
      b.add(boxGeo(V(0.6, 2.0, -6.45), V(2.6, 2.25, -5.95), 2), lam("wellBeam", () => ({ map: beam() })));
      b.add(beamBetween(V(0.75, 2.0, -6.2), V(1.6, 3.2, -6.2), 0.13), lam("wellBeam", () => ({ map: beam() })));
      b.add(beamBetween(V(2.45, 2.0, -6.2), V(1.6, 3.2, -6.2), 0.13), lam("wellBeam", () => ({ map: beam() })));
      b.add(boxGeo(V(0.8, 3.05, -6.75), V(2.4, 3.25, -5.65), 0), lam("wellRoof", () => ({ map: beamHD() })));
      // sparse paling fences along the lane
      for (const [x0, x1, z] of [[-14, -6.5, -2.6], [6.5, 13.5, -4.2], [-13, -7, 7.8]] as const)
        for (let x = x0; x < x1; x += 0.95)
          b.add(boxGeo(V(x, 0, z - 0.06), V(x + 0.14, 0.82 + ((Math.round(x * 7) % 5 + 5) % 5) * 0.045, z + 0.06), 0), lam("fenceHD", () => ({ map: beam() })));
      b.build(R);
      // village lane: packed dirt from the road into the square
      const b2 = new Batch();
      b2.add(quadUp(-2.3, 2.3, -28, 6.5, 0.008, 3), lam("laneDirt", () => ({ color: "#75644f" })));
      b2.add(quadUp(-8, 8, -13.4, -2.6, 0.008, 3), lam("laneDirt2", () => ({ color: "#6f5f4b" }))); // the square apron
      b2.build(R, false);
    }
    // ---------------- windowed: the Year Without a Summer (snow) vs the lost-summer garden ----------------
    const gSnowEx = new THREE.Group();
    {
      const b = new Batch();
      // white ground over the square (polygonOffset not needed: 0.012 above the grass)
      b.add(quadUp(-34, 34, -31, 15, 0.013, 6), lam("snowField", () => ({ color: "#e9ecf2" })));
      // drifts against the walls and the chapel
      for (const [x, z, s] of [[-5.2, 6.1, 1.7], [5.0, 5.2, 1.5], [-13.0, 4.4, 1.4], [6.8, -5.4, 1.3], [-13.5, -12.6, 1.6], [13.0, -6.4, 1.5], [-15.2, -3.5, 1.2], [0.9, -4.0, 1.1]] as const)
        b.add(new THREE.SphereGeometry(1, 10, 7).scale(s, s * 0.4, s * 0.8), lam("driftHD", () => ({ color: "#f0f3f8" })), new THREE.Matrix4().makeTranslation(x, 0.02, z));
      b.build(gSnowEx, false);
      // bare, drowned trees (dark): two in the square
      for (const [x, z, h] of [[-6.8, -4.6, 3.6], [7.6, 3.4, 3.1]] as const) {
        const t = kitClone(kit, "tree_default", h);
        if (t) { t.position.set(x, 0, z); t.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshLambertMaterial({ color: "#463e36" }); }); gSnowEx.add(t); }
      }
      // ice sheet on the well: a pale disc just above the rim shadow
      const ice = new THREE.Mesh(new THREE.CircleGeometry(0.78, 12), new THREE.MeshLambertMaterial({ color: "#dfe9ee" }));
      ice.rotation.x = -Math.PI / 2; ice.position.set(1.6, 1.02, -6.2); gSnowEx.add(ice);
      this.win(gSnowEx, 462, 731);
    }
    const gSummerEx = new THREE.Group();
    {
      const b = new Batch();
      // cottage gardens: tilled beds + bean rows along the east houses
      b.add(quadUp(5.8, 13.6, -8.6, -2.2, 0.012, 3), lam("gardenBed", () => ({ color: "#4d4234" })));
      for (let z = -8.2; z < -2.4; z += 1.35) b.add(boxGeo(V(6.1, 0, z), V(13.3, 0.14, z + 0.42), 0), lam("beanRow", () => ({ color: "#55682e" })));
      b.add(quadUp(-14.5, -5.6, 5.2, 8.6, 0.012, 3), lam("gardenBed2", () => ({ color: "#54483a" })));
      b.build(gSummerEx, false);
      for (const [x, z, h] of [[-6.8, -4.6, 4.6], [7.6, 3.4, 4.2]] as const) {
        const t = kitClone(kit, "tree_oak", h);
        if (t) { t.position.set(x, 0, z); gSummerEx.add(t); }
      }
      for (const [x, z] of [[6.4, 6.6], [-5.2, 8.0], [12.6, -1.0]] as const) {
        const t = kitClone(kit, "flower_redA", 0.5);
        if (t) { t.position.set(x, 0, z); gSummerEx.add(t); }
      }
      this.win(gSummerEx, 0, 462);
      this.win(gSummerEx, 731, 9e9);
    }
    const g1817 = new THREE.Group();
    // ---------------- the workshop lean-to (west of the lane) + sawhorse trestles ----------------
    {
      const b = new Batch();
      const plank = lam("workshopHD", () => ({ map: rep(beam(), 2, 2), side: THREE.DoubleSide }));
      const darkT = lam("workshopDark", () => ({ color: "#4a3826" }));
      // back wall + west gable wall (open face east toward the lane)
      b.add(quad(V(-8.6, 0, 11.0), V(-4.6, 0, 11.0), V(-4.6, 3.6, 11.0), V(-8.6, 3.6, 11.0)), plank);
      b.add(quad(V(-8.6, 0, 15.4), V(-8.6, 0, 11.0), V(-8.6, 3.6, 11.0), V(-8.6, 3.6, 15.4)), plank);
      b.add(quad(V(-4.6, 0, 11.0), V(-4.6, 0, 15.4), V(-4.6, 3.4, 15.4), V(-4.6, 3.4, 11.0)), plank);
      // lean-to roof: high at the back (west), sloping down east, wide overhang
      const roofQ = quad(V(-9.35, 4.15, 9.6), V(-4.0, 2.95, 9.6), V(-4.0, 2.95, 16.6), V(-9.35, 4.15, 16.6), 3, 5);
      b.add(roofQ, lam("workshopRoof", () => ({ map: beamHD(), side: THREE.DoubleSide })));
      b.add(boxGeo(V(-9.5, 4.05, 9.4), V(-4.1, 4.35, 9.8), 0), darkT); // fascia
      // posts on the open face
      for (const z of [11.3, 13.2, 15.1]) b.add(boxGeo(V(-4.75, 0, z - 0.09), V(-4.55, 3.0, z + 0.09), 0), darkT);
      // workbench + shelf silhouettes
      b.add(boxGeo(V(-8.45, 0.95, 11.6), V(-6.2, 1.12, 12.35), 2), darkT);
      b.add(boxGeo(V(-8.3, 0, 11.7), V(-8.15, 0.95, 11.85), 0), darkT); b.add(boxGeo(V(-6.35, 0, 11.7), V(-6.2, 0.95, 11.85), 0), darkT);
      b.add(boxGeo(V(-8.5, 1.9, 11.15), V(-5.4, 2.02, 11.75), 2), darkT); // shelf
      // sawhorse trestles under the machine (wheels bottom at y = 0.80); windowed to the workshop era —
      // the ride-through (S16) would otherwise phase the bike through them
      const bT = new Batch();
      for (const x of [-0.35, 1.35]) {
        bT.add(boxGeo(V(x - 0.55, 0.68, 13.38), V(x + 0.55, 0.80, 13.72), 2), darkT); // top beam
        for (const s of [-1, 1] as const) for (const dz of [-1, 1] as const) {
          const leg = new THREE.BoxGeometry(0.09, 0.86, 0.09);
          const m = new THREE.Matrix4().makeTranslation(x + s * 0.34, 0.34, 13.55 + dz * 0.1)
            .multiply(new THREE.Matrix4().makeRotationZ(s * 0.28)).multiply(new THREE.Matrix4().makeRotationX(dz * 0.16));
          bT.add(leg, darkT, m);
        }
      }
      const gTrestle = new THREE.Group();
      bT.build(gTrestle);
      this.win(gTrestle, 0, 1236);
      b.build(g1817);
    }
    // ---------------- the empty stable (the oats were gone) ----------------
    {
      const b = new Batch();
      const plank = lam("stableHD", () => ({ map: rep(beam(), 3, 2), side: THREE.DoubleSide }));
      const darkT = lam("stableDark", () => ({ color: "#3f3226" }));
      // three sides, open face south (toward the lane/camera); lean-to roof
      b.add(quad(V(-7.1, 0, 26.6), V(-2.4, 0, 26.6), V(-2.4, 3.3, 26.6), V(-7.1, 3.3, 26.6)), plank);   // back (north)
      b.add(quad(V(-7.1, 0, 32.0), V(-7.1, 0, 26.6), V(-7.1, 3.3, 26.6), V(-7.1, 3.3, 32.0)), plank);   // west gable
      b.add(quad(V(-2.4, 0, 26.6), V(-2.4, 0, 32.0), V(-2.4, 2.5, 32.0), V(-2.4, 2.5, 26.6)), plank);   // east
      const roofQ = quad(V(-7.6, 3.95, 25.7), V(-1.9, 2.7, 25.7), V(-1.9, 2.7, 32.6), V(-7.6, 3.95, 32.6), 3, 4);
      b.add(roofQ, lam("stableRoof", () => ({ map: beamHD(), side: THREE.DoubleSide })));
      b.add(boxGeo(V(-2.55, 0, 26.3), V(-2.3, 2.45, 26.6), 0), darkT); b.add(boxGeo(V(-2.55, 0, 31.2), V(-2.3, 2.45, 31.5), 0), darkT); // door posts
      // the empty manger: plank box, full of nothing, one oat left
      b.add(boxGeo(V(-6.2, 0, 29.8), V(-3.4, 1.05, 30.6), 2), darkT);
      b.add(quad(V(-6.2, 1.05, 29.8), V(-3.4, 1.05, 29.8), V(-3.4, 1.35, 29.35), V(-6.2, 1.35, 29.35), 2, 1), darkT); // feed trough lip
      b.add(new THREE.SphereGeometry(0.045, 6, 5).scale(1, 0.7, 1), lam("oatOne", () => ({ color: "#caa24e" })), new THREE.Matrix4().makeTranslation(-4.6, 1.1, 30.0));
      // one leaning, empty sack at the door
      const sack = new THREE.SphereGeometry(0.42, 9, 8); sack.scale(0.8, 1.15, 0.6);
      b.add(sack, lam("sackHD", () => ({ color: "#b99a5e" })), new THREE.Matrix4().makeTranslation(-3.0, 0.42, 27.0).multiply(new THREE.Matrix4().makeRotationZ(0.18)));
      // cobweb arc in the dark corner (a thin pale triangle fan)
      b.build(g1817);
    }
    // ---------------- the Baden bench (a forester and a baron) ----------------
    {
      const b = new Batch();
      const wood = lam("benchHD", () => ({ map: beamHD() }));
      b.add(boxGeo(V(1.35, 0.44, 14.35), V(3.05, 0.53, 14.95), 1), wood);           // seat
      b.add(boxGeo(V(1.45, 0, 14.42), V(1.56, 0.44, 14.56), 0), wood);              // leg L
      b.add(boxGeo(V(2.84, 0, 14.42), V(2.95, 0.44, 14.56), 0), wood);              // leg R
      for (const y of [0.72, 0.98]) b.add(boxGeo(V(1.42, y, 14.88), V(2.98, y + 0.09, 14.97), 1), wood); // back slats
      b.add(boxGeo(V(1.42, 0.53, 14.9), V(1.53, 1.15, 15.0), 0), wood);             // back post L
      b.add(boxGeo(V(2.87, 0.53, 14.9), V(2.98, 1.15, 15.0), 0), wood);             // back post R
      // the sack at his feet
      const sack = new THREE.SphereGeometry(0.3, 8, 7); sack.scale(0.85, 1.1, 0.75);
      b.add(sack, lam("sackHD2", () => ({ color: "#a8895a" })), new THREE.Matrix4().makeTranslation(1.52, 0.28, 14.62));
      b.build(g1817);
      this.win(g1817, 0, 1515);
      this.win(g1817, 1627, 9e9);
    }
    // ---------------- the Schwetzingen gate: two domes, an arch, the road home ----------------
    {
      const b = new Batch();
      const stucco = lam("gateHD", () => ({ map: rep(beam(), 1, 1), color: "#d9c0a2" }));
      const verdigris = lam("gateRoof", () => ({ color: "#6f8b74" }));
      for (const s of [-1, 1] as const) {
        b.add(boxGeo(V(s === -1 ? -5.95 : 2.65, 0, 8.1), V(s === -1 ? -2.65 : 5.95, 6.2, 13.4), 4), stucco);
        const pyr = new THREE.ConeGeometry(2.6, 2.1, 4); pyr.rotateY(Math.PI / 4);
        b.add(pyr, verdigris, new THREE.Matrix4().makeTranslation(s * 4.3, 7.25, 10.75));
        b.add(new THREE.SphereGeometry(0.34, 10, 8), lam("gateBall", () => ({ color: "#c9a84e" })), new THREE.Matrix4().makeTranslation(s * 4.3, 8.55, 10.75));
        // arched doorway into each pavilion (dark)
        b.add(quad(V(s * 4.3 - 0.75, 0, 8.08), V(s * 4.3 + 0.75, 0, 8.08), V(s * 4.3 + 0.75, 2.6, 8.08), V(s * 4.3 - 0.75, 2.6, 8.08)), lam("gateDoor", () => ({ color: "#241f1a", side: THREE.DoubleSide })));
      }
      // the span: box + arch ring + pediment with a golden sun
      b.add(boxGeo(V(-2.65, 4.15, 8.4), V(2.65, 6.4, 13.1), 3), stucco);
      const arc = new THREE.TorusGeometry(2.27, 0.45, 10, 26, Math.PI);
      b.add(arc, stucco, new THREE.Matrix4().makeTranslation(0, 4.15, 8.25));
      b.add(tri(V(-3.1, 6.4, 10.75), V(3.1, 6.4, 10.75), V(0, 8.15, 10.75)), stucco);
      b.add(new THREE.CircleGeometry(0.52, 24), lam("gateSun", () => ({ color: "#d9b25f", emissive: "#7a5a20" })), new THREE.Matrix4().makeTranslation(0, 6.95, 10.72));
      // the passage: cobbled shade, light leaking at the far end
      b.add(quadUp(-2.6, 2.6, 8.2, 13.3, 0.012, 4), lam("gateCobble", () => ({ map: cobbleHD() })));
      b.build(R, false);
    }
    // ---------------- Villa Diodati (the last good evening) + its candle ----------------
    const gCandle = new THREE.Group();
    {
      const b = new Batch();
      const stucco = lam("villaBody", () => ({ color: "#ddd5c7" }));
      // main block facing the lake (-z), 16 x 8.6 x 7
      b.add(boxGeo(V(-8, 0, 46), V(8, 8.6, 53), 6), stucco);
      // the painted street front (arched French windows, one of them lit)
      b.add(quad(V(-8, 0, 45.98), V(-8, 8.6, 45.98), V(8, 8.6, 45.98), V(8, 0, 45.98)), lam("villaFront", () => ({ map: villaTex() })));
      // hipped roof: squashed 4-sided pyramid + eave box
      b.add(boxGeo(V(-8.4, 8.6, 45.6), V(8.4, 9.1, 53.4), 0), stucco);
      const hip = new THREE.ConeGeometry(9.3, 4.3, 4); hip.rotateY(Math.PI / 4); hip.scale(1, 1, 0.62);
      b.add(hip, lam("villaRoof", () => ({ map: beamHD(), color: "#a8552f" })), new THREE.Matrix4().makeTranslation(0, 11.2, 49.5));
      // pedimented centre bay
      b.add(tri(V(-3.4, 8.6, 45.94), V(3.4, 8.6, 45.94), V(0, 11.3, 45.94)), stucco);
      // flanking cypress pair
      for (const s of [-1, 1] as const) {
        const cy = new THREE.ConeGeometry(0.85, 5.6, 8);
        b.add(cy, lam("cypressHD", () => ({ color: "#3d5a34" })), new THREE.Matrix4().makeTranslation(s * 10.6, 2.8, 47.5));
      }
      // garden wall + gate piers toward the lake
      b.add(boxGeo(V(-12, 0, 40.5), V(-3.2, 1.5, 41.1), 2), stucco); b.add(boxGeo(V(3.2, 0, 40.5), V(12, 0, 41.1), 2), stucco);
      b.build(R);
      // the candle: a warm heartbeat of light in the upper east room + a tiny flame quad
      const glowTex = ctex("candleGlow", 64, 64, (g2) => { const gr = g2.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,220,140,1)"); gr.addColorStop(0.4, "rgba(255,180,90,0.65)"); gr.addColorStop(1, "rgba(255,160,70,0)"); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); });
      this.candleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.candleGlow.position.set(1.95, 6.0, 45.6); this.candleGlow.scale.setScalar(1.7); this.candleGlow.layers.set(NOINK); this.candleGlow.frustumCulled = false;
      gCandle.add(this.candleGlow);
      this.win(gCandle, 731, 883);
    }
    // ---------------- far bank of the Rhine + Burg Katz (the castle that glides by) ----------------
    {
      const b = new Batch();
      const dark = lam("farbankHD", () => ({ color: "#453c48" }));
      const r0 = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
      // a hazy strip of rooftops, chimneys and one spire, x 52..170, z -150..280
      let z = -150, i = 0;
      while (z < 280) {
        const w = 6 + r0(i * 3 + 1) * 8, h = 4.5 + r0(i * 3 + 2) * 5.5, x = 56 + r0(i * 3 + 3) * 95;
        b.add(boxGeo(V(x - w / 2, 0, z), V(x + w / 2, h, z + w * 0.8), 0), dark);
        if (r0(i * 7 + 5) > 0.72) b.add(boxGeo(V(x - 0.5, h, z + 1), V(x + 0.5, h + 2.6, z + 2), 0), dark); // chimney
        z += w * 0.9 + 3.5; i++;
      }
      const spire = new THREE.ConeGeometry(1.6, 7.5, 4); spire.rotateY(Math.PI / 4);
      b.add(spire, dark, new THREE.Matrix4().makeTranslation(88, 8.2, -32));
      // Burg Katz knoll + keep + twin towers, across the water at z ~ 95
      const knoll = new THREE.SphereGeometry(1, 16, 10); knoll.scale(17, 5.5, 13);
      b.add(knoll, lam("katzKnoll", () => ({ color: "#3a4432" })), new THREE.Matrix4().makeTranslation(58, -0.6, 95));
      b.add(boxGeo(V(52.5, 4.2, 91.0), V(63.5, 16.5, 99.5), 3), dark);                    // keep
      b.add(boxGeo(V(56.0, 10.0, 86.5), V(60.0, 19.5, 90.5), 2), dark);                   // bergfried
      for (const s of [-1, 1] as const) {
        const tw = new THREE.CylinderGeometry(1.35, 1.55, 8.5, 10);
        b.add(tw, dark, new THREE.Matrix4().makeTranslation(58 + s * 6.6, 9.4, 102.5));
        const cap = new THREE.ConeGeometry(1.5, 2.6, 10);
        b.add(cap, dark, new THREE.Matrix4().makeTranslation(58 + s * 6.6, 14.95, 102.5));
      }
      b.build(R);
    }
    // ---------------- the failed field (wheat, 1816) ----------------
    const gWheat = new THREE.Group();
    {
      const b = new Batch();
      const soil = lam("soilField", () => ({ color: "#4d4238" }));
      b.add(quadUp(-88, -6, -4, 68, 0.011, 6), soil);
      const wheatM = lam("wheatHD3", () => ({ map: wheatTex(), alphaTest: 0.42, side: THREE.DoubleSide }));
      const wg = new THREE.PlaneGeometry(0.62, 1.05);
      const put = (x: number, z: number) => {
        for (const yaw of [0.35, 0.35 + Math.PI / 2]) {
          const g2 = wg.clone(); g2.rotateY(yaw + ((x * 13 + z * 7) % 10) / 18); g2.translate(x, 0.5, z + (((x * 31 + z * 13) % 8) / 8));
          b.add(g2, wheatM);
        }
      };
      for (let x = -84; x < -24; x += 1.5) for (let z = -2; z < 64; z += 1.15) if ((x * 7 + z * 13) % 11 !== 0) put(x + ((z * 17) % 10) / 12, z);
      for (let x = -24; x < -7; x += 1.9) for (let z = 16; z < 64; z += 1.4) if ((x * 5 + z * 11) % 7 < 3) put(x, z);
      const hedgeM = lam("hedgeField", () => ({ color: "#2e3328" }));
      for (let x = -88; x < -14; x += 4.6) b.add(new THREE.SphereGeometry(1.6, 8, 6).scale(1.5, 0.95, 1.0), hedgeM, new THREE.Matrix4().makeTranslation(x, 0.35, 66));
      b.build(gWheat, false);
      this.win(gWheat, 558, 616);
      this.win(gWheat, 1707, 1764);
    }
    // ---------------- the hearth (frozen to death, but at least the soup is warm) ----------------
    const gHearth = new THREE.Group();
    {
      const b = new Batch();
      const stone = lam("hearthHD", () => ({ map: stoneHD("hearthHD", ["#cbb59a", "#bda887", "#d4c3a6", "#b09d80"], "#8a7c68"), side: THREE.DoubleSide }));
      const dark = lam("hearthDark", () => ({ color: "#2b2320", side: THREE.DoubleSide }));
      // fake room corner: two wings angled from the firebox, ceiling beams in shadow
      const wingL = quad(V(-3.4, 0, -2.5), V(-0.75, 0, 0.6), V(-0.75, 4.6, 0.6), V(-3.4, 0, -2.5).clone().setY(4.6));
      b.add(wingL, dark);
      const wingR = quad(V(3.0, 0, -2.5), V(0.55, 0, 0.6), V(0.55, 4.6, 0.6), V(3.0, 0, -2.5).clone().setY(4.6));
      b.add(wingR, dark);
      b.add(quad(V(-0.95, 0, 0.9), V(0.75, 0, 0.9), V(0.75, 4.6, 0.9), V(-0.95, 4.6, 0.9)), dark);   // firebox back, deep shadow
      // hearth slab + surround + mantel + breast
      b.add(boxGeo(V(-1.35, 0, -0.35), V(1.15, 0.16, 1.35), 1), stone);
      b.add(boxGeo(V(-1.05, 0.16, 0.75), V(0.85, 2.6, 1.15), 2), stone);   // breast
      b.add(boxGeo(V(-1.3, 2.6, 0.55), V(1.1, 2.92, 1.35), 2), stone);     // mantel shelf
      b.add(boxGeo(V(-1.3, 2.92, 0.75), V(1.1, 5.2, 1.15), 2), stone);     // chimney breast rising
      // arched firebox opening into the breast
      b.add(quad(V(-0.55, 0.16, 0.735), V(0.35, 0.16, 0.735), V(0.35, 1.35, 0.735), V(-0.55, 1.35, 0.735)), lam("fireboxVoid", () => ({ color: "#17100c", side: THREE.DoubleSide })));
      const arch = new THREE.TorusGeometry(0.45, 0.09, 8, 20, Math.PI);
      b.add(arch, stone, new THREE.Matrix4().makeTranslation(-0.1, 1.35, 0.74));
      // logs
      for (const [y, z, r, l] of [[0.28, 0.15, 0.09, 0.7], [0.42, 0.05, 0.08, 0.55]] as const) {
        const log = new THREE.CylinderGeometry(r, r, l, 8); log.rotateZ(Math.PI / 2);
        b.add(log, lam("logHD", () => ({ color: "#3a2a1c" })), new THREE.Matrix4().makeTranslation(-0.1, y, z));
      }
      b.build(gHearth);
      // flames: three quads, unlit, additive-ish warm
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.34), new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, depthWrite: false, color: new THREE.Color(2.2, 1.5, 0.8), fog: false, side: THREE.DoubleSide }));
        f.position.set(-0.22 + i * 0.17, 0.42 + (i === 1 ? 0.06 : 0), 0.1); f.layers.set(NOINK); f.frustumCulled = false;
        this.flames.push(f); gHearth.add(f);
      }
      const glowTex = ctex("fireGlow", 64, 64, (g2) => { const gr = g2.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,190,90,1)"); gr.addColorStop(0.45, "rgba(255,120,40,0.55)"); gr.addColorStop(1, "rgba(255,90,30,0)"); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); });
      this.fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.fireGlow.position.set(-0.1, 0.62, 0.12); this.fireGlow.scale.setScalar(2.3); this.fireGlow.layers.set(NOINK); this.fireGlow.frustumCulled = false;
      gHearth.add(this.fireGlow);
      this.win(gHearth, 616, 678);
    }
    // ---------------- the oat stall (the price of breathing went up eight times) ----------------
    const gStall = new THREE.Group(); const gOats = new THREE.Group();
    {
      const b = new Batch();
      const timber = lam("stallHD", () => ({ map: beamHD() }));
      const canvasM = lam("stallCanvas", () => ({ color: "#cfc3a0", side: THREE.DoubleSide }));
      // counter + 4 posts + pitched canvas awning
      b.add(boxGeo(V(-2.35, 0.78, 3.1), V(1.75, 0.95, 4.15), 2), lam("stallCounter", () => ({ map: rep(beam(), 2, 1) })));
      for (const [x, z] of [[-2.25, 3.15], [1.65, 3.15], [-2.25, 4.35], [1.65, 4.35]] as const)
        b.add(boxGeo(V(x - 0.07, 0, z - 0.07), V(x + 0.07, 2.25, z + 0.07), 0), timber);
      const roofQ = quad(V(-2.6, 2.62, 2.75), V(2.0, 2.62, 2.75), V(2.0, 1.95, 4.75), V(-2.6, 1.95, 4.75), 3, 1.4);
      b.add(roofQ, canvasM);
      // the scale (an upright + arm + two pans)
      b.add(boxGeo(V(-0.3, 0.95, 3.6), V(-0.22, 1.72, 3.68), 0), timber);
      b.add(boxGeo(V(-0.62, 1.66, 3.6), V(0.1, 1.73, 3.68), 0), timber);
      for (const s of [-1, 1] as const) {
        const pan = new THREE.CylinderGeometry(0.09, 0.06, 0.07, 10);
        b.add(pan, lam("scalePan", () => ({ color: "#8f97a8" })), new THREE.Matrix4().makeTranslation(-0.26 + s * 0.3 + (s > 0 ? -0.04 : 0.06), 1.4, 3.64));
        b.add(beamBetween(V(-0.26 + s * 0.3, 1.68, 3.64), V(-0.26 + s * 0.3 + (s > 0 ? -0.04 : 0.06), 1.43, 3.64), 0.012), lam("scalePan", () => ({ color: "#8f97a8" })));
      }
      // price board leaning (eight times the coin) — blank chalk face
      b.add(boxGeo(V(0.95, 0, 2.6), V(1.45, 1.05, 2.68), 0), lam("chalkHD", () => ({ color: "#2e2e34" })));
      b.build(gStall);
      this.win(gStall, 678, 731);
      this.win(gStall, 1764, 1790);
      // the oats: six bulging sacks and a bushel basket
      const b2 = new Batch();
      const burlap = lam("burlapHD", () => ({ color: "#b99a5e" }));
      for (const [x, y, z, s] of [[-1.9, 0.32, 3.5, 0.34], [-1.25, 0.3, 3.45, 0.32], [-0.6, 0.31, 3.55, 0.33], [0.15, 0.3, 3.5, 0.31], [0.85, 0.32, 3.55, 0.34], [-1.55, 0.86, 3.6, 0.28], [-0.9, 0.85, 3.55, 0.27]] as const) {
        const sack = new THREE.SphereGeometry(1, 9, 8); sack.scale(s, s * 1.12, s * 0.82);
        b2.add(sack, burlap, new THREE.Matrix4().makeTranslation(x, y, z));
      }
      b2.add(new THREE.CylinderGeometry(0.3, 0.22, 0.42, 12, 1, true), lam("basketHD", () => ({ color: "#8a6a42", side: THREE.DoubleSide })), new THREE.Matrix4().makeTranslation(-0.25, 1.16, 3.62));
      b2.build(gOats);
      this.win(gOats, 678, 731);
    }
    // ---------------- the four refusals: Mannheim's signpost, and three cities that say no ----------------
    const mkQuad = (w: number, h: number, z: number) => quad(V(-11, 0, z), V(-11, h, z), V(9.5, h, z), V(9.5, 0, z));
    const mkBack = (mat: THREE.Material, h: number): THREE.Group => {
      const g = new THREE.Group(), b = new Batch();
      b.add(mkQuad(20.5, h, 15.2), mat);
      b.build(g);
      return g;
    };
    { // Mannheim 1817: a sign, a palm, no discussion
      const g = new THREE.Group(); const b = new Batch();
      b.add(boxGeo(V(1.82, 0, 4.28), V(1.98, 2.5, 4.44), 0), lam("signPost", () => ({ map: beam() })));
      b.add(boxGeo(V(1.28, 1.85, 4.22), V(2.52, 3.0, 4.3), 0), lam("signBoard", () => ({ map: signTex() })));
      b.build(g);
      this.win(g, 1515, 1563);
    }
    { // Milan 1818: the arcade
      const g = mkBack(lam("milanArcade", () => ({ map: arcadeTex() })), 8.6);
      const b = new Batch();
      for (let i = 0; i < 6; i++) b.add(boxGeo(V(-10.95 + i * 4.1, 0, 14.9), V(-10.3 + i * 4.1, 8.6, 15.35), 0), lam("milanPier", () => ({ color: "#b28a58" })));
      b.add(boxGeo(V(-11.3, 8.6, 14.7), V(9.8, 9.15, 15.5), 0), lam("milanCornice", () => ({ color: "#e5d3ac" })));
      b.build(g);
      this.win(g, 1563, 1584);
    }
    { // London 1819: the terrace says no
      const g = mkBack(lam("londonTerrace", () => ({ map: terraceTex() })), 9.0);
      const b = new Batch();
      for (const x of [-8.6, 0.4, 6.2]) b.add(boxGeo(V(x - 0.75, 9.0, 14.8), V(x + 0.75, 11.1, 15.6), 0), lam("londonChim", () => ({ map: rep(brick(), 1, 1) })));
      b.add(boxGeo(V(-11.3, 8.6, 14.7), V(9.8, 9.0, 15.5), 0), lam("londonParapet", () => ({ color: "#54483e" })));
      b.build(g);
      this.win(g, 1584, 1605);
    }
    { // New York 1824: cast iron and the water tower
      const g = mkBack(lam("nycIron", () => ({ map: ironTex() })), 9.2);
      const b = new Batch();
      const timber = lam("nycTower", () => ({ color: "#54432e" }));
      b.add(boxGeo(V(3.2, 9.2, 14.9), V(6.2, 9.6, 15.4), 0), timber);               // roof curb
      for (const [dx, dz] of [[-1.1, -0.18], [1.1, -0.18], [-1.1, 0.18], [1.1, 0.18]] as const)
        b.add(beamBetween(V(4.7 + dx * 1.15, 9.4, 15.15 + dz), V(4.7 + dx, 10.6, 15.15 + dz * 0.6), 0.09), timber); // legs
      b.add(new THREE.CylinderGeometry(1.35, 1.45, 2.5, 14), timber, new THREE.Matrix4().makeTranslation(4.7, 11.75, 15.15));
      b.add(new THREE.ConeGeometry(1.5, 1.15, 14), timber, new THREE.Matrix4().makeTranslation(4.7, 13.55, 15.15));
      b.build(g);
      this.win(g, 1605, 1627);
    }
    // ---------------- the modern road (asphalt runs only in the six-lane era) ----------------
    const gModern = new THREE.Group();
    {
      const b = new Batch();
      b.add(quadUp(-3.6, 3.6, -280, 6.5, 0.0095, 6), lam("asphaltHD", () => ({ color: "#3f3f46" })));
      b.add(quadUp(0.95, 2.15, -280, 6.5, 0.011, 6), lam("bikeLane", () => ({ color: "#2e6e46" })));   // the green lane
      b.add(quadUp(3.0, 3.18, -280, 6.5, 0.011, 6), lam("edgeLine", () => ({ color: "#d8d8d2" })));
      b.add(quadUp(-3.18, -3.0, -280, 6.5, 0.011, 6), lam("edgeLine2", () => ({ color: "#d8d8d2" })));
      b.build(gModern, false);
      // dashed centre line: small white quads every 8 m
      const b2 = new Batch();
      for (let z = -276; z < 6; z += 8) b2.add(quadUp(-0.09, 0.09, z, z + 3, 0.0115, 1), lam("dashHD", () => ({ color: "#e8e8e2" })));
      b2.build(gModern, false);
      this.win(gModern, 1845, 9e9);
    }
    // ---------------- one lost summer: a rose in the snow ----------------
    const gRose = new THREE.Group();
    {
      const snow = new THREE.MeshLambertMaterial({ color: "#eef1f6" });
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10).scale(1, 0.42, 1), twoTone(snow));
      mound.position.set(0, -0.05, 0.18); gRose.add(mound);
      const stemM = twoTone(new THREE.MeshLambertMaterial({ color: "#3f5a34" }));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.34, 6), stemM);
      stem.position.set(0.008, 0.17, 0.18); stem.rotation.z = 0.08; gRose.add(stem);
      const leaf1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6).scale(1.6, 0.28, 0.7), stemM);
      leaf1.position.set(0.085, 0.19, 0.18); leaf1.rotation.z = 0.45; gRose.add(leaf1);
      const leaf2 = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 6).scale(1.5, 0.28, 0.7), stemM);
      leaf2.position.set(-0.075, 0.13, 0.18); leaf2.rotation.z = -0.4; gRose.add(leaf2);
      // the bloom: two rings of petals around a tight core
      const petalOut = twoTone(new THREE.MeshLambertMaterial({ color: "#8e2c40" }));
      const petalIn = twoTone(new THREE.MeshLambertMaterial({ color: "#b84a5e" }));
      const core = twoTone(new THREE.MeshLambertMaterial({ color: "#5e1c2a" }));
      const cy = 0.375, cz = 0.18;
      const coreM = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 7), core); coreM.position.set(0.03, cy, cz); gRose.add(coreM);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6).scale(1.15, 0.62, 0.8), petalIn);
        p.position.set(0.03 + Math.cos(a) * 0.036, cy + Math.sin(a) * 0.036 * 0.6, cz + 0.004);
        p.rotation.z = a; gRose.add(p);
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.45;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.034, 7, 6).scale(1.3, 0.55, 0.75), petalOut);
        p.position.set(0.03 + Math.cos(a) * 0.052, cy + Math.sin(a) * 0.052 * 0.62, cz - 0.006);
        p.rotation.z = a; gRose.add(p);
      }
      this.win(gRose, 2142, 2172);
    }
    // ---------------- Tambora itself (CRATER anchor): cone, apron, the column, the parasol ----------------
    {
      const b = new Batch();
      const basalt = twoTone(new THREE.MeshLambertMaterial({ color: "#453c38" }), 0.35);
      // cone: dark basalt, steep; open cylinder so the crater reads from above
      const coneGeo = new THREE.CylinderGeometry(13, 82, 96, 44, 1, true);
      const cone = new THREE.Mesh(coneGeo, basalt);
      cone.position.set(CRATER[0], 48, CRATER[2]); cone.castShadow = true; cone.receiveShadow = true;
      this.root.add(cone);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(12.4, 2.4, 8, 30), basalt);
      rim.rotation.x = Math.PI / 2; rim.position.set(CRATER[0], 96.2, CRATER[2]); this.root.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(12.0, 26), new THREE.MeshBasicMaterial({ color: "#1a130f" }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(CRATER[0], 93.6, CRATER[2]); this.root.add(floor);
      // the ash apron: a vast dark disc, and scorched trunks around its edge
      const apron = new THREE.Mesh(new THREE.CircleGeometry(200, 40), new THREE.MeshLambertMaterial({ color: "#473d33" }));
      apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.016, CRATER[2]); apron.receiveShadow = true; this.root.add(apron);
      const trunkM = lam("trunkHD", () => ({ color: "#2a2320" }));
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * Math.PI * 2 + 0.4;
        if (Math.sin(a) > 0.62) continue; // keep the camera lane clear
        const d = 62 + ((i * 37) % 66), h = 2.2 + ((i * 53) % 30) / 9;
        b.add(new THREE.CylinderGeometry(0.15, 0.32, h, 5), trunkM, new THREE.Matrix4().makeTranslation(Math.cos(a) * d, h / 2, CRATER[2] + Math.sin(a) * d)
          .multiply(new THREE.Matrix4().makeRotationZ(((i * 29) % 7 - 3) * 0.05)));
      }
      // lava cracks, lit only during the lightning beats
      const lavaM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.95, 0.18), fog: false });
      for (let i = 0; i < 3; i++) {
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(2.0 + i * 1.1, 0.66), lavaM);
        crack.rotation.x = -Math.PI / 2; crack.rotation.z = i * 1.15 + 0.3;
        crack.position.set(CRATER[0] + (i - 1) * 5.4, 93.8 + i * 0.12, CRATER[2] + (i % 2) * 4.6 - 2.3);
        crack.visible = false; this.lava.push(crack); this.root.add(crack);
      }
      b.build(this.root);
      // the column: 15 billowing sprites climbing from the crater (billboards; tinted per light in update)
      const sm = smokeTex();
      for (let i = 0; i < 15; i++) {
        const mat = new THREE.SpriteMaterial({ map: sm, transparent: true, depthWrite: false, color: "#5f584f" });
        const m = new THREE.Sprite(mat);
        m.layers.set(NOINK); m.frustumCulled = false;
        this.column.push({ m, mat, k: i / 15 });
        this.root.add(m);
      }
      // the parasol: a veil hung in the stratosphere (the gag the whole film is named for)
      const par = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: parasolTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      par.position.set(0, 210, CRATER[2]); par.layers.set(NOINK); par.frustumCulled = false; par.visible = false; par.renderOrder = 3;
      this.parasol = par; this.root.add(par);
      // crater glow (additive)
      const glowTex = ctex("craterGlow", 128, 128, (g2) => { const gr = g2.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, "rgba(255,200,95,1)"); gr.addColorStop(0.4, "rgba(255,120,35,0.72)"); gr.addColorStop(1, "rgba(255,80,20,0)"); g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128); });
      this.craterGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.craterGlow.position.set(CRATER[0], 97.8, CRATER[2]); this.craterGlow.scale.setScalar(11); this.craterGlow.layers.set(NOINK); this.craterGlow.frustumCulled = false;
      this.root.add(this.craterGlow);
      // the devastated Sumbawa village, drowned under the ash (the aerial reads it)
      const dv = new Batch();
      const dvM = lam("dvHD", () => ({ color: "#37302a" }));
      const r0 = (i: number) => { const v = Math.sin(i * 127.1 + 74.7) * 43758.5453; return v - Math.floor(v); };
      for (let i = 0; i < 8; i++) {
        const hx = -42 + i * 12 + r0(i * 3) * 5, hz = CRATER[2] - 52 - r0(i * 3 + 1) * 34, hw = 3 + r0(i * 3 + 2) * 3.2, h = 2.1 + r0(i * 7) * 1.7;
        dv.add(boxGeo(V(hx - hw / 2, 0, hz - hw * 0.4), V(hx + hw / 2, h, hz + hw * 0.4), 0), dvM);
        dv.add(boxGeo(V(hx - 0.3, h, hz - 0.3), V(hx + 0.3, h + 1.3, hz + 0.3), 0), dvM);
      }
      dv.build(this.root);
    }
    // ---------------- snow & ash: two point storms, each windowed ----------------
    {
      const dot = softDotTex();
      const mk = (n: number, size: number, col: string, op: number, yMax: number, seed: number) => {
        const base = new Float32Array(n * 3);
        const r0 = (i: number) => { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
        for (let i = 0; i < n; i++) { base[i * 3] = (r0(i * 3) - 0.5) * 52; base[i * 3 + 1] = r0(i * 3 + 1) * yMax; base[i * 3 + 2] = (r0(i * 3 + 2) - 0.5) * 60 + 6; }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
        const p = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: dot, transparent: true, opacity: op, depthWrite: false, color: col, sizeAttenuation: true }));
        p.frustumCulled = false; p.layers.set(NOINK);
        this.root.add(p);
        return { p, base };
      };
      const s = mk(380, 0.075, "#ffffff", 0.92, 15, 3); this.snowPts = s.p; this.snowBase = s.base;
      const a = mk(260, 0.06, "#6e675c", 0.8, 20, 11); this.ashPts = a.p; this.ashBase = a.base;
    }
    // ---------------- near-lens foreground framing (kit GLBs, windowed) ----------------
    for (const fg of FOREGROUND) {
      const o = kitClone(kit, fg.kit, fg.s ?? 1);
      if (!o) continue;
      o.position.set(fg.pos[0], fg.pos[1], fg.pos[2]);
      if (fg.yaw) o.rotation.y = fg.yaw;
      o.visible = false;
      this.root.add(o);
      this.fgs.push({ o, a: fg.a, b: fg.b });
    }
  }

  /** register a time-windowed set (frames); multiple windows per set are OK */
  private win(g: THREE.Object3D, a: number, b: number) { this.root.add(g); this.setWins.push({ g, a, b }); }

  /** per-frame: fog/sky/lights/uniforms, set windows, particles, the column, cast sync; returns the look point */
  update(id: number, f: number, camera: THREE.PerspectiveCamera, scene: THREE.Scene): THREE.Vector3 {
    const t = f / FPS;
    const def = SHOTS[id - 1];
    const preset: LightPreset = LIGHTS[def.light];
    const look = this.target.set(0, 0, 0);
    const c = camAt(id, f);
    look.set(c.look[0], c.look[1], c.look[2]);
    // ---- camera: position, fov, roll ----
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    camera.fov = c.fov; camera.near = 0.2; camera.far = 1600;
    const fwd = this.v.set(look.x - c.pos[0], look.y - c.pos[1], look.z - c.pos[2]).normalize();
    camera.up.set(0, 1, 0).applyAxisAngle(fwd, c.roll);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    // ---- the sun (camera-relative az/el, per-shot overrides) ----
    const ov = SUN_SHOT[id];
    const az = rad(ov?.az ?? preset.az), el = rad(ov?.el ?? preset.el);
    const right = this.v2.set(0, 0, 0).crossVectors(fwd, UP).normalize();
    const fwdXZ = this.v3.set(fwd.x, 0, fwd.z).normalize();
    const sunDir = new THREE.Vector3().addScaledVector(fwdXZ, Math.cos(el) * Math.cos(az)).addScaledVector(right, Math.cos(el) * Math.sin(az)).addScaledVector(UP, Math.sin(el)).normalize();
    this.sun.position.copy(look).addScaledVector(sunDir, 150);
    this.sun.target.position.copy(look);
    this.sun.target.updateMatrixWorld();
    this.sun.color.set(preset.sunCol); this.sun.intensity = preset.sunI;
    this.sun.shadow.bias = preset.bias; this.sun.shadow.normalBias = preset.normalBias;
    this.hemi.color.set(preset.sky); this.hemi.groundColor.set(preset.ground); this.hemi.intensity = preset.hemiI;
    this.fill.color.set("#9fb8ff"); this.fill.intensity = 0.22;
    this.fill.position.copy(look).addScaledVector(right, -60).addScaledVector(UP, 55).addScaledVector(fwd, -40);
    this.fill.target.position.copy(look); this.fill.target.updateMatrixWorld();
    // ---- world two-tone + card character uniforms ----
    TONE.uLitCol.value.set(preset.lit[0], preset.lit[1], preset.lit[2]);
    TONE.uShadeCol.value.set(preset.shade[0], preset.shade[1], preset.shade[2]);
    TONE.uShadeLift.value.set(preset.lift[0], preset.lift[1], preset.lift[2]);
    TONE.uLambert.value = preset.lambert; TONE.uSideK.value = preset.sideK; TONE.uTerm.value = preset.term;
    TONE.uBounce.value.set(LOOK[def.light].bounce[0], LOOK[def.light].bounce[1], LOOK[def.light].bounce[2]);
    TONE.uSat.value = LOOK[def.light].sat;
    CHAR.uCharTint.value.set(preset.charTint[0], preset.charTint[1], preset.charTint[2]);
    CHAR.uCharShade.value = preset.charShade; CHAR.uGrad.value = preset.charGrad; CHAR.uBodyGrad.value = preset.bodyGrad;
    CHAR.uSideTint.value.set(preset.sideTint[0], preset.sideTint[1], preset.sideTint[2]);
    // ---- sky dome + fog (linear, pre-inverted from the Neutral TMO) ----
    const lc = this.lc.get(def.light)!;
    (this.skyMat.uniforms.c0.value as THREE.Color).copy(lc.sky[0]);
    (this.skyMat.uniforms.c1.value as THREE.Color).copy(lc.sky[1]);
    (this.skyMat.uniforms.c2.value as THREE.Color).copy(lc.sky[2]);
    (this.skyMat.uniforms.c3.value as THREE.Color).copy(lc.sky[3]);
    (this.skyMat.uniforms.c4.value as THREE.Color).copy(lc.sky[4]);
    this.sky.position.copy(camera.position);
    this.fog.color.copy(lc.fog); this.fog.near = preset.fogNear; this.fog.far = preset.fogFar;
    scene.fog = this.fog;
    // ---- clouds (swap palette only on light change) ----
    if (this.cloudLight !== def.light) {
      this.cloudLight = def.light;
      for (let i = 0; i < this.cloudMeshes.length; i++) {
        const m = this.cloudMeshes[i].material as THREE.MeshBasicMaterial;
        m.map = this.cloudMaps[def.light][i % 4];
        m.needsUpdate = true;
      }
    }
    for (const m of this.cloudMeshes) m.lookAt(camera.position);
    // ---- the sun disc + halo (hidden by day, low blood disc in the ash, blazing at golden hour) ----
    const sunPos = this.v2.copy(camera.position).addScaledVector(sunDir, 820);
    this.sunDisc.position.copy(sunPos); this.sunHalo.position.copy(sunPos);
    if (def.light === "day") { this.sunDisc.visible = false; this.sunHalo.visible = false; }
    else if (def.light === "golden") {
      this.sunDisc.visible = true; this.sunHalo.visible = true;
      this.sunDisc.material.color.set(new THREE.Color(9.0, 5.2, 1.8)); this.sunDisc.scale.setScalar(150);
      this.sunHalo.material.color.set(new THREE.Color(1.15, 0.82, 0.42)); this.sunHalo.scale.setScalar(560);
    } else {
      this.sunDisc.visible = true; this.sunHalo.visible = false;
      this.sunDisc.material.color.set(untone("#e2552e").multiplyScalar(2.6)); this.sunDisc.scale.setScalar(120);
    }
    // ---- water ----
    this.WU.wNearC.value.set(lc.wNear); this.WU.wMidC.value.set(lc.wMid); this.WU.wFarC.value.set(lc.wFar);
    this.WU.wCrest.value.set(lc.wCrest); this.WU.wTrough.value.set(lc.wTrough); this.WU.wGlint.value.set(lc.wGlint);
    (this.WU.wShade.value as THREE.Vector3).set(LOOK[def.light].water.shade[0], LOOK[def.light].water.shade[1], LOOK[def.light].water.shade[2]);
    this.WU.wTime.value = t;
    // ---- windowed sets ----
    const wins = this.setWins;
    for (const { g, a, b } of wins) {
      const want = f >= a && f < b;
      if (g.visible !== want) g.visible = want;
    }
    // a group with two windows (summer) — recompute as any-of
    const twice = new Set<THREE.Object3D>();
    for (const w of wins) if (wins.some((o) => o !== w && o.g === w.g)) twice.add(w.g);
    for (const g of twice) g.visible = wins.some((w) => w.g === g && f >= w.a && f < w.b);
    for (const fg of this.fgs) fg.o.visible = f >= fg.a && f < fg.b;
    // ---- the column: puffs climb, widen, thin; tinted by the light ----
    const colTint = def.light === "golden" ? "#6a5648" : def.light === "ash" ? "#45413e" : "#5f584f";
    for (const { m, mat, k } of this.column) {
      const h = (t * 12.5 + k * 330 + 8) % 330;
      const wob = Math.sin(h * 0.045 + k * 9.1) * (6 + h * 0.045);
      const wob2 = Math.cos(h * 0.038 + k * 5.3) * (5 + h * 0.05);
      m.position.set(CRATER[0] + wob, CRATER[1] + h - 4, CRATER[2] + wob2);
      const s = 13 + h * 0.115;
      m.scale.set(s, s * 0.86, 1);
      const birth = clamp01(h / 14);
      mat.opacity = 0.82 * Math.pow(1 - h / 330, 1.35) * birth;
      mat.color.set(colTint);
    }
    // ---- the crater glow + the lightning beats (eruptions at f≈147 and f≈2133) ----
    const env = Math.max(0, 1 - Math.abs(f - 152) / 26) + Math.max(0, 1 - Math.abs(f - 2133) / 24);
    this.craterGlow.material.opacity = clamp01(0.52 + 0.07 * Math.sin(t * 2.1) + env * 0.75);
    this.craterGlow.scale.setScalar(10.5 + env * 9 + 0.6 * Math.sin(t * 3.7));
    this.craterGlow.position.set(CRATER[0], 97.8, CRATER[2]);
    const lavaOn = f >= 138 && f < 186 || f >= 2110 && f < 2144;
    for (const l of this.lava) l.visible = lavaOn;
    // ---- the parasol: it rises during the gag, then hangs forever ----
    const pvis = (f >= 1627 && f < 1707) || f >= 2088;
    this.parasol.visible = pvis;
    if (pvis) {
      if (f < 1707) {
        const u = smooth((f - 1627) / 58);
        this.parasol.position.set(0, 97 + u * 118, CRATER[2]);
        this.parasol.scale.set(46 + u * 78, 31 + u * 52, 1);
      } else {
        this.parasol.position.set(0, 214 + Math.sin(t * 0.23) * 3.2, CRATER[2]);
        this.parasol.scale.set(172, 113, 1);
      }
      this.parasol.lookAt(this.parasol.position.x + fwd.x, this.parasol.position.y, this.parasol.position.z + fwd.z);
      this.parasol.rotation.z += 0.05 * Math.sin(t * 0.31);
    }
    // ---- the hearth flames + fire glow (S7 only) ----
    if (this.fireGlow) {
      const on = f >= 616 && f < 678;
      this.fireGlow.visible = on;
      for (const fl of this.flames) fl.visible = on;
      if (on) {
        this.fireGlow.material.opacity = 0.72 + 0.2 * Math.sin(t * 9.2) + 0.09 * Math.sin(t * 23.7 + 1.2);
        this.fireGlow.scale.setScalar(2.15 + 0.35 * Math.sin(t * 11.3 + 0.6));
        this.flames.forEach((fl, i) => {
          fl.scale.y = 1 + 0.22 * Math.sin(t * 10.5 + i * 2.2) + 0.1 * Math.sin(t * 27 + i);
          fl.scale.x = 1 + 0.1 * Math.sin(t * 17 + i * 1.7);
          fl.position.y = 0.42 + (i === 1 ? 0.06 : 0) + 0.03 * Math.sin(t * 13 + i);
        });
      }
    }
    // ---- the Diodati candle (S9 only) ----
    if (this.candleGlow) {
      const on = f >= 731 && f < 883;
      this.candleGlow.visible = on;
      if (on) {
        this.candleGlow.material.opacity = 0.68 + 0.2 * Math.sin(t * 3.1) + 0.08 * Math.sin(t * 13.7 + 2.1);
        this.candleGlow.scale.setScalar(1.55 + 0.22 * Math.sin(t * 4.3 + 0.8));
      }
    }
    // ---- snow & ash storms ----
    const snowOn = f >= 462 && f < 731 || f >= 2142 && f < 2172;
    this.snowPts.visible = snowOn;
    if (snowOn) this.updateStorm(this.snowPts, this.snowBase, t, 1.55, 0.5);
    const ashOn = f >= 315 && f < 462 || f >= 1707 && f < 1790 || f >= 2115 && f < 2142;
    this.ashPts.visible = ashOn;
    if (ashOn) this.updateStorm(this.ashPts, this.ashBase, t, 0.72, 1.5);
    // ---- the cast ----
    this.syncCast(id, f, camera.position, right, sunDir, preset);
    return look;
  }

  private updateStorm(p: THREE.Points, base: Float32Array, t: number, fall: number, sway: number) {
    const pos = p.geometry.attributes.position as THREE.BufferAttribute;
    const n = pos.count, H = 17;
    for (let i = 0; i < n; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      const y = by - t * fall;
      pos.setXYZ(i, bx + Math.sin(t * 0.9 + i * 1.7) * sway, ((y % H) + H) % H + 0.15, bz + Math.cos(t * 0.7 + i * 2.3) * sway * 0.6);
    }
    pos.needsUpdate = true;
  }
  /** pose the card cast: request canvases, reuse actor meshes, bind textures, billboard */
  private syncCast(id: number, f: number, camPos: THREE.Vector3, right: THREE.Vector3, sunDir: THREE.Vector3, preset: LightPreset) {
    const t = f / FPS;
    const camInfo: CamInfo = { pos: camPos.clone(), right: right.clone(), sun: sunDir.clone() };
    const { places, fx } = stage(id, t, camInfo);
    const preq = places.map((p) => { const s = p.size ?? [600, 800, 1.8]; return this.pool.req(p.key, s[0], s[1], s[2], p.draw); });
    const freq = fx.map((p) => this.pool.req(p.key, p.cw, p.ch, 1, p.draw));
    this.pool.flush();
    // hide everything first
    for (const a of this.actors) a.mesh.visible = false;
    for (const k of ["ride", "modern", "farthing", "horse"] as SpecKind[]) for (const a of this.spec[k]) a.mesh.visible = false;
    for (const x of this.fxs) x.mesh.visible = false;
    const billboard = (x: number, z: number) => Math.atan2(camPos.x - x, camPos.z - z);
    let pi = 0, fi = 0;
    const specIdx: Record<SpecKind, number> = { ride: 0, modern: 0, farthing: 0, horse: 0 };
    places.forEach((p, idx) => {
      const kind = p.geo;
      const geoIsSpec = !!kind && kind !== "body" && kind !== "swing";
      let actor: Actor;
      if (geoIsSpec) {
        const k = kind as SpecKind;
        const arr = this.spec[k];
        const i = specIdx[k]++;
        while (arr.length <= i) arr.push(new Actor(this.root, SPEC_GEO[k]));
        actor = arr[i];
      } else {
        while (this.actors.length <= pi) this.actors.push(new Actor(this.root));
        actor = this.actors[pi++];
      }
      actor.r = preq[idx];
      actor.bind();
      const m = actor.mesh;
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      m.rotation.set(0, billboard(p.x, p.z) + (p.mirror ? Math.PI : 0) + (p.yaw ?? 0), p.roll ?? 0);
      const sc = p.scale ?? 1;
      m.scale.setScalar(sc);
      m.castShadow = preset.actorShadow;
    });
    fx.forEach((p, idx) => {
      while (this.fxs.length <= fi) this.fxs.push(new Fx(this.root));
      const e = this.fxs[fi++];
      e.r = freq[idx];
      e.use(!!p.soft);
      e.bind();
      const m = e.mesh;
      m.visible = true;
      m.position.set(p.x, p.y, p.z);
      if (p.flat) {
        m.rotation.set(-Math.PI / 2, 0, 0);
        m.rotation.order = "YXZ";
        m.rotation.y = p.rot ?? 0;
      } else {
        m.rotation.set(0, billboard(p.x, p.z), p.rot ?? 0);
      }
      m.scale.set(p.w, p.h, 1);
    });
  }
}
