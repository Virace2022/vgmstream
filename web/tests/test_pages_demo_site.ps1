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
    "assets/i18n.mjs",
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

$IndexPage = Get-Content -LiteralPath (Join-Path $SiteDir "index.html") -Raw
$WebDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/web.html") -Raw
$ReactDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/react.html") -Raw
$VueDoc = Get-Content -LiteralPath (Join-Path $SiteDir "docs/vue.html") -Raw

if ($IndexPage -notmatch "添加文件" -or $IndexPage -notmatch "English") {
    throw "Expected index.html to default to Chinese while exposing an English switch"
}
if ($IndexPage -notmatch 'data-role="locale-switcher"') {
    throw "Expected index.html to expose a locale switcher"
}
if ($IndexPage -notmatch [Regex]::Escape("https://github.com/Virace2022/vgmstream")) {
    throw "Expected index.html to link to the GitHub repository"
}
if ($WebDoc -notmatch "原生 Web 集成" -or $WebDoc -notmatch "English") {
    throw "Expected web.html to provide Chinese-first bilingual content"
}
if ($WebDoc -notmatch 'data-role="locale-switcher"') {
    throw "Expected web.html to expose a locale switcher"
}
if ($ReactDoc -notmatch "React 集成" -or $ReactDoc -notmatch "English") {
    throw "Expected react.html to provide Chinese-first bilingual content"
}
if ($VueDoc -notmatch "Vue 集成" -or $VueDoc -notmatch "English") {
    throw "Expected vue.html to provide Chinese-first bilingual content"
}

Write-Host "PASS: Pages demo site assembled into $SiteDir"
