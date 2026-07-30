[CmdletBinding()]
param(
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TailnetHost = '',
    [string]$TaskName = 'Hermes_Mobile_Server',
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = ''
)

$ErrorActionPreference = 'Stop'

$runner = Join-Path $PSScriptRoot 'run-mobile-server.ps1'
$proxyScript = Join-Path $PSScriptRoot 'mobile_proxy.py'
if (-not (Test-Path -LiteralPath $runner)) {
    throw "Mobile server runner not found: $runner"
}

function Stop-HermesMobileListener {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ListenerPort,
        [Parameter(Mandatory = $true)]
        [ValidateSet('server', 'proxy')]
        [string]$Role
    )

    $listeners = @(
        Get-NetTCPConnection `
            -LocalAddress 127.0.0.1 `
            -LocalPort $ListenerPort `
            -State Listen `
            -ErrorAction SilentlyContinue
    )
    foreach ($listener in $listeners) {
        $process = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "ProcessId = $($listener.OwningProcess)" `
            -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }

        $commandLine = [string]$process.CommandLine
        $owned = if ($Role -eq 'server') {
            $commandLine -match '(?i)(?:^|\s)serve(?:\s|$)' -and
            $commandLine -match '(?i)--host\s+127\.0\.0\.1(?:\s|$)' -and
            $commandLine -match "(?i)--port\s+$ListenerPort(?:\s|$)"
        } else {
            $commandLine.Contains($proxyScript, [StringComparison]::OrdinalIgnoreCase) -and
            $commandLine -match "(?i)--port\s+$ListenerPort(?:\s|$)" -and
            $commandLine -match "(?i)--upstream\s+http://127\.0\.0\.1:$Port(?:\s|$)"
        }
        if (-not $owned) {
            throw "Refusing to stop unrelated process $($process.ProcessId) listening on 127.0.0.1:$ListenerPort"
        }

        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
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

# Stop-ScheduledTask terminates the scheduled PowerShell process, but Windows
# does not reliably keep Start-Process children in the task's job object. A
# refresh could therefore leave the old backend and proxy listening while the
# replacement task crash-looped against their occupied ports. Retire only
# listeners whose command lines match this Mobile server's exact loopback
# roles, then require both ports to be free before registering the replacement.
$cleanupDeadline = [DateTimeOffset]::Now.AddSeconds(20)
do {
    Stop-HermesMobileListener -ListenerPort $Port -Role server
    Stop-HermesMobileListener -ListenerPort $ProxyPort -Role proxy
    $remainingListeners = @(
        Get-NetTCPConnection `
            -LocalAddress 127.0.0.1 `
            -LocalPort $Port, $ProxyPort `
            -State Listen `
            -ErrorAction SilentlyContinue
    )
    if ($remainingListeners.Count -eq 0) {
        break
    }
    Start-Sleep -Milliseconds 250
} while ([DateTimeOffset]::Now -lt $cleanupDeadline)
if ($remainingListeners.Count -ne 0) {
    throw "Timed out retiring the previous Hermes Mobile listeners on ports $Port and $ProxyPort"
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
    $ProxyPort.ToString(),
    '-HermesHome',
    "`"$HermesHome`""
) -join ' '
if ($TailnetHost) {
    $arguments = "$arguments -TailnetHost `"$TailnetHost`""
}
if ($HermesExecutable) {
    $arguments = "$arguments -HermesExecutable `"$HermesExecutable`""
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument $arguments `
    -WorkingDirectory $PSScriptRoot
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
    $backendListener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue
    $proxyListener = Get-NetTCPConnection `
        -LocalAddress 127.0.0.1 `
        -LocalPort $ProxyPort `
        -State Listen `
        -ErrorAction SilentlyContinue
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($backendListener -and $proxyListener -and $task.State -eq 'Running') {
        break
    }
    Start-Sleep -Milliseconds 500
} while ([DateTimeOffset]::Now -lt $deadline)

if (-not $backendListener -or -not $proxyListener -or $task.State -ne 'Running') {
    $stateDirectory = Join-Path $HermesHome 'mobile-server'
    throw "Hermes Mobile server did not stabilize on ports $Port and $ProxyPort. Check $stateDirectory"
}

Write-Host "Hermes Mobile server is listening on 127.0.0.1:$Port with proxy 127.0.0.1:$ProxyPort"
