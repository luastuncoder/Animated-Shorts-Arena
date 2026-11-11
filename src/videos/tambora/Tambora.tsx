// "The Volcano That Invented the Bicycle": our original 74 s short in the flat-characters-in-a-3D-toon-world style.
// One three.js world (world.ts) posed per frame from the story timeline (story.ts). Post chain (look-match pass):
//   InkPass (world ink lines, own pass) -> lens blur pre + main (thin-lens DOF per shot from dofAt) ->
//   [bloom (emissive only) + NEUTRAL tone mapping + colour grade] (one merged EffectPass), MSAA 4.
// Ink runs before the DOF so lines blur with what they belong to; bloom after the DOF so glows defocus with their
// source; the grade is display-referred, so it comes after tone mapping. Every pixel-sized parameter is specified at
// 1080x1920 and scaled with the output size, so stills at --scale 0.5 and the 1440x2560 final match.
// Scene changes crossfade by stacking a second canvas for the fade frames.
import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { AbsoluteFill, continueRender, delayRender, getInputProps, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useFrame, useThree } from "@react-three/fiber";
import { World, loadKit } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { buildPostWithRenderer, type RawPost } from "./post";
import { Kit } from "./build";
import { TOTAL, FLASHES, SHOTS, layersAt, dofAt } from "./story";

export const TAMBORA_FRAMES = TOTAL;

/** A/B switches for test stills only (Remotion inputProps `{ post: { ink: false, ... } }`); everything is on by default. */
type PostToggles = { ink: boolean; lens: boolean; pre: boolean; bloom: boolean; grade: boolean; grain: boolean; post: boolean; shadows: boolean; ms: number; fbt: "half" | "byte"; inkDebug: number };
const toggles = (): PostToggles => ({ ink: true, lens: true, pre: true, bloom: true, grade: true, grain: false, post: true, shadows: true, ms: 4, fbt: "half", inkDebug: 0, ...((getInputProps() as { post?: Partial<PostToggles> }).post ?? {}) });

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const useKit = () => {
  const [kit, setKit] = useState<Kit | null>(null);
  const [handle] = useState(() => delayRender("tambora kit"));
  useEffect(() => { loadKit().then((k) => { setKit(k); continueRender(handle); }); }, [handle]);
  return kit;
};

const Inner: React.FC<{ id: number; kit: Kit }> = ({ id, kit }) => {
  const f = useCurrentFrame();
  const { camera, scene } = useThree();
  const world = useMemo(() => new World(kit), [kit]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const on = useMemo(toggles, []);
  const gl = useThree((s) => s.gl);
  const fx = useMemo(() => buildPostWithRenderer(gl, scene, camera as THREE.PerspectiveCamera, {
    ink: on.ink, lens: on.lens, pre: on.pre, bloom: on.bloom, grade: on.grade, grain: on.grain,
    ms: on.ms, fbt: on.fbt, inkDebug: on.inkDebug,
  }), [camera, scene, gl, on]);
  useEffect(() => () => fx.dispose(), [fx]);
  const cam = camera as THREE.PerspectiveCamera;
  target.copy(world.update(id, f, cam, scene));
  noInkFallback(world.root);
  // thin-lens focus: distance along the view axis to the shot's focus point (default: the camera's look target)
  const d = dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  if (fx.lens) { fx.lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd)); fx.lens.cInf = d.cInf; }
  if (fx.grade) fx.grade.setLight(SHOTS[id - 1].light);
  if (fx.grain) fx.grain.seed = f; // deterministic per frame
  return (
    <>
      <primitive object={world.root} dispose={null} />
      {on.post ? <PostDriver post={fx} /> : null}
    </>
  );
};

/** drives the raw composer once per R3F frame (priority > 0 takes over the default render) */
const PostDriver: React.FC<{ post: RawPost }> = ({ post }) => {
  useFrame(() => post.composer.render(), 1);
  return null;
};

/** test stills only: inputProps `{ post: { dpr: 0.5 } }` forces the WebGL buffer size (R3F clamps dpr to >= 1 by default) */
const dprOverride = () => (getInputProps() as { post?: { dpr?: number } }).post?.dpr;
const ShotView: React.FC<{ id: number; kit: Kit; alpha: number }> = ({ id, kit, alpha }) => {
  const { width, height } = useVideoConfig();
  return (
  <AbsoluteFill style={{ opacity: alpha }}>
    <ThreeCanvas width={width} height={height} {...(dprOverride() ? { dpr: dprOverride() } : {})} shadows={(getInputProps() as { post?: Partial<PostToggles> }).post?.shadows !== false} gl={{ antialias: false, stencil: false, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
      camera={{ fov: 40, near: 0.2, far: 1500 }}>
      <Inner id={id} kit={kit} />
    </ThreeCanvas>
  </AbsoluteFill>
  );
};

export const TamboraShort: React.FC = () => {
  const f = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const flash = FLASHES.find((fl) => fl.f === f);
  return (
    <AbsoluteFill style={{ background: "#0a0908" }}>
      {layersAt(f).map((l, i) => <ShotView key={i ? "over" : "base"} id={l.id} kit={kit} alpha={l.alpha} />)}
      {flash && <AbsoluteFill style={{ background: flash.warm ? "#ffe4b8" : "#ffffff", opacity: flash.a }} />}
    </AbsoluteFill>
  );
};
