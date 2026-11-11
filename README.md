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

## Storage & hosting strategy

The sandbox has ~20 GB free, so the environment, assets and renders live on local disk. We still keep git
source-only for hygiene and use GitHub + Vercel for delivery:

1. **Git (this repo, mostly source):** code, shot plans, scripts, configs. `node_modules/`, `out/`, `*.mp4`,
   `*.wav` are gitignored — binary masters don't belong in git history.
2. **GitHub Releases (private repo):** final masters — `mix.wav`, 1440x2560 2K master mp4, QA sheets.
   `gh release create <tag> <files> --repo luastuncoder/Animated-Shorts-Arena`.
3. **Vercel (team "RjPrc"):** project `animated-shorts-arena` — **linked to this GitHub repo**, root
   directory `web/`, static output `.`, production branch `main`. Serves the preview theater: episode cards,
   QA stills, web-size H.264 clips for inline playback.
   - ⚠️ Connector limitation: its **first** production deployment cannot be created through the API/tools
     (`projectSettings` missing for new projects). One manual step fixes it forever:
     `cd web && npx vercel deploy --prod` (or press Deploy in the Vercel dashboard). All subsequent
     deployments can be managed programmatically.
   - Git auto-deploy note: the project's `createDeployments` flag is `disabled`, so pushes may not
     auto-deploy; we trigger deploys explicitly and merge to `main` for the production site.
4. **Local disk hygiene:** Remotion bundles copy `public/` into temp on every bundle — set `REMOTION_TMP`
   (e.g. `/tmp/remotion-tmp`) before rendering, and clear `remotion-webpack-bundle-*` when finished.
5. **Skill reference frames** (`~/.claude/skills/cartoon-3d-short/references/`) stay on the local machine only —
   never in git, never on Vercel, never attached to releases.
6. **Kenney CC0 kit** (`public/bridge/kenney/*.glb`) is small enough (~15 MB) to commit when fetched.

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
