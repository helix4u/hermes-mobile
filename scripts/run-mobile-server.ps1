[CmdletBinding()]
param(
    [int]$Port = 9129,
    [int]$ProxyPort = 9130,
    [string]$TailnetHost = '',
    [string]$HermesHome = (Join-Path $env:LOCALAPPDATA 'hermes'),
    [string]$HermesExecutable = '',
    [string]$DesktopExecutable = ''
)

$ErrorActionPreference = 'Stop'

if ($Port -lt 1024 -or $Port -gt 65535) {
    throw "Port must be between 1024 and 65535"
}

if (-not $HermesExecutable) {
    $HermesExecutable = Join-Path $HermesHome 'hermes-agent\venv\Scripts\hermes.exe'
}
if (-not (Test-Path -LiteralPath $HermesExecutable)) {
    throw "Hermes executable not found: $HermesExecutable"
}

if (-not $TailnetHost) {
    $tailscale = (Get-Command tailscale.exe -ErrorAction Stop).Source
    $tailscaleStatus = (& $tailscale status --json | ConvertFrom-Json)
    $TailnetHost = ([string]$tailscaleStatus.Self.DNSName).TrimEnd('.')
    if (-not $tailscaleStatus.Self.Online -or -not $TailnetHost) {
        throw 'Tailscale is not online or has no MagicDNS name'
    }
}

$stateDirectory = Join-Path $HermesHome 'mobile-server'
$tokenPath = Join-Path $stateDirectory 'session-token'
$stdoutPath = Join-Path $stateDirectory 'server.stdout.log'
$stderrPath = Join-Path $stateDirectory 'server.stderr.log'
$launcherLog = Join-Path $stateDirectory 'launcher.log'
$proxyStdoutPath = Join-Path $stateDirectory 'proxy.stdout.log'
$proxyStderrPath = Join-Path $stateDirectory 'proxy.stderr.log'
$proxyScript = Join-Path $PSScriptRoot 'mobile_proxy.py'
$desktopProcessScript = Join-Path $PSScriptRoot 'mobile-desktop-process.ps1'
$desktopRouteScript = Join-Path $PSScriptRoot 'mobile-desktop-route.ps1'
$pythonExecutable = Join-Path (Split-Path -Parent $HermesExecutable) 'python.exe'
$lifecycleTraceId = [guid]::NewGuid().ToString('N')
$serverWorkingDirectory = if (
    $env:USERPROFILE -and
    (Test-Path -LiteralPath $env:USERPROFILE -PathType Container)
) {
    $env:USERPROFILE
} else {
    $HermesHome
}

if (-not (Test-Path -LiteralPath $desktopProcessScript -PathType Leaf)) {
    throw "Desktop process identity helper not found: $desktopProcessScript"
}
. $desktopProcessScript
if (-not (Test-Path -LiteralPath $desktopRouteScript -PathType Leaf)) {
    throw "Desktop route helper not found: $desktopRouteScript"
}
. $desktopRouteScript

function Write-MobileLifecycleEvent {
    param(
        [Parameter(Mandatory = $true)][string]$Event,
        [Parameter(Mandatory = $true)][string]$Phase,
        [string]$Outcome = '',
        [hashtable]$Fields = @{}
    )

    $record = [ordered]@{
        ts = [DateTimeOffset]::Now.ToString('O')
        trace = $lifecycleTraceId
        lane = 'mobile-bridge'
        event = $Event
        phase = $Phase
    }
    if ($Outcome) {
        $record.outcome = $Outcome
    }
    foreach ($key in @($Fields.Keys | Sort-Object)) {
        $record[[string]$key] = $Fields[$key]
    }
    [System.IO.File]::AppendAllText(
        $launcherLog,
        "LIFECYCLE $($record | ConvertTo-Json -Compress)`r`n"
    )
}

function Test-DesktopRunning {
    if (-not $DesktopExecutable) {
        return $true
    }
    return @(Get-HermesDesktopProcessIds -DesktopExecutable $DesktopExecutable).Count -gt 0
}

