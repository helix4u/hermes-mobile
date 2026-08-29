[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Profile,
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = ''
)

$ErrorActionPreference = 'Stop'

$profileName = $Profile.Trim()
if (-not $profileName) {
    $profileName = 'default'
}
if ($profileName -ne 'default' -and $profileName -notmatch '^[a-z0-9][a-z0-9_-]{0,63}$') {
    throw "Invalid Hermes profile name: $profileName"
}

$mobileLinker = Join-Path $PSScriptRoot 'link-plugin.ps1'
if (-not (Test-Path -LiteralPath $mobileLinker -PathType Leaf)) {
    throw "Hermes Mobile linker not found: $mobileLinker"
}
& $mobileLinker `
    -HermesHome $HermesHome `
    -HermesExecutable $HermesExecutable `
    -Profile $profileName

if ($profileName -eq 'default') {
    return
}

$supportSource = Join-Path $HermesHome 'plugins\support-ops'
if (-not (Test-Path -LiteralPath $supportSource -PathType Container)) {
    return
}

$supportManifest = Join-Path $supportSource 'plugin.yaml'
if (-not (Test-Path -LiteralPath $supportManifest -PathType Leaf)) {
    throw "The installed Support Ops plugin is missing its manifest: $supportSource"
}

$profilePlugins = Join-Path $HermesHome "profiles\$profileName\plugins"
$supportTarget = Join-Path $profilePlugins 'support-ops'
if (-not (Test-Path -LiteralPath $profilePlugins -PathType Container)) {
    New-Item -ItemType Directory -Path $profilePlugins | Out-Null
}

if (Test-Path -LiteralPath $supportTarget) {
    $existing = Get-Item -LiteralPath $supportTarget -Force
    if ($existing.LinkType -eq 'Junction') {
        $resolvedSource = (Resolve-Path -LiteralPath $supportSource).Path
        $resolvedTargets = @($existing.Target | ForEach-Object {
            (Resolve-Path -LiteralPath $_).Path
        })
        if ($resolvedTargets -notcontains $resolvedSource) {
            throw "Refusing to replace existing Support Ops junction: $supportTarget"
        }
    } elseif (-not (Test-Path -LiteralPath (Join-Path $supportTarget 'plugin.yaml') -PathType Leaf)) {
        throw "Refusing to replace existing profile plugin path: $supportTarget"
    }
} else {
    New-Item -ItemType Junction -Path $supportTarget -Target $supportSource | Out-Null
}

if (-not $HermesExecutable) {
    $HermesExecutable = Join-Path $HermesHome 'hermes-agent\venv\Scripts\hermes.exe'
}
if (-not (Test-Path -LiteralPath $HermesExecutable -PathType Leaf)) {
    throw "Hermes executable not found: $HermesExecutable"
}

& $HermesExecutable `
    --profile $profileName `
    plugins enable --no-allow-tool-override support-ops
if ($LASTEXITCODE -ne 0) {
    throw "Hermes could not enable the support-ops plugin for profile $profileName"
}

Write-Host "Support Ops linked for profile $profileName at $supportTarget"
