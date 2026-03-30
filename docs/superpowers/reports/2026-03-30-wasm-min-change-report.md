# wasm-min Change Report

## Summary

This report captures the `wasm-min` work carried out on the `wasm-min` branch for the League of Legends browser playback scenario.

The target remained intentionally narrow:

- input: League of Legends `.wem`
- codec: `Wwise Vorbis` only
- output: decoded `WAV` plus JSON metadata
- non-goals: generic format coverage, generic CLI compatibility, desktop targets

The resulting work moved the project from a generic WebAssembly path toward a dedicated `wasm-min` runtime with a much smaller feature surface.

## Commit Sequence

### `566af753`
`feat(wasm-min): 增加 LoL Wwise Vorbis 专用 wasm-min 构建链`

Main contents:

- introduced the first dedicated `wasm-min` target and compatibility layer
- added native smoke tests for `.wem -> WAV + JSON`
- added WSL build entry script
- added the initial `BUILD_WASM_MIN` path and minimal parser registry
- enforced `Wwise Vorbis-only` under `VGM_WASM_MIN`

### `a10d23cf`
`refactor(wasm-min): 继续收敛内部解码路径与体积`

Main contents:

- moved the compatibility layer off the generic `libvgmstream` public API hot path
- reduced wasm-min base/API surface
- improved WSL build reuse and local dependency handling
- recorded the intermediate size reduction

### `986e0b73`
`refactor(wasm-min): 再次剥离通用运行时并压缩产物`

Main contents:

- added a dedicated wasm-min runtime helper layer
- switched Wwise init/open/close to wasm-min-specific runtime branches under `VGM_WASM_MIN`
- continued reducing generic runtime dependencies while keeping the LoL `.wem` positive path alive

### `cfc73ad9`
`chore(wasm-min): 补充改动报告与手动构建工作流`

Main contents:

- added a consolidated change report for the wasm-min workstream
- added a `workflow_dispatch` workflow for manually building and publishing wasm-min artifacts

## Size History

The most relevant checkpoints were:

| Stage | JS | WASM | Gzip WASM |
| --- | ---: | ---: | ---: |
| First working wasm-min build | 66,937 | 1,688,285 | 565,644 |
| After size-oriented link tuning | 30,240 | 1,676,548 | 563,917 |
| After brutal runtime/path reduction | 29,949 | 1,046,690 | 344,903 |
| After direct STREAMFILE path cleanup | 29,949 | 1,045,367 | 344,618 |

### High-level delta

From the first working `wasm-min` build to the current result:

- JS reduced by `36,988` bytes
- WASM reduced by `642,918` bytes
- gzip-compressed WASM reduced by `221,026` bytes

### Practical meaning

The large reduction did not come from linker flags alone. Linker tuning mainly helped the JS shell and produced only marginal raw wasm gains.

The real size drop came from changing execution architecture:

- narrowing format registration to Wwise-only
- enforcing `Wwise Vorbis-only`
- bypassing the generic libvgmstream API hot path
- moving toward a wasm-min-specific runtime

## Main Technical Changes

### 1. Dedicated wasm-min entrypoint

Added a dedicated wasm target and compatibility surface instead of continuing to reuse the generic CLI flow.

Key files:

- [src/vgmstream_wasm_min.c](/mnt/h/Programming/C++/vgmstream-lite/src/vgmstream_wasm_min.c)
- [src/vgmstream_wasm_min.h](/mnt/h/Programming/C++/vgmstream-lite/src/vgmstream_wasm_min.h)
- [cli/vgmstream_wasm_min_exports.c](/mnt/h/Programming/C++/vgmstream-lite/cli/vgmstream_wasm_min_exports.c)

### 2. Wwise-only parser path

Added a wasm-min-specific parser registry so the target no longer relies on the global full parser table.

Key file:

- [src/vgmstream_init_wasm_min.c](/mnt/h/Programming/C++/vgmstream-lite/src/vgmstream_init_wasm_min.c)

### 3. Wwise Vorbis-only enforcement

Under `VGM_WASM_MIN`, non-Vorbis Wwise codecs are rejected early.

Key file:

- [src/meta/wwise.c](/mnt/h/Programming/C++/vgmstream-lite/src/meta/wwise.c)

### 4. wasm-min runtime path

Added a dedicated wasm-min runtime helper layer so the browser-oriented conversion path can keep moving away from the generic runtime.

Key files:

- [src/vgmstream_wasm_min_runtime.c](/mnt/h/Programming/C++/vgmstream-lite/src/vgmstream_wasm_min_runtime.c)
- [src/vgmstream_wasm_min_runtime.h](/mnt/h/Programming/C++/vgmstream-lite/src/vgmstream_wasm_min_runtime.h)

### 5. Source-set reduction

The wasm-min source graph has been narrowed compared to the generic build, especially around parser selection and parts of the API/runtime layer.

Key file:

- [src/CMakeLists.txt](/mnt/h/Programming/C++/vgmstream-lite/src/CMakeLists.txt)

### 6. Build-chain consolidation

The WSL wasm build path is now encapsulated in a dedicated script instead of requiring long manual commands every time.

Key file:

- [make-build-wasm-min.sh](/mnt/h/Programming/C++/vgmstream-lite/make-build-wasm-min.sh)

### 7. Direct STREAMFILE bridge removal in hot path

The latest reduction step removed the `libstreamfile -> STREAMFILE` bridge from the wasm-min compatibility-layer hot path and replaced it with a minimal in-memory `STREAMFILE` implementation.

This did not radically change size on its own, but it simplified the path and removed more generic runtime glue.

## Validation Performed

### Native positive-path smoke

Command:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Verified:

- representative SFX and VO `.wem` samples under `.temp\wem`
- successful `WAV` emission
- successful JSON emission
- no regression in the positive path after the runtime refactors

### WSL wasm build

Command:

```bash
BUILD_DIR=/mnt/h/Programming/C++/vgmstream-lite/.temp/build-wasm-min-wsl-export-direct bash ./make-build-wasm-min.sh
```

Verified:

- `vgmstream_wasm_min.js`
- `vgmstream_wasm_min.wasm`
- `gzip`-compressed wasm size

## Current Limitations

- The current wasm-min target still depends on parts of the generic decode/render/layout chain.
- The build graph is much smaller than before, but it is not yet a fully custom Wwise-Vorbis-only decoder stack.
- The local dependency reuse path currently assumes repository-local `dependencies/ogg` and `dependencies/vorbis` are available.
- The GitHub-hosted workflow will still rely on upstream downloads on a fresh runner unless those dependencies are pre-seeded by cache.

## Recommended Next Steps

### 1. Continue source-graph reduction

The next meaningful size gains are likely to come from removing more of the generic decode/render/layout stack from the wasm-min path.

### 2. Specialize the render loop further

The more the runtime can assume:

- `layout_none`
- `coding_VORBIS_custom`
- single positive-path browser decode

the more generic machinery can be removed.

### 3. Keep using positive-path smoke as the guardrail

Because the strategy is intentionally aggressive, the LoL `.wem` smoke test must remain the primary safety rail for every additional cut.
