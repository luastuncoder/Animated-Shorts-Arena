#!/usr/bin/env bash
# Mux a Remotion render (silent audio track) with the final sound mix.
# usage: scripts/mux.sh <video-no-audio.mp4> <mix.wav> <out.mp4>
set -euo pipefail
VIDEO="$1"; AUDIO="$2"; OUT="$3"
ffmpeg -hide_banner -loglevel warning -y -i "$VIDEO" -i "$AUDIO" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -movflags +faststart "$OUT"
echo "muxed -> $OUT"
