# Audit Notes – Blank Screen in Development

## Summary
- **Issue**: Opening the main experience with `npm run dev` showed only the start overlay because the core modules never executed.
- **Root Cause**: Vite serves inline module scripts from `/index.html?html-proxy&index=N.js`. A second HTML file at `public/index.html` intercepted those requests (query ignored), so the browser received `text/html` instead of JavaScript and stopped executing the initialiser chain.
- **Impact**: Development builds stall before `window.Athens.boot()` resolves, yielding a blank scene even though assets are available.
- **Fix Overview**: Move the dev bootstrap page to a non-conflicting pathname and update tooling/documentation to point at the new location.

## Verification
- Reproduced the blank screen with the original structure (console errors about incorrect MIME type).
- Moving the dev bootstrap file eliminated the MIME errors and allowed the scene to render normally.
