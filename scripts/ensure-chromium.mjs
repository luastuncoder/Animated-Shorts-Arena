// Ensures a working headless Chromium is available for Remotion in this sandbox.
// remotion.media (Remotion's own browser download) is NOT reachable, so we use the
// @sparticuz/chromium npm binary (Amazon Linux 2023 build) plus its bundled
// NSS/NSPR support libraries (al2023.tar.br), which this Debian container lacks.
// Idempotent: skips extraction when already present. Prints the chromium path.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = "/tmp/chromium";
const LIBDIR = "/tmp/al2023/lib";

if (!existsSync(BIN) || !existsSync(join(LIBDIR, "libnss3.so"))) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const bin = await chromium.executablePath(); // extracts /tmp/chromium (+ swiftshader libs)
  const { inflate } = await import("@sparticuz/chromium/build/lambdafs.js");
  const pkgRoot = new URL("../node_modules/@sparticuz/chromium/bin/", import.meta.url).pathname;
  await inflate(join(pkgRoot, "al2023.tar.br")); // extracts /tmp/al2023/lib
  console.log("[ensure-chromium] extracted", bin, "with libs in", LIBDIR);
} else {
  console.log("[ensure-chromium] already present:", BIN);
}

// Remotion spawns the browser from this process: it must see the NSS libs.
process.env.LD_LIBRARY_PATH = [LIBDIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
console.log(BIN);
