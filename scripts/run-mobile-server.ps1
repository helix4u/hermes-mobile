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
        $candidates = @()
        foreach ($backendProcess in $processTree) {
            $listeners = @(
                Get-NetTCPConnection -OwningProcess ([int]$backendProcess.ProcessId) -State Listen -ErrorAction SilentlyContinue |
                    Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') }
            )
            foreach ($listener in $listeners) {
                $listenerPort = [int]$listener.LocalPort
                if ($listenerPort -ge 1024 -and $listenerPort -notin @($Port, $ProxyPort)) {
                    $candidates += [pscustomobject]@{
                        Url = "http://127.0.0.1:$listenerPort"
                        AccessTokenFile = $accessTokenFile
                        Profile = $activeProfile
                        IdentityKey = "$backendPid|$listenerPort|$accessTokenFile"
                    }
                }
            }
        }
        # A Hermes backend process can own unrelated loopback listeners in
        # addition to the JSON API. Never select a port by enumeration order.
        # Prove that the candidate serves the authenticated Hermes status route.
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
        $status = Invoke-RestMethod `
            -Uri "$([string]$Backend.Url)/api/status" `
            -Headers @{ Authorization = "Bearer $accessToken" } `
            -Method Get `
            -TimeoutSec 2
        return [string]$status.overall -eq 'ok'
    } catch {
        return $false
    }
}

function Test-DesktopBackendStable {
    param($ExpectedBackend)

    if (-not $ExpectedBackend) {
        return $true
    }
    $routePreference = Get-HermesDesktopRoutePreference -UserDataDirectory (Join-Path $env:APPDATA 'Hermes')
    if ($routePreference.Published) {
        if (
            -not $routePreference.Local -or
            [string]$routePreference.Profile -ne [string]$ExpectedBackend.Profile
        ) {
            return $false
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
            return $false
        }
    }
    return Test-DesktopBackendApi -Backend $ExpectedBackend
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
    while ($true) {
        if (-not (Test-DesktopRunning)) {
            [System.IO.File]::AppendAllText(
                $launcherLog,
                "[$([DateTimeOffset]::Now.ToString('O'))] desktop-bound mode found no Desktop process; exiting until the recovery trigger`r`n"
            )
            return
        }

        $desktopBackend = Get-DesktopBackendEndpoint
        if ($DesktopExecutable -and -not $desktopBackend) {
            Start-Sleep -Seconds 2
            continue
        }

        $upstream = if ($desktopBackend) { [string]$desktopBackend.Url } else { "http://127.0.0.1:$Port" }
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

        while (
            -not $server.HasExited -and
            -not $proxy.HasExited -and
            (Test-DesktopRunning) -and
            (Test-DesktopBackendStable -ExpectedBackend $desktopBackend)
        ) {
            Start-Sleep -Seconds 2
            $server.Refresh()
            $proxy.Refresh()
        }

        $exitedName = if (-not (Test-DesktopRunning)) {
            'desktop'
        } elseif ($desktopBackend -and -not (Test-DesktopBackendStable -ExpectedBackend $desktopBackend)) {
            'desktop backend'
        } elseif ($server.HasExited) {
            'server'
        } else {
            'proxy'
        }
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

        [System.IO.File]::AppendAllText(
            $launcherLog,
            "[$([DateTimeOffset]::Now.ToString('O'))] $exitedName ended with code $exitCode; reevaluating lifecycle in 5 seconds`r`n"
        )
        if ($exitedName -eq 'desktop') {
            return
        }
        Start-Sleep -Seconds 5
    }
} finally {
    Remove-Item Env:HERMES_DASHBOARD_SESSION_TOKEN -ErrorAction SilentlyContinue
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
