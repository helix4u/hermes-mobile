[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory = $true)]
    [string]$Device,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedSerial,

    [string]$PackageName = 'dev.hermes.mobile',

    [string]$ApkPath = (
        Join-Path $PSScriptRoot '..\client\android\app\build\outputs\apk\debug\app-debug.apk'
    ),

    [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA 'hermes-mobile-backups'),

    [string]$RestoreFromBackup,

    [switch]$BackupOnly,

    [switch]$AllowCredentialReset,

    [switch]$AllowMissingCredentialEnvelope
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-AdbPath {
    $command = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        return $candidate
    }
    throw 'adb.exe was not found on PATH or in the normal Android SDK location.'
}

function Invoke-AdbText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowFailure
    )
    $output = & $script:AdbPath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "adb failed with exit code ${exitCode}: $($output -join [Environment]::NewLine)"
    }
    [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($output)
        Text = ($output -join [Environment]::NewLine).Trim()
    }
}

function Save-AdbBinaryOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $script:AdbPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $Arguments) {
        [void]$startInfo.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Could not start adb for the private-data archive.'
    }
    $errorTask = $process.StandardError.ReadToEndAsync()
    try {
        $destinationStream = [IO.File]::Create($Destination)
        try {
            $process.StandardOutput.BaseStream.CopyTo($destinationStream)
        } finally {
            $destinationStream.Dispose()
        }
        $process.WaitForExit()
        $errorText = $errorTask.GetAwaiter().GetResult().Trim()
        if ($process.ExitCode -ne 0) {
            throw "adb archive failed with exit code $($process.ExitCode): $errorText"
        }
        if ((Get-Item -LiteralPath $Destination).Length -le 0) {
            throw 'adb produced an empty private-data archive.'
        }
    } finally {
        $process.Dispose()
    }
}

function Protect-DirectoryForCurrentUser {
    param([Parameter(Mandatory = $true)][string]$Path)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $Path
    $acl.SetAccessRuleProtection($true, $false)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Invoke-LocalTar {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if (-not $tar) {
        throw 'tar.exe is required for migration archive verification.'
    }
    $output = & $tar.Source @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "tar.exe failed: $($output -join [Environment]::NewLine)"
    }
    @($output)
}

function Resolve-ApkSignerPath {
    $buildToolsRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools'
    $candidate = Get-ChildItem -LiteralPath $buildToolsRoot -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'apksigner.bat' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if (-not $candidate) {
        throw 'apksigner.bat was not found in the normal Android SDK build-tools directory.'
    }
    $candidate
}

function Get-ApkCertificateSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $output = & $script:ApkSignerPath verify --print-certs $Path 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "apksigner could not verify ${Path}: $($output -join [Environment]::NewLine)"
    }
    $match = $output | Select-String -Pattern 'certificate SHA-256 digest:\s*([0-9a-f]+)' |
        Select-Object -First 1
    if (-not $match) {
        throw "apksigner did not report a certificate fingerprint for $Path"
    }
    $match.Matches[0].Groups[1].Value.ToUpperInvariant()
}

$script:AdbPath = Resolve-AdbPath
$script:ApkSignerPath = Resolve-ApkSignerPath
$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$dataRoot = "/data/user/0/$PackageName"
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDirectory = Join-Path $BackupRoot "$timestamp-$ExpectedSerial"
$privateDataTar = Join-Path $backupDirectory 'private-data-full.tar'
$restoreStage = Join-Path $backupDirectory 'restore-stage'
$restoreTar = Join-Path $backupDirectory 'private-data-restore.tar'
$installedApkDirectory = Join-Path $backupDirectory 'installed-apks'
$manifestPath = Join-Path $backupDirectory 'migration-manifest.json'
$remoteRestoreTar = "/data/local/tmp/hermes-mobile-restore-$timestamp.tar"
$restoreTestRoot = "$dataRoot/cache/hermes-mobile-migration-test-$timestamp"

if (-not $AllowCredentialReset -and -not $BackupOnly) {
    throw @'
This migration must delete the old Android package identity. That removes the
non-exportable Android Keystore credential key. Re-run with
-AllowCredentialReset only after accepting that saved bearer tokens may need to
be entered again. Ordinary Mobile state is backed up and restored.
'@
}

if ($AllowMissingCredentialEnvelope -and -not $AllowCredentialReset) {
    throw '-AllowMissingCredentialEnvelope requires -AllowCredentialReset.'
}

