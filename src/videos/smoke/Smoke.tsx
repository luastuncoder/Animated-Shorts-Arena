// Internal health check: verifies Remotion + three.js + headless WebGL all work in this sandbox.
// Not part of any episode. Render with: npx remotion still src/index.ts SmokeTest out/smoke.jpg
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";

export const SmokeTest: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#263b63 0%, #101828 100%)" }}>
      <ThreeCanvas width={1080} height={1920} camera={{ position: [0, 0.6, 6], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 6]} intensity={1.4} color="#fff4e0" />
        <mesh rotation={[frame * 0.02, frame * 0.03, 0]}>
          <boxGeometry args={[2.4, 2.4, 2.4]} />
          <meshStandardMaterial color="#ff8e6e" roughness={0.35} metalness={0.05} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
          <circleGeometry args={[6, 48]} />
          <meshStandardMaterial color="#3f5a8a" roughness={0.9} />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
