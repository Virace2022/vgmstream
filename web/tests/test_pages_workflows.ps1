Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$PagesWorkflow = Join-Path $RepoRoot ".github/workflows/pages-demo.yml"
$WasmWorkflow = Join-Path $RepoRoot ".github/workflows/wasm-min-manual.yml"

if (-not (Test-Path $PagesWorkflow)) {
    throw "Expected Pages workflow does not exist: $PagesWorkflow"
}

$PagesText = Get-Content -LiteralPath $PagesWorkflow -Raw
$WasmText = Get-Content -LiteralPath $WasmWorkflow -Raw

$RequiredPagesSnippets = @(
    "push:",
    "web/pages/**",
    "actions/configure-pages",
    "gh release download",
    "actions/upload-pages-artifact",
    "actions/deploy-pages",
    "make-build-pages-demo.sh"
)

foreach ($Snippet in $RequiredPagesSnippets) {
    if ($PagesText -notmatch [Regex]::Escape($Snippet)) {
        throw "Expected Pages workflow to reference '$Snippet'"
    }
}

if ($PagesText -match "(?m)^  workflow_run:") {
    throw "Expected pages-demo workflow to stop using workflow_run after switching to release/artifact download"
}

if ($WasmText -match "(?m)^  push:") {
    throw "Expected wasm-min workflow to stop using push trigger"
}
if ($WasmText -notmatch "(?m)^  workflow_dispatch:") {
    throw "Expected wasm-min workflow to keep workflow_dispatch trigger"
}
if ($WasmText -notmatch "gh release create") {
    throw "Expected wasm-min workflow to publish a release"
}
if ($WasmText -notmatch "github\\.sha|GITHUB_SHA") {
    throw "Expected wasm-min workflow release/version logic to reference commit id"
}

Write-Host "PASS: workflow smoke checks passed"
