function Get-HermesDesktopRoutePreference {
    param([Parameter(Mandatory = $true)][string]$UserDataDirectory)

    $routePath = Join-Path $UserDataDirectory 'active-backend-route.json'
    if (-not (Test-Path -LiteralPath $routePath -PathType Leaf)) {
        return [pscustomobject]@{
            Published = $false
            Local = $false
            Profile = ''
        }
    }

    try {
        $route = Get-Content -LiteralPath $routePath -Raw | ConvertFrom-Json
        $profile = [string]$route.profile
        $validProfile = $profile -eq 'default' -or $profile -match '^[a-z0-9][a-z0-9_-]{0,63}$'
        if ([int]$route.version -ne 1 -or -not [bool]$route.local -or -not $validProfile) {
            return [pscustomobject]@{
                Published = $true
                Local = $false
                Profile = ''
            }
        }

        return [pscustomobject]@{
            Published = $true
            Local = $true
            Profile = $profile
        }
    } catch {
        # An explicitly published but malformed route must not fall back to a
        # different profile and silently show the wrong Desktop session.
        return [pscustomobject]@{
            Published = $true
            Local = $false
            Profile = ''
        }
    }
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
