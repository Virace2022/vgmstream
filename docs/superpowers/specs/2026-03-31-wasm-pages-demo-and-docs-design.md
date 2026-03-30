# wasm-min Pages Demo and Integration Docs Design

## Context

This repository already contains a dedicated `wasm-min` build track for the narrow browser playback scenario.

The current state is useful for build experimentation, but it is still missing three pieces needed for practical adoption:

- a stable browser-facing runtime wrapper that treats the WebAssembly module as an application-level singleton
- a GitHub Pages demo site that can load local `.wem` files or a local folder and behave like a small player
- framework-facing documentation that explains how to integrate the browser wrapper from plain Web, React, and Vue applications without wasting bandwidth or re-instantiating the runtime on every user action

Recent CI work also exposed GitHub Actions Node.js 20 deprecation annotations. Those warnings are not the product goal, but they are noise in the same workflow surface that will be used for the Pages demo, so this design includes a targeted workflow cleanup step.

The intended browser scenario is also now better defined:

- GitHub Pages should host a working browser demo
- the demo should target modern Chromium browsers
- the demo should support opening a single file or a folder
- folder mode should only list candidate `.wem` files
- the demo should provide playback plus `WAV` download for the currently decoded file
- the page should show a compact set of timing and size metrics
- deeper diagnostics should go to DevTools console output rather than bloating the page UI

## Goals

- Publish a GitHub Pages site that always includes the latest `wasm-min` artifacts and a runnable demo player.
- Keep `wasm-min` CI validation and Pages publishing as clear, separate workflows.
- Remove or substantially reduce GitHub Actions Node.js 20 deprecation noise in the affected workflows.
- Introduce a browser-side wrapper that loads and initializes the `wasm-min` module once per page lifecycle and reuses it across decode and playback actions.
- Provide a player-style demo page that supports:
  - opening a single local `.wem` file
  - opening a local folder in Chromium
  - showing only playable `.wem` entries from the folder
  - double-click playback from the file list
  - downloading the current decoded `WAV`
- Surface key timing and size metrics in the page UI while sending detailed debug information to DevTools console output.
- Provide detailed integration guides for:
  - plain browser applications
  - React applications
  - Vue applications
- Make the framework guidance explicitly teach singleton runtime usage so consumers do not refetch or re-instantiate the module on every interaction.

## Non-Goals

- Supporting Firefox or Safari folder workflows in the first phase.
- Adding batch conversion, multi-file queue processing, or playlist export.
- Publishing runnable React and Vue demo applications in the repository.
- Replacing the existing `wasm-min` native ABI with a brand-new export model.
- Building a full site generator or documentation framework before the first usable Pages demo exists.
- Expanding support beyond the currently supported `wasm-min` decode scenario merely for demo completeness.

## Chosen Approach

Three approaches were considered:

1. Publish a single integrated GitHub Pages site that builds the latest `wasm-min` artifacts, hosts the demo page, and hosts framework integration docs.
2. Keep Pages as a static documentation-only site and make it download prebuilt artifacts from a different workflow.
3. Limit the work to local demo scripts and repository docs without a hosted browser demo.

Approach 1 is chosen.

It has the best user outcome and the cleanest maintenance story:

- users get a live browser example instead of a partially manual setup
- the Pages site always matches the latest repository state
- the docs can point to the same wrapper API that the live demo already proves
- the deployment chain stays understandable because publishing remains a single repository-owned workflow

Approach 2 adds artifact handoff complexity without meaningfully improving the developer experience for this repository. Approach 3 does not satisfy the requirement to use GitHub Pages as a live example surface.

## High-Level Architecture

The design introduces four cooperating layers:

1. `wasm-min` build and CI layer
2. Pages publishing layer
3. browser runtime wrapper layer
4. demo UI and framework docs layer

### 1. wasm-min build and CI layer

The existing `wasm-min build` workflow remains the push-triggered CI gate for `wasm-min`.

Its responsibility is to prove that the current branch still produces a valid `wasm-min` artifact set. It should not become a documentation or site-publishing workflow.

This workflow is also part of the Node.js 20 deprecation cleanup because the same action versions currently generate noise during routine CI.

### 2. Pages publishing layer

A new Pages workflow should:

- build the latest `vgmstream_wasm_min.js/.wasm`
- assemble a static site directory
- copy demo assets and documentation pages into that directory
- publish through GitHub Pages

This workflow should trigger on `master` pushes, but it should remain scoped to the web-facing surface, for example when relevant demo, doc, workflow, or `wasm-min` build inputs change.

### 3. Browser runtime wrapper layer

The browser should not import the raw Emscripten module in ad hoc ways from each page or framework component.

Instead, the repository should provide a thin browser wrapper that:

- owns module loading
- caches the module instance or initialization promise
- exposes stable high-level browser APIs
- measures timing
- formats errors
- emits detailed console diagnostics

This wrapper becomes the supported browser integration surface for the demo page and for the framework documentation.

### 4. Demo UI and framework docs layer

