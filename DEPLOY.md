# Deploy & Rollback (Athens)

## Checkpoint a known-good build
```bash
git tag -a vYYYY.MM.DD-a -m "Checkpoint before changes"
git push origin vYYYY.MM.DD-a
```

This auto-creates a GitHub Release with source & built zips (see Releases tab).

## Deploy any ref to Pages
1. GitHub → Actions → Deploy Pages → Run workflow.
2. Enter ref (e.g., `main`, `vYYYY.MM.DD-a`, or a commit SHA).
3. Run → wait for green check → Pages updates.

## Roll back instantly
Run the Deploy Pages workflow again with the previous tag as the ref.
No code changes needed.

## Notes
- Pages must be configured to GitHub Actions under Settings → Pages.
- `npm run build` must emit to `dist/` (adjust if different).
