#!/usr/bin/env bash
set -e
rm -rf node_modules/.vite node_modules/.vite-* .vite 2>/dev/null || true
echo "✅ Vite caches cleared."
