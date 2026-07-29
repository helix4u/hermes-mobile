[CmdletBinding()]
param(
    [int]$Port = 9140
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serviceProject = Join-Path $projectRoot "qwen-service"
$runtimeRoot = Join-Path $env:LOCALAPPDATA "hermes\qwen-tts"
$venvRoot = Join-Path $runtimeRoot "venv"
$python = Join-Path $venvRoot "Scripts\python.exe"
$uv = Join-Path $env:LOCALAPPDATA "hermes\bin\uv.exe"
$tokenPath = Join-Path $runtimeRoot "service-token"
$taskName = "Hermes_Qwen_TTS"

New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

if (-not (Test-Path -LiteralPath $uv)) {
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uvCommand) {
        throw "uv is required but was not found."
    }
    $uv = $uvCommand.Source
}

if (-not (Test-Path -LiteralPath $python)) {
    & $uv python install 3.12
    & $uv venv --python 3.12 $venvRoot
}

& $uv pip install --python $python $serviceProject
# PyPI currently resolves the compact CPU-only Windows wheel. Qwen's local
# model path is intended for the NVIDIA GPU, so replace it with PyTorch's
# official CUDA 12.8 wheel after the service dependencies are installed.
& $uv pip install --python $python `
    "torch==2.11.0+cu128" "torchaudio==2.11.0+cu128" `
    --index-url "https://download.pytorch.org/whl/cu128"

if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [Convert]::ToBase64String($bytes)
    [IO.File]::WriteAllText($tokenPath, $token, [Text.UTF8Encoding]::new($false))
}

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetOwner([Security.Principal.NTAccount]::new($currentIdentity))
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $currentIdentity,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.AccessControlType]::Allow
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $tokenPath -AclObject $acl

$action = New-ScheduledTaskAction -Execute $python -Argument "-m qwen_tts_service --host 127.0.0.1 --port $Port" -WorkingDirectory $runtimeRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentIdentity
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $currentIdentity -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$deadline = [DateTime]::UtcNow.AddMinutes(2)
do {
    Start-Sleep -Milliseconds 750
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
        if ($health.status -eq "healthy") {
            Write-Output "Qwen3-TTS service is healthy on 127.0.0.1:$Port."
            exit 0
        }
    } catch {
    }
} while ([DateTime]::UtcNow -lt $deadline)

throw "Qwen3-TTS service did not become healthy before the timeout."
