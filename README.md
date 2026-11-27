# Athens authoritative installed-release transfer

This branch captures Windows Athens **f0f663a64708**, selected on 28 November 2026 Adelaide time. Its game entry is SHA-256 **4a2d46ccf26524fa66c075cd675b6fba75343406ef810dfbe5b3d41db355aac1**. It retains the installed Sparta destination **599f3f655732** for the existing travel link.

The earlier repository game is preserved in Git history and at `rollback/cloud-before-installed-sync-20261128-6cf306b` (commit `6cf306b60617d6cca8abd5f9c49a0fd33092f11d`). This dedicated transfer branch does not update `main` or publish GitHub Pages. The earlier deployment workflows are absent from this branch so its cloud preparation cannot accidentally publish the legacy game.

## Source authority and an important limitation

The actual installed development path is a retained native foundation, frozen editable helper graphs, and guarded literal integrations. `source/native-foundation.mjs` is the exact retained **d7295243de8c** programme, including the SDK and earlier approved content. `source/build-chain.json` then identifies **24 successive installed updates**. Each step is pinned to its parent and output hashes. `scripts/build-entry.mjs` recompiles the recovered pure helper graphs, checks each compiled result against its recorded integration, runs the preserved chariot source functions, applies the integrations, and proves exact reversal to the parent. It must finish at the installed entry hash above.

**This is a reproducible native release source chain, not a verified clean whole-world TypeScript source build.** Some older implementation authority still resides in the retained compiled foundation. The mixed Windows working folder is older than selected native owners in several places. Do not run its old general build over this programme or describe the historical 397-file memory snapshot as a current complete source tree. Recovering a standalone fully editable whole-world build remains a separate source-reconciliation task. The cloud can reproduce and extend the captured chain without depending on Windows files.

The authenticated draft release also retains `athens-source-recovery-20261128.tar`, containing the 397-file accepted historical memory snapshot, earlier approved helper snapshots and their recipes, for that reconciliation. It is historical evidence and is excluded from the active build. `provenance/source-recovery-archive.json` pins its checksum.

## Build and run in the existing Codex Cloud environment

Use the **Athens** environment and this branch. Start from a clean checkout of the exact handoff commit. Node 24 or later and a `gh` login with repository-maintainer access are needed for the private input download.

```sh
npm ci --no-audit --no-fund
node scripts/verify-source.mjs
npm run build:entry
node scripts/fetch-inputs.mjs
npm run build
PORT=3000 ATHENS_PUBLIC_ORIGIN=http://127.0.0.1:3000 npm start
```

For a hosted Cloud preview, set `ATHENS_PUBLIC_ORIGIN` to its actual HTTPS origin, without a path, and choose a non-reserved configured preview port. The only server adaptation is trusted explicit public-origin handling in the existing request-context adapter; the game entry and every manifest-listed asset remain exact. The standard launch is `/athens-game-starter/index.html?engine=babylon&place=propylaia`. The Agora is `/athens-game-starter/index.html?place=agora`.

In a second shell, run `node smoke.mjs http://127.0.0.1:3000/`, then one brief browser launch/movement check. Confirm the release ID, appearance defaults and a loaded scene. Reuse the prior release QA; this transfer does not warrant repeating the extensive route/performance audits. `dist/ENTRY-VERIFICATION.json` and `dist/BUILD-VERIFICATION.json` record actual checks. Do not claim a cloud browser launch from file checks alone.

The build writes only the new checkout's ignored `game/` and `dist/`. It uses the unchanged managed city selector and appearance gate **inside that new output**. It never accesses, installs into or serves the laptop's port 5189. A second build deliberately refuses to overwrite `game/`; retain or move that generated directory before rebuilding.

## Private inputs and unfinished work

The repository is public. The earlier audit did not establish complete redistribution rights for every model and audio input. Required assets therefore reside in the **unpublished authenticated draft release** `migration/athens-f0f663a64708` in this same repository. Do not publish that draft or mirror its payload publicly until those rights are resolved. A public branch does not make draft-release attachments public.

The payload contains only hash-deduplicated manifest-listed inputs for current Athens and its installed Sparta destination. It excludes the Athens entry, which the build must reproduce, along with saves, credentials, caches, recordings, screenshots and unrelated projects. `provenance/asset-payload.json` pins the archive and input counts. All attribution and provenance files listed by the manifests are retained; their presence does not prove complete rights clearance.

`athens-uninstalled-working-source-20261128.zip`, also in the authenticated draft, preserves the mixed current working source and the discovered private source groups separately. It is **not** part of any build. `provenance/preserved-uninstalled-work.json` records its exact contents. Original Windows source, private candidates, immutable releases, rollback receipts and personal saves are retained. No owner acceptance is inferred from technical QA.

## Future changes

Extend this captured chain or deliberately reconcile its source authority. Preserve the approved appearance, editor defaults, Agora, Acropolis, stoas, farms, NPC persistence, chariot, resource ownership and cross-city routing. Add new steps on the currently selected programme; do not rerun initial installation scripts against later parents. The original Windows-specific recipes under `provenance/` are evidence, not portable commands. Local release selection and publishing remain separate actions from a cloud source build.
