# Kenney CC0 kit provenance

Downloaded 2026-11-11. All Kenney assets are **CC0** (public domain) — free to use, modify and redistribute,
no attribution required (credited here anyway: Kenney — https://www.kenney.nl).

## nature/ — Kenney Nature Kit 2.1 (CC0, creation date 29-04-2020)
- `LICENSE.txt` — official license from the kit.
- GLBs fetched from the mirror repo `BastiaanOlij/godot-vr-weapons` (GitHub), path
  `assets/kenney.nl/naturekit/Models/GLTF format/<name>.glb`, at commit HEAD on 2026-11-11.
  Files verified to start with the `glTF` magic bytes.
- Official source (if you ever need the full kit): https://kenney.nl/assets/nature-kit
- Used: trees (oak/default/detailed/fat/cone), bushes, flowers, grass, lily pads, canoe.

## town/ — Kenney Fantasy Town Kit (CC0) — NOT INSTALLED
- Every available mirror on GitHub stores this kit in **Git LFS** (only 130-byte pointer files are reachable from
  this sandbox; the CDN hosts kenney.nl / media.githubusercontent.com / LFS endpoints are unreachable).
- **Workaround:** the world builder constructs these props procedurally instead (box hedges with painted texture,
  gonfalons/banners via `flagTex`, lanterns with emissive heads, the windmill is procedural), and uses
  Nature Kit trees where `tree-high-round`/`tree` were wanted.
- **To install the real kit:** download `kenney_fantasy-town-kit.zip` from https://kenney.nl/assets/fantasy-town-kit
  and unzip the contents of `Models/GLB format/` into `public/kenney/town/`. The filenames already match the
  skill's expected names (stall-red, stall-green, stall-bench, banner-red, banner-green, lantern, cart,
  hedge, tree, tree-high-round, windmill).
