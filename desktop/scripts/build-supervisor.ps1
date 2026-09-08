$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$desktopRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $desktopRoot 'supervisor\Program.cs'
$outputDirectory = Join-Path $desktopRoot 'bin'
$output = Join-Path $outputDirectory 'dsh-supervisor.exe'

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

if (
    (Test-Path $output) -and
    ((Get-Item $output).LastWriteTimeUtc -ge (Get-Item $source).LastWriteTimeUtc)
) {
    Write-Host "Windows supervisor is up to date: $output"
    exit 0
}

Remove-Item -Force -ErrorAction SilentlyContinue $output
Add-Type `
    -Path $source `
    -OutputAssembly $output `
    -OutputType ConsoleApplication

Write-Host "Built Windows supervisor: $output"
