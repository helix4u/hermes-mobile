function Get-HermesDesktopProcessIds {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DesktopExecutable,
        [AllowEmptyCollection()]
        [object[]]$Processes = @()
    )

    $expected = [System.IO.Path]::GetFullPath($DesktopExecutable)
    if ($Processes.Count -eq 0) {
        $Processes = @(
            Get-CimInstance Win32_Process -Filter "Name = 'Hermes.exe'" -ErrorAction SilentlyContinue
        )
    }

    $byPid = @{}
    $desktopPids = [System.Collections.Generic.HashSet[int]]::new()
    $queue = [System.Collections.Generic.Queue[int]]::new()

    foreach ($process in $Processes) {
        if (-not [string]::Equals(
            [string]$process.Name,
            'Hermes.exe',
            [StringComparison]::OrdinalIgnoreCase
        )) {
            continue
        }
        $processId = [int]$process.ProcessId
        $byPid[$processId] = $process

        $candidate = [string]$process.ExecutablePath
        if (-not $candidate) {
            continue
        }
        try {
            $candidate = [System.IO.Path]::GetFullPath($candidate)
        } catch {
            continue
        }
        if ([string]::Equals($candidate, $expected, [StringComparison]::OrdinalIgnoreCase)) {
            if ($desktopPids.Add($processId)) {
                $queue.Enqueue($processId)
            }
        }
    }

    # Electron can hide the executable path of its browser/root process while
    # exposing that path on renderer and utility children. Walk only from an
    # exact-path Hermes child to Hermes ancestors whose path is either the same
    # executable or inaccessible. This proves the process family without
    # accepting an unrelated Hermes installation.
    while ($queue.Count -gt 0) {
        $process = $byPid[$queue.Dequeue()]
        if (-not $process) {
            continue
        }
        $parentId = [int]$process.ParentProcessId
        if (-not $byPid.ContainsKey($parentId) -or $desktopPids.Contains($parentId)) {
            continue
        }
        $parent = $byPid[$parentId]
        $parentPath = [string]$parent.ExecutablePath
        if ($parentPath) {
            try {
                $parentPath = [System.IO.Path]::GetFullPath($parentPath)
            } catch {
                continue
            }
            if (-not [string]::Equals(
                $parentPath,
                $expected,
                [StringComparison]::OrdinalIgnoreCase
            )) {
                continue
            }
        }
        if ($desktopPids.Add($parentId)) {
            $queue.Enqueue($parentId)
        }
    }

    return @($desktopPids | Sort-Object)
}
