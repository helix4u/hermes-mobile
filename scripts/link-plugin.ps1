[CmdletBinding()]
param(
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = ''
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'server-plugin')).Path
$pluginsRoot = Join-Path $HermesHome 'plugins'
$target = Join-Path $pluginsRoot 'hermes-mobile'

if (-not (Test-Path -LiteralPath $pluginsRoot)) {
    New-Item -ItemType Directory -Path $pluginsRoot | Out-Null
}

if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -LiteralPath $target -Force
    $resolvedTargets = @($existing.Target | ForEach-Object {
        (Resolve-Path -LiteralPath $_).Path
    })
    if (
        $existing.LinkType -ne 'Junction' -or
        $resolvedTargets -notcontains $source
    ) {
        throw "Refusing to replace existing plugin path: $target"
    }
} else {
    New-Item -ItemType Junction -Path $target -Target $source | Out-Null
}

if (-not $HermesExecutable) {
    $HermesExecutable = Join-Path $HermesHome 'hermes-agent\venv\Scripts\hermes.exe'
}
if (-not (Test-Path -LiteralPath $HermesExecutable)) {
    throw "Hermes executable not found: $HermesExecutable"
}

& $HermesExecutable plugins enable --no-allow-tool-override hermes-mobile
if ($LASTEXITCODE -ne 0) {
    throw "Hermes could not enable the hermes-mobile plugin"
}

Write-Host "Hermes Mobile linked at $target"
Write-Host 'Restart the target Hermes server process to load the plugin.'
