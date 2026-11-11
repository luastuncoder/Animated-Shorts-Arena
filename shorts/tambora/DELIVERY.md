# Tambora — delivery notes (2026-11-11)

## Status

| Step | State |
|---|---|
| Script (approved v4, `SCRIPT.md`) | done — shots timed to the approved 73.62 s VO |
| VO (`voice.wav`, −19.5 LUFS, 268 words) | **LOST from the sandbox** (only `voice/words.json` + `voice/segments.json` survive) — mix pending re-supply |
| Look-match (ink → lens DOF → bloom → Neutral tonemap → grade → 1920-based px scaling) | done — raw three/jsm post chain (`src/videos/tambora/post.ts`), verified frame-by-frame |
| World retheme (Tambora story) | done — `src/videos/tambora/*` |
| 2K frame render (1440×2560, JPEG q92) | running (chunked, `scripts/render-2k.sh` — resumable; sandbox reboots/crashed browser mid-run do not lose completed chunks) → `out/tambora/frames2k/frame-XXXX.jpeg (normalised after render)` (1..2224, 30 fps, 74.13 s) |
| 2K master encode | **pending frames** — command below |
| Audio mix + mux | **pending `voice.wav`** — commands below |
| QA | spot-checks pass (stills in `out/tambora/*.jpg`); final check on the encoded master |

## Encode the 2K master (after the frame render finishes)

```bash
# ffmpeg from the Remotion bundle (system ffmpeg may not exist)
FF=node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg
$FF -hide_banner -y -framerate 30 -start_number 0 -i out/tambora/frames2k/frame-%04d.jpeg \
  -vf scale=out_range=limited -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -colorspace bt709 -color_range tv \
  out/tambora/tambora_2k_silent.mp4   # validated: h264 High, yuv420p, bt709, limited range
```

## Finish the mix (when `voice.wav` is re-supplied)

1. Drop the approved VO at `shorts/tambora/voice/voice.wav` (mono 44.1 kHz; expected −19.5 LUFS,
   73.62 s — matches `words.json`, which ends at 73.621 s; shots are timed to it).
2. Mix: VO at 0 dB gain (already levelled), plus −15 LUFS march/SFX bed if a score is supplied;
   if the VO is re-generated from `voice/segments.json` instead, rebuild with
   `PYTHONPATH=.vendor python3 scripts/voice_build.py voice/segments.json <seg_dir> voice/voice.wav voice/words.json`
   **but then every shot boundary in `story.ts` must be re-timed to the new `words.json`** —
   the timeline is locked to the original 73.62 s read.
3. Mux: `scripts/mux.sh out/tambora/tambora_2k_silent.mp4 out/tambora/mix.wav out/tambora/tambora_2k.mp4`

## Known gotchas

- `node_modules/`, `/usr/local/*` Python packages are periodically wiped in this sandbox — re-run
  `npm ci` and `pip install --target .vendor numpy imageio-ffmpeg` after any wipe; `scripts/ensure-chromium.mjs`
  restores the headless browser (including the `--enable-unsafe-swiftshader` swangle patch, which a plain
  `npm ci` would otherwise clobber — Chrome ≥ 139 won't create a WebGL context without it).
- Stills are fresh pages, so they always show fresh depth. The video render reuses one tab:
  `DepthAttachPass` (pre-render) attaches the shared DepthTexture to the current read buffer each frame and
  `DepthDetachPass` releases it after the RenderPass — do not "simplify" this or ink/DOF freeze at frame 1.
- `render-stills.mjs <comp> <prefix> <frames> <scale>` renders stills with the same pipeline as the video.
- Never commit `references/` frames or any of the reference material (see `.gitignore`).
