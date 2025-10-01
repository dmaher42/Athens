# Athens

A 3D interactive recreation of Ancient Athens built with Three.js.

Visit the site: https://dmaher42.github.io/Athens/

## Static assets

Static files under `public/` are served without the `public` segment. Use `${BASE}assets/...` in code for GitHub Pages compatibility.

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
