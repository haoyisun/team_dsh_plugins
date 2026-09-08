param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$NpxCommand,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateSet('@deepseek-ai/dsh', '@deepseek-ai/dsh@latest')]
    [string]$PackageSpec
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

& $NpxCommand '--yes' $PackageSpec 'web' '--no-open'
exit $LASTEXITCODE
