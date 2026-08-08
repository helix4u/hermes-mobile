[CmdletBinding()]
param(
    [string]$SigningRoot = (Join-Path $env:LOCALAPPDATA 'hermes-mobile-signing'),
    [string]$SourceKeystore = (Join-Path $env:USERPROFILE '.android\debug.keystore')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $repositoryRoot 'client\android'
$propertiesPath = Join-Path $androidRoot 'signing.properties'
$keystorePath = Join-Path $SigningRoot 'hermes-mobile-dev.keystore'
$backupRoot = Join-Path $SigningRoot 'backups'

if (-not (Test-Path -LiteralPath $SourceKeystore -PathType Leaf)) {
    throw "Source Android debug keystore was not found: $SourceKeystore"
}

New-Item -ItemType Directory -Path $SigningRoot -Force | Out-Null
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $keystorePath -PathType Leaf)) {
    Copy-Item -LiteralPath $SourceKeystore -Destination $keystorePath
    $backupPath = Join-Path $backupRoot (
        'hermes-mobile-dev-initial-{0}.keystore' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    )
    Copy-Item -LiteralPath $keystorePath -Destination $backupPath
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($path in @($SigningRoot, $backupRoot)) {
    # Set-Acl can attempt to write inherited audit entries from the existing
    # security descriptor and fail without SeSecurityPrivilege. icacls changes
    # only the DACL needed here and leaves the SACL untouched.
    & icacls.exe $path /inheritance:r /grant:r "*$($identity.Value):(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to restrict Android signing path to the current user: $path"
    }
}

$normalizedKeystorePath = $keystorePath.Replace('\', '/')
$properties = @(
    "storeFile=$normalizedKeystorePath"
    'storePassword=android'
    'keyAlias=androiddebugkey'
    'keyPassword=android'
) -join "`n"
[IO.File]::WriteAllText(
    $propertiesPath,
    $properties + "`n",
    [Text.UTF8Encoding]::new($false)
)

$hash = (Get-FileHash -LiteralPath $keystorePath -Algorithm SHA256).Hash
[pscustomobject]@{
    SigningProperties = $propertiesPath
    Keystore = $keystorePath
    Sha256 = $hash
    Created = (Get-Item -LiteralPath $keystorePath).CreationTime
}
