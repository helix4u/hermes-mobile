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
    if (-not $external.Published -or $external.Local -or -not $external.External) {
        throw 'An explicit external route must be distinguished from malformed route data'
    }
    $ownedBackend = [pscustomobject]@{ profile = 'default'; parentPid = 42; command = 'serve --host 127.0.0.1' }
    if ((Select-HermesMobileLocalProfile -RoutePreference $external -OwnershipEntries @($ownedBackend) -DesktopProcessIds @(42)) -ne 'default') {
        throw 'A unique Desktop-owned local backend must remain usable when Desktop selects Cloud'
    }
    if ($null -ne (Select-HermesMobileLocalProfile -RoutePreference $external -OwnershipEntries @($ownedBackend, $ownedBackend) -DesktopProcessIds @(42))) {
        throw 'An ambiguous external-route backend must fail closed'
    }
    if ($null -ne (Select-HermesMobileLocalProfile -RoutePreference $external -OwnershipEntries @($ownedBackend) -DesktopProcessIds @(99))) {
        throw 'An external-route backend not owned by this Desktop must fail closed'
    }

    Set-Content -LiteralPath (Join-Path $testRoot 'active-backend-route.json') -Value '{bad json'
    $malformed = Get-HermesDesktopRoutePreference -UserDataDirectory $testRoot
    if (-not $malformed.Published -or $malformed.Local -or $malformed.External) {
        throw 'A malformed published route must fail closed'
    }
    if ($null -ne (Select-HermesMobileLocalProfile -RoutePreference $malformed -OwnershipEntries @($ownedBackend) -DesktopProcessIds @(42))) {
        throw 'Malformed route data must not select even a plausible local backend'
    }
    foreach ($route in @($local, $external, $local)) {
        if (-not (Test-HermesMobileBackendRoute -RoutePreference $route -Profile 'inbox-triage')) {
            throw 'Local to Cloud to the same local profile must retain the verified bridge'
        }
    }
    foreach ($route in @($local, $malformed)) {
        if (Test-HermesMobileBackendRoute -RoutePreference $route -Profile 'another-profile') {
            throw 'Changed profile or malformed route must retire the previous binding'
        }
    }

    $candidates = @(
        [pscustomobject]@{ Url = 'http://127.0.0.1:60001'; Kind = 'unrelated' },
        [pscustomobject]@{ Url = 'http://127.0.0.1:60002'; Kind = 'hermes' }
    )
    # Desktop publishes ownership before its socket is bound. An empty poll
    # must keep the supervisor alive so the next ready poll can recover.
    $startingBackend = Select-HermesDesktopBackendCandidate -Candidates @() -Probe {
        throw 'An empty candidate list must not probe a backend'
    }
    if ($null -ne $startingBackend) {
        throw 'An empty startup poll must wait without selecting a backend'
    }
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

    $listeners = @(
        [pscustomobject]@{ OwningProcess = 40; LocalAddress = '127.0.0.1'; LocalPort = 60001 },
        [pscustomobject]@{ OwningProcess = 41; LocalAddress = '::1'; LocalPort = 60002 },
        [pscustomobject]@{ OwningProcess = 99; LocalAddress = '127.0.0.1'; LocalPort = 60003 },
        [pscustomobject]@{ OwningProcess = 40; LocalAddress = '0.0.0.0'; LocalPort = 60004 },
        [pscustomobject]@{ OwningProcess = 40; LocalAddress = '127.0.0.1'; LocalPort = 9130 }
    )
    if (@(Get-HermesDesktopLoopbackListeners -ProcessIds @(40) -Listeners @()).Count -ne 0) {
        throw 'An empty listener snapshot must wait without terminating the supervisor'
    }
    if (@(Get-HermesDesktopLoopbackListeners -ProcessIds @() -Listeners $listeners).Count -ne 0) {
        throw 'No verified process must yield no listeners'
    }
    $ownedListeners = @(
        Get-HermesDesktopLoopbackListeners `
            -ProcessIds @(40, 41) `
            -Listeners $listeners `
            -ExcludedPorts @(9129, 9130)
    )
    if (
        $ownedListeners.Count -ne 2 -or
        @($ownedListeners.LocalPort | Sort-Object) -join ',' -ne '60001,60002'
    ) {
        throw 'Listener discovery must retain only verified-process loopback ports'
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
