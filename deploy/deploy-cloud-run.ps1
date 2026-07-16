param(
  [string]$ProjectId = "su-chatbot-5tr4th",
  [string]$Region = "me-west1",
  [string]$Service = "su-assistant-api"
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
$gcloud = Join-Path $workspace ".tools\gcloud-full\google-cloud-sdk\bin\gcloud.cmd"
$env:CLOUDSDK_PYTHON = Join-Path $workspace ".tools\gcloud-full\google-cloud-sdk\platform\bundledpython\python.exe"
$runtimeIdentity = "su-assistant-api@$ProjectId.iam.gserviceaccount.com"

& $gcloud services enable run.googleapis.com cloudbuild.googleapis.com `
  artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com `
  --project $ProjectId
if ($LASTEXITCODE -ne 0) { throw "API activation failed. Confirm project billing is active." }

& $gcloud secrets describe su-assistant-jwt-secret --project $ProjectId 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gcloud secrets create su-assistant-jwt-secret --replication-policy automatic --project $ProjectId
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes) | & $gcloud secrets versions add su-assistant-jwt-secret `
    --data-file=- --project $ProjectId
}

$secretBindings = @("JWT_SECRET=su-assistant-jwt-secret:latest")
$optionalSecrets = @{
  "su-assistant-openai-key" = "OPENAI_API_KEY"
  "su-assistant-ams-client-secret" = "AMS_CLIENT_SECRET"
  "su-assistant-token-encryption-key" = "SERVICE_TOKEN_ENCRYPTION_KEY"
}
foreach ($secretName in $optionalSecrets.Keys) {
  & $gcloud secrets describe $secretName --project $ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $secretBindings += "$($optionalSecrets[$secretName])=$secretName`:latest"
  }
}

& $gcloud run deploy $Service --source (Join-Path $workspace "backend") `
  --project $ProjectId --region $Region --service-account $runtimeIdentity `
  --allow-unauthenticated --min-instances 0 --max-instances 3 `
  --cpu 1 --memory 512Mi --concurrency 40 --timeout 300 `
  --env-vars-file (Join-Path $PSScriptRoot "cloud-run-env.yaml") `
  --set-secrets ($secretBindings -join ",") --quiet
if ($LASTEXITCODE -ne 0) { throw "Cloud Run deployment failed." }

$serviceUrl = & $gcloud run services describe $Service --project $ProjectId --region $Region `
  --format "value(status.url)"
& $gcloud run services update $Service --project $ProjectId --region $Region `
  --update-env-vars "PUBLIC_BASE_URL=$serviceUrl" --quiet

$runtimeConfig = @"
window.SU_ASSISTANT_CONFIG = Object.freeze({
  mode: "live",
  apiBaseUrl: "$serviceUrl",
});
"@
Set-Content -LiteralPath (Join-Path $workspace "web-widget\public\runtime-config.js") `
  -Value $runtimeConfig -Encoding utf8

Write-Host "Cloud Run is live at $serviceUrl"
Write-Host "Run Firebase Hosting deploy after institutional authentication is configured."
