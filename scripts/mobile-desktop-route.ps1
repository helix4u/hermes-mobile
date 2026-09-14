function Get-HermesDesktopRoutePreference {
    param([Parameter(Mandatory = $true)][string]$UserDataDirectory)

    $routePath = Join-Path $UserDataDirectory 'active-backend-route.json'
    if (-not (Test-Path -LiteralPath $routePath -PathType Leaf)) {
        return [pscustomobject]@{
            Published = $false
            Local = $false
            External = $false
            Profile = ''
        }
    }

    try {
        $route = Get-Content -LiteralPath $routePath -Raw | ConvertFrom-Json
        $profile = [string]$route.profile
        $validProfile = $profile -eq 'default' -or $profile -match '^[a-z0-9][a-z0-9_-]{0,63}$'
        if ([int]$route.version -eq 1 -and $route.local -eq $false -and -not $profile) {
            return [pscustomobject]@{
                Published = $true
                Local = $false
                External = $true
                Profile = ''
            }
        }
        if ([int]$route.version -ne 1 -or -not [bool]$route.local -or -not $validProfile) {
            return [pscustomobject]@{
                Published = $true
                Local = $false
                External = $false
                Profile = ''
            }
        }

        return [pscustomobject]@{
            Published = $true
            Local = $true
            External = $false
            Profile = $profile
        }
    } catch {
        # An explicitly published but malformed route must not fall back to a
        # different profile and silently show the wrong Desktop session.
        return [pscustomobject]@{
            Published = $true
            Local = $false
            External = $false
            Profile = ''
        }
    }
}

function Select-HermesMobileLocalProfile {
    param(
        [Parameter(Mandatory = $true)]$RoutePreference,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$OwnershipEntries,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$DesktopProcessIds
    )

    if ($RoutePreference.Local) {
        return [string]$RoutePreference.Profile
    }
    if (-not $RoutePreference.External) {
        return $null
    }

    # Cloud is the current Desktop UI route, not the phone's Workstation target.
    # Bind only when there is one plausible Desktop-owned local backend. The
    # caller still verifies its process tree, start markers, token file and
    # authenticated Mobile health before accepting the endpoint.
    $eligibleEntries = @(
        $OwnershipEntries |
            Where-Object {
                [int]$_.parentPid -in $DesktopProcessIds -and
                [string]$_.command -match '(?i)(?:^|\s)serve(?:\s|$)' -and
                ([string]$_.profile -eq 'default' -or [string]$_.profile -match '^[a-z0-9][a-z0-9_-]{0,63}$')
            }
    )
    if ($eligibleEntries.Count -ne 1) {
        return $null
    }
    return [string]$eligibleEntries[0].profile
}

function Test-HermesMobileBackendRoute {
    param(
        [Parameter(Mandatory = $true)]$RoutePreference,
        [Parameter(Mandatory = $true)][string]$Profile
    )

    # A Cloud tab does not change an already verified Workstation binding.
    # Explicit local profile changes and malformed publications still retire it.
    return $RoutePreference.External -or (
        $RoutePreference.Local -and [string]$RoutePreference.Profile -eq $Profile
    )
}

function Select-HermesDesktopBackendCandidate {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Candidates,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Probe
    )

    foreach ($candidate in $Candidates) {
        if (& $Probe $candidate) {
            return $candidate
        }
    }
    return $null
}

function Get-HermesDesktopLoopbackListeners {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [int[]]$ProcessIds,
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$Listeners,
        [int[]]$ExcludedPorts = @()
    )

    $owned = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($processId in $ProcessIds) {
        [void]$owned.Add([int]$processId)
    }

    return @(
        $Listeners |
            Where-Object {
                $port = [int]$_.LocalPort
                $owned.Contains([int]$_.OwningProcess) -and
                [string]$_.LocalAddress -in @('127.0.0.1', '::1') -and
                $port -ge 1024 -and
                $port -notin $ExcludedPorts
            }
    )
}

function Test-HermesMobileHealthResponse {
    param([Parameter(Mandatory = $true)]$Health)

    # Desktop's aggregate status can be degraded for an unrelated stopped
    # messaging gateway while its dashboard and Mobile contract are healthy.
    # The Mobile route itself is the lifecycle authority for these bridges.
    return (
        [string]$Health.status -eq 'ok' -and
        [int]$Health.contract_version -ge 1
    )
}
