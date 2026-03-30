# wasm-min LoL WEM Vorbis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `wasm-min` WebAssembly target that only decodes League of Legends `.wem` files through the `Wwise Vorbis` path and returns `WAV + JSON` through a web-oriented compatibility layer.

**Architecture:** Add a new `vgmstream_wasm_min` target instead of modifying the generic CLI target. Narrow the wasm build through a dedicated parser registry, a small exported compatibility layer, and `VGM_WASM_MIN` conditionals that keep only the `Wwise Vorbis` decode path active for this target.

**Tech Stack:** C, CMake, libvgmstream, Emscripten/WebAssembly, PowerShell, optional WSL Ubuntu fallback.

---

### File Map

**Existing files to modify**
- `CMakeLists.txt`
- `src/CMakeLists.txt`
- `src/meta/wwise.c`
- `src/meta/meta.h`
- `src/libvgmstream.h`

**New files to create**
- `src/vgmstream_init_wasm_min.c`
- `src/vgmstream_wasm_min.h`
- `src/vgmstream_wasm_min.c`
- `cli/tests/test_wasm_min_exports.ps1`
- `cli/tests/test_wasm_min_samples.ps1`

**Docs already written**
- `docs/superpowers/specs/2026-03-30-wasm-min-lol-wem-vorbis-design.md`

### Task 1: Create a failing wasm-min export smoke test

**Files:**
- Create: `cli/tests/test_wasm_min_exports.ps1`
- Modify: `CMakeLists.txt`
- Modify: `src/CMakeLists.txt`

- [ ] **Step 1: Write the failing export smoke script**

Create a PowerShell smoke script that:
- configures a WebAssembly out-of-source build directory
- builds a target named `vgmstream_wasm_min`
- asserts that the resulting `.js` and `.wasm` artifacts exist
- asserts that the generated JavaScript contains the expected exported compatibility-layer names

Expected script responsibilities:
- fail loudly if the target does not exist
- fail if artifacts are missing
- fail if compatibility symbols are not exported

- [ ] **Step 2: Run the export smoke script to verify it fails**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
```

Expected:
- failure because `vgmstream_wasm_min` target and exports do not exist yet

- [ ] **Step 3: Add the minimal target skeleton**

Implement the smallest possible target plumbing:
- add `VGM_WASM_MIN` option or target-specific compile definition in `CMakeLists.txt`
- add a separate `vgmstream_wasm_min` target in `src/CMakeLists.txt`
- create placeholder compatibility-layer files and a placeholder minimal init file
- configure Emscripten exports for the new compatibility entrypoints

- [ ] **Step 4: Re-run the export smoke script to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
```

Expected:
- build succeeds
- `.js` and `.wasm` exist
- exported names are present

### Task 2: Create a failing sample decode smoke test

**Files:**
- Create: `cli/tests/test_wasm_min_samples.ps1`
- Modify: `src/vgmstream_wasm_min.h`
- Modify: `src/vgmstream_wasm_min.c`

- [ ] **Step 1: Write the failing sample decode smoke script**

Create a PowerShell smoke script that:
- uses `.temp\wem` samples
- chooses at least one SFX sample and one VO sample
- runs the new wasm-min output through a Node/JS shim or a wasm-facing harness
- asserts:
  - conversion returns success
  - output begins with a `RIFF`/`WAVE` header
  - metadata JSON is present and parseable

- [ ] **Step 2: Run the sample decode smoke script to verify it fails**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- failure because the compatibility layer does not decode real samples yet

- [ ] **Step 3: Implement the compatibility-layer decode path**

Implement the minimal production code required:
- define `vgmstream_web_options` / `vgmstream_web_result`
- implement `vgmstream_web_convert(...)`
- implement `vgmstream_web_free_result(...)`
- use `libvgmstream_*` APIs to open, configure, render, and package the `WAV` result in memory
- emit minimal JSON metadata compatible with current browser expectations

- [ ] **Step 4: Re-run the sample decode smoke script to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- success on representative `.temp\wem` samples
- valid `WAV`
- valid JSON metadata

### Task 3: Narrow parser registration to wasm-min

