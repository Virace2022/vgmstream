# wasm-min LoL WEM Vorbis Design

## Context

This repository is a fork of upstream `vgmstream` focused on WebAssembly size reduction for a single browser playback scenario.

The target scenario is intentionally narrow:

- Input is a League of Legends internal audio `.wem` file.
- The only codec that must be supported is `Wwise Vorbis`.
- The browser-side consumer only needs decoded `WAV` bytes plus stream metadata suitable for loop-aware playback.
- All non-WebAssembly platforms are out of scope for this effort.

The current upstream-oriented WebAssembly flow builds a generic `vgmstream-cli.js/.wasm` bundle. It still carries a broad CLI surface, a broad parser registry, and a broad Wwise codec surface. A historical `lite` branch demonstrated that aggressive reduction can dramatically lower output size, but it achieved this mainly through broad deletions and is no longer a good long-term maintenance path.

This design replaces the "delete until small enough" strategy with a dedicated `wasm-min` build profile and a new external compatibility layer.

## Goals

- Minimize the final WebAssembly artifact size for the League of Legends browser playback scenario.
- Avoid broad destructive source deletion from the main codebase.
- Introduce a WebAssembly-only compatibility layer that bypasses the generic CLI entrypoint.
- Support only `.wem` files that decode through the `Wwise Vorbis` path.
- Return `WAV` output and JSON metadata in a form that is easy to consume from browser worker code.
- Keep the generic upstream-like build path intact outside the new `wasm-min` flow.

## Non-Goals

- Supporting all `.wem` codecs.
- Supporting arbitrary `vgmstream` formats in the `wasm-min` target.
- Preserving generic CLI compatibility inside the `wasm-min` target.
- Shipping OGG encoding in the first phase.
- Preserving directory-based or companion-file-based web workflows such as `txtp + wem`.
- Optimizing Windows, macOS, Linux, or desktop plugin outputs as part of this effort.

## Chosen Approach

Three approaches were considered:

1. Keep the generic CLI and only reduce build flags and dependencies.
2. Keep the generic CLI but shrink the parser and codec surface for WebAssembly.
3. Add a dedicated WebAssembly compatibility layer and pair it with an aggressively narrowed `wasm-min` runtime surface.

Approach 3 is chosen.

It provides the best size ceiling because it removes the generic CLI argument parsing and file-output workflow from the hot path, while still avoiding destructive repository-wide deletions.

## High-Level Architecture

The implementation introduces a separate `wasm-min` build track with a dedicated entrypoint and a dedicated initialization path.

### New build identity

- New working branch: `wasm-min`
- New build profile: `wasm-min`
- New compile definition: `VGM_WASM_MIN`
- New WebAssembly target: `vgmstream_wasm_min`

This target is not meant to replace the current generic `vgmstream_cli` target. It is a separate, highly constrained target intended only for the League of Legends web scenario.

### New compatibility layer

The new compatibility layer will accept audio bytes in memory and return decoded bytes in memory.

The compatibility layer must not depend on:

- `callMain`
- `getopt`
- CLI help/version/debug text paths
- filesystem-based output files
- `WORKERFS`
- directory mounting

The compatibility layer is responsible for:

- receiving `.wem` bytes and a logical filename
- decoding through the minimal vgmstream path
- packaging output as `WAV`
- producing minimal JSON metadata
- returning structured errors

## Proposed ABI

The compatibility layer exposes a small exported ABI suitable for JavaScript worker bindings.

```c
typedef struct {
    int ignore_loop;
    int want_info_json;
    int output_format; /* phase 1 only supports WAV */
} vgmstream_web_options;

typedef struct {
    int ok;
    int error_code;
    const char* error_message;
    unsigned char* audio_data;
    size_t audio_size;
    char* info_json;
} vgmstream_web_result;

int vgmstream_web_convert(
    const unsigned char* input_data,
    size_t input_size,
    const char* input_name,
    const vgmstream_web_options* options,
    vgmstream_web_result* out);

void vgmstream_web_free_result(vgmstream_web_result* result);
```

### ABI notes

- Phase 1 only supports `WAV` output, but `output_format` remains in the structure so that future expansion does not require a breaking ABI redesign.
- The JavaScript side should wrap this ABI and return a response object close to the current `vgmstream-web` worker contract.
- This design keeps browser integration inexpensive while letting the native side drop the generic CLI stack.

## Internal Narrowing Strategy

The new target must be narrow by construction, not by ad hoc deletions.

### Parser registry

The current generic parser registry in `src/vgmstream_init.c` is far too broad for this target.

Introduce a dedicated minimal registry, for example:

- `src/vgmstream_init_wasm_min.c`

