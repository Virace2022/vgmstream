#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/.temp/build-wasm-min-wsl}"
EMSDK_ENV="${EMSDK_ENV:-/root/projects/emsdk/emsdk_env.sh}"
GENERATOR="${GENERATOR:-Unix Makefiles}"
TARGET="${TARGET:-vgmstream_wasm_min}"
JOBS="${JOBS:-}"

if [[ ! -f "$EMSDK_ENV" ]]; then
    echo "emsdk env script not found: $EMSDK_ENV" >&2
    exit 1
fi

source "$EMSDK_ENV" >/dev/null 2>&1

cmake -E make_directory "$BUILD_DIR"

emcmake cmake \
    -S "$REPO_ROOT" \
    -B "$BUILD_DIR" \
    -G "$GENERATOR" \
    -DBUILD_WASM_MIN=ON \
    -DBUILD_CLI=OFF \
    -DBUILD_AUDACIOUS=OFF \
    -DBUILD_V123=OFF

if [[ -n "$JOBS" ]]; then
    cmake --build "$BUILD_DIR" --target "$TARGET" -j "$JOBS"
else
    cmake --build "$BUILD_DIR" --target "$TARGET"
fi

echo "Built $TARGET in $BUILD_DIR"
