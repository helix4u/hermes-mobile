$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'mobile-backend-owner.ps1')
$broker = [pscustomobject]@{ Ready = $true; IdentityKey = 'home|broker-a|worker-a'; Url = 'http://127.0.0.1:24001'; BrokerHome = 'synthetic-home'; CodeRoot = 'synthetic-code' }
$plan = Get-HermesMobileOwnerPlan -BackendOwner shared-runtime -DesktopBound $false -DesktopPresent $false -Endpoint $broker
if ($plan.Action -ne 'bridge') { throw 'Independent broker bridge must not require Desktop' }
$plan = Get-HermesMobileOwnerPlan -BackendOwner shared-runtime -DesktopBound $false -DesktopPresent $true -Endpoint $null
if ($plan.Action -ne 'wait') { throw 'Missing broker must not spawn a standalone backend' }
$plan = Get-HermesMobileOwnerPlan -BackendOwner legacy -DesktopBound $true -DesktopPresent $false -Endpoint $broker
if ($plan.Action -ne 'wait') { throw 'Legacy Desktop exit must retire bridges' }
$plan = Get-HermesMobileOwnerPlan -BackendOwner legacy -DesktopBound $false -DesktopPresent $false -Endpoint $null
if ($plan.Action -ne 'serve') { throw 'Existing standalone behavior changed' }
$replacement = [pscustomobject]@{ Ready = $true; IdentityKey = 'home|broker-b|worker-a'; Url = $broker.Url; BrokerHome = $broker.BrokerHome; CodeRoot = $broker.CodeRoot }
if (Test-HermesMobileBrokerIdentity $broker $replacement) { throw 'Same-worker broker replacement must fence the binding' }
Write-Output 'Mobile backend owner policy cases passed'
