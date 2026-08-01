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
$pythonExecutable = Join-Path (Split-Path -Parent $HermesExecutable) 'python.exe'
$serverWorkingDirectory = if (
    $env:USERPROFILE -and
    (Test-Path -LiteralPath $env:USERPROFILE -PathType Container)
) {
    $env:USERPROFILE
} else {
    $HermesHome
}

function Test-DesktopRunning {
    if (-not $DesktopExecutable) {
        return $true
    }
    $expected = [System.IO.Path]::GetFullPath($DesktopExecutable)
    $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'Hermes.exe'" -ErrorAction SilentlyContinue)
    foreach ($process in $processes) {
        $candidate = [string]$process.ExecutablePath
        if ($candidate -and [string]::Equals(
            [System.IO.Path]::GetFullPath($candidate),
            $expected,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            return $true
        }
    }
    return $false
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
    $env:HERMES_DASHBOARD_SESSION_TOKEN = $token
    while ($true) {
        if (-not (Test-DesktopRunning)) {
            [System.IO.File]::AppendAllText(
                $launcherLog,
                "[$([DateTimeOffset]::Now.ToString('O'))] desktop-bound mode found no Desktop process; exiting until the recovery trigger`r`n"
            )
            return
        }
        [System.IO.File]::AppendAllText(
            $launcherLog,
            "[$([DateTimeOffset]::Now.ToString('O'))] starting Hermes Mobile server on 127.0.0.1:$Port with proxy 127.0.0.1:$ProxyPort for $TailnetHost`r`n"
        )
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

        $proxy = Start-Process `
            -FilePath $pythonExecutable `
            -ArgumentList @(
                $proxyScript,
                '--host',
                '127.0.0.1',
                '--port',
                $ProxyPort.ToString(),
                '--upstream',
                "http://127.0.0.1:$Port",
                '--allowed-host',
                $TailnetHost
            ) `
            -WorkingDirectory $PSScriptRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $proxyStdoutPath `
            -RedirectStandardError $proxyStderrPath `
            -PassThru

        while (
            -not $server.HasExited -and
            -not $proxy.HasExited -and
            (Test-DesktopRunning)
        ) {
            Start-Sleep -Seconds 2
            $server.Refresh()
            $proxy.Refresh()
        }

        $exitedName = if (-not (Test-DesktopRunning)) {
            'desktop'
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
