// Raw three.js post chain for the Tambora short.
// Why this exists: the @react-three/postprocessing composer renders nothing in this project's headless
// SwiftShader (consistently transparent output across effect sets / MSAA / buffer formats), while three's own
// examples/jsm passes work. Same pass order as before: InkPass -> thin-lens DOF (pre, main) ->
// UnrealBloom (emissive threshold >= 1) -> OutputPass (renderer.toneMapping = Neutral, sRGB encode) ->
// GradePass (display-referred) -> [GrainPass]. Intermediate buffers are linear HalfFloat.
// Depth for the DOF/ink "characters in front" tests comes from one DepthTexture shared by both composer
// buffers (the postprocessing library's stable-depth-texture pattern); MSAA is forced off while ink needs it.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { InkPass } from "./ink";
import { GRADES, GRADE_STRENGTH, monoTangents, tintRGB, type GradeParams } from "./grade";

export type PostOn = {
  ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean;
  ms: number; fbt: "half" | "byte"; inkDebug: number;
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** one lens-blur stage (identical math to lensblur.ts's LensBlurEffect, adapted to raw ShaderPass) */
const lensFrag = (taps: number, spread: number, nearTaps: number, rot: number) => /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float focus;
uniform float cInf;
uniform float nearScale;
uniform float maxCoC;
uniform float cNear;
uniform float cFar;
uniform vec2 uResolution;
uniform vec2 uTexel;
varying vec2 vUv;
#define GOLDEN 2.39996323
#define TAPS ${taps}
#define SPREAD ${spread.toFixed(4)}
#define NEAR_TAPS ${nearTaps}
#define ROT ${rot.toFixed(4)}

float cocAt(float d, float s) {               // signed CoC radius in output px
  float c = cInf * s * (1.0 - focus / max(d, 1e-3));
  if (c < 0.0) c *= nearScale;
  return clamp(c, -maxCoC * s, maxCoC * s);
}
float distAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cNear, cFar); }

void main() {
  vec2 uv = vUv;
  vec4 inputColor = texture2D(tDiffuse, uv);
  if (cInf < 0.25) { gl_FragColor = inputColor; return; }
  float s = uResolution.y / 1920.0;          // output px per 1080x1920 px
  float d0 = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cNear, cFar);
  float r0 = abs(cocAt(d0, s));
  float R = r0 * SPREAD;
  vec3 acc = inputColor.rgb; float wsum = 1.0;
  if (R > 0.5) {
    for (int i = 0; i < TAPS; i++) {
      float rr = sqrt((float(i) + 0.5) / float(TAPS)) * R;
      float a = float(i) * GOLDEN + ROT;
      vec2 suv = uv + vec2(cos(a), sin(a)) * rr * uTexel;
      float ds = distAt(suv);
      float rs = abs(cocAt(ds, s)) * SPREAD;
      if (ds > d0) rs = min(rs, R);          // background never bleeds over a nearer pixel
      float w = clamp(rs - rr + 0.5, 0.0, 1.0); // does the sample's disc reach us?
      acc += texture2D(tDiffuse, suv).rgb * w; wsum += w;
    }
  }
  vec3 col = acc / wsum;
#if NEAR_TAPS > 0
  float M = maxCoC * s;
  vec3 fg = vec3(0.0); float fw = 0.0, cov = 0.0;
  for (int i = 0; i < NEAR_TAPS; i++) {
    float rr = sqrt((float(i) + 0.5) / float(NEAR_TAPS)) * M;
    if (rr <= R) continue;                   // already covered by the disc gather
    float a = float(i) * GOLDEN + 1.0;
    vec2 suv = uv + vec2(cos(a), sin(a)) * rr * uTexel;
    float ds = distAt(suv);
    if (ds >= d0 * 0.97) continue;           // only things in front of us
    float rs = abs(cocAt(ds, s));
    float w = clamp(rs - rr + 0.5, 0.0, 1.0);
    fg += texture2D(tDiffuse, suv).rgb * w; fw += w;
    cov += w * (M * M) / max(rs * rs, 1.0);
  }
  if (fw > 0.0) col = mix(col, fg / fw, clamp(cov / float(NEAR_TAPS), 0.0, 1.0));
