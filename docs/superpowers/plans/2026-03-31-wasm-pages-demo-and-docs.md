# wasm-min Pages Demo and Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a GitHub Pages demo for `wasm-min` that can open local `.wem` files or folders in Chromium, play the current file, download the decoded `WAV`, and document correct singleton-style integration for plain Web, React, and Vue consumers.

**Architecture:** Keep `wasm-min` native exports unchanged and add a thin browser wrapper that owns a singleton runtime, timing collection, and error normalization. Assemble a static Pages site from checked-in HTML/CSS/ES module sources plus the latest built `vgmstream_wasm_min.js/.wasm`, while keeping workflow validation and Pages publishing as separate responsibilities.

**Tech Stack:** GitHub Actions, GitHub Pages, bash/sh helper scripts, static HTML/CSS, browser ES modules, Node built-in test runner, PowerShell smoke tests, existing `wasm-min` Emscripten build pipeline.

**Repo rule note:** This repository does not auto-commit during normal implementation unless the user explicitly asks. Use task checkpoints and verification outputs instead of assuming commit steps.

---

### File Map

**Existing files to modify**
- `.github/workflows/wasm-min-manual.yml`
- `make-build-wasm-min.sh` (only if site assembly or workflow integration needs a stable artifact path tweak)

**New workflow files**
- `.github/workflows/pages-demo.yml`

**New site assembly / local preview scripts**
- `make-build-pages-demo.sh`
- `preview-pages-demo.sh`

**New Pages source files**
- `web/pages/index.html`
- `web/pages/assets/app.css`
- `web/pages/assets/app.mjs`
- `web/pages/assets/player-controller.mjs`
- `web/pages/assets/vgmstream-runtime.mjs`
- `web/pages/docs/web.html`
- `web/pages/docs/react.html`
- `web/pages/docs/vue.html`

**New tests**
- `web/tests/vgmstream-runtime.test.mjs`
- `web/tests/player-controller.test.mjs`
- `web/tests/test_pages_demo_site.ps1`
- `web/tests/test_pages_workflows.ps1`

**Existing tests to keep green**
- `cli/tests/test_wasm_min_exports.ps1`
- `cli/tests/test_wasm_min_samples.ps1`

**Existing design inputs**
- `docs/superpowers/specs/2026-03-31-wasm-pages-demo-and-docs-design.md`
- `docs/superpowers/specs/2026-03-30-wasm-min-lol-wem-vorbis-design.md`

### Task 1: Add a failing singleton runtime contract test

**Files:**
- Create: `web/tests/vgmstream-runtime.test.mjs`
- Create: `web/pages/assets/vgmstream-runtime.mjs`

- [ ] **Step 1: Write the failing runtime contract test**

Create `web/tests/vgmstream-runtime.test.mjs` using Node's built-in test runner.

Cover these behaviors with an injected fake loader:
- concurrent warmup calls share one in-flight promise
- the loader runs only once for repeated warmup/decode access
- `reload()` forces a fresh loader call
- runtime state reports `ready/loading/error` transitions without exposing raw internals

Use dependency injection so the test never needs a real browser fetch or real wasm binary.

- [ ] **Step 2: Run the runtime contract test to verify it fails**

Run:

```bash
node --test web/tests/vgmstream-runtime.test.mjs
```

Expected:
- failure because `web/pages/assets/vgmstream-runtime.mjs` does not exist yet

- [ ] **Step 3: Implement the minimal singleton runtime wrapper**

Create `web/pages/assets/vgmstream-runtime.mjs` with:
- cached initialization promise
- explicit `warmup()`
- `decodeFile(file, options)` entrypoint
- `reload()` for demo/debug use
- `getState()` for UI summaries
- timing collection placeholders
- normalized error objects

Keep the module thin:
- no DOM code
- no player UI logic
- no framework-specific code

- [ ] **Step 4: Re-run the runtime contract test to verify it passes**

Run:

```bash
node --test web/tests/vgmstream-runtime.test.mjs
```

Expected:
- all singleton contract assertions pass

### Task 2: Add a failing player controller test for file list and playback state

**Files:**
- Create: `web/tests/player-controller.test.mjs`
- Create: `web/pages/assets/player-controller.mjs`
- Create: `web/pages/assets/app.mjs`
- Create: `web/pages/index.html`
- Create: `web/pages/assets/app.css`

