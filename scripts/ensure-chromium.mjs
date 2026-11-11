// Ensures a working headless Chromium is available for Remotion in this sandbox.
// remotion.media (Remotion's own browser download) is NOT reachable, so we use the
// @sparticuz/chromium npm binary (Amazon Linux 2023 build) plus its bundled
// NSS/NSPR support libraries (al2023.tar.br), which this Debian container lacks.
// Idempotent: skips extraction when already present. Prints the chromium path.
import fs, { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = "/tmp/chromium";
const LIBDIR = "/tmp/al2023/lib";

if (!existsSync(BIN) || !existsSync(join(LIBDIR, "libnss3.so"))) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const bin = await chromium.executablePath(); // extracts /tmp/chromium (+ swiftshader libs)
  // al2023 support libs (NSS/NSPR): the package does not export ./build/lambdafs.js, so decompress + untar here
  const zlib = await import("node:zlib");
  const { execFileSync } = await import("node:child_process");
  const pkgRoot = new URL("../node_modules/@sparticuz/chromium/bin/", import.meta.url).pathname;
  const tarPath = join(tmpdir(), "al2023.tar");
  writeFileSync(tarPath, zlib.brotliDecompressSync(readFileSync(join(pkgRoot, "al2023.tar.br"))));
  mkdirSync("/tmp/al2023", { recursive: true });
  execFileSync("tar", ["-xf", tarPath, "-C", "/tmp/al2023"]);
  console.log("[ensure-chromium] extracted", bin, "with libs in", LIBDIR);
} else {
  console.log("[ensure-chromium] already present:", BIN);
}

// Remotion spawns the browser from this process: it must see the NSS libs.
process.env.LD_LIBRARY_PATH = [LIBDIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
console.log(BIN);

// Chrome >= 139 removed the automatic software-WebGL fallback; new headless shells must opt in with
// --enable-unsafe-swiftshader or every WebGL context creation fails (black frames). Remotion's swangle
// preset passes --use-angle=swiftshader but not the opt-in, so patch the installed renderer bundle here.
// Idempotent and safe to re-run; logs and continues if the renderer internals ever change shape.
const patchSwiftshader = () => {
  const targets = [
    "node_modules/@remotion/renderer/dist/esm/index.mjs",
    "node_modules/@remotion/renderer/dist/open-browser.js",
  ];
  for (const f of targets) {
    try {
      const src = readFileSync(f, "utf8");
      const swangle = src.match(/\[\s*["']--use-gl=angle["'],\s*["']--use-angle=swiftshader["']\s*\]/);
      if (!swangle) {
        if (src.includes("--use-angle=swiftshader', '--enable-unsafe-swiftshader']") || src.includes('--use-angle=swiftshader", "--enable-unsafe-swiftshader"]')) {
          console.log("[ensure-chromium] swangle opt-in already present:", f); continue;
        }
        console.log("[ensure-chromium] could not find swangle gl flag array in", f); continue;
      }
      const q = swangle[0].includes("'") ? "'" : '"';
      const patchedArray = swangle[0].replace(/\]$/, `, ${q}--enable-unsafe-swiftshader${q}]`);
      const patched = src.slice(0, swangle.index) + patchedArray + src.slice((swangle.index ?? 0) + swangle[0].length);
      writeFileSync(f, patched); console.log("[ensure-chromium] patched swangle gl flags:", f, "->", patchedArray.replace(/\s+/g, " "));
    } catch (e) {
      console.log("[ensure-chromium] could not patch", f, "-", String(e).slice(0, 120));
    }
  }
};
patchSwiftshader();
