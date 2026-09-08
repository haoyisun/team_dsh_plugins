$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$desktopRoot = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $desktopRoot 'bin\dsh-supervisor.exe'
$icon = Join-Path $desktopRoot 'bin\app-icon.ico'
$electron = Join-Path $desktopRoot 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "DSH Desktop dependencies are missing. Run pnpm install in:`n$desktopRoot",
        'DSH Desktop',
        'OK',
        'Error'
    ) | Out-Null
    exit 1
}

if (-not (Test-Path $supervisor)) {
    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File (Join-Path $PSScriptRoot 'build-supervisor.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path $icon)) {
    & node (Join-Path $PSScriptRoot 'build-icon.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Set-Location $desktopRoot
& $electron $desktopRoot
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "DSH Desktop exited during startup (exit code $exitCode).",
        'DSH Desktop',
        'OK',
        'Error'
    ) | Out-Null
}

exit $exitCode
