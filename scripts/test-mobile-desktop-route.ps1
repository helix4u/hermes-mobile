$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'mobile-desktop-route.ps1')

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('hermes-mobile-route-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
    $missing = Get-HermesDesktopRoutePreference -UserDataDirectory $testRoot
    if ($missing.Published) {
        throw 'A missing active route must allow the legacy fallback'
    }

    @{ version = 1; local = $true; profile = 'inbox-triage' } |
        ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $testRoot 'active-backend-route.json')
    $local = Get-HermesDesktopRoutePreference -UserDataDirectory $testRoot
    if (-not $local.Published -or -not $local.Local -or $local.Profile -ne 'inbox-triage') {
        throw 'A published local route did not retain its exact profile'
    }

    @{ version = 1; local = $false; profile = $null } |
        ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $testRoot 'active-backend-route.json')
    $external = Get-HermesDesktopRoutePreference -UserDataDirectory $testRoot
    if (-not $external.Published -or $external.Local) {
        throw 'An external route must fail closed instead of selecting a local fallback'
    }

    Set-Content -LiteralPath (Join-Path $testRoot 'active-backend-route.json') -Value '{bad json'
    $malformed = Get-HermesDesktopRoutePreference -UserDataDirectory $testRoot
    if (-not $malformed.Published -or $malformed.Local) {
        throw 'A malformed published route must fail closed'
    }

    $candidates = @(
        [pscustomobject]@{ Url = 'http://127.0.0.1:60001'; Kind = 'unrelated' },
        [pscustomobject]@{ Url = 'http://127.0.0.1:60002'; Kind = 'hermes' }
    )
    $selected = Select-HermesDesktopBackendCandidate -Candidates $candidates -Probe {
        param($candidate)
        $candidate.Kind -eq 'hermes'
    }
    if (-not $selected -or $selected.Url -ne 'http://127.0.0.1:60002') {
        throw 'Backend selection must skip an unrelated listener owned by the same process'
    }

    $missingBackend = Select-HermesDesktopBackendCandidate -Candidates $candidates -Probe {
        param($candidate)
        $false
    }
    if ($null -ne $missingBackend) {
        throw 'Backend selection must fail closed when no candidate passes its Hermes probe'
    }

    $healthyMobile = [pscustomobject]@{
        status = 'ok'
        contract_version = 1
    }
    if (-not (Test-HermesMobileHealthResponse -Health $healthyMobile)) {
        throw 'A healthy authenticated Mobile contract must be accepted'
    }

    foreach ($unhealthyMobile in @(
        [pscustomobject]@{ status = 'degraded'; contract_version = 1 },
        [pscustomobject]@{ status = 'ok'; contract_version = 0 },
        [pscustomobject]@{ status = 'ok' }
    )) {
        if (Test-HermesMobileHealthResponse -Health $unhealthyMobile) {
            throw 'An unhealthy or invalid Mobile contract must fail closed'
        }
    }
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}

Write-Output 'Desktop active-backend route tests passed'
