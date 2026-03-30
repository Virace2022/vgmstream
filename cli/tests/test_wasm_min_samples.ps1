Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BuildDir = Join-Path $RepoRoot ".temp/build-wasm-min-native-samples"
$SamplesRoot = Join-Path $RepoRoot ".temp/wem"
$VsShell = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
$VsInstance = "9d4658d4"

function Invoke-VsCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes(@"
Import-Module '$VsShell'
Enter-VsDevShell $VsInstance | Out-Null
$Command
"@))

    & "C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -EncodedCommand $encoded
    if ($LASTEXITCODE -ne 0) {
        throw "VS command failed with exit code $LASTEXITCODE"
    }
}

function Get-FirstSample {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativeDir
    )

    $dir = Join-Path $SamplesRoot $RelativeDir
    $sample = Get-ChildItem -LiteralPath $dir -Filter *.wem -File | Select-Object -First 1
    if (-not $sample) {
        throw "No sample file found under $dir"
    }
    return $sample.FullName
}

$SfxSample = Get-FirstSample "SFX"
$VoSample = Get-FirstSample "VO"

if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
}

Invoke-VsCommand "cmake -S `"$RepoRoot`" -B `"$BuildDir`" -G Ninja -DBUILD_FB2K=OFF -DBUILD_WINAMP=OFF -DBUILD_XMPLAY=OFF"
Invoke-VsCommand "cmake --build `"$BuildDir`" --target vgmstream_wasm_min_smoke"

$Exe = Join-Path $BuildDir "cli/vgmstream_wasm_min_smoke.exe"
if (-not (Test-Path $Exe)) {
    throw "Expected smoke executable was not created: $Exe"
}

$env:PATH = "$RepoRoot\\ext_libs;$env:PATH"

$OutputDir = Join-Path $BuildDir "sample-smoke"
if (Test-Path $OutputDir) {
    Remove-Item -LiteralPath $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

foreach ($Sample in @($SfxSample, $VoSample)) {
    $BaseName = [IO.Path]::GetFileNameWithoutExtension($Sample)
    $WavPath = Join-Path $OutputDir "$BaseName.wav"
    $JsonPath = Join-Path $OutputDir "$BaseName.json"

    & $Exe --input $Sample --output-wav $WavPath --output-json $JsonPath --ignore-loop
    if ($LASTEXITCODE -ne 0) {
        throw "Smoke executable failed for sample: $Sample"
    }

    if (-not (Test-Path $WavPath)) {
        throw "Expected WAV output was not created: $WavPath"
    }
    if (-not (Test-Path $JsonPath)) {
        throw "Expected JSON output was not created: $JsonPath"
    }

    $header = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($WavPath), 0, 4)
    if ($header -ne "RIFF") {
        throw "WAV output does not start with RIFF: $WavPath"
    }

    $json = Get-Content -LiteralPath $JsonPath -Raw | ConvertFrom-Json
    if (-not $json.sampleRate) {
        throw "JSON output did not contain sampleRate: $JsonPath"
    }
}

Write-Host "PASS: sample smoke completed"
