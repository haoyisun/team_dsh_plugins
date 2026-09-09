param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$NpmCommand
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

& $NpmCommand 'view' '@deepseek-ai/dsh' 'dist-tags.latest' `
    '--json' '--prefer-online'
exit $LASTEXITCODE
