$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$desktopRoot = Split-Path -Parent $PSScriptRoot
$launchScript = Join-Path $PSScriptRoot 'launch.ps1'
$electron = Join-Path $desktopRoot 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $desktopRoot 'bin\app-icon.ico'

if (-not (Test-Path $electron)) {
    throw "Run pnpm install in $desktopRoot first."
}
if (-not (Test-Path $icon)) {
    & node (Join-Path $PSScriptRoot 'build-icon.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'DSH Desktop.lnk'
$powershell = Join-Path $env:SystemRoot `
    'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = (
    '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' `
        -f $launchScript
)
$shortcut.WorkingDirectory = $desktopRoot
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'Launch and manage DSH Web'
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"