if ($Device.Contains(':')) {
    [void](Invoke-AdbText -Arguments @('connect', $Device) -AllowFailure)
}

$deviceState = Invoke-AdbText -Arguments @('-s', $Device, 'get-state')
if ($deviceState.Text -ne 'device') {
    throw "ADB target is not ready: $($deviceState.Text)"
}
$actualSerial = (Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'getprop', 'ro.serialno'
)).Text
if ($actualSerial -ne $ExpectedSerial) {
    throw "Refusing device $Device. Expected serial $ExpectedSerial, found $actualSerial."
}
$model = (Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'getprop', 'ro.product.model'
)).Text
$runAs = Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'run-as', $PackageName, 'id'
) -AllowFailure
if ($runAs.ExitCode -ne 0) {
    throw "The installed $PackageName package is not available through run-as. No migration was started."
}

$packagePathsResult = Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'pm', 'path', $PackageName
) -AllowFailure
$packagePaths = @(
    $packagePathsResult.Output |
        ForEach-Object { [string]$_ } |
        Where-Object { $_.StartsWith('package:') } |
        ForEach-Object { $_.Substring('package:'.Length).Trim() }
)
if ($packagePaths.Count -eq 0) {
    throw "The installed $PackageName package was not found."
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
Protect-DirectoryForCurrentUser -Path $backupDirectory
New-Item -ItemType Directory -Path $installedApkDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $restoreStage -Force | Out-Null

[void](Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'am', 'force-stop', $PackageName
))

Save-AdbBinaryOutput -Arguments @(
    '-s', $Device,
    'exec-out',
    'run-as', $PackageName,
    'tar', '-cf', '-', '-C', $dataRoot,
    'app_webview', 'files', 'no_backup', 'shared_prefs'
) -Destination $privateDataTar

$archiveEntries = Invoke-LocalTar -Arguments @('-tf', $privateDataTar)
if (-not ($archiveEntries | Where-Object { $_ -like 'app_webview/Default/Local Storage/*' })) {
    throw 'The backup does not contain the Mobile WebView local-storage database.'
}
if (
    -not ($archiveEntries -contains 'shared_prefs/hermes_mobile_secure_v1.xml') -and
    -not $AllowMissingCredentialEnvelope
) {
    throw 'The backup did not capture the existing encrypted credential envelope.'
}

[void](Invoke-LocalTar -Arguments @('-xf', $privateDataTar, '-C', $restoreStage))
$excludedPaths = @(
    (Join-Path $restoreStage 'shared_prefs\hermes_mobile_secure_v1.xml'),
    (Join-Path $restoreStage 'app_webview\webview_data.lock'),
    (Join-Path $restoreStage 'app_webview\last-exit-info')
)
foreach ($excludedPath in $excludedPaths) {
    if (Test-Path -LiteralPath $excludedPath) {
        Remove-Item -LiteralPath $excludedPath -Force
    }
}

Push-Location $restoreStage
try {
    [void](Invoke-LocalTar -Arguments @(
        '-cf', $restoreTar, 'app_webview', 'files', 'no_backup', 'shared_prefs'
    ))
} finally {
    Pop-Location
}
$restoreEntries = Invoke-LocalTar -Arguments @('-tf', $restoreTar)
if ($restoreEntries -contains 'shared_prefs/hermes_mobile_secure_v1.xml') {
    throw 'The restore archive unexpectedly contains encrypted credentials.'
}

$postInstallRestoreTar = $restoreTar
$restoredFromBackup = $null
if ($RestoreFromBackup) {
    $sourceBackup = (Resolve-Path -LiteralPath $RestoreFromBackup).Path
    $sourceManifestPath = Join-Path $sourceBackup 'migration-manifest.json'
    if (-not (Test-Path -LiteralPath $sourceManifestPath -PathType Leaf)) {
        throw "The selected restore backup has no migration manifest: $sourceBackup"
    }
    $sourceManifest = Get-Content -Raw -LiteralPath $sourceManifestPath | ConvertFrom-Json
    if ($sourceManifest.device_serial -ne $actualSerial) {
        throw "The selected restore backup belongs to device $($sourceManifest.device_serial), not $actualSerial."
    }
    $sourceRestoreTar = Join-Path $sourceBackup 'private-data-restore.tar'
    if (-not (Test-Path -LiteralPath $sourceRestoreTar -PathType Leaf)) {
        throw "The selected restore backup has no filtered restore archive: $sourceBackup"
    }
    $sourceRestoreHash = (Get-FileHash -LiteralPath $sourceRestoreTar -Algorithm SHA256).Hash
    if ($sourceRestoreHash -ne $sourceManifest.restore_sha256) {
        throw "The selected restore archive hash does not match its manifest: $sourceBackup"
    }
    $sourceRestoreEntries = Invoke-LocalTar -Arguments @('-tf', $sourceRestoreTar)
    if ($sourceRestoreEntries -contains 'shared_prefs/hermes_mobile_secure_v1.xml') {
        throw 'The selected restore archive contains excluded encrypted credentials.'
    }
    if (-not ($sourceRestoreEntries | Where-Object { $_ -like 'app_webview/Default/Local Storage/*' })) {
        throw 'The selected restore archive has no Mobile WebView local-storage database.'
    }
    $postInstallRestoreTar = $sourceRestoreTar
    $restoredFromBackup = $sourceBackup
}

