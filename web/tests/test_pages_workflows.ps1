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
    "actions/configure-pages",
    "actions/upload-pages-artifact",
    "actions/deploy-pages",
    "make-build-pages-demo.sh"
)

foreach ($Snippet in $RequiredPagesSnippets) {
    if ($PagesText -notmatch [Regex]::Escape($Snippet)) {
        throw "Expected Pages workflow to reference '$Snippet'"
    }
}

if ($WasmText -notmatch "(?m)^  push:") {
    throw "Expected wasm-min workflow to keep push trigger"
}
if ($WasmText -notmatch "(?m)^  workflow_dispatch:") {
    throw "Expected wasm-min workflow to keep workflow_dispatch trigger"
}

Write-Host "PASS: workflow smoke checks passed"
