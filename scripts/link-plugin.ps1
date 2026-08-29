[CmdletBinding()]
param(
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = '',
    [string]$Profile = 'default'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'server-plugin')).Path
$profileName = $Profile.Trim()
if (-not $profileName) {
    $profileName = 'default'
}
if ($profileName -ne 'default' -and $profileName -notmatch '^[a-z0-9][a-z0-9_-]{0,63}$') {
    throw "Invalid Hermes profile name: $profileName"
}
$profileHome = if ($profileName -eq 'default') {
    $HermesHome
} else {
    Join-Path $HermesHome "profiles\$profileName"
}
$pluginsRoot = Join-Path $profileHome 'plugins'
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

$enableArguments = @()
if ($profileName -ne 'default') {
    $enableArguments += @('--profile', $profileName)
}
$enableArguments += @(
    'plugins',
    'enable',
    '--no-allow-tool-override',
    'hermes-mobile'
)
& $HermesExecutable @enableArguments
if ($LASTEXITCODE -ne 0) {
    throw "Hermes could not enable the hermes-mobile plugin for profile $profileName"
}

Write-Host "Hermes Mobile linked for profile $profileName at $target"
Write-Host 'Restart the target Hermes server process to load the plugin.'
