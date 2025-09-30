# Repository Audit – Athens (Three.js)

## Overview
- Full file size inventory can be regenerated at any time with `npm run size-report`, which writes `file-sizes.csv` at the repository root for reference and tooling import.
- Findings focus on redundant assets, dead code from earlier rewrites, Three.js lifecycle issues, and GitHub Pages deployment hygiene.

## 1. File Audit
### Files that should be ignored
- Generated glTF assets under `public/assets/models/` are tracked even though the build script outputs them and the readme marks them as generated.【F:scripts/generate-static-assets.js†L12-L23】【F:public/assets/models/README.txt†L1-L2】  Add a blanket ignore (or remove them from git) instead of the current per-file allowlist.【F:.gitignore†L4-L12】
- Production audio MP3s live under `public/assets/audio/` despite `.gitignore` excluding that pattern.【F:.gitignore†L22-L23】【b5c65e†L1-L7】  Several files contradict the README statement that binaries stay local.【F:public/assets/audio/README.md†L3-L16】
- The vendored `Tone.js` bundle in `public/assets/vendor/Tone.js` duplicates the npm package and inflates the repo without use.

### Duplicate or redundant assets
- Character models exist in three separate trees (`assets/models`, `models`, `public/assets/models`).  The generated directory alone is ~20 MB (`du`), so dropping tracked copies could recover tens of megabytes.【44647b†L1-L1】
- `data/agora_local.json` and `athens_places.geojson` are duplicated verbatim under both `data/` and `public/data/` even though runtime only needs one copy.【F:src/map/agoraLayer.js†L1-L3】
- Sky textures are stored three times (`assets/sky`, `src/sky`, `public/assets/sky`) despite the manual-drop README; e.g., `day.jpg` appears in both asset trees.【F:assets/sky/README.md†L1-L44】【e205aa†L1-L1】
- Placeholder files (`placeholder.txt`) proliferate across multiple asset folders without purpose.

### Unused or orphaned assets
- Ambient track registry expects eight MP3s, but only dawn/day files exist; missing dusk/night/forest/coast/market/night-crickets references will warn at runtime.【F:src/audio/ambient.ts†L11-L19】【F:public/assets/audio/README.md†L7-L16】
- `public/assets/audio/footsteps_dirt.mp3` / `footsteps_stone.mp3` do not match the runtime expectation of `footstep_*.mp3`, so the loaders fail to resolve them.【F:src/audio/footsteps.js†L13-L55】【F:public/assets/audio/README.md†L12-L13】
- `public/assets/audio/wolf-howl.mp3` is unused anywhere in `src/` (search only hits unrelated encoded data).【2049d9†L1-L3】
- `public/assets/props/torch2.glb` is never referenced by code or config.【fddcef†L1-L1】
- `public/assets/roads/propsConfig.json` is not imported, leaving roadside scatter defaults hardcoded instead.【F:public/assets/roads/propsConfig.json†L1-L27】【cb816d†L1-L1】

### Large files of interest
- `public/assets/models/character.glb` and the raw copies exceed 9 MB each.
- `src/sky/nightSkyTextureData.js` embeds a 1.2 MB base64 texture that could become an external asset for faster diffs.

### Estimated recoverable space
- Removing tracked build outputs and redundant assets (`public/assets/models` ≈20 MB + `assets/models` ≈24 MB + duplicate sky/texture trees ≈6 MB + unused audio/props ≈4 MB) would reclaim roughly **50–55 MB** (conservative sum of `du` values).【44647b†L1-L1】【e205aa†L1-L1】【b617db†L1-L1】【e6bc17†L1-L1】

## 2. Code Analysis
### Dead / duplicate modules
- Legacy ambient system `src/audio/ambience.js` remains after the TypeScript rewrite (`ambient.ts`) and is no longer imported.【F:src/audio/ambience.js†L1-L95】【178018†L1-L3】
- `src/scene/index1.js`, `dirt1.DISABLED.js`, and `grass1.DISABLED.js` reference non-existent modules (`./dirt.js`, `./grass.js`), signalling an abandoned ground implementation left alongside the new layered ground system.【F:src/scene/index1.js†L1-L28】【F:src/scene/dirt1.DISABLED.js†L1-L44】【F:src/ground/index.js†L520-L574】
- Two separate sky managers coexist (`src/scene/sky.js` vs `src/scene/sky.ts`) in addition to `src/sky/SkyManager.ts`, each duplicating loader/color-space logic.【F:src/scene/sky.js†L1-L120】【F:src/scene/sky.ts†L1-L200】【F:src/sky/SkyManager.ts†L1-L156】

