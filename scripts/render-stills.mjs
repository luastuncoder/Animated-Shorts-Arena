// usage: node scripts/render-stills.mjs <comp-id> <outPrefix> <frame,frame,...> [scale]
// Bundles once, then renders JPEG stills. Set REMOTION_TMP to a big drive to keep
// Remotion's per-bundle copies of public/ out of a small system disk.
// Set STILLS_ENTRY to render a sandbox copy instead of src/index.ts (look-match loop).
import fs from "node:fs";
if (process.env.REMOTION_TMP) {
  fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true });
  process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP;
}
import "./ensure-chromium.mjs"; // sets LD_LIBRARY_PATH before the browser spawns
const BROWSER = "/tmp/chromium";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [compId, prefix, frames, scale = "0.5"] = process.argv.slice(2);
if (!compId || !prefix || !frames) {
  console.error("usage: node scripts/render-stills.mjs <comp-id> <outPrefix> <frame,frame,...> [scale]");
  process.exit(1);
}
const entry = path.resolve(process.env.STILLS_ENTRY || "src/index.ts");
const serveUrl = await bundle({ entryPoint: entry, publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: compId, browserExecutable: BROWSER, chromiumOptions: { gl: "swangle" } });
const onBrowserLog = (l) => { if (l.type === "error" || l.type === "warning") console.log(`[${l.type}]`, l.text.slice(0, 300)); };
for (const f of frames.split(",").map(Number)) {
  const t0 = Date.now();
  await renderStill({ composition, serveUrl, frame: f, output: `${prefix}${f}.jpg`, imageFormat: "jpeg", jpegQuality: 88,
    scale: Number(scale), browserExecutable: BROWSER, chromiumOptions: { gl: "swangle" }, timeoutInMilliseconds: 180000, onBrowserLog });
  console.log("still", f, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
