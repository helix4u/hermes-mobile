[CmdletBinding()]
param(
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TaskName = 'Hermes_Mobile_Server',
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes')
)

$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop

foreach ($expectedPort in @($Port, $ProxyPort)) {
    $listener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $expectedPort `
        -State Listen `
        -ErrorAction SilentlyContinue
    if (-not $listener) {
        throw "Expected loopback listener is missing: 127.0.0.1:$expectedPort"
    }
}

$tokenPath = Join-Path $HermesHome 'mobile-server\session-token'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw "Hermes Mobile credential has not been created: $tokenPath"
}
$token = [System.IO.File]::ReadAllText($tokenPath).Trim()
if ($token.Length -lt 43) {
    throw 'The Hermes Mobile credential is missing or too short'
}

$headers = @{ Authorization = "Bearer $token" }
$baseUrl = "http://127.0.0.1:$Port/api/plugins/hermes-mobile/v1"
$health = Invoke-RestMethod -Uri "$baseUrl/health" -Headers $headers -Method Get
$capabilities = Invoke-RestMethod `
    -Uri "$baseUrl/capabilities" `
    -Headers $headers `
    -Method Get

if ($health.status -ne 'ok') {
    throw "Hermes Mobile health returned: $($health.status)"
}
if ($capabilities.status -notin @('compatible', 'degraded')) {
    throw "Hermes Mobile compatibility returned: $($capabilities.status)"
}

$serveStatus = $null
$tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue
if ($tailscale) {
    $serveStatus = (& $tailscale.Source serve status --json | ConvertFrom-Json)
}

[pscustomobject]@{
    Task = $TaskName
    TaskState = $task.State
    Backend = "127.0.0.1:$Port"
    Proxy = "127.0.0.1:$ProxyPort"
    Health = $health.status
    Compatibility = $capabilities.status
    ContractVersion = $capabilities.contract_version
    TailscaleServeConfigured = [bool]$serveStatus
}