**Files:**
- Create: `src/vgmstream_init_wasm_min.c`
- Modify: `src/meta/meta.h`
- Modify: `src/CMakeLists.txt`
- Test: `cli/tests/test_wasm_min_samples.ps1`

- [ ] **Step 1: Extend the decode smoke script with a format-boundary assertion**

Add one extra assertion that the wasm-min path is using the narrowed parser path, for example:
- metadata identifies Wwise
- unsupported non-target formats are rejected if a quick fixture is available

- [ ] **Step 2: Run the sample decode smoke script to verify the new assertion fails**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- failure until the new minimal registry is wired in

- [ ] **Step 3: Add the dedicated minimal parser registry**

Implement `src/vgmstream_init_wasm_min.c` with only the required parser set:
- register `init_vgmstream_wwise`
- do not register the generic full parser table

Wire the new registry only into the `vgmstream_wasm_min` target.

- [ ] **Step 4: Re-run the sample decode smoke script to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- target still decodes `.wem`
- metadata path remains valid
- minimal registry path is active

### Task 4: Narrow Wwise to Vorbis-only under `VGM_WASM_MIN`

**Files:**
- Modify: `src/meta/wwise.c`
- Test: `cli/tests/test_wasm_min_samples.ps1`

- [ ] **Step 1: Add a failing assertion for Vorbis-only behavior**

Extend the smoke test to check that decoded samples report a Vorbis-oriented codec/metadata identity where available, and that unsupported-codec handling has a deterministic error path.

- [ ] **Step 2: Run the sample decode smoke script to verify it fails**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- failure because the current code still allows broader Wwise codec branches

- [ ] **Step 3: Implement `VGM_WASM_MIN` codec narrowing**

In `src/meta/wwise.c`:
- keep `Wwise Vorbis`
- reject all other Wwise codec branches under `VGM_WASM_MIN`
- keep the generic path unchanged outside `VGM_WASM_MIN`

- [ ] **Step 4: Re-run the sample decode smoke script to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- LoL `.wem` samples still pass
- unsupported codec handling is deterministic

### Task 5: Shrink the wasm runtime and verify artifact size

**Files:**
- Modify: `CMakeLists.txt`
- Modify: `src/CMakeLists.txt`
- Test: `cli/tests/test_wasm_min_exports.ps1`
- Test: `cli/tests/test_wasm_min_samples.ps1`

- [ ] **Step 1: Add a failing size-report expectation**

Update the export smoke script to print and persist:
- raw wasm size
- gzip size
- brotli size

Make the script fail if the artifacts cannot be size-profiled.

- [ ] **Step 2: Run the export smoke script to verify the new size-report expectation fails if not implemented**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
```

Expected:
- failure until size reporting is wired in

- [ ] **Step 3: Apply wasm-min runtime reductions**

Implement the minimal runtime surface needed:
- remove generic CLI dependencies from the new target
- avoid `WORKERFS` and directory-mount assumptions in the new target
- apply size-oriented Emscripten flags such as `-Oz`/`-flto` and optional post-link optimization if available
- keep only the export surface required by the compatibility layer

- [ ] **Step 4: Re-run both smoke scripts to verify they pass**

Run:

```powershell
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- both scripts pass
- artifact sizes are printed and captured

### Task 6: Record results and close out

**Files:**
- Modify: `docs/superpowers/specs/2026-03-30-wasm-min-lol-wem-vorbis-design.md` (only if implementation changed design boundaries)
- Modify: `docs/superpowers/plans/2026-03-30-wasm-min-lol-wem-vorbis.md`

- [ ] **Step 1: Record actual artifact sizes and validation notes**

Add a short execution note section at the end of the plan with:
- final raw/gzip/brotli sizes
- sample coverage used from `.temp\wem`
- any remaining limitations

- [ ] **Step 2: Run final targeted verification**

Run:

```powershell
git status --short
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Expected:
- modified files are understood
- both smoke scripts pass

- [ ] **Step 3: Commit**

Stage only the wasm-min implementation files and related docs/tests, then create a Chinese Conventional Commit message with Why / What / Risk / Test sections as required by project rules.