function Get-BackendProcessTree {
    param([int]$RootProcessId)

    $allProcesses = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    )
    $byParent = @{}
    foreach ($candidate in $allProcesses) {
        $parentId = [int]$candidate.ParentProcessId
        if (-not $byParent.ContainsKey($parentId)) {
            $byParent[$parentId] = [System.Collections.Generic.List[object]]::new()
        }
        $byParent[$parentId].Add($candidate)
    }

    $queue = [System.Collections.Generic.Queue[int]]::new()
    $seen = [System.Collections.Generic.HashSet[int]]::new()
    $queue.Enqueue($RootProcessId)
    while ($queue.Count -gt 0) {
        $processId = $queue.Dequeue()
        if (-not $seen.Add($processId)) {
            continue
        }
        $process = $allProcesses | Where-Object { [int]$_.ProcessId -eq $processId } | Select-Object -First 1
        if ($process) {
            $process
        }
        if ($byParent.ContainsKey($processId)) {
            foreach ($child in $byParent[$processId]) {
                $queue.Enqueue([int]$child.ProcessId)
            }
        }
    }
}

function Test-ProcessStartMarker {
    param(
        [Parameter(Mandatory = $true)]
        $Process,
        [Parameter(Mandatory = $true)]
        [string]$Marker
    )

    if (-not $Process.CreationDate) {
        return $false
    }
    if ($Marker -match '^win:(\d+)$') {
        $expectedTicks = [long]$Matches[1]
        $actualTicks = [long]$Process.CreationDate.ToUniversalTime().Ticks
        return [Math]::Abs($actualTicks - $expectedTicks) -le 10000
    }
    if ($Marker -match '^winms:(\d+)$') {
        $expectedMilliseconds = [long]$Matches[1]
        $actualMilliseconds = [long]([DateTimeOffset]$Process.CreationDate).ToUnixTimeMilliseconds()
        return [Math]::Abs($actualMilliseconds - $expectedMilliseconds) -le 1000
    }
    return $false
}

