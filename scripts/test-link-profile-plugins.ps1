$ErrorActionPreference = 'Stop'

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-mobile-profile-links-" + [guid]::NewGuid().ToString('N'))
try {
    $hermesHome = Join-Path $root 'hermes'
    $supportSource = Join-Path $hermesHome 'plugins\support-ops'
    $profileHome = Join-Path $hermesHome 'profiles\worker'
    $callsPath = Join-Path $root 'calls.txt'
    $fakeHermes = Join-Path $root 'hermes.ps1'

    New-Item -ItemType Directory -Path $supportSource -Force | Out-Null
    New-Item -ItemType Directory -Path $profileHome -Force | Out-Null
    [System.IO.File]::WriteAllText(
        (Join-Path $supportSource 'plugin.yaml'),
        "name: support-ops`n",
        [System.Text.UTF8Encoding]::new($false)
    )
    [System.IO.File]::WriteAllText(
        $fakeHermes,
        "param([Parameter(ValueFromRemainingArguments = `$true)][string[]]`$Rest)`nAdd-Content -LiteralPath '$($callsPath.Replace("'", "''"))' -Value (`$Rest -join ' ')`nexit 0`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    & (Join-Path $PSScriptRoot 'link-profile-plugins.ps1') `
        -Profile worker `
        -HermesHome $hermesHome `
        -HermesExecutable $fakeHermes | Out-Null

    $mobileTarget = Get-Item -LiteralPath (Join-Path $profileHome 'plugins\hermes-mobile') -Force
    $supportTarget = Get-Item -LiteralPath (Join-Path $profileHome 'plugins\support-ops') -Force
    if ($mobileTarget.LinkType -ne 'Junction') {
        throw 'Hermes Mobile profile path was not created as a junction'
    }
    if ($supportTarget.LinkType -ne 'Junction') {
        throw 'Support Ops profile path was not created as a junction'
    }
    $supportResolved = (Resolve-Path -LiteralPath $supportSource).Path
    $supportTargets = @($supportTarget.Target | ForEach-Object { (Resolve-Path -LiteralPath $_).Path })
    if ($supportTargets -notcontains $supportResolved) {
        throw 'Support Ops profile junction does not point at the installed plugin'
    }

    $calls = @(Get-Content -LiteralPath $callsPath)
    if ($calls -notcontains '--profile worker plugins enable --no-allow-tool-override hermes-mobile') {
        throw 'Hermes Mobile was not enabled for the selected profile'
    }
    if ($calls -notcontains '--profile worker plugins enable --no-allow-tool-override support-ops') {
        throw 'Support Ops was not enabled for the selected profile'
    }

    $rejected = $false
    try {
        & (Join-Path $PSScriptRoot 'link-profile-plugins.ps1') `
            -Profile '..\outside' `
            -HermesHome $hermesHome `
            -HermesExecutable $fakeHermes | Out-Null
    } catch {
        $rejected = $true
    }
    if (-not $rejected) {
        throw 'Invalid profile path was not rejected'
    }

    Write-Output 'Profile plugin link tests passed'
} finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
