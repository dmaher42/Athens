# Current Athens cloud handoff

- Repository: https://github.com/dmaher42/Athens
- Development branch: `main`. The initial transfer branch `cloud/authoritative-f0f663a64708` is retained.
- Captured installed game: Athens `f0f663a64708`, entry SHA256 `4a2d46ccf26524fa66c075cd675b6fba75343406ef810dfbe5b3d41db355aac1`.
- Existing environment/chat: **Athens** / **Set up Athens**. Authoritative working checkout: `/workspace/Athens-authoritative`. Original older checkout remains intact at `/workspace/Athens`.
- Rollback: `rollback/cloud-before-installed-sync-20261128-6cf306b`, commit `6cf306b60617d6cca8abd5f9c49a0fd33092f11d`; existing cloud Git bundle also retained.
- Source/build identity: see `release-lock.json`, `source/build-chain.json`, `provenance/source-inventory.json` and `provenance/CLOUD-VALIDATION.json`.
- Verified code/test revisions: source reproduction at `234870a18f88968e8d3c606d6e0f4597cfed3997`; full build at merged `21966376c945343d93e1dd64054e184bc991ad76`; corrected served smoke test at `8a779f3c48c0960ad5eee847efab03e9cb8cf9a0`. Subsequent handoff documentation does not change game/build inputs.

The 118 frozen inputs and 24-stage source chain reproduce the exact selected game. The 788,418,560-byte authenticated payload was downloaded and hash-verified in cloud. Full build, managed appearance selection and corrected served checks passed for both cities, colour texture, travel routing and media byte ranges. An environment restart interrupted an earlier build; that partial output was retained separately, and the later complete build passed.

The actual cloud browser **did not reach a playable scene**. It failed at the existing archive guard with `Archive input differs from exact source: sanctuary-texture:5:Acropolis:`. The encoded asset hashes match the manifests. The retained source guard compares a raw decoded texture buffer's length and SHA against its baked archive before using prepared recovery data. The reason this decoded input differs on the cloud browser is not confirmed. Keep the guard and captured game intact; diagnose that portability issue as the next task before claiming cloud playability. Do not repeat the previous extensive route/performance audits merely to reconfirm transfer identity.

Cloud evidence and exact logs are under `/workspace/athens-migration/validation-234870a/`; the chat's current result/status records include the final smoke check and unresolved scene failure. `/workspace/athens-migration/STATUS.md` records the authoritative checkout and environment setup state. There is no published playable web endpoint from this task.

Required models, textures, audio and resident packs are in the same repository's unpublished authenticated draft release `migration/athens-f0f663a64708`. Four uploaded archive digests match their local receipts. Historical editable source recovery and unfinished working source are separate attachments and excluded from all builds. Do not publish these assets while redistribution evidence remains incomplete.

This is a portable native foundation plus recovered editable updates, not a proven standalone whole-world TypeScript build. Historical source reconciliation remains separate from the successful exact-release reproduction. The golden Windows installation, normal port 5189, immutable releases and personal saves were never changed. No visual/gameplay changes, new repository, public website deployment or asset-release publication occurred.
