# Release Verification Checklist

This checklist documents the manual verifications required before releasing the Athens experience. Each section captures the expected outcome and any mitigation steps if the behavior deviates from the norm.

## 1. Boot
- [ ] Load the application entry point in a clean browser session and confirm the page initializes without errors in the developer console.
- [ ] Inspect the application logs and verify they contain the boot sequence messages in order: `resolving entry point` → `invoking initializer` → `render loop running`.

## 2. Visual
- [ ] Observe that either the intended ground/sky visuals render correctly or, if texture loading fails, the fallback geometry appears instead of a blank scene.
- [ ] Resize the browser window (or adjust the viewport using dev tools) and confirm the canvas resizes accordingly without stretching or aspect-ratio artifacts.

## 3. Assets
- [ ] Confirm that at least one texture request and, if applicable, one model fetch succeed by monitoring the network panel.
- [ ] Intentionally rename a texture or model asset to trigger a 404 and refresh; verify the application displays the designated fallback visuals rather than a blank screen.

## 4. Debug
- [ ] Execute `window.toggleStatsVisibility()` in the console and ensure the performance panel toggles visibility each time it is called.
- [ ] Press the `S` key and confirm the sanity mesh toggles on and off.

## 5. Deployability
- [ ] Build the project with the base path set to `/Athens` (for example, using `npm run build -- --base=/Athens`) and serve the output to confirm assets load correctly under the subpath.
- [ ] Verify no unintended absolute `/assets/` paths remain in the build output or configuration, unless explicitly required.
