# Athens

A 3D interactive recreation of Ancient Athens built with Three.js.

Visit the site: https://dmaher42.github.io/Athens/

## Static assets

Static files under `public/` are served without the `public` segment. Use `${BASE}assets/...` in code for GitHub Pages compatibility.

### Landmarks & points of interest

Landmark pins, labels, and feature outlines are now driven entirely by GeoJSON data rather than pre-authored GLB meshes. By default
`src/landmarks-loader.js` resolves `data/athens_places.geojson` through the asset-path helper so the file can be loaded in both the
dev server and the GitHub Pages build. To add or adjust landmarks:

1. Edit `data/athens_places.geojson` (or supply an alternate URL when calling `loadLandmarks`).
2. Each point feature becomes a pin/label pair and will snap to the ground meshes at runtime.
3. Line and polygon features render as feature outlines using the same dataset.

Because the loader operates on GeoJSON, there is no longer a `public/models/landmarks/` directory or fallback GLB pipeline to
maintain. Existing code automatically warns (without crashing) if the GeoJSON fails to load so the experience continues even when
landmarks are unavailable.

<!-- Rebuild trigger for GitHub Pages deployment -->

## Debug utilities

Development builds now launch straight into the main experience at `/`. For troubleshooting helpers:

- Open `/dev/` while running the dev server to use the standalone bootstrap page without interfering with Vite's module proxy.
- Press `S` to toggle the "sanity geometry" helper if the scene looks empty.
- Press `M` to mute or resume the ambience audio.
- Press `P` to show or hide the FPS panel (also available via `window.toggleStatsVisibility()` in the console).
- Press `K` to toggle the sky background if you need to inspect lighting without the skybox.
- Watch the console for boot milestones (asset base detection, renderer sizing) and initialization errors.

## Entry points

Use `src/entry/initializeAthens.js` as the runtime entry point for embedding Athens into other experiences.

## Collision & Interiors

- Building interiors and walkable areas should have dedicated collider meshes in the GLB.
- Prefix collider meshes with `COL_` **or** set `userData.collision = true` in the authoring tool to ensure they are picked up by the collision BVH builder.
- Colliders should be closed volumes or have sufficient thickness. Single-sided planes only collide from one side and may allow the player to tunnel through.

## Documentation

Additional documentation lives under [`docs/`](./docs).

- [Keyboard Hotkeys](./docs/hotkeys.md) — default bindings and how to change them.
