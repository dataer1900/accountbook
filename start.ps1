$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Test-Path '.\node_modules')) {
  Write-Host 'node_modules not found. Run npm install first.' -ForegroundColor Yellow
  exit 1
}

Write-Host 'Starting personal-bookkeeping-app...' -ForegroundColor Cyan
Start-Process -FilePath npm.cmd -ArgumentList 'run','backend' -WorkingDirectory $projectRoot -WindowStyle Hidden
npm run start
