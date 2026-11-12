# Tambora — delivery notes (2026-11-11)

## Status (updated 2026-11-12, rebuilt after second sandbox wipe)

| Step | State |
|---|---|
| Script (approved v4, `SCRIPT.md`) | done — shots timed to the approved 73.62 s VO |
| VO (`voice.wav`, −19.5 LUFS, 268 words) | **rebuilt 2026-11-12** (voice-01 TTS, per-segment `atempo` fit onto the original 73.62 s timeline; `words.json` byte-identical to the committed one — no shot re-timing needed) — rendered to `out/tambora/voice.wav` (−19.55 LUFS) |
| Mix | **rebuilt** — `out/tambora/mix.wav` (single-pass `loudnorm` I=-15.8, TP=-1.5; VO-only, no music bed yet) |
| Look-match (ink → lens DOF → bloom → Neutral tonemap → grade → 1920-based px scaling) | done — raw three/jsm post chain (`src/videos/tambora/post.ts`), verified frame-by-frame |
| World retheme (Tambora story) | done — `src/videos/tambora/*` |
| 2K frame render (1440×2560, JPEG q92) | **running** (`scripts/render-2k.sh 278`, resumable — completed chunks skipped on re-run) → `out/tambora/frames2k/frame-XXXX.jpeg` (1..2224, 30 fps, 74.13 s) |
| 2K master encode | pending frames — command below (remember: do **not** add `-shortest` to the mux; it truncates the video to VO length) |
| Audio mix + mux | pending frames — commands below |
| QA | spot-checks pass; final check on the encoded master |
| GitHub Release | **pending — run immediately after the master muxes** (`gh release create tambora-001 out/tambora/tambora_2k.mp4 out/tambora/tambora_2k_silent.mp4 out/tambora/mix.wav --title "Tambora Episode 1 — 'The Volcano That Invented the Bicycle'" --notes-file shorts/tambora/DELIVERY.md`) |

> **Lesson recorded:** build durable artifacts first after any wipe — push git, then Release the master the
> moment it muxes. The master was previously deleted by a sandbox reset (2026-11-12 ~06:10) before it ever
> reached the Release.

## Encode the 2K master (after the frame render finishes)

```bash
# ffmpeg from the Remotion bundle (system ffmpeg may not exist)
FF=node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg
$FF -hide_banner -y -framerate 30 -start_number 0 -i out/tambora/frames2k/frame-%04d.jpeg \
  -vf scale=out_range=limited -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -colorspace bt709 -color_range tv \
  out/tambora/tambora_2k_silent.mp4   # validated: h264 High, yuv420p, bt709, limited range
```

## Finish the mix (done 2026-11-12 — kept for the record)

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

1. `out/tambora/voice.wav` (−19.55 LUFS, 73.62 s) and `out/tambora/mix.wav` (single-pass
   `loudnorm` I=-15.8 TP=-1.5, VO-only) are both built.
2. No music/SFX bed exists yet — the mix is VO-only. If a score is added later, drop it in
   under the VO (bed ≈ −22 LUFS vs VO), re-normalise the mix to ≈ −15 LUFS, and re-mux.
3. Mux: `scripts/mux.sh out/tambora/tambora_2k_silent.mp4 out/tambora/mix.wav out/tambora/tambora_2k.mp4`
   (bundled ffmpeg variant: `FF=node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg;
   $FF -y -i tambora_2k_silent.mp4 -i out/tambora/mix.wav -c:v copy -c:a aac -b:a 192k -ar 44100
   out/tambora/tambora_2k.mp4` — **no `-shortest`**: VO is shorter than the picture; `-shortest`
   truncated the video to 2208 frames on the first re-mux).

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
