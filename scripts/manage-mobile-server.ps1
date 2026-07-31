[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop', 'Restart', 'Status', 'Uninstall')]
    [string]$Action,
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TaskName = 'Hermes_Mobile_Server',
    [string]$Runner = (Join-Path $PSScriptRoot 'run-mobile-server.ps1')
)

$ErrorActionPreference = 'Stop'

function Get-HermesMobileTask {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        return $null
    }
    $actions = @($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" })
    if (-not ($actions -match [regex]::Escape($Runner))) {
        throw "Refusing to manage unrelated scheduled task: $TaskName"
    }
    return $task
}

function Get-HermesMobileListener {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ListenerPort,
        [Parameter(Mandatory = $true)]
        [ValidateSet('server', 'proxy')]
        [string]$Role
    )

    $proxyScript = Join-Path $PSScriptRoot 'mobile_proxy.py'
    $rows = @()
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
            throw "Refusing to manage unrelated process $($process.ProcessId) listening on 127.0.0.1:$ListenerPort"
        }
        $rows += $process
    }
    return $rows
}

function Stop-HermesMobileHost {
    $task = Get-HermesMobileTask
    if ($task -and $task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $TaskName
        $deadline = [DateTimeOffset]::Now.AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 250
            $task = Get-HermesMobileTask
        } while ($task -and $task.State -eq 'Running' -and [DateTimeOffset]::Now -lt $deadline)
        if ($task -and $task.State -eq 'Running') {
            throw "Timed out stopping scheduled task: $TaskName"
        }
    }

    # Task Scheduler does not reliably put Start-Process descendants in the
    # task job object. Retire only listeners that prove they belong to this
    # exact loopback server/proxy pair.
    $deadline = [DateTimeOffset]::Now.AddSeconds(20)
    do {
        $owned = @(
            Get-HermesMobileListener -ListenerPort $Port -Role server
            Get-HermesMobileListener -ListenerPort $ProxyPort -Role proxy
        )
        foreach ($process in $owned) {
            & taskkill.exe /PID $process.ProcessId /T /F 2>$null | Out-Null
        }
        $remaining = @(
            Get-NetTCPConnection `
                -LocalAddress 127.0.0.1 `
                -LocalPort $Port, $ProxyPort `
                -State Listen `
                -ErrorAction SilentlyContinue
        )
        if ($remaining.Count -eq 0) {
            return
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::Now -lt $deadline)
    throw "Timed out stopping Hermes Mobile listeners on ports $Port and $ProxyPort"
}

function Start-HermesMobileHost {
    $task = Get-HermesMobileTask
    if (-not $task) {
        throw "Hermes Mobile service is not installed: $TaskName"
    }

    $listeners = @(
        Get-NetTCPConnection `
            -LocalAddress 127.0.0.1 `
            -LocalPort $Port, $ProxyPort `
            -State Listen `
            -ErrorAction SilentlyContinue
    )
    if ($task.State -eq 'Running' -and $listeners.Count -eq 2) {
        return
    }
    if ($listeners.Count -gt 0) {
        # This validates ownership and throws before Start-ScheduledTask can
        # collide with an unrelated process.
        Get-HermesMobileListener -ListenerPort $Port -Role server | Out-Null
        Get-HermesMobileListener -ListenerPort $ProxyPort -Role proxy | Out-Null
        throw 'Hermes Mobile has stale owned listeners; run restart instead.'
    }
    if ($task.State -ne 'Running') {
        Start-ScheduledTask -TaskName $TaskName
    }
}

function Get-HermesMobileStatus {
    $task = Get-HermesMobileTask
    $arguments = if ($task) { [string]@($task.Actions)[0].Arguments } else { '' }
    $startupMode = if ($arguments -match '(?i)-DesktopExecutable(?:\s|$)') {
        'desktop'
    } elseif ($task -and @($task.Triggers).Count -gt 0) {
        'persistent'
    } elseif ($task) {
        'manual'
    } else {
        'not-installed'
    }
    $desktopRunning = $null
    if ($startupMode -eq 'desktop') {
        $desktopExecutable = if ($arguments -match '(?i)-DesktopExecutable\s+"([^"]+)"') {
            $Matches[1]
        } elseif ($arguments -match '(?i)-DesktopExecutable\s+(\S+)') {
            $Matches[1]
        } else {
            ''
        }
        $desktopRunning = $false
        if ($desktopExecutable) {
            $expected = [System.IO.Path]::GetFullPath($desktopExecutable)
            $desktopRunning = [bool]@(
                Get-CimInstance Win32_Process -Filter "Name = 'Hermes.exe'" -ErrorAction SilentlyContinue |
                    Where-Object {
                        $_.ExecutablePath -and
                        [string]::Equals(
                            [System.IO.Path]::GetFullPath([string]$_.ExecutablePath),
                            $expected,
                            [StringComparison]::OrdinalIgnoreCase
                        )
                    }
            )
        }
    }
    $backend = @(Get-HermesMobileListener -ListenerPort $Port -Role server)
    $proxy = @(Get-HermesMobileListener -ListenerPort $ProxyPort -Role proxy)
    [pscustomobject]@{
        Task = $TaskName
        Installed = [bool]$task
        TaskState = if ($task) { [string]$task.State } else { 'NotInstalled' }
        StartupMode = $startupMode
        DesktopRunning = $desktopRunning
        BackendListening = $backend.Count -gt 0
        BackendPid = if ($backend.Count -gt 0) { $backend[0].ProcessId } else { $null }
        ProxyListening = $proxy.Count -gt 0
        ProxyPid = if ($proxy.Count -gt 0) { $proxy[0].ProcessId } else { $null }
    }
}

switch ($Action) {
    'Start' {
        Start-HermesMobileHost
        Start-Sleep -Milliseconds 500
        Get-HermesMobileStatus | ConvertTo-Json -Compress
    }
    'Stop' {
        Stop-HermesMobileHost
        Get-HermesMobileStatus | ConvertTo-Json -Compress
    }
    'Restart' {
        Stop-HermesMobileHost
        Start-HermesMobileHost
        Start-Sleep -Milliseconds 500
        Get-HermesMobileStatus | ConvertTo-Json -Compress
    }
    'Status' {
        Get-HermesMobileStatus | ConvertTo-Json -Compress
    }
    'Uninstall' {
        Stop-HermesMobileHost
        $task = Get-HermesMobileTask
        if ($task) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        Get-HermesMobileStatus | ConvertTo-Json -Compress
    }
}
