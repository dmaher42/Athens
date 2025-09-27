#!/usr/bin/env bash
set -euo pipefail

dirs=()
if [[ -d "public" ]]; then
  dirs+=("public")
fi
if [[ -d "docs" ]]; then
  dirs+=("docs")
fi

if [[ ${#dirs[@]} -eq 0 ]]; then
  exit 0
fi

if grep -RE "<script[^>]+src=.*\\.ts" --include='*.html' "${dirs[@]}"; then
  echo "Error: HTML files must not reference TypeScript sources directly." >&2
  exit 1
fi