- [ ] **Step 1: Write the failing player controller test**

Create `web/tests/player-controller.test.mjs` and keep it UI-logic-focused rather than DOM-heavy.

Test at least:
- folder input filters to `.wem` candidates only
- file list sorting is stable
- selecting or double-clicking an entry moves it to current-track state
- download becomes available only after a successful decode result exists
- page-visible metrics state is updated from controller inputs without requiring the DOM

- [ ] **Step 2: Run the player controller test to verify it fails**

Run:

```bash
node --test web/tests/player-controller.test.mjs
```

Expected:
- failure because `web/pages/assets/player-controller.mjs` does not exist yet

- [ ] **Step 3: Implement the controller and minimal page shell**

Create:
- `web/pages/assets/player-controller.mjs` for state transitions and filtered file list logic
- `web/pages/assets/app.mjs` for DOM wiring and browser API integration
- `web/pages/index.html` for the player layout
- `web/pages/assets/app.css` for a clean player-style layout

Keep responsibilities split:
- controller module owns state and transitions
- app module owns DOM events and runtime calls
- HTML/CSS owns structure and presentation

UI scope for this task:
- top bar with `Open File`, `Open Folder`, `Reload WASM`, `Download WAV`
- file list
- player/details panel
- compact debug metrics area

- [ ] **Step 4: Re-run the player controller test to verify it passes**

Run:

```bash
node --test web/tests/player-controller.test.mjs
```

Expected:
- `.wem` filtering, selection, and download-state assertions pass

### Task 3: Add a failing Pages site assembly smoke test

**Files:**
- Create: `web/tests/test_pages_demo_site.ps1`
- Create: `make-build-pages-demo.sh`
- Create: `preview-pages-demo.sh`
- Modify: `web/pages/index.html`
- Modify: `web/pages/assets/app.mjs`
- Modify: `web/pages/assets/app.css`

- [ ] **Step 1: Write the failing Pages site smoke test**

Create `web/tests/test_pages_demo_site.ps1`.

The script should:
- invoke `sh ./make-build-pages-demo.sh`
- assert the assembled site output exists in a deterministic temp directory
- assert the built site contains:
  - `index.html`
  - `assets/app.mjs`
  - `assets/player-controller.mjs`
  - `assets/vgmstream-runtime.mjs`
  - `assets/vgmstream_wasm_min.js`
  - `assets/vgmstream_wasm_min.wasm`
  - `docs/web.html`
  - `docs/react.html`
  - `docs/vue.html`

Add one assertion that the site keeps the browser runtime and wasm assets colocated under the published asset tree.

- [ ] **Step 2: Run the Pages site smoke test to verify it fails**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_demo_site.ps1
```

Expected:
- failure because `make-build-pages-demo.sh` does not exist yet

- [ ] **Step 3: Implement site assembly and local preview**

Create:
- `make-build-pages-demo.sh` to build `wasm-min`, stage the static site, and copy the wasm artifacts into the published asset directory
- `preview-pages-demo.sh` to serve the assembled site locally via a simple `sh`-friendly path

Important constraints:
- keep the source pages checked in under `web/pages/`
- keep assembled output under `.temp/`
- do not require a JS bundler for the first working version

- [ ] **Step 4: Re-run the Pages site smoke test to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_demo_site.ps1
```

Expected:
- assembled site exists
- wasm artifacts are present
- docs pages are present
- local preview script path is available through `sh`

### Task 4: Add a failing workflow smoke test for Pages deployment

**Files:**
- Create: `web/tests/test_pages_workflows.ps1`
- Modify: `.github/workflows/wasm-min-manual.yml`
- Create: `.github/workflows/pages-demo.yml`

- [ ] **Step 1: Write the failing workflow smoke test**

Create `web/tests/test_pages_workflows.ps1`.

The script should assert:
- `.github/workflows/pages-demo.yml` exists
- the Pages workflow includes the official Pages deployment steps
- the `wasm-min` workflow still keeps `push` and `workflow_dispatch`
- the Pages workflow references the site assembly path produced by `make-build-pages-demo.sh`

Do not hardcode speculative action major versions in the test. The test should focus on required workflow responsibilities and file presence.

