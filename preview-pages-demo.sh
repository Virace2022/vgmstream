#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SITE_DIR="${SITE_DIR:-$REPO_ROOT/.temp/pages-demo-site}"
PORT="${PORT:-4173}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  sh "$REPO_ROOT/make-build-pages-demo.sh"
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "python3/python is required to preview the Pages demo site" >&2
  exit 1
fi

printf 'Previewing Pages demo site at http://localhost:%s\n' "$PORT"
cd "$SITE_DIR"
exec "$PYTHON" -m http.server "$PORT"