This registry should only register the minimum required parser set for the target scenario:

- `init_vgmstream_wwise`

The following should not be registered in the `wasm-min` target:

- `init_vgmstream_txth`
- `init_vgmstream_mpeg`
- `init_vgmstream_ffmpeg`
- all non-Wwise parsers

### Wwise codec surface

`src/meta/wwise.c` should remain the canonical Wwise parser source, but `VGM_WASM_MIN` should aggressively narrow what is accepted.

Under `VGM_WASM_MIN`:

- allow `Wwise Vorbis`
- reject all other Wwise codecs with a clean unsupported-codec path

That means rejecting, at minimum:

- PCM
- IMA
- XMA2
- XWMA
- AAC
- OPUS variants
- HEVAG
- ATRAC9
- PTADPCM

The goal is to preserve source maintainability while ensuring unsupported codec branches do not meaningfully participate in the `wasm-min` target behavior.

### Dependency surface

The `wasm-min` target only keeps the decode stack needed for `Wwise Vorbis`:

- keep `ogg`
- keep `vorbis`
- disable `mpeg`
- disable `ffmpeg`
- disable `g7221`
- disable `g719`
- disable `atrac9`
- disable `celt`
- disable `speex`

### Runtime surface

The `wasm-min` target should behave as a single-file memory-in / memory-out decoder.

Phase 1 explicitly excludes:

- directory scanning
- mounted worker filesystems
- companion file workflows
- hash-driven multi-file browser orchestration

## JavaScript Integration Shape

The new JavaScript worker integration should become thinner than the current `vgmstream-web` worker.

Instead of building command arrays such as:

```js
vgmstream("-I", "-o", outputFilename, "-i", inputFilename)
```

the worker should:

- allocate input bytes into wasm memory
- call the exported conversion function
- read back `WAV` bytes and JSON metadata
- free native-side result buffers

The JavaScript wrapper can still return a browser-friendly object with fields analogous to the existing workflow:

- `inputFilename`
- `outputFilename`
- `arrayBuffer`
- `infoJson`
- `error`

This keeps browser changes focused and avoids forcing a complete front-end redesign.

## Build System Changes

The build changes should stay additive and scoped.

### Expected additions

- New C/C++ sources for the compatibility layer
- New minimal parser-registry source
- New CMake option or profile gate for `wasm-min`
- New WebAssembly target configuration with size-focused linker settings
- Optional post-link size optimization step such as `wasm-opt -Oz`

### Expected non-changes

- Do not delete the generic CLI target.
- Do not remove desktop platform targets from the repository.
- Do not replace the main upstream-like build path with the `wasm-min` path.

## Validation Strategy

This effort must be measured, not just "made smaller".

Each iteration records:

- raw wasm size
- gzip size
- brotli size
- functional pass/fail against League of Legends `.wem` samples
- JSON metadata availability
- decoded `WAV` playability

### Sample source

- Test `.wem` files are stored in `.temp/wem`

### Environment notes

- Primary local Windows build entry:

```powershell
C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe -noe -c "&{Import-Module \"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll\"; Enter-VsDevShell 9d4658d4}"
```

- If native Windows compilation is blocked or inefficient for this WebAssembly work, a WSL Ubuntu build script may be added as a fallback path later.

### Iteration order

1. Create `wasm-min` branch and record current size/function baseline.
2. Add dedicated compatibility-layer target.
3. Replace generic parser registry with minimal `wasm-min` registry.
4. Narrow Wwise handling to `Vorbis` only under `VGM_WASM_MIN`.
5. Remove unnecessary runtime and export surface from the wasm build.
6. Apply and measure size-focused Emscripten optimization settings.
7. Stop when gains flatten relative to maintainability cost.

## Risks

- League of Legends sample assumptions may be incomplete. A future sample could still be `.wem` but not `Wwise Vorbis`.
- The smallest possible artifact may require deeper surgery than the first-phase compatibility layer alone.
- Replacing the generic CLI path means browser bindings need focused adjustments, even if the response shape stays familiar.
- Some code may still get compiled into the target until the build graph is narrowed enough for the linker to drop it.

## Success Criteria

The first successful milestone is:

- `wasm-min` branch exists
- a dedicated `vgmstream_wasm_min` target exists
- the target decodes League of Legends `.wem` samples from `.temp/wem`
- output is valid `WAV`
- metadata JSON is produced
- the artifact is materially smaller than the current generic WebAssembly build

## Follow-Up Possibilities

These are explicitly deferred until after phase 1:

- direct PCM output for WebAudio instead of packaged WAV bytes
- optional OGG output or encoding
- broader Wwise codec support
- multi-file web workflows
- reusing the compatibility layer in non-browser environments