- [ ] **Step 2: Run the workflow smoke test to verify it fails**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_workflows.ps1
```

Expected:
- failure because the Pages workflow file does not exist yet

- [ ] **Step 3: Implement workflow cleanup and Pages deploy workflow**

Implement:
- targeted action-version cleanup in `.github/workflows/wasm-min-manual.yml`
- new `.github/workflows/pages-demo.yml` with:
  - build step for `wasm-min`
  - site assembly step
  - Pages permissions
  - artifact upload
  - Pages deployment

Before editing workflow versions, check the official action documentation and release guidance so the updated refs reflect current supported versions rather than stale memory.

- [ ] **Step 4: Re-run the workflow smoke test and workflow lint**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_workflows.ps1
actionlint -ignore 'property "workspace" is not defined in object type'
```

Expected:
- workflow smoke test passes
- workflow lint passes without introducing new lint failures

### Task 5: Extend the site smoke test to require integration docs

**Files:**
- Modify: `web/tests/test_pages_demo_site.ps1`
- Create: `web/pages/docs/web.html`
- Create: `web/pages/docs/react.html`
- Create: `web/pages/docs/vue.html`

- [ ] **Step 1: Extend the Pages site smoke test with failing docs assertions**

Add assertions to `web/tests/test_pages_demo_site.ps1` that require:
- each docs page exists in the assembled site
- each docs page mentions the singleton/runtime reuse rule
- the React and Vue docs explicitly discourage per-click or per-mount wasm loading

- [ ] **Step 2: Re-run the Pages site smoke test to verify the new assertions fail**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_demo_site.ps1
```

Expected:
- failure because the docs pages or required singleton wording do not exist yet

- [ ] **Step 3: Write the integration docs**

Create:
- `web/pages/docs/web.html`
- `web/pages/docs/react.html`
- `web/pages/docs/vue.html`

Required content:
- wrapper usage flow
- runtime warmup guidance
- file decode + playback flow
- `WAV` download flow
- cleanup guidance for object URLs
- explicit singleton guidance for app-level runtime ownership
- explicit anti-pattern warnings against repeated wasm fetching/instantiation

- [ ] **Step 4: Re-run the Pages site smoke test to verify it passes**

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_demo_site.ps1
```

Expected:
- site output still assembles
- docs pages are present
- singleton guidance assertions pass

### Task 6: Run the full verification stack and perform manual Chromium validation

**Files:**
- Test: `web/tests/vgmstream-runtime.test.mjs`
- Test: `web/tests/player-controller.test.mjs`
- Test: `web/tests/test_pages_demo_site.ps1`
- Test: `web/tests/test_pages_workflows.ps1`
- Test: `cli/tests/test_wasm_min_exports.ps1`
- Test: `cli/tests/test_wasm_min_samples.ps1`

- [ ] **Step 1: Run the automated local verification stack**

Run:

```bash
node --test web/tests/vgmstream-runtime.test.mjs
node --test web/tests/player-controller.test.mjs
```

Run:

```powershell
pwsh -NoProfile -File .\web\tests\test_pages_demo_site.ps1
pwsh -NoProfile -File .\web\tests\test_pages_workflows.ps1
pwsh -NoProfile -File .\cli\tests\test_wasm_min_exports.ps1
pwsh -NoProfile -File .\cli\tests\test_wasm_min_samples.ps1
```

Run:

```bash
actionlint -ignore 'property "workspace" is not defined in object type'
```

Expected:
- all local tests and workflow lint checks pass

- [ ] **Step 2: Perform manual Chromium verification against the assembled site**

Use the local preview script:

```bash
sh ./preview-pages-demo.sh
```

Then verify in Chromium:
- `Open File` selects and plays a `.wem`
- `Open Folder` lists only `.wem`
- double-click starts playback
- `Download WAV` downloads the current decoded file
- page-visible timing metrics update
- deeper diagnostics appear in DevTools console

- [ ] **Step 3: Verify deployed workflow behavior after push**

After publishing:
- confirm `wasm-min build` still succeeds
- confirm `pages-demo` deploy succeeds
- confirm targeted Node 20 deprecation noise is removed or clearly reduced

Record the exact GitHub run IDs and outcomes in the delivery summary.