### Debug / console noise
- Production entrypoints log heavily (`console.info`, `console.warn`, `console.error`) within `src/main.js`, `src/entry/landing.js`, `src/entry/initializeAthens.js`, and `src/roads/hybridroads.js` debug helpers.【F:src/main.js†L224-L299】【F:src/entry/landing.js†L139-L209】【F:src/entry/initializeAthens.js†L139-L157】【F:src/roads/hybridroads.js†L95-L126】

### Incomplete refactors & TODO hotspots
- Footstep audio renaming was never reflected in code, leaving default clip names wrong.【F:src/audio/footsteps.js†L24-L56】【F:public/assets/audio/README.md†L12-L13】
- `AmbientAPI` exposes track IDs that no longer exist, so mode-to-track mapping silently fails.【F:src/audio/ambient.ts†L11-L19】【F:src/entry/initializeAthens.js†L611-L647】

### Unused dependencies
- `depcheck` reports `cannon`, `tone`, `rimraf`, and `puppeteer` unused; no references exist in `src/` to those packages.【fd27ba†L1-L6】【F:package.json†L19-L29】

## 3. Three.js-specific findings
- Tree scattering never disposes of instanced geometries/materials or exposes a teardown hook, risking GPU leaks when scenes reload.【F:src/vegetation/trees.js†L327-L610】
- Multiple sky systems create their own PMREM generators/textures without shared disposal, increasing memory churn (e.g., `setSky` in `SkyManager.ts`, procedural sky, and `scene/sky.js` all manage PMREM separately).【F:src/sky/SkyManager.ts†L109-L156】【F:src/visual/skyAndHorizon.js†L5-L28】【F:src/scene/sky.js†L167-L198】
- `window.scatterTest` spawns roads and props into the scene without cleanup, leaving meshes attached until a full refresh.【F:src/roads/hybridroads.js†L95-L126】
- Duplicate texture registries (`scene/sky.ts` vs `scene/sky.js`) complicate environment selection and risk loading the same HDR assets multiple times.【F:src/scene/sky.ts†L20-L199】【F:src/scene/sky.js†L40-L126】

## 4. Architecture issues
- Asset-path utilities overlap: `assetUrl.js` and `asset-paths.js` both compute base URLs and normalize paths, creating parallel code paths that drift over time.【F:src/utils/assetUrl.js†L1-L34】【F:src/utils/asset-paths.js†L1-L107】
- Duplicate asset roots (`assets/`, `models/`, `public/assets/`) with inconsistent casing (`Adventurer.glb` vs `adventurer.glb`) suggest partial migrations and complicate tooling.
- GitHub Pages base path is handled in Vite config, yet many helpers also attempt to infer BASE_URL manually, increasing risk of inconsistencies when deploying under `/Athens/`.【F:vite.config.js†L1-L28】【F:src/utils/asset-paths.js†L90-L107】
- No circular dependencies detected by `madge`, but the coexistence of multiple entry modules (e.g., `sky.ts` vs `sky.js`) indicates unfinished rewrites.【069e4b†L1-L4】【F:src/scene/sky.js†L1-L120】【F:src/scene/sky.ts†L1-L200】

## 5. GitHub Pages considerations
- `public/` currently ships generated binaries, placeholder text files, and unused vendor bundles, all of which bloat static deployments and GitHub Pages publishes.
- BASE path helpers should be unified (`assetUrl` → `asset-paths` or vice versa) to avoid divergent behavior between dev/build/Pages modes.【F:src/utils/assetUrl.js†L20-L34】【F:src/utils/asset-paths.js†L68-L107】
- Redundant sky/audio assets in `public/` can be trimmed to the minimal set required for the deployed scene.

