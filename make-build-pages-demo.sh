#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
SITE_DIR="${SITE_DIR:-$REPO_ROOT/.temp/pages-demo-site}"
BUILD_DIR="${BUILD_DIR:-$REPO_ROOT/.temp/build-wasm-min-pages}"
FETCHCONTENT_BASE_DIR="${FETCHCONTENT_BASE_DIR:-$REPO_ROOT/.temp/fetchcontent-pages}"
WASM_ASSET_DIR="${WASM_ASSET_DIR:-}"

to_wsl_path() {
  windows_path=$1
  drive=$(printf '%s' "$windows_path" | cut -c1 | tr '[:upper:]' '[:lower:]')
  rest=$(printf '%s' "$windows_path" | cut -c3-)
  rest=$(printf '%s' "$rest" | tr '\\' '/')
  printf '/mnt/%s%s' "$drive" "$rest"
}

build_wasm_min() {
  if [ -n "$WASM_ASSET_DIR" ]; then
    return
  fi

  mkdir -p "$BUILD_DIR" "$FETCHCONTENT_BASE_DIR"

  if command -v emcmake >/dev/null 2>&1; then
    BUILD_DIR="$BUILD_DIR" \
    FETCHCONTENT_BASE_DIR="$FETCHCONTENT_BASE_DIR" \
    FETCHCONTENT_UPDATES_DISCONNECTED=ON \
    bash "$REPO_ROOT/make-build-wasm-min.sh"
    return
  fi

  if command -v wsl.exe >/dev/null 2>&1; then
    if command -v cygpath >/dev/null 2>&1; then
      WINDOWS_REPO_ROOT=$(cygpath -m "$REPO_ROOT")
      WINDOWS_BUILD_DIR=$(cygpath -m "$BUILD_DIR")
      WINDOWS_FETCH_DIR=$(cygpath -m "$FETCHCONTENT_BASE_DIR")
    else
      echo "Unable to convert paths for WSL build because cygpath is unavailable" >&2
      exit 1
    fi

    WSL_REPO_ROOT=$(to_wsl_path "$WINDOWS_REPO_ROOT")
    WSL_BUILD_DIR=$(to_wsl_path "$WINDOWS_BUILD_DIR")
    WSL_FETCH_DIR=$(to_wsl_path "$WINDOWS_FETCH_DIR")

    wsl.exe bash -lc "cd '$WSL_REPO_ROOT' && BUILD_DIR='$WSL_BUILD_DIR' FETCHCONTENT_BASE_DIR='$WSL_FETCH_DIR' FETCHCONTENT_UPDATES_DISCONNECTED=ON bash ./make-build-wasm-min.sh"
    return
  fi

  echo "Unable to build wasm-min: neither emcmake nor wsl.exe is available" >&2
  exit 1
}

assemble_site() {
  if [ -z "$WASM_ASSET_DIR" ]; then
    WASM_ASSET_DIR="$BUILD_DIR/cli"
  fi

  if [ ! -f "$WASM_ASSET_DIR/vgmstream_wasm_min.js" ] || [ ! -f "$WASM_ASSET_DIR/vgmstream_wasm_min.wasm" ]; then
    echo "Expected wasm assets were not found in $WASM_ASSET_DIR" >&2
    exit 1
  fi

  mkdir -p "$SITE_DIR/assets" "$SITE_DIR/docs"
  find "$SITE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

  cp -R "$REPO_ROOT/web/pages/." "$SITE_DIR/"
  cp "$WASM_ASSET_DIR/vgmstream_wasm_min.js" "$SITE_DIR/assets/"
  cp "$WASM_ASSET_DIR/vgmstream_wasm_min.wasm" "$SITE_DIR/assets/"
  if [ -f "$WASM_ASSET_DIR/vgmstream_wasm_min.wasm.gz" ]; then
    cp "$WASM_ASSET_DIR/vgmstream_wasm_min.wasm.gz" "$SITE_DIR/assets/"
  fi
}

build_wasm_min
assemble_site

printf 'Built Pages demo site in %s\n' "$SITE_DIR"
