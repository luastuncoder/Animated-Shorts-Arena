import React from "react";
import { Composition } from "remotion";
import { SmokeTest } from "./videos/smoke/Smoke";

// Shorts register their compositions here next to each other, e.g.:
//   import { BridgeShort } from "./videos/bridge/Bridge";
// The first short is being planned — see README.md.
export const Root: React.FC = () => {
  return (
    <>
      {/* Internal health check — not an episode */}
      <Composition id="SmokeTest" component={SmokeTest} durationInFrames={30} fps={30} width={1080} height={1920} />
    </>
  );
};
