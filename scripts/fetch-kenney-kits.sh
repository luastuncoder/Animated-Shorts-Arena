#!/usr/bin/env bash
# Re-fetches the Kenney Nature Kit GLBs (CC0) used by the shorts. See public/kenney/SOURCES.md.
# Requires: gh (authenticated). Exits non-zero if any download fails the glTF magic-bytes check.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/kenney/nature
NAT="assets/kenney.nl/naturekit/Models/GLTF format"
for n in tree_oak tree_default tree_detailed tree_fat tree_cone plant_bushLarge plant_bushDetailed plant_bush flower_redA flower_yellowA flower_purpleA grass_large grass lily_large canoe; do
  gh api "repos/BastiaanOlij/godot-vr-weapons/contents/$NAT/$n.glb" -H "Accept: application/vnd.github.raw" > "public/kenney/nature/$n.glb"
done
gh api "repos/BastiaanOlij/godot-vr-weapons/contents/assets/kenney.nl/naturekit/License.txt" -H "Accept: application/vnd.github.raw" > public/kenney/nature/LICENSE.txt
for f in public/kenney/nature/*.glb; do
  if [ "$(head -c4 "$f")" != "glTF" ]; then echo "BAD GLB: $f" >&2; exit 1; fi
done
echo "Nature kit OK ($(ls public/kenney/nature/*.glb | wc -l) models). Fantasy Town Kit is NOT fetchable from here — see public/kenney/SOURCES.md"
