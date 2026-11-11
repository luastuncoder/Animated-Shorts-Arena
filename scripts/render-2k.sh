#!/usr/bin/env bash
# Resumable 2K frame render for TamboraShort2K (1440x2560, 2224 frames @30fps).
# Renders the sequence in chunks so a sandbox reboot / browser crash only costs one chunk.
# Each frame is written to out/tambora/frames2k/element-XXXX.jpeg; completed chunks are skipped
# on re-run. Force a full re-render by deleting the directory.
#
# usage: scripts/render-2k.sh [chunk_size]
set -uo pipefail
cd "$(dirname "$0")/.."

export REMOTION_TMP="${REMOTION_TMP:-/home/user/.remotion-tmp}"
export TEMP="$REMOTION_TMP"
export LD_LIBRARY_PATH="/tmp/al2023/lib:${LD_LIBRARY_PATH:-}"
mkdir -p "$REMOTION_TMP" out/tambora/frames2k

TOTAL=2224
CHUNK="${1:-278}"
FFWDIR=out/tambora/frames2k

chunk_missing() { # start end -> number of missing/invalid frames (any zero-padded width)
  python3 - "$1" "$2" <<'PY'
import os, re, sys
s, e = int(sys.argv[1]), int(sys.argv[2])
have = {}
for f in os.listdir("out/tambora/frames2k"):
    m = re.fullmatch(r"element-0*(\d+)\.jpeg", f) or re.fullmatch(r"frame-0*(\d+)\.jpeg", f)
    if m:
        p = os.path.join("out/tambora/frames2k", f)
        have[int(m.group(1))] = os.path.getsize(p)
miss = sum(1 for i in range(s, e + 1) if have.get(i, 0) < 4096)
print(miss)
PY
}

for ((start=0; start<TOTAL; start+=CHUNK)); do
  end=$((start+CHUNK-1)); (( end >= TOTAL )) && end=$((TOTAL-1))
  # self-heal after sandbox wipes: reinstall deps if gone, restore browser + swiftshader patch
  if [ ! -x node_modules/.bin/remotion ]; then echo "[chunk $start-$end] node_modules missing — npm ci"; npm ci --no-audit --no-fund || exit 1; fi
  node scripts/ensure-chromium.mjs >/dev/null || true
  if [ "$(chunk_missing "$start" "$end")" -eq 0 ]; then
    echo "[chunk $start-$end] complete, skipping"
    continue
  fi
  for attempt in 1 2 3; do
    echo "[chunk $start-$end] attempt $attempt, $(chunk_missing "$start" "$end") frame(s) missing"
    npx remotion render TamboraShort2K out/tambora/frames2k \
      --sequence --image-format=jpeg --jpeg-quality=92 --concurrency=1 \
      --image-sequence-pattern='frame-[frame].jpeg' \
      --overwrite --frames="$start-$end" --timeout=120000 && break
    rc=$?
    echo "[chunk $start-$end] render exited rc=$rc (attempt $attempt) — backing off 20s"
    sleep 20
  done
  if [ "$(chunk_missing "$start" "$end")" -ne 0 ]; then
    echo "[chunk $start-$end] FAILED after 3 attempts" >&2
    exit 1
  fi
  echo "[chunk $start-$end] done"
done
echo "all chunks rendered — normalising filenames to frame-%04d.jpeg"
python3 - <<'PY'
import os, re
d = "out/tambora/frames2k"
for f in list(os.listdir(d)):
    m = re.fullmatch(r"element-0*(\d+)\.jpeg", f) or re.fullmatch(r"frame-0*(\d+)\.jpeg", f)
    if m:
        os.replace(os.path.join(d, f), os.path.join(d, f"frame-{int(m.group(1)):04d}.jpeg"))
print("normalised:", len(os.listdir(d)), "files")
PY
echo "ALL CHUNKS DONE: $(ls $FFWDIR | wc -l) files in $FFWDIR"