The Pages site should contain:

- a player-style demo page
- a plain Web integration guide
- a React integration guide
- a Vue integration guide

The demo proves the wrapper works in practice. The docs explain how to reuse the same wrapper correctly in applications with different UI stacks.

## Proposed Site Structure

The published Pages site should stay intentionally simple and static.

One reasonable output shape is:

```text
/
  index.html
  assets/
    app.css
    app.js
    vgmstream-runtime.js
    vgmstream_wasm_min.js
    vgmstream_wasm_min.wasm
  docs/
    web.html
    react.html
    vue.html
```

The key point is not the exact directory name but the ownership model:

- the demo page and docs are first-class site pages
- the `wasm-min` artifacts are published as local site assets
- the demo and docs both target the same browser wrapper and the same deployed artifact pair

This avoids drift between "the thing users can try" and "the thing the docs describe."

If the implementation adds local preview or helper scripts for the demo site, they should be invokable from `sh` so local preview remains lightweight and shell-friendly.

## Browser Runtime Model

### Design Principle

The `wasm-min` module is large enough that browser consumers must treat it as an application-level singleton runtime, not as a disposable per-click helper.

The design therefore requires:

- one fetch path per page lifecycle
- one initialization path per page lifecycle
- explicit reuse of the loaded runtime for later decode calls

Repeated decode actions must not refetch or re-instantiate the module unless the user explicitly asks to reload it for debugging.

### Supported wrapper responsibilities

The wrapper should provide a small Promise-based API around the existing `wasm-min` web exports.

Conceptually, the wrapper should support operations like:

- `warmup()`
- `decodeFile(file, options)`
- `revoke(decodedResult)`
- `reload()`
- `getState()`

The exact names can change during implementation, but the semantics should remain:

- `warmup()` initializes the singleton runtime and records first-load metrics
- `decodeFile(...)` handles file reading, decode invocation, timing, and result assembly
- `revoke(...)` releases browser-side object URLs or temporary references
- `reload()` is reserved for demo/debug use and should explicitly discard cached runtime state
- `getState()` exposes a minimal UI-facing summary without leaking raw internals

### Singleton strategy

The wrapper should internally cache either:

- the resolved runtime object, or
- the in-flight initialization `Promise`

The second option is usually safer because concurrent first-use calls can all await the same promise instead of racing into duplicate instantiations.

The design requirement is:

- first caller starts the load
- later callers await the same pending load
- once complete, all later decode requests reuse the ready runtime

### Framework guidance requirement

The React and Vue integration docs must explicitly teach that the wrapper belongs near the top of the app lifecycle:

- React should recommend a provider or app-level singleton module
- Vue should recommend a top-level composable or `provide/inject` pattern
- plain Web should keep the runtime in module scope or a single app controller object

The docs must also explicitly warn against:

- fetching the wasm file on every play button click
- re-creating the runtime inside each component mount
- treating the module as a local short-lived helper instead of shared application infrastructure

## Demo Player UX

The Pages demo should be a single-page player with four visible regions:

1. top action bar
2. file list
3. player/details panel
4. compact debug metrics panel

### Top action bar

The action bar should contain:

- `Open File`
- `Open Folder`
- `Reload WASM`
- `Download WAV`
- a compact runtime status indicator such as `Loading`, `Ready`, `Decoding`, `Playing`, or `Error`

`Open Folder` may rely on modern Chromium file system APIs. This is acceptable because Chromium-only support is the chosen compatibility target.

### File list behavior

The file list should behave differently depending on how content was opened:

- single-file mode shows the selected file as the current entry
- folder mode lists all candidate `.wem` files from the chosen folder

The folder list should:

- include only candidate `.wem` files
- ignore unrelated files
- sort by a stable user-friendly rule such as file name
- support double-click to start playback for the selected entry
- highlight the current item

### Player/details panel

The main panel should look like a lightweight player rather than a raw test harness.

It should show:

- current file name
- playback controls
- progress and time
- current basic metadata
- a visible `Download WAV` action for the current decoded file

The visible metadata should stay focused:

- file size
- output `WAV` size
- sample rate when available
- channel count when available
- duration when available

### Download behavior

The page should only offer download for the currently decoded file.

The design explicitly avoids:

- batch download
- queue export
- bulk conversion UI

## Timing and Debug Strategy

The page should show only the key metrics that are useful for user-visible performance understanding.

### Page-visible metrics

The metrics panel should display:

- wasm download time
- wasm initialization time
- user action to decode start time
- decode completion time
- user action to playback start time
- `WAV` export time
- input file size
- output `WAV` size

These numbers should be updated per relevant interaction and should clearly distinguish cold-path and warm-path behavior.

For example, once the runtime is already cached, the panel can mark that fact rather than pretending every decode includes a fresh load.

### Console-visible diagnostics

Detailed diagnostics should go to DevTools console output instead of the page itself.

That includes:

