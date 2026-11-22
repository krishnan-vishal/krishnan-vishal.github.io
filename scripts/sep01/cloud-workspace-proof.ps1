# A bounded cloud PowerShell proof, not a general-purpose shell endpoint.
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if (-not $env:GITHUB_ACTIONS -or -not $env:GITHUB_WORKSPACE) {
  throw 'CLOUD_RUNNER_REQUIRED'
}
Set-Location -LiteralPath $env:GITHUB_WORKSPACE
$expected = @('admin/central-command/index.html', 'scripts/sep01/durable-actions-worker.mjs', '.github/workflows/sep01-durable-dispatch.yml')
foreach ($path in $expected) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "CLOUD_WORKSPACE_MISSING_FILE: $path"
  }
}
$receipt = [ordered]@{
  schema = 'gpir.cloud-powershell-proof.v1'
  result = 'PASS'
  operation = 'workspace-proof'
  executor = 'github-hosted-ubuntu-pwsh'
  repository = $env:GITHUB_REPOSITORY
  commit = $env:GITHUB_SHA
  workflow_run_id = $env:GITHUB_RUN_ID
  files_verified = $expected
  local_office_machine_required = $false
  production_modified = $false
}
$receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath 'cloud-workspace-receipt.json' -Encoding utf8
Write-Output 'CLOUD_POWERSHELL_WORKSPACE_PROOF_PASS'
