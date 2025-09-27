# Dev Bootstrap Checklist

1. `npm install`
2. `npm run dev` – confirm the main experience loads without MIME-type errors and the scene renders.
3. `npm run dev:boot` – verify the debug overlay opens on `/dev-boot.html` and the log widget updates as initialization progresses.
4. Toggle the HUD and mini-map to confirm UI bindings survive the bootstrap move.
5. Inspect `window.__AthensAssetBase` in the console to ensure the value/source pair is populated.
