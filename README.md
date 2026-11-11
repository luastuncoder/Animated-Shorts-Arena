# Animated Shorts Arena

Cartoon 3D story shorts: flat 2D cartoon characters in colourful painted 3D worlds — ink outlines, lens blur, gliding
cameras, a synthesized march score — rendered frame-by-frame with **three.js inside Remotion**. No AI video generation.

Based on the [`cartoon-3d-short`](https://github.com/mromidev/claude-animated-shorts) skill (MIT). The skill is
installed locally at `~/.claude/skills/cartoon-3d-short/` (SKILL.md + templates + private reference frames for style
study). Story, characters and voice are always our own; the reference material is **never committed or uploaded**.

## Repository layout

| Path | What lives there | Committed? |
|---|---|---|
| `src/` | Remotion compositions — one folder per short (`src/videos/<name>/`), registered in `src/Root.tsx` | ✅ |
| `scripts/` | render/QA helpers (`render-stills.mjs`, `mux.sh`) | ✅ |
| `web/` | Static preview "theater" deployed to Vercel | ✅ |
| `public/` | Static assets for Remotion (Kenney CC0 kit etc.) | large binaries ❌ gitignored |
| `out/` | Render output, stills, QA sheets | ❌ gitignored |
| `audio work dirs` | `voice/`, `words.json`, `_cache/` per short | ❌ gitignored |

## Storage & hosting strategy (128 MB local container)

The local workspace is capped, so heavy artifacts never live in git and are offloaded immediately:

1. **Git (this repo, source only):** code, shot plans, scripts, small configs. Patchset stays tiny.
2. **GitHub Releases (private repo):** final masters — `mix.wav`, 1440x2560 2K master mp4, QA sheets.
   Attach with `gh release upload <tag> <files>`.
3. **Vercel (connected team):** hosts the `web/` preview theater — episode cards, QA still galleries and
   compressed web-size H.264 clips (1080x1920, CRF ~26) for inline playback.
4. **Local disk hygiene:** Remotion bundles copy `public/` into temp on every bundle — set
   `REMOTION_TMP` to a large scratch drive before rendering, and clear `remotion-webpack-bundle-*`
   folders when a project is finished (SKILL.md "Gotchas").
5. **Skill reference frames** (`~/.claude/skills/cartoon-3d-short/references/`) stay on the local machine only —
   never in git, never on Vercel, never attached to releases.

## Toolchain

- Node 22 + npm · Remotion 4.0.542 (`@remotion/three`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/cli`)
- three.js 0.187 · @react-three/fiber 9 · @react-three/postprocessing 3 · react 19
- Python 3.11 · numpy · scipy · **ffmpeg** (via `imageio-ffmpeg`, symlinked to `/usr/local/bin/ffmpeg`)
- Rendering: `npx remotion render src/index.ts <Comp> out/<name>/video.mp4 --codec h264 --crf 16 --scale 1.3333`
  (2K vertical export; mux the silent Remotion track with the mix: `scripts/mux.sh`)

## Commands

```bash
npm ci                 # install Remotion toolchain
npm run dev            # Remotion Studio (preview)
npm run stills -- <CompId> out/<name>/still_ <frames> 0.5   # stills for look checks
npm run typecheck      # tsc --noEmit
```

## Pipeline (see the skill's SKILL.md for the full rules)

1. Topic + facts → 2. Script (~3.7 words/s, 55–70 s) → 3. Voice + `words.json` word timings →
4. Shot plan in `story.ts` (camera keys, crossfades, DOF) → 5. World/materials/characters →
6. Post chain (ink → lens → bloom → grade, MSAA 4) → 7. Sound (synthesized SFX + original march score, −15 LUFS) →
8. Stills vs reference reports → 9. 2K final render → 10. QA (`short_qa.py`) → 11. Deliver (Release + Vercel).

New shorts start by copying `templates/bridge/` from the installed skill into `src/videos/<name>/`, renaming the
composition, then rebuilding `story.ts` / `build.ts` around the new story. Save after every step.