[void](Invoke-AdbText -Arguments @('-s', $Device, 'push', $restoreTar, $remoteRestoreTar))
[void](Invoke-AdbText -Arguments @('-s', $Device, 'shell', 'chmod', '0644', $remoteRestoreTar))
try {
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device, 'shell', 'run-as', $PackageName,
        'mkdir', '-p', $restoreTestRoot
    ))
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device, 'shell', 'run-as', $PackageName,
        'tar', '-xf', $remoteRestoreTar, '-C', $restoreTestRoot
    ))
    $restoreProbe = Invoke-AdbText -Arguments @(
        '-s', $Device, 'shell', 'run-as', $PackageName,
        'find', "$restoreTestRoot/app_webview", '-name', 'CURRENT', '-type', 'f'
    ) -AllowFailure
    if (
        $restoreProbe.ExitCode -ne 0 -or
        $restoreProbe.Text -notlike '*Local Storage/leveldb/CURRENT*'
    ) {
        throw 'The phone could not read the rehearsed local-storage restore.'
    }
} finally {
    if ($restoreTestRoot.StartsWith("$dataRoot/cache/hermes-mobile-migration-test-")) {
        [void](Invoke-AdbText -Arguments @(
            '-s', $Device, 'shell', 'run-as', $PackageName,
            'rm', '-rf', $restoreTestRoot
        ) -AllowFailure)
    }
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device, 'shell', 'rm', '-f', $remoteRestoreTar
    ) -AllowFailure)
}

$installedApks = @()
for ($index = 0; $index -lt $packagePaths.Count; $index++) {
    $remotePath = $packagePaths[$index]
    $name = if ($remotePath.EndsWith('/base.apk')) {
        'base.apk'
    } else {
        'split-{0}.apk' -f $index
    }
    $destination = Join-Path $installedApkDirectory $name
    [void](Invoke-AdbText -Arguments @('-s', $Device, 'pull', $remotePath, $destination))
    $installedApks += $destination
}

$installedCertificate = Get-ApkCertificateSha256 -Path $installedApks[0]
$replacementCertificate = Get-ApkCertificateSha256 -Path $resolvedApk
if ($installedCertificate -eq $replacementCertificate -and -not $BackupOnly) {
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device,
        'shell',
        'am', 'start', '-W', '-n', "$PackageName/.MainActivity"
    ))
    throw @"
Installed and replacement APK certificates already match ($installedCertificate).
Credential-reset migration is unnecessary; use adb install -r instead.
The verified backup remains at $backupDirectory.
"@
}

$packageDetails = (Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'dumpsys', 'package', $PackageName
)).Output | Where-Object {
    $_ -match 'versionCode=|versionName=|lastUpdateTime='
}
$manifest = [ordered]@{
    created_at = (Get-Date).ToString('o')
    device_endpoint = $Device
    device_serial = $actualSerial
    device_model = $model
    package_name = $PackageName
    source_package = @($packageDetails)
    replacement_apk = $resolvedApk
    replacement_sha256 = (Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256).Hash
    replacement_certificate_sha256 = $replacementCertificate
    installed_certificate_sha256 = $installedCertificate
    private_data_archive = $privateDataTar
    private_data_sha256 = (Get-FileHash -LiteralPath $privateDataTar -Algorithm SHA256).Hash
    restore_archive = $restoreTar
    restore_sha256 = (Get-FileHash -LiteralPath $restoreTar -Algorithm SHA256).Hash
    post_install_restore_archive = $postInstallRestoreTar
    post_install_restore_sha256 = (Get-FileHash -LiteralPath $postInstallRestoreTar -Algorithm SHA256).Hash
    restored_from_backup = $restoredFromBackup
    credential_preference_restored = $false
    installed_apks = @(
        $installedApks | ForEach-Object {
            [ordered]@{
                path = $_
                sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
            }
        }
    )
    status = 'backup-verified'
}
[IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 6),
    [Text.UTF8Encoding]::new($false)
)

