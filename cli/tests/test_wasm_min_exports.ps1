Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BuildDir = Join-Path $RepoRoot ".temp/build-wasm-min-native-export"
$WslBuildDir = Join-Path $RepoRoot ".temp/build-wasm-min-wsl-export"
$VsShell = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
$VsInstance = "9d4658d4"
$WslRepoRoot = "/mnt/" + $RepoRoot.Substring(0,1).ToLowerInvariant() + $RepoRoot.Substring(2).Replace('\', '/')
$WslBuildRoot = "/mnt/" + $WslBuildDir.Substring(0,1).ToLowerInvariant() + $WslBuildDir.Substring(2).Replace('\', '/')

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

function Invoke-WslCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    & wsl.exe bash -lc $Command
    if ($LASTEXITCODE -ne 0) {
        throw "WSL command failed with exit code $LASTEXITCODE"
    }
}

if (Test-Path $BuildDir) {
    Remove-Item -LiteralPath $BuildDir -Recurse -Force
}
if (Test-Path $WslBuildDir) {
    Remove-Item -LiteralPath $WslBuildDir -Recurse -Force
}

New-Item -ItemType Directory -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Path $WslBuildDir | Out-Null

Invoke-VsCommand "cmake -S `"$RepoRoot`" -B `"$BuildDir`" -G Ninja -DBUILD_FB2K=OFF -DBUILD_WINAMP=OFF -DBUILD_XMPLAY=OFF"
Invoke-VsCommand "cmake --build `"$BuildDir`" --target vgmstream_wasm_min_smoke"

$Exe = Join-Path $BuildDir "cli/vgmstream_wasm_min_smoke.exe"
if (-not (Test-Path $Exe)) {
    throw "Expected smoke executable was not created: $Exe"
}

Invoke-WslCommand "source /root/projects/emsdk/emsdk_env.sh >/dev/null 2>&1 && emcmake cmake -S '$WslRepoRoot' -B '$WslBuildRoot' -G 'Unix Makefiles' -DBUILD_WASM_MIN=ON -DBUILD_CLI=OFF -DBUILD_AUDACIOUS=OFF -DBUILD_V123=OFF && cmake --build '$WslBuildRoot' --target vgmstream_wasm_min"

$WasmJs = Join-Path $WslBuildDir "cli/vgmstream_wasm_min.js"
$WasmBin = Join-Path $WslBuildDir "cli/vgmstream_wasm_min.wasm"
if (-not (Test-Path $WasmJs)) {
    throw "Expected wasm JS artifact was not created: $WasmJs"
}
if (-not (Test-Path $WasmBin)) {
    throw "Expected wasm binary artifact was not created: $WasmBin"
}

Write-Host "PASS: found wasm-min smoke executable at $Exe"
Write-Host "PASS: found wasm-min wasm artifacts at $WasmJs and $WasmBin"