- runtime load start and end timestamps
- whether module fetch or init reused cached state
- file read phase timings
- decode invocation boundaries
- internal phase markers
- richer environment information
- structured errors and stack traces when relevant

This keeps the page focused and useful while still providing enough detail for debugging.

### Error categories

The wrapper should normalize browser-consumable error categories, for example:

- `wasm-load-failed`
- `decode-failed`
- `playback-failed`

Each error should preserve enough context for debugging while letting the page show concise user-facing messages.

## GitHub Actions and Pages Workflow Design

### CI workflow cleanup

The current workflow surface emits GitHub Actions Node.js 20 deprecation annotations.

This design includes a targeted cleanup pass:

- inspect the current action versions used by `wasm-min` and related workflows
- upgrade them where a safe Node 24-capable path exists
- avoid unrelated broad workflow churn

The goal is to remove or substantially reduce warning noise while preserving current behavior.

### Pages workflow responsibilities

The new Pages workflow should:

1. check out repository contents
2. build the latest `wasm-min` artifacts
3. assemble the static site directory
4. copy the artifacts into the site asset directory
5. copy demo files and documentation pages into the site directory
6. upload the site artifact
7. deploy to GitHub Pages

### Pages workflow boundaries

The Pages workflow should not replace the existing `wasm-min build` CI workflow.

Instead:

- `wasm-min build` proves the artifact can be built on push
- Pages deploy proves the hosted site can be assembled and published

That separation makes failures easier to diagnose:

- if `wasm-min build` fails, it is a build problem
- if Pages deploy fails, it is a site assembly or publish problem

## Framework Integration Documentation Strategy

The repository should ship one live demo but three detailed usage guides.

### Plain Web guide

The plain Web guide should explain:

- how to import the wrapper
- how to warm the runtime
- how to decode a selected file
- how to bind the result to an `Audio` or `AudioContext` consumer
- how to download the generated `WAV`
- how to dispose of object URLs

### React guide

The React guide should explain:

- why the runtime should live at app scope
- how to keep the runtime in a provider or stable module-level singleton
- how to expose decode functions through hooks or context
- how to avoid repeated runtime initialization in route or component mounts
- how to clean up audio object URLs in effect cleanup

The guide should explicitly warn against putting runtime creation inside button handlers or component bodies that rerun frequently.

### Vue guide

The Vue guide should explain:

- how to keep the runtime in an app-level composable or `provide/inject` wrapper
- how to expose decode actions to view components
- how to avoid recreating the runtime per component instance
- how to release object URLs during unmount or track replacement

### Shared framework principles

All three guides should reinforce the same rules:

- load once
- reuse often
- separate cold-load metrics from hot-path playback metrics
- keep detailed logs in console output
- expose compact user-facing status in the UI

## Verification Strategy

The finished implementation should be validated at several layers.

### Workflow verification

- confirm the upgraded workflows no longer emit the targeted Node 20 deprecation noise, or document any remaining external blockers
- confirm `wasm-min build` still succeeds on push
- confirm the Pages workflow succeeds and publishes the site

### Browser verification

Manual validation should cover modern Chromium browsers and confirm:

- `Open File` works with a local `.wem`
- `Open Folder` works with a local folder
- only candidate `.wem` files are listed
- double-click playback works from the list
- current-file `WAV` download works
- key timing metrics appear in the page
- richer diagnostics appear in DevTools console output

### Runtime reuse verification

The implementation should explicitly verify the singleton contract:

- first decode path performs full load and init
- later decode path reuses the existing runtime
- repeated play actions do not trigger redundant wasm fetches or inits
- explicit `Reload WASM` resets that behavior only when intentionally requested

### Documentation verification

The docs should be checked against the actual wrapper API and demo structure so they do not drift into aspirational examples that do not match the repository.

## Implementation Phases

The work should proceed in the following order:

1. workflow cleanup and Pages deployment skeleton
2. browser singleton runtime wrapper
3. Pages demo player UI
4. plain Web, React, and Vue integration docs
5. end-to-end verification and Pages publication confirmation

This order is chosen because it resolves infrastructure uncertainty first, then builds the public-facing demo and docs on top of a stable deployment path.

## Risks and Constraints

- GitHub Pages deployment adds another workflow surface and therefore another place where action-version compatibility matters.
- Chromium-only folder support is a deliberate tradeoff and should be documented clearly.
- The runtime singleton contract must be enforced by design, not merely suggested in comments, or framework consumers will regress into repeated load behavior.
- The wrapper API should remain thin; if it grows too broad, it will become another unstable abstraction layer that is harder to document consistently.

## Success Criteria

This design is considered successful when all of the following are true:

- the repository publishes a working GitHub Pages demo site
- the demo can open a local file or local folder in Chromium
- the demo plays supported `.wem` files and allows downloading the current `WAV`
- the page shows concise performance metrics and the console shows richer diagnostics
- the runtime is reused across repeated interactions without redundant load behavior
- React and Vue docs clearly teach app-level singleton integration
- the relevant GitHub Actions noise has been removed or reduced with clear evidence
