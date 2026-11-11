# Tambora — delivery notes (2026-11-11)

## Status

| Step | State |
|---|---|
| Script (approved v4, `SCRIPT.md`) | done — shots timed to the approved 73.62 s VO |
| VO (`voice.wav`, −19.5 LUFS, 268 words) | **rebuilt** (voice-01 TTS, per-segment `atempo` fit onto the original 73.62 s timeline; max word drift 0.1 ms) — `voice/voice.wav`, `scripts/voice_fit.py` |
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

## Finish the mix (VO is rebuilt — this is ready to run)

The re-generated TTS voice-01 read is ~1.8× slower than the lost original, so a naive rebuild
would invalidate every shot cut in `story.ts`. `scripts/voice_fit.py` fixes this:

```bash
PYTHONPATH=.vendor python3 scripts/voice_fit.py shorts/tambora/voice/segments.json \
  shorts/tambora/voice/seg shorts/tambora/voice/voice.wav shorts/tambora/voice/words.json
```

It trims per-segment edge silence, time-stretches each segment (pitch-preserving `atempo`)
so its words span exactly the original timeline (verified: total 73.62 s,
`words.json` drift vs the original ≤ 0.1 ms — **no shot re-timing needed**), then
`voice.wav` is gain-normalised to −19.5 LUFS (−0.76 dBTP input, no clipping).
Note: the source TTS is naturally slower, so per-segment tempo is 1.04–2.7×.

1. `voice.wav` (−19.5 LUFS, 73.62 s, mono 44.1 kHz s16) and `out/tambora/mix.wav`
   (VO loudness-normalised, −15.8 LUFS, TP −1.5 dB — target delivery level) are both built.
2. No music/SFX bed exists yet — the mix is VO-only. If a score is added later, drop it in
   under the VO (bed ≈ −22 LUFS vs VO), re-normalise the mix to ≈ −15 LUFS, and re-mux.
3. Mux: `scripts/mux.sh out/tambora/tambora_2k_silent.mp4 out/tambora/mix.wav out/tambora/tambora_2k.mp4`
   (or with the bundled ffmpeg: `FF=node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg;
   $FF -y -i tambora_2k_silent.mp4 -i out/tambora/mix.wav -c:v copy -c:a aac -b:a 192k
   -shortest out/tambora/tambora_2k.mp4`)

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
