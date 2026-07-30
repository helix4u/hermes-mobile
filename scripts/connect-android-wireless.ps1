[CmdletBinding()]
param(
    [string]$AdbPath = "",
    [string]$DeviceIp = "",
    [ValidateRange(1, 60)]
    [int]$WaitSeconds = 12,
    [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AdbExecutable {
    if ($AdbPath) {
        $resolved = Resolve-Path -LiteralPath $AdbPath -ErrorAction Stop
        return $resolved.Path
    }

    $command = Get-Command adb.exe -ErrorAction SilentlyContinue
    if (-not $command) {
        $command = Get-Command adb -ErrorAction SilentlyContinue
    }
    if ($command) {
        return $command.Source
    }

    $sdkRoots = @(
        $env:ANDROID_HOME
        $env:ANDROID_SDK_ROOT
        $(if ($env:LOCALAPPDATA) {
            Join-Path $env:LOCALAPPDATA "Android\Sdk"
        })
    ) | Where-Object { $_ }
    foreach ($sdkRoot in $sdkRoots) {
        $candidate = Join-Path $sdkRoot "platform-tools\adb.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "ADB was not found. Install Android platform-tools or pass -AdbPath."
}

function ConvertFrom-AdbMdnsLine {
    param([string]$Line)

    if ($Line -notmatch "_adb-tls-connect\._tcp\.?\s+(?<endpoint>\S+)\s*$") {
        return $null
    }

    $endpoint = $Matches.endpoint.Trim()
    if ($endpoint.StartsWith("[")) {
        if ($endpoint -notmatch "^\[(?<host>[^\]]+)\]:(?<port>\d+)$") {
            return $null
        }
        $hostName = $Matches.host
        $portNumber = [int]$Matches.port
    } else {
        $colon = $endpoint.LastIndexOf(":")
        if ($colon -le 0) {
            return $null
        }
        $hostName = $endpoint.Substring(0, $colon)
        $portText = $endpoint.Substring($colon + 1)
        $portNumber = 0
        if (-not [int]::TryParse($portText, [ref]$portNumber)) {
            return $null
        }
    }

    [pscustomobject]@{
        Host = $hostName
        Port = $portNumber
        Endpoint = $endpoint
        Service = $Line.Trim()
    }
}

function Get-WirelessDebuggingServices {
    param([string]$Executable)

    $raw = & $Executable mdns services 2>&1
    if ($LASTEXITCODE -ne 0) {
        $detail = ($raw | ForEach-Object { "$_" }) -join [Environment]::NewLine
        throw "ADB mDNS discovery failed.$([Environment]::NewLine)$detail"
    }

    @(
        $raw |
            ForEach-Object { ConvertFrom-AdbMdnsLine "$_" } |
            Where-Object { $null -ne $_ } |
            Sort-Object Endpoint -Unique
    )
}

$adb = Resolve-AdbExecutable
& $adb start-server | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "ADB server startup failed."
}

$deadline = [DateTime]::UtcNow.AddSeconds($WaitSeconds)
$services = @()
do {
    $services = @(Get-WirelessDebuggingServices -Executable $adb)
    if ($DeviceIp) {
        $services = @($services | Where-Object { $_.Host -eq $DeviceIp })
    }
    if ($services.Count -gt 0) {
        break
    }
    Start-Sleep -Milliseconds 750
} while ([DateTime]::UtcNow -lt $deadline)

if ($services.Count -eq 0) {
    $selection = if ($DeviceIp) { " for $DeviceIp" } else { "" }
    throw (
        "No paired Wireless debugging service was discovered$selection. " +
        "Keep Android's Wireless debugging screen open, confirm this workstation " +
        "is still paired, and try again."
    )
}

if ($ListOnly) {
    $services | Select-Object Host, Port, Endpoint
    return
}

if ($services.Count -ne 1) {
    $services | Select-Object Host, Port, Endpoint | Format-Table | Out-Host
    throw (
        "More than one paired device answered. Re-run with -DeviceIp " +
        "for the intended phone; no connection was attempted."
    )
}

$target = $services[0].Endpoint
$connectOutput = & $adb connect $target 2>&1
if ($LASTEXITCODE -ne 0 -or "$connectOutput" -match "(?i)failed|unable|cannot") {
    throw "ADB could not connect to $target. $connectOutput"
}

$escapedTarget = [regex]::Escape($target)
$deviceRows = & $adb devices -l 2>&1
$connected = @(
    $deviceRows | Where-Object { "$_" -match "^$escapedTarget\s+device(?:\s|$)" }
)
if ($connected.Count -ne 1) {
    throw "ADB did not report $target in the ready device state after connecting."
}

Write-Output "Connected to the paired Android device at $target."
