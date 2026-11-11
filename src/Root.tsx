import React from "react";
import { Composition } from "remotion";
import { TamboraShort, TAMBORA_FRAMES } from "./videos/tambora/Tambora";

// Shorts register their compositions here next to each other, e.g.:
//   import { BridgeShort } from "./videos/bridge/Bridge";
export const Root: React.FC = () => {
  return (
    <>
      {/* "The Volcano That Invented the Bicycle" — original story, 74.1 s, 30 fps, 9:16 */}
      <Composition id="TamboraShort" component={TamboraShort} durationInFrames={TAMBORA_FRAMES} fps={30} width={1080} height={1920} />
      {/* 2K delivery master (1440x2560) */}
      <Composition id="TamboraShort2K" component={TamboraShort} durationInFrames={TAMBORA_FRAMES} fps={30} width={1440} height={2560} />
    </>
  );
};
