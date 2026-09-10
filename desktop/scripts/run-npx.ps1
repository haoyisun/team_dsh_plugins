param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$NpmCommand,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidatePattern('^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$')]
    [string]$Version,

    [Parameter(Position = 2)]
    [ValidateSet('prefer-offline', 'prefer-online')]
    [string]$CacheMode = 'prefer-offline'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$packageSpec = "@deepseek-ai/dsh@$Version"
$cacheArgument = "--$CacheMode"
& $NpmCommand 'exec' '--yes' $cacheArgument '--' `
    $packageSpec 'web' '--no-open'
exit $LASTEXITCODE
