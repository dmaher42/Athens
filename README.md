# Athens

A 3D interactive recreation of Ancient Athens built with Three.js.

Visit the site: https://dmaher42.github.io/Athens/

## Static assets

Static files under `public/` are served without the `public` segment. Use `${BASE}assets/...` in code for GitHub Pages compatibility.

<!-- Rebuild trigger for GitHub Pages deployment -->

## Debug utilities

Development builds include a lightweight overlay (`public/index.html`) that exposes several debugging aids:

- Press `S` to toggle the "sanity geometry" helper if the scene looks empty.
- Call `window.toggleStatsVisibility()` in the browser console to show or hide the FPS panel (visible automatically on localhost).
- Watch the on-screen log for boot milestones (asset base detection, renderer sizing) and friendly error messages if initialization fails.

These helpers are available whenever you run the dev bootstrap (`npm run dev` or opening `public/index.html` directly).
