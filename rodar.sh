#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

python3 coletor/coletar.py "$@"

if ! git remote get-url origin >/dev/null 2>&1; then
  exit 0
fi

git add dados/historico.json dados/vitrines.json dados/arquivo.json docs/dados.js
if git diff --cached --quiet; then
  exit 0
fi
git commit -q -m "chore: atualiza preços $(date +'%d/%m %H:%M')"
git push -q origin HEAD
