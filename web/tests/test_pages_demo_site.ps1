Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BuildScript = Join-Path $RepoRoot "make-build-pages-demo.sh"
$SiteDir = Join-Path $RepoRoot ".temp/pages-demo-site"

if (-not (Test-Path $BuildScript)) {
    throw "Expected Pages demo build script does not exist: $BuildScript"
}

if (Test-Path $SiteDir) {
    Get-ChildItem -LiteralPath $SiteDir -Force | Remove-Item -Recurse -Force
}

Push-Location $RepoRoot
try {
    & sh -lc "./make-build-pages-demo.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Pages demo build script failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$ExpectedFiles = @(
    "index.html",
    "assets/app.mjs",
    "assets/player-controller.mjs",
    "assets/vgmstream-runtime.mjs",
    "assets/vgmstream_wasm_min.js",
    "assets/vgmstream_wasm_min.wasm",
    "docs/web.html",
    "docs/react.html",
    "docs/vue.html"
)

foreach ($RelativePath in $ExpectedFiles) {
    $FullPath = Join-Path $SiteDir $RelativePath
    if (-not (Test-Path $FullPath)) {
        throw "Expected Pages demo artifact was not created: $FullPath"
    }
}

$WebDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/web.html") -Raw
$ReactDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/react.html") -Raw
$VueDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/vue.html") -Raw

if ($WebDoc -notmatch "(?i)singleton|single runtime|load once") {
    throw "Expected web.html to explain singleton runtime usage"
}
if ($ReactDoc -notmatch "(?i)provider|singleton|load once") {
    throw "Expected react.html to explain app-level singleton/provider usage"
}
if ($ReactDoc -notmatch "(?i)do not|don't|avoid") {
    throw "Expected react.html to warn against repeated wasm loading"
}
if ($VueDoc -notmatch "(?i)provide|inject|singleton|load once") {
    throw "Expected vue.html to explain provide/inject or singleton usage"
}
if ($VueDoc -notmatch "(?i)do not|don't|avoid") {
    throw "Expected vue.html to warn against repeated wasm loading"
}

Write-Host "PASS: Pages demo site assembled into $SiteDir"