if ($BackupOnly) {
    $manifest.status = 'backup-and-restore-rehearsal-verified'
    [IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 6),
        [Text.UTF8Encoding]::new($false)
    )
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device,
        'shell',
        'am', 'start', '-W', '-n', "$PackageName/.MainActivity"
    ))
    return [pscustomobject]@{
        Status = $manifest.status
        Device = "$model ($actualSerial)"
        Backup = $backupDirectory
        Manifest = $manifestPath
        CredentialsRemainUntouched = $true
    }
}

if (-not $PSCmdlet.ShouldProcess(
    "$model ($actualSerial)",
    "replace $PackageName after verified backup and restore non-secret state"
)) {
    $manifest.status = 'backup-only'
    [IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 6),
        [Text.UTF8Encoding]::new($false)
    )
    return [pscustomobject]@{
        Status = 'backup-only'
        Device = "$model ($actualSerial)"
        Backup = $backupDirectory
        Manifest = $manifestPath
    }
}

$uninstall = Invoke-AdbText -Arguments @(
    '-s', $Device, 'uninstall', $PackageName
) -AllowFailure
if ($uninstall.ExitCode -ne 0 -or $uninstall.Text -notmatch 'Success') {
    throw "Android did not uninstall the old package: $($uninstall.Text)"
}

$install = Invoke-AdbText -Arguments @(
    '-s', $Device, 'install', '-r', $resolvedApk
) -AllowFailure
if ($install.ExitCode -ne 0 -or $install.Text -notmatch 'Success') {
    $rollbackArguments = if ($installedApks.Count -gt 1) {
        @('-s', $Device, 'install-multiple', '-r') + $installedApks
    } else {
        @('-s', $Device, 'install', '-r', $installedApks[0])
    }
    [void](Invoke-AdbText -Arguments $rollbackArguments -AllowFailure)
    $manifest.status = 'replacement-install-failed'
    [IO.File]::WriteAllText(
        $manifestPath,
        ($manifest | ConvertTo-Json -Depth 6),
        [Text.UTF8Encoding]::new($false)
    )
    throw "Replacement install failed. The prior APK was offered for rollback: $($install.Text)"
}

[void](Invoke-AdbText -Arguments @('-s', $Device, 'push', $postInstallRestoreTar, $remoteRestoreTar))
[void](Invoke-AdbText -Arguments @('-s', $Device, 'shell', 'chmod', '0644', $remoteRestoreTar))
try {
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device,
        'shell',
        'run-as', $PackageName,
        'tar', '-xf', $remoteRestoreTar, '-C', $dataRoot
    ))
} finally {
    [void](Invoke-AdbText -Arguments @(
        '-s', $Device, 'shell', 'rm', '-f', $remoteRestoreTar
    ) -AllowFailure)
}

$credentialCheck = Invoke-AdbText -Arguments @(
    '-s', $Device,
    'shell',
    'run-as', $PackageName,
    'ls', "$dataRoot/shared_prefs/hermes_mobile_secure_v1.xml"
) -AllowFailure
if ($credentialCheck.ExitCode -eq 0) {
    throw 'The excluded encrypted credential preference appeared after restore.'
}

$launch = Invoke-AdbText -Arguments @(
    '-s', $Device,
    'shell',
    'am', 'start', '-W', '-n', "$PackageName/.MainActivity"
)
$postInstall = (Invoke-AdbText -Arguments @(
    '-s', $Device, 'shell', 'dumpsys', 'package', $PackageName
)).Output | Where-Object {
    $_ -match 'versionCode=|versionName=|lastUpdateTime='
}

$manifest.status = 'restored-and-launched'
$manifest.post_install_package = @($postInstall)
$manifest.launch = @($launch.Output)
[IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 6),
    [Text.UTF8Encoding]::new($false)
)

[pscustomobject]@{
    Status = $manifest.status
    Device = "$model ($actualSerial)"
    Backup = $backupDirectory
    Manifest = $manifestPath
    ReplacementSha256 = $manifest.replacement_sha256
    CredentialsRequireReentry = $true
}
