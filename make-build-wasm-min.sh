#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/.temp/build-wasm-min-wsl}"
EMSDK_ENV="${EMSDK_ENV:-/root/projects/emsdk/emsdk_env.sh}"
GENERATOR="${GENERATOR:-Unix Makefiles}"
TARGET="${TARGET:-vgmstream_wasm_min}"
JOBS="${JOBS:-}"
FETCHCONTENT_BASE_DIR="${FETCHCONTENT_BASE_DIR:-$REPO_ROOT/.temp/fetchcontent}"
FETCHCONTENT_UPDATES_DISCONNECTED="${FETCHCONTENT_UPDATES_DISCONNECTED:-ON}"
OGG_PATH_DEFAULT="$REPO_ROOT/dependencies/ogg"
VORBIS_PATH_DEFAULT="$REPO_ROOT/dependencies/vorbis"
OGG_PATH_ARG=()
VORBIS_PATH_ARG=()

if [[ ! -f "$EMSDK_ENV" ]]; then
    echo "emsdk env script not found: $EMSDK_ENV" >&2
    exit 1
fi

if [[ -d "$OGG_PATH_DEFAULT" ]]; then
    OGG_PATH_ARG=(-DOGG_PATH="$OGG_PATH_DEFAULT")
fi

if [[ -d "$VORBIS_PATH_DEFAULT" ]]; then
    VORBIS_PATH_ARG=(-DVORBIS_PATH="$VORBIS_PATH_DEFAULT")
fi

source "$EMSDK_ENV" >/dev/null 2>&1

cmake -E make_directory "$BUILD_DIR"
cmake -E make_directory "$FETCHCONTENT_BASE_DIR"

emcmake cmake \
    -S "$REPO_ROOT" \
    -B "$BUILD_DIR" \
    -G "$GENERATOR" \
    -DFETCHCONTENT_BASE_DIR="$FETCHCONTENT_BASE_DIR" \
    -DFETCHCONTENT_UPDATES_DISCONNECTED="$FETCHCONTENT_UPDATES_DISCONNECTED" \
    -DBUILD_WASM_MIN=ON \
    -DBUILD_CLI=OFF \
    -DBUILD_AUDACIOUS=OFF \
    -DBUILD_V123=OFF \
    "${OGG_PATH_ARG[@]}" \
    "${VORBIS_PATH_ARG[@]}"

if [[ -n "$JOBS" ]]; then
    cmake --build "$BUILD_DIR" --target "$TARGET" -j "$JOBS"
else
    cmake --build "$BUILD_DIR" --target "$TARGET"
fi

echo "Built $TARGET in $BUILD_DIR"
