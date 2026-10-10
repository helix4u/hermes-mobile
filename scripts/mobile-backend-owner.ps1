# Pure attach-only policy. This file has no probes, state writes or process starts.
function Get-HermesMobileOwnerPlan {
    param([ValidateSet('legacy', 'shared-runtime')][string]$BackendOwner = 'legacy', [bool]$DesktopBound, [bool]$DesktopPresent, $Endpoint)
    if ($BackendOwner -eq 'shared-runtime') {
        if ($Endpoint -and $Endpoint.Ready -is [bool] -and $Endpoint.Ready -eq $true) {
            return [pscustomobject]@{ Action = 'bridge'; Endpoint = $Endpoint }
        }
        return [pscustomobject]@{ Action = 'wait'; Endpoint = $null }
    }
    if ($DesktopBound -and (-not $DesktopPresent -or -not $Endpoint)) {
        return [pscustomobject]@{ Action = 'wait'; Endpoint = $null }
    }
    return [pscustomobject]@{ Action = $(if ($Endpoint) { 'bridge' } else { 'serve' }); Endpoint = $Endpoint }
}

function Test-HermesMobileBrokerIdentity {
    param($Expected, $Observed)
    return [bool]($Expected -and $Observed -and $Observed.Ready -is [bool] -and $Observed.Ready -eq $true -and
        -not [string]::IsNullOrWhiteSpace([string]$Expected.IdentityKey) -and
        [string]$Expected.IdentityKey -eq [string]$Observed.IdentityKey -and
        [string]$Expected.Url -eq [string]$Observed.Url -and
        [string]$Expected.BrokerHome -eq [string]$Observed.BrokerHome -and
        [string]$Expected.CodeRoot -eq [string]$Observed.CodeRoot)
}