#endif
  gl_FragColor = vec4(col, inputColor.a);
}`;

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float gradeKy[7];
uniform float gradeKm[7];
uniform vec3 gradeSat;
uniform vec3 gradeTintS;
uniform vec3 gradeTintM;
uniform vec3 gradeTintH;
uniform vec2 gradeVig;
uniform float gradeAmount;
varying vec2 vUv;

vec3 gradeEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 gradeDecode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float gradeHermite(float v, float x0, float x1, float y0, float y1, float m0, float m1) {
  float h = x1 - x0, t = (v - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * y0 + (t3 - 2.0 * t2 + t) * h * m0 + (-2.0 * t3 + 3.0 * t2) * y1 + (t3 - t2) * h * m1;
}
float gradeCurve(float v) {
  v = clamp(v, 0.0, 1.0);
  if (v < 0.1)  return gradeHermite(v, 0.0, 0.1, gradeKy[0], gradeKy[1], gradeKm[0], gradeKm[1]);
  if (v < 0.25) return gradeHermite(v, 0.1, 0.25, gradeKy[1], gradeKy[2], gradeKm[1], gradeKm[2]);
  if (v < 0.5)  return gradeHermite(v, 0.25, 0.5, gradeKy[2], gradeKy[3], gradeKm[2], gradeKm[3]);
  if (v < 0.75) return gradeHermite(v, 0.5, 0.75, gradeKy[3], gradeKy[4], gradeKm[3], gradeKm[4]);
  if (v < 0.9)  return gradeHermite(v, 0.75, 0.9, gradeKy[4], gradeKy[5], gradeKm[4], gradeKm[5]);
  return gradeHermite(v, 0.9, 1.0, gradeKy[5], gradeKy[6], gradeKm[5], gradeKm[6]);
}

void main() {
  vec2 uv = vUv;
  vec4 inputColor = texture2D(tDiffuse, uv);
  vec3 src = gradeEncode(inputColor.rgb);
  vec3 c = vec3(gradeCurve(src.r), gradeCurve(src.g), gradeCurve(src.b));
  const vec3 W = vec3(0.2126, 0.7152, 0.0722);
  float y = dot(c, W);
  float wS = 1.0 - smoothstep(0.0, 0.55, y);
  float wH = smoothstep(0.45, 1.0, y);
  float wM = 1.0 - wS - wH;
  float s = gradeSat.y + (gradeSat.x - gradeSat.y) * wS + (gradeSat.z - gradeSat.y) * wH;
  c = vec3(y) + s * (c - vec3(y));
  c += wS * gradeTintS + wM * gradeTintM + wH * gradeTintH;
  vec2 p = uv * 2.0 - 1.0;
  float r = length(p) * 0.70710678;
  c *= 1.0 - gradeVig.x * smoothstep(gradeVig.y, 1.0, r);
  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(gradeDecode(mix(src, c, gradeAmount)), inputColor.a);
}`;

