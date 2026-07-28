[CmdletBinding()]
param(
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TailnetHost = '',
    [string]$TaskName = 'Hermes_Mobile_Server'
)

$ErrorActionPreference = 'Stop'

$runner = Join-Path $PSScriptRoot 'run-mobile-server.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
    throw "Mobile server runner not found: $runner"
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    $existingActions = @($existing.Actions | ForEach-Object {
        "$($_.Execute) $($_.Arguments)"
    })
    if (-not ($existingActions -match [regex]::Escape($runner))) {
        throw "Refusing to replace unrelated scheduled task: $TaskName"
    }
    if ($existing.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $TaskName
        $deadline = [DateTimeOffset]::Now.AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 250
            $existing = Get-ScheduledTask -TaskName $TaskName
        } while (
            $existing.State -eq 'Running' -and
            [DateTimeOffset]::Now -lt $deadline
        )
        if ($existing.State -eq 'Running') {
            throw "Timed out stopping existing scheduled task: $TaskName"
        }
    }
}

$powerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$arguments = @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-WindowStyle',
    'Hidden',
    '-File',
    "`"$runner`"",
    '-Port',
    $Port.ToString(),
    '-ProxyPort',
    $ProxyPort.ToString()
) -join ' '
if ($TailnetHost) {
    $arguments = "$arguments -TailnetHost `"$TailnetHost`""
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal `
    -UserId $identity `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Persistent loopback Hermes backend for Hermes Mobile over Tailscale Serve.' `
    -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

$deadline = [DateTimeOffset]::Now.AddSeconds(45)
do {
    $listener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue
    if ($listener) {
        break
    }
    Start-Sleep -Milliseconds 500
} while ([DateTimeOffset]::Now -lt $deadline)

if (-not $listener) {
    $stateDirectory = Join-Path $env:LOCALAPPDATA 'hermes\mobile-server'
    throw "Hermes Mobile server did not begin listening. Check $stateDirectory"
}

Write-Host "Hermes Mobile server is listening on 127.0.0.1:$Port"
