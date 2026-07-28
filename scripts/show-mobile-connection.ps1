[CmdletBinding()]
param(
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [switch]$RevealToken
)

$ErrorActionPreference = 'Stop'

$tailscale = (Get-Command tailscale.exe -ErrorAction Stop).Source
$status = (& $tailscale status --json | ConvertFrom-Json)
$dnsName = [string]$status.Self.DNSName
if (-not $status.Self.Online -or -not $dnsName) {
    throw "Tailscale is not online or has no MagicDNS name"
}

$tokenPath = Join-Path $HermesHome 'mobile-server\session-token'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    throw "Hermes Mobile credential has not been created"
}

$serveStatus = (& $tailscale serve status --json | ConvertFrom-Json)
if (-not $serveStatus) {
    throw "Tailscale Serve is not configured"
}

Write-Host "Address: https://$($dnsName.TrimEnd('.'))"
if ($RevealToken) {
    Write-Warning 'The next value is a secret. Do not paste it into logs, chat, or issue reports.'
    Write-Host "Token: $([System.IO.File]::ReadAllText($tokenPath).Trim())"
} else {
    Write-Host "Token: stored at $tokenPath"
    Write-Host 'Run this script again with -RevealToken when you are ready to enter it on the phone.'
}
