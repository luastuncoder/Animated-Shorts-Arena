import { execSync } from "node:child_process";
import { Config } from "@remotion/cli/config";

// Local sandbox: remotion.media is unreachable — use the @sparticuz/chromium binary + its AL2023 NSS libs.
// This runs the same extraction as `node scripts/ensure-chromium.mjs` (idempotent, fast when cached).
execSync("node scripts/ensure-chromium.mjs", { stdio: "inherit" });
process.env.LD_LIBRARY_PATH = ["/tmp/al2023/lib", process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

Config.setBrowserExecutable("/tmp/chromium");
Config.setChromiumOpenGlRenderer("swangle"); // CPU-only container: SwiftShader via ANGLE
Config.setOverwriteOutput(true);