function Get-DesktopBackendEndpoint {
    if (-not $DesktopExecutable) {
        return $null
    }

    $desktopPids = @(Get-HermesDesktopProcessIds -DesktopExecutable $DesktopExecutable)
    if ($desktopPids.Count -eq 0) {
        return $null
    }

    $userDataDirectory = Join-Path $env:APPDATA 'Hermes'
    $ownershipPath = Join-Path $userDataDirectory 'backend-ownership.json'
    $accessDirectory = [System.IO.Path]::GetFullPath((Join-Path $userDataDirectory 'backend-access'))
    if (-not (Test-Path -LiteralPath $ownershipPath -PathType Leaf)) {
        return $null
    }

    $routePreference = Get-HermesDesktopRoutePreference -UserDataDirectory $userDataDirectory
    if ($routePreference.Published) {
        if (-not $routePreference.Local) {
            return $null
        }
        $activeProfile = [string]$routePreference.Profile
    } else {
        $activeProfile = 'default'
        $activeProfilePath = Join-Path $userDataDirectory 'active-profile.json'
        if (Test-Path -LiteralPath $activeProfilePath -PathType Leaf) {
            try {
                $configured = [string](Get-Content -LiteralPath $activeProfilePath -Raw | ConvertFrom-Json).profile
                if ($configured.Trim()) {
                    $activeProfile = $configured.Trim()
                }
            } catch {
                $activeProfile = 'default'
            }
        }
    }

    try {
        $entries = @((Get-Content -LiteralPath $ownershipPath -Raw | ConvertFrom-Json).backends)
    } catch {
        return $null
    }

    $listenerSnapshot = $null

    foreach ($entry in $entries) {
        if (
            [string]$entry.profile -ne $activeProfile -or
            [int]$entry.parentPid -notin $desktopPids
        ) {
            continue
        }
        $backendPid = [int]$entry.pid
        $processTree = @(Get-BackendProcessTree -RootProcessId $backendPid)
        $rootProcess = $processTree | Where-Object { [int]$_.ProcessId -eq $backendPid } | Select-Object -First 1
        $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$entry.parentPid)" -ErrorAction SilentlyContinue
        $ownedCommand = [string]$entry.command
        if (
            -not $rootProcess -or
            [int]$rootProcess.ParentProcessId -ne [int]$entry.parentPid -or
            -not [string]$entry.startMarker -or
            -not $parentProcess -or
            -not [string]$entry.parentStartMarker -or
            -not (Test-ProcessStartMarker -Process $rootProcess -Marker ([string]$entry.startMarker)) -or
            -not (Test-ProcessStartMarker -Process $parentProcess -Marker ([string]$entry.parentStartMarker)) -or
            $ownedCommand -notmatch '(?i)(?:^|\s)serve(?:\s|$)' -or
            $ownedCommand -notmatch '(?i)--host\s+127\.0\.0\.1(?:\s|$)'
        ) {
            continue
        }
        $accessTokenFile = [string]$entry.accessTokenFile
        if (-not $accessTokenFile) {
            continue
        }
        try {
            $accessTokenFile = [System.IO.Path]::GetFullPath($accessTokenFile)
        } catch {
            continue
        }
        if (
            -not $accessTokenFile.StartsWith(
                "$accessDirectory$([System.IO.Path]::DirectorySeparatorChar)",
                [StringComparison]::OrdinalIgnoreCase
            ) -or
            -not (Test-Path -LiteralPath $accessTokenFile -PathType Leaf)
        ) {
            continue
        }
        # Windows venv launchers can remain as the ownership PID while the base
        # interpreter child owns the socket. CIM can hide both command lines in
        # packaged Desktop. The ownership record, start markers, Desktop parent,
        # and subtree above prove identity before accepting a loopback listener.
        # One system-wide listener snapshot is substantially cheaper and more
        # predictable than a separate CIM-backed query for every launcher and
        # interpreter in the verified backend process tree. Filter the snapshot
        # only after the ownership and start-marker checks above have passed.
        if ($null -eq $listenerSnapshot) {
            $listenerSnapshot = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)
        }
        $backendProcessIds = @($processTree | ForEach-Object { [int]$_.ProcessId })
        $listeners = @(
            Get-HermesDesktopLoopbackListeners `
                -ProcessIds $backendProcessIds `
                -Listeners $listenerSnapshot `
                -ExcludedPorts @($Port, $ProxyPort)
        )
        $candidates = @()
        foreach ($listener in $listeners) {
            $listenerPort = [int]$listener.LocalPort
            $candidates += [pscustomobject]@{
                Url = "http://127.0.0.1:$listenerPort"
                AccessTokenFile = $accessTokenFile
                Profile = $activeProfile
                IdentityKey = "$backendPid|$listenerPort|$accessTokenFile"
            }
        }
        # A Hermes backend process can own unrelated loopback listeners in
        # addition to the JSON API. Never select a port by enumeration order.
        # Prove that the candidate serves the authenticated Mobile contract.
        $selected = Select-HermesDesktopBackendCandidate -Candidates $candidates -Probe {
            param($candidate)
            Test-DesktopBackendApi -Backend $candidate
        }
        if ($selected) {
            return $selected
        }
    }
    return $null
}

function Test-DesktopBackendApi {
    param([Parameter(Mandatory = $true)]$Backend)

    try {
        $accessToken = [System.IO.File]::ReadAllText([string]$Backend.AccessTokenFile).Trim()
        if ($accessToken.Length -lt 32) {
            return $false
        }
        $health = Invoke-RestMethod `
            -Uri "$([string]$Backend.Url)/api/plugins/hermes-mobile/v1/health" `
            -Headers @{ Authorization = "Bearer $accessToken" } `
            -Method Get `
            -TimeoutSec 2
        return Test-HermesMobileHealthResponse -Health $health
    } catch {
        return $false
    }
}

function Get-DesktopBackendStability {
    param($ExpectedBackend)

    if (-not $ExpectedBackend) {
        return [pscustomobject]@{ Stable = $true; Transient = $false; Reason = '' }
    }
    $routePreference = Get-HermesDesktopRoutePreference -UserDataDirectory (Join-Path $env:APPDATA 'Hermes')
    if ($routePreference.Published) {
        if (
            -not $routePreference.Local -or
            [string]$routePreference.Profile -ne [string]$ExpectedBackend.Profile
        ) {
            return [pscustomobject]@{
                Stable = $false
                Transient = $false
                Reason = 'route-changed'
            }
        }
    } else {
        $fallbackProfile = 'default'
        $activeProfilePath = Join-Path $env:APPDATA 'Hermes\active-profile.json'
        if (Test-Path -LiteralPath $activeProfilePath -PathType Leaf) {
            try {
                $configured = [string](Get-Content -LiteralPath $activeProfilePath -Raw | ConvertFrom-Json).profile
                if ($configured.Trim()) {
                    $fallbackProfile = $configured.Trim()
                }
            } catch {
                $fallbackProfile = 'default'
            }
        }
        if ($fallbackProfile -ne [string]$ExpectedBackend.Profile) {
            return [pscustomobject]@{
                Stable = $false
                Transient = $false
                Reason = 'profile-changed'
            }
        }
    }
    if (Test-DesktopBackendApi -Backend $ExpectedBackend) {
        return [pscustomobject]@{ Stable = $true; Transient = $false; Reason = '' }
    }
    return [pscustomobject]@{
        Stable = $false
        Transient = $true
        Reason = 'health-probe-failed'
    }
}

if (-not (Test-Path -LiteralPath $proxyScript)) {
    throw "Mobile reverse proxy not found: $proxyScript"
}
if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw "Hermes Python executable not found: $pythonExecutable"
}

[System.IO.Directory]::CreateDirectory($stateDirectory) | Out-Null

if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = [byte[]]::new(48)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [System.IO.File]::WriteAllText(
        $tokenPath,
        $token,
        [System.Text.UTF8Encoding]::new($false)
    )

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $tokenPath -AclObject $acl
}

$token = [System.IO.File]::ReadAllText($tokenPath).Trim()
if ($token.Length -lt 43) {
    throw "The mobile server credential is missing or too short"
}

$mutex = [System.Threading.Mutex]::new(
    $false,
    'Local\HermesMobileServer'
)
if (-not $mutex.WaitOne(0)) {
    throw "Hermes Mobile server is already running"
}

try {
    $backendWaitStartedAt = $null
    $backendWaitPolls = 0
    $bridgeGeneration = 0
    while ($true) {
        if (-not (Test-DesktopRunning)) {
            $desktopWaitStartedAt = [DateTimeOffset]::Now
            Write-MobileLifecycleEvent -Event 'desktop-presence' -Phase 'begin'
            $waitPolls = Wait-HermesDesktopPresence `
                -Probe { Test-DesktopRunning } `
                -PollMilliseconds 500
            Write-MobileLifecycleEvent `
                -Event 'desktop-presence' `
                -Phase 'end' `
                -Outcome 'available' `
                -Fields @{
                    polls = $waitPolls
                    elapsed_ms = [int]([DateTimeOffset]::Now - $desktopWaitStartedAt).TotalMilliseconds
                }
            $backendWaitStartedAt = $null
            $backendWaitPolls = 0
            continue
        }

        $desktopBackend = Get-DesktopBackendEndpoint
        if ($DesktopExecutable -and -not $desktopBackend) {
            if ($null -eq $backendWaitStartedAt) {
                $backendWaitStartedAt = [DateTimeOffset]::Now
                $backendWaitPolls = 0
                Write-MobileLifecycleEvent -Event 'desktop-backend' -Phase 'begin'
            }
            $backendWaitPolls += 1
            Start-Sleep -Milliseconds 500
            continue
        }
        if ($null -ne $backendWaitStartedAt) {
            Write-MobileLifecycleEvent `
                -Event 'desktop-backend' `
                -Phase 'end' `
                -Outcome 'resolved' `
                -Fields @{
                    polls = $backendWaitPolls
                    elapsed_ms = [int]([DateTimeOffset]::Now - $backendWaitStartedAt).TotalMilliseconds
                    profile = [string]$desktopBackend.Profile
                }
            $backendWaitStartedAt = $null
            $backendWaitPolls = 0
        }

        $upstream = if ($desktopBackend) { [string]$desktopBackend.Url } else { "http://127.0.0.1:$Port" }
        $bridgeGeneration += 1
        Write-MobileLifecycleEvent `
            -Event 'bridge-generation' `
            -Phase 'begin' `
            -Fields @{
                generation = $bridgeGeneration
                profile = if ($desktopBackend) { [string]$desktopBackend.Profile } else { 'standalone' }
            }
        $launcherMessage = if ($desktopBackend) {
            "[$([DateTimeOffset]::Now.ToString('O'))] attaching Mobile bridges on 127.0.0.1:$Port and 127.0.0.1:$ProxyPort to the Desktop backend`r`n"
        } else {
            "[$([DateTimeOffset]::Now.ToString('O'))] starting Hermes Mobile server on 127.0.0.1:$Port with proxy 127.0.0.1:$ProxyPort for $TailnetHost`r`n"
        }
        [System.IO.File]::AppendAllText($launcherLog, $launcherMessage)

        if ($desktopBackend) {
            $server = Start-Process `
                -FilePath $pythonExecutable `
                -ArgumentList @(
                    $proxyScript,
                    '--host',
                    '127.0.0.1',
                    '--port',
                    $Port.ToString(),
                    '--upstream',
                    $upstream,
                    '--allowed-host',
                    $TailnetHost,
                    '--credential-file',
                    $tokenPath,
                    '--upstream-credential-file',
                    [string]$desktopBackend.AccessTokenFile
                ) `
                -WorkingDirectory $PSScriptRoot `
                -WindowStyle Hidden `
                -RedirectStandardOutput $stdoutPath `
                -RedirectStandardError $stderrPath `
                -PassThru
        } else {
            $env:HERMES_DASHBOARD_SESSION_TOKEN = $token
            $server = Start-Process `
                -FilePath $HermesExecutable `
                -ArgumentList @(
                    'serve',
                    '--host',
                    '127.0.0.1',
                    '--port',
                    $Port.ToString()
                ) `
                -WorkingDirectory $serverWorkingDirectory `
                -WindowStyle Hidden `
                -RedirectStandardOutput $stdoutPath `
                -RedirectStandardError $stderrPath `
                -PassThru
        }

        $proxyArguments = @(
            $proxyScript,
            '--host',
            '127.0.0.1',
            '--port',
            $ProxyPort.ToString(),
            '--upstream',
            $upstream,
            '--allowed-host',
            $TailnetHost
        )
        if ($desktopBackend) {
            $proxyArguments += @(
                '--credential-file',
                $tokenPath,
                '--upstream-credential-file',
                [string]$desktopBackend.AccessTokenFile
            )
        }

        $proxy = Start-Process `
            -FilePath $pythonExecutable `
            -ArgumentList $proxyArguments `
            -WorkingDirectory $PSScriptRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $proxyStdoutPath `
            -RedirectStandardError $proxyStderrPath `
            -PassThru

        Write-MobileLifecycleEvent `
            -Event 'bridge-generation' `
            -Phase 'end' `
            -Outcome 'spawned' `
            -Fields @{
                generation = $bridgeGeneration
                server_pid = $server.Id
                proxy_pid = $proxy.Id
            }

        $exitReason = ''
        $healthFailureStartedAt = $null
        $healthFailurePolls = 0
        while ($true) {
            $server.Refresh()
            $proxy.Refresh()
            if ($server.HasExited) {
                $exitReason = 'server'
                break
            }
            if ($proxy.HasExited) {
                $exitReason = 'proxy'
                break
            }
            if (-not (Test-DesktopRunning)) {
                $exitReason = 'desktop'
                break
            }

            $stability = Get-DesktopBackendStability -ExpectedBackend $desktopBackend
            if ($stability.Stable) {
                if ($null -ne $healthFailureStartedAt) {
                    Write-MobileLifecycleEvent `
                        -Event 'upstream-health' `
                        -Phase 'end' `
                        -Outcome 'recovered' `
                        -Fields @{
                            generation = $bridgeGeneration
                            polls = $healthFailurePolls
                            elapsed_ms = [int]([DateTimeOffset]::Now - $healthFailureStartedAt).TotalMilliseconds
                        }
                    $healthFailureStartedAt = $null
                    $healthFailurePolls = 0
                }
            } elseif (-not $stability.Transient) {
                $exitReason = [string]$stability.Reason
                break
            } else {
                if ($null -eq $healthFailureStartedAt) {
                    $healthFailureStartedAt = [DateTimeOffset]::Now
                    $healthFailurePolls = 0
                    Write-MobileLifecycleEvent `
                        -Event 'upstream-health' `
                        -Phase 'begin' `
                        -Outcome 'grace' `
                        -Fields @{
                            generation = $bridgeGeneration
                            reason = [string]$stability.Reason
                        }
                }
                $healthFailurePolls += 1
                $healthFailureElapsed = [DateTimeOffset]::Now - $healthFailureStartedAt
                if ($healthFailurePolls -ge 3 -and $healthFailureElapsed.TotalSeconds -ge 8) {
                    $exitReason = 'desktop-backend-health'
                    break
                }
            }
            Start-Sleep -Milliseconds 1000
        }

        $exitedName = if ($exitReason) { $exitReason } else { 'unknown' }
        $exitCode = if ($server.HasExited) {
            $server.ExitCode
        } elseif ($proxy.HasExited) {
            $proxy.ExitCode
        } else {
            0
        }
        foreach ($process in @($server, $proxy)) {
            if ($process -and -not $process.HasExited) {
                Stop-Process -Id $process.Id -Force
                $process.WaitForExit()
            }
        }

        $retryDelayMilliseconds = if ($exitedName -in @('desktop', 'route-changed', 'profile-changed')) {
            250
        } else {
            1000
        }
        Write-MobileLifecycleEvent `
            -Event 'bridge-generation' `
            -Phase 'end' `
            -Outcome 'recycle' `
            -Fields @{
                generation = $bridgeGeneration
                reason = $exitedName
                exit_code = $exitCode
                retry_delay_ms = $retryDelayMilliseconds
            }
        Start-Sleep -Milliseconds $retryDelayMilliseconds
    }
} finally {
    Remove-Item Env:HERMES_DASHBOARD_SESSION_TOKEN -ErrorAction SilentlyContinue
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
