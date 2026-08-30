$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'mobile-desktop-process.ps1')

$expected = 'C:\Program Files\Hermes\Hermes.exe'
$other = 'C:\Other\Hermes.exe'
$processes = @(
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 100; ParentProcessId = 1; ExecutablePath = $null }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 101; ParentProcessId = 100; ExecutablePath = $expected }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 102; ParentProcessId = 100; ExecutablePath = $expected }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 200; ParentProcessId = 1; ExecutablePath = $null }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 300; ParentProcessId = 1; ExecutablePath = $expected }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 400; ParentProcessId = 1; ExecutablePath = $other }
    [pscustomobject]@{ Name = 'Hermes.exe'; ProcessId = 401; ParentProcessId = 400; ExecutablePath = $expected }
    [pscustomobject]@{ Name = 'not-hermes.exe'; ProcessId = 500; ParentProcessId = 1; ExecutablePath = $expected }
)

$actual = @(Get-HermesDesktopProcessIds -DesktopExecutable $expected -Processes $processes)
$expectedIds = @(100, 101, 102, 300, 401)
if (($actual -join ',') -ne ($expectedIds -join ',')) {
    throw "Unexpected Desktop process family: $($actual -join ','); expected $($expectedIds -join ',')"
}

$probeResults = [System.Collections.Generic.Queue[bool]]::new()
$probeResults.Enqueue($false)
$probeResults.Enqueue($false)
$probeResults.Enqueue($true)
$delays = [System.Collections.Generic.List[int]]::new()
$polls = Wait-HermesDesktopPresence `
    -Probe { $probeResults.Dequeue() } `
    -PollMilliseconds 25 `
    -Delay { param($milliseconds) $delays.Add($milliseconds) }
if ($polls -ne 2 -or ($delays -join ',') -ne '25,25' -or $probeResults.Count -ne 0) {
    throw "Desktop wait did not remain active until the process returned"
}

Write-Output "Desktop process and wait tests passed: $($actual -join ',')"
