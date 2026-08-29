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
