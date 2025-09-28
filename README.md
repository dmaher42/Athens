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
- Call `window.toggleStatsVisibility()` in the browser console to show or hide the FPS panel (visible automatically on localhost).
- Watch the console for boot milestones (asset base detection, renderer sizing) and initialization errors.
