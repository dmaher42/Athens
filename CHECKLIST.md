# Verification Checklist

## Boot
- [ ] Page loads without console errors.
- [ ] Logs show the sequence: resolving entry point → invoking initializer → render loop running.

## Visual
- [ ] Ground/sky or fallback geometry is visible even if textures fail to load.
- [ ] Resizing the window resizes the canvas without introducing stretching artifacts.

## Assets
- [ ] At least one texture and one optional model fetch succeed.
- [ ] Renaming an asset to produce a 404 results in a visible fallback instead of a blank screen.

## Debug
- [ ] `window.toggleStatsVisibility()` toggles the performance panel.
- [ ] Pressing `S` toggles the sanity mesh.

## Deployability
- [ ] Build artifacts continue to load correctly when served from a subpath (e.g., `base=/Athens`).
- [ ] Asset references avoid unintended absolute `/assets/` paths.