const GRAIN_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float seed;
uniform float amount;
uniform float cellPx;
uniform vec2 uResolution;
varying vec2 vUv;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float h3(ivec2 c, uint k) { return float(pcg(uint(c.x) + pcg(uint(c.y) + pcg(k)))) * (1.0 / 4294967295.0) - 0.5; }
void main() {
  vec2 uv = vUv;
  vec4 inputColor = texture2D(tDiffuse, uv);
  vec2 p = uv * uResolution / (cellPx * uResolution.y / 1920.0);
  ivec2 i = ivec2(floor(p)); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  uint k = uint(seed + 0.5) * 2654435761u + 1013904223u;
  float n = mix(mix(h3(i, k), h3(i + ivec2(1, 0), k), f.x), mix(h3(i + ivec2(0, 1), k), h3(i + ivec2(1, 1), k), f.x), f.y);
  vec3 g = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  float w = 0.25 + 0.75 * clamp(4.0 * l * (1.0 - l), 0.0, 1.0);
  g = max(g + n * (amount / 0.2145) * w, 0.0);
  gl_FragColor = vec4(pow(g, vec3(2.2)), inputColor.a);
}`;

export class RawLens {
  private pre: ShaderPass; private main: ShaderPass;
  constructor(maxCoC: number, nearScale: number, withPre: boolean) {
    this.pre = RawLens.mk(16, 0.287, 0, 0.61, maxCoC, nearScale);
    this.main = RawLens.mk(64, 0.958, 32, 0, maxCoC, nearScale);
    this.withPre = withPre;
  }
  readonly withPre: boolean;
  private static mk(taps: number, spread: number, nearTaps: number, rot: number, maxCoC: number, nearScale: number) {
    return new ShaderPass(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: lensFrag(taps, spread, nearTaps, rot),
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, focus: { value: 10 }, cInf: { value: 0 },
        nearScale: { value: nearScale }, maxCoC: { value: maxCoC }, cNear: { value: 0.2 }, cFar: { value: 1500 },
        uResolution: { value: new THREE.Vector2(1080, 1920) }, uTexel: { value: new THREE.Vector2(1 / 1080, 1 / 1920) },
      },
      depthTest: false, depthWrite: false,
    }));
  }
  setDepth(t: THREE.Texture) { this.pre.material.uniforms.tDepth.value = t; this.main.material.uniforms.tDepth.value = t; }
  setNearFar(n: number, f: number) { this.pre.material.uniforms.cNear.value = n; this.main.material.uniforms.cNear.value = n; this.pre.material.uniforms.cFar.value = f; this.main.material.uniforms.cFar.value = f; }
  setSize(w: number, h: number) {
    for (const m of [this.pre.material, this.main.material]) {
      (m.uniforms.uResolution.value as THREE.Vector2).set(w, h);
      (m.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
    }
  }
  set focus(v: number) { this.pre.material.uniforms.focus.value = v; this.main.material.uniforms.focus.value = v; }
  get focus() { return this.main.material.uniforms.focus.value as number; }
  set cInf(v: number) { this.pre.material.uniforms.cInf.value = v; this.main.material.uniforms.cInf.value = v; }
  get cInf() { return this.main.material.uniforms.cInf.value as number; }
  get prePass() { return this.pre; }
  get mainPass() { return this.main; }
  dispose() { this.pre.material.dispose(); this.main.material.dispose(); }
}

export class RawGrade {
  readonly pass: ShaderPass;
  private _light?: string;
  private _amount = 1;
  constructor(p: GradeParams, amount = 1) {
    this.pass = new ShaderPass(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GRADE_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        gradeKy: { value: p.ky.slice() }, gradeKm: { value: monoTangents(p.ky) },
        gradeSat: { value: new THREE.Vector3(...p.sat) },
        gradeTintS: { value: tintRGB(...p.tintS) }, gradeTintM: { value: tintRGB(...p.tintM) }, gradeTintH: { value: tintRGB(...p.tintH) },
        gradeVig: { value: new THREE.Vector2(...p.vig) }, gradeAmount: { value: amount },
      },
      depthTest: false, depthWrite: false,
    }));
    this._amount = amount;
  }
  set(p: GradeParams) {
    const u = this.pass.material.uniforms;
    u.gradeKy.value = p.ky.slice();
    u.gradeKm.value = monoTangents(p.ky);
    (u.gradeSat.value as THREE.Vector3).set(...p.sat);
    u.gradeTintS.value = tintRGB(...p.tintS);
    u.gradeTintM.value = tintRGB(...p.tintM);
    u.gradeTintH.value = tintRGB(...p.tintH);
    (u.gradeVig.value as THREE.Vector2).set(...p.vig);
  }
  /** apply the preset of a light (only touches uniforms when the light changes) + the per-light strength */
  setLight(light: "day" | "golden" | "ash") {
    if (this._light !== light) { this.set(GRADES[light]); this._light = light; }
    this.amount = GRADE_STRENGTH[light];
  }
  get amount() { return this._amount; }
  set amount(v: number) { this._amount = v; this.pass.material.uniforms.gradeAmount.value = v; }
  dispose() { this.pass.material.dispose(); }
}

export class RawGrain {
  readonly pass: ShaderPass;
  constructor({ amount = 0.025, cellPx = 1.5 } = {}) {
    this.pass = new ShaderPass(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: GRAIN_FRAG,
      uniforms: { tDiffuse: { value: null }, seed: { value: 0 }, amount: { value: amount }, cellPx: { value: cellPx }, uResolution: { value: new THREE.Vector2(1080, 1920) } },
      depthTest: false, depthWrite: false,
    }));
  }
  set seed(v: number) { this.pass.material.uniforms.seed.value = v; }
  setSize(w: number, h: number) { (this.pass.material.uniforms.uResolution.value as THREE.Vector2).set(w, h); }
  dispose() { this.pass.material.dispose(); }
}

/** detaches the shared DepthTexture from both composer buffers (run right after the RenderPass):
 *  the buffers fall back to a private renderbuffer depth, and the texture becomes a free-floating
 *  sampler for the ink/DOF passes — otherwise each buffer's depth attachment IS the texture being
 *  sampled while drawing into it (WebGL feedback loop, draws silently dropped). */

/** runs first each frame: the RenderPass renders into readBuffer, so readBuffer carries the shared
 *  DepthTexture this frame; the OTHER buffer must not (lens/ink sample the texture while drawing
 *  into their targets — an attachment of the same texture would be a WebGL feedback loop). */
class DepthAttachPass extends Pass {
  constructor(private depthTex: THREE.DepthTexture) { super(); this.needsSwap = false; }
  override render(_renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    readBuffer.depthTexture = this.depthTex;
    if (writeBuffer.depthTexture) writeBuffer.depthTexture = null;
  }
}

class DepthDetachPass extends Pass {
  constructor(private rt1: THREE.WebGLRenderTarget, private rt2: THREE.WebGLRenderTarget) { super(); this.needsSwap = false; }
  override render(_renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget) {
    if (this.rt1.depthTexture) this.rt1.depthTexture = null;
    if (this.rt2.depthTexture) this.rt2.depthTexture = null;
  }
}

export type RawPost = {
  composer: EffectComposer;
  ink: InkPass | null;
  lens: RawLens | null;
  grade: RawGrade | null;
  grain: RawGrain | null;
  depthTex: THREE.DepthTexture;
  dispose(): void;
};

export function buildPostWithRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, on: PostOn): RawPost {
  // NeutralToneMapping lives on the renderer; OutputPass picks it up at render time (plus the sRGB encode).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const dbs = renderer.getDrawingBufferSize(new THREE.Vector2());
  // while ink is on it needs the shared depth texture -> force single sampling (WebGL2 depth textures are single-sample)
  const samples = on.ink ? 0 : on.ms;
  const depthTex = new THREE.DepthTexture(dbs.x, dbs.y, THREE.UnsignedIntType);
  depthTex.name = "mainDepth";
  const rt = new THREE.WebGLRenderTarget(dbs.x, dbs.y, {
    type: on.fbt === "byte" ? THREE.UnsignedByteType : THREE.HalfFloatType,
    samples, generateMipmaps: false,
  });
  rt.texture.name = "composer.rt";
  const composer = new EffectComposer(renderer, rt);
  composer.setSize(dbs.x, dbs.y);

  const needsDepth = on.ink || on.lens;
  if (needsDepth) composer.addPass(new DepthAttachPass(depthTex));
  composer.addPass(new RenderPass(scene, camera));
  if (needsDepth) composer.addPass(new DepthDetachPass(composer.renderTarget1, composer.renderTarget2));

  let ink: InkPass | null = null;
  if (on.ink) {
    ink = new InkPass(scene, camera);
    ink.setDepthTexture(depthTex);
    ink.debug = on.inkDebug | 0;
    composer.addPass(ink);
  }

  let lens: RawLens | null = null;
  if (on.lens) {
    lens = new RawLens(24, 1.2, on.pre);
    lens.setDepth(depthTex);
    lens.setNearFar(camera.near, camera.far);
    lens.setSize(dbs.x, dbs.y);
    if (on.pre) composer.addPass(lens.prePass);
    composer.addPass(lens.mainPass);
  }

  if (on.bloom) {
    const bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, dbs.x >> 1), Math.max(1, dbs.y >> 1)), 0.55, 0.6, 1.0);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());

  let grade: RawGrade | null = null;
  if (on.grade) { grade = new RawGrade(GRADES.day, GRADE_STRENGTH.day); composer.addPass(grade.pass); }

  let grain: RawGrain | null = null;
  if (on.grain) { grain = new RawGrain({ amount: 0.025, cellPx: 1.5 }); grain.setSize(dbs.x, dbs.y); composer.addPass(grain.pass); }

  const inkRef = ink, lensRef = lens, gradeRef = grade, grainRef = grain;
  return {
    composer, ink: inkRef, lens: lensRef, grade: gradeRef, grain: grainRef, depthTex,
    dispose() {
      inkRef?.dispose(); lensRef?.dispose(); gradeRef?.dispose(); grainRef?.dispose();
      depthTex.dispose();
      composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
    },
  };
}