## Prioritized deletion candidates
1. **Tracked generated models** – remove `public/assets/models/*.glb` from git and regenerate during build to save ~20 MB.【F:public/assets/models/README.txt†L1-L2】【44647b†L1-L1】
2. **Legacy `assets/models/` tree** – consolidate onto `models/` (script source) or vice versa; deleting the unused tree frees ~24 MB.【F:scripts/generate-static-assets.js†L12-L23】【44647b†L1-L1】
3. **Unused audio bundle** – delete `public/assets/audio/wolf-howl.mp3` and align footstep filenames to code expectations.【F:src/audio/footsteps.js†L24-L55】
4. **Legacy ambient module `src/audio/ambience.js`** – remove to avoid confusion with the active TypeScript version.【F:src/audio/ambience.js†L1-L95】
5. **Obsolete ground/sky modules** – delete `src/scene/index1.js`, `dirt1.DISABLED.js`, `grass1.DISABLED.js`, and one of the redundant sky implementations after confirming references.【F:src/scene/index1.js†L1-L28】【F:src/scene/dirt1.DISABLED.js†L1-L44】【F:src/scene/sky.ts†L1-L200】
6. **Vendored `Tone.js`** – rely on npm dependency instead of bundling the file in `public/assets/vendor`.

## Refactoring opportunities
- Create a unified asset manifest to eliminate duplicate directories and ensure build scripts write to an ignored output folder only.【F:scripts/generate-static-assets.js†L12-L23】
- Introduce disposal hooks for tree groves and sky resources so Three.js materials/textures are released when swapping scenes.【F:src/vegetation/trees.js†L327-L610】【F:src/sky/SkyManager.ts†L109-L156】
- Replace ad-hoc BASE URL logic with a single helper (e.g., keep `asset-paths` and migrate consumers) to simplify GitHub Pages compatibility.【F:src/utils/assetUrl.js†L1-L34】【F:src/utils/asset-paths.js†L68-L107】
- Normalize audio asset handling: rename files to match `footstep_*` expectations, supply the missing ambience tracks, or degrade gracefully by pruning IDs from `AMBIENT_TRACKS`.【F:src/audio/ambient.ts†L11-L19】【F:src/audio/footsteps.js†L24-L55】
- Consolidate sky selection into one module (likely `SkyManager.ts`) and migrate all callers, removing `scene/sky.js` and `scene/sky.ts` duplication.【F:src/scene/sky.js†L1-L198】【F:src/scene/sky.ts†L1-L200】【F:src/sky/SkyManager.ts†L1-L156】
- Strip or gate debug `console.*` calls behind environment checks to keep production logs clean.【F:src/main.js†L224-L299】【F:src/entry/landing.js†L139-L209】

## Cleanup plan
1. **Asset consolidation** – Decide on authoritative asset directories (e.g., keep `models/` as source, ignore generated output) and remove redundant trees from git. Update `.gitignore` to cover entire generated folders.【F:scripts/generate-static-assets.js†L12-L23】【F:.gitignore†L4-L23】
2. **Audio alignment** – Rename or replace MP3 files to match code expectations, remove unused clips, and update README to reflect the tracked/ignored policy.【F:src/audio/ambient.ts†L11-L19】【F:src/audio/footsteps.js†L24-L55】【F:public/assets/audio/README.md†L7-L16】
3. **Code pruning** – Delete obsolete modules (`ambience.js`, disabled ground files, duplicate sky modules) after verifying no imports remain, then update references to the canonical implementations.【F:src/audio/ambience.js†L1-L95】【F:src/scene/index1.js†L1-L28】【F:src/scene/sky.ts†L1-L200】
4. **Memory management** – Add explicit `dispose()` routines for tree libraries and sky environments to prevent GPU leaks during hot reloads or scene swaps.【F:src/vegetation/trees.js†L327-L610】【F:src/sky/SkyManager.ts†L109-L156】
5. **Logging hygiene** – Guard console usage with environment flags or remove verbose info/debug logs in production entry points.【F:src/main.js†L224-L299】【F:src/entry/initializeAthens.js†L139-L157】
6. **GitHub Pages prep** – Ensure all asset URL helpers use the same base resolution logic and audit `public/` so only necessary, non-generated assets ship to Pages.【F:vite.config.js†L1-L28】【F:src/utils/asset-paths.js†L68-L107】

