# NSM AI Speaker - Windows 배포 스크립트
# 사용법: .\scripts\deploy.ps1

param(
    [string]$Subdomain = "nsm-speaker",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== NSM AI Speaker Deploy ===" -ForegroundColor Cyan

# 1. 기존 프로세스 종료
Write-Host "[1/5] Stopping existing processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. 프로젝트 디렉토리로 이동
Set-Location $ProjectRoot
Write-Host "[2/5] Working directory: $ProjectRoot" -ForegroundColor Yellow

# 3. 환경변수 확인
if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env file not found! Copy .env.example to .env and configure." -ForegroundColor Red
    exit 1
}

# 4. 의존성 설치
Write-Host "[3/5] Installing dependencies..." -ForegroundColor Yellow
npm ci --production

# 5. 서버 시작
Write-Host "[4/5] Starting server..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:ProjectRoot
    npm start
}

Start-Sleep -Seconds 3

# 서버 상태 확인
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5
    Write-Host "Server started successfully!" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Server failed to start!" -ForegroundColor Red
    Receive-Job $serverJob
    exit 1
}

# 6. Localtunnel 시작
Write-Host "[5/5] Starting tunnel ($Subdomain.loca.lt)..." -ForegroundColor Yellow
$tunnelJob = Start-Job -ScriptBlock {
    npx localtunnel --port $using:Port --subdomain $using:Subdomain
}

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Local:  http://localhost:$Port" -ForegroundColor White
Write-Host "Public: https://$Subdomain.loca.lt" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray

# 프로세스 유지
try {
    while ($true) {
        Start-Sleep -Seconds 60
        # 서버 상태 체크
        try {
            Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 5 | Out-Null
        } catch {
            Write-Host "[WARNING] Server may be down, checking..." -ForegroundColor Yellow
        }
    }
} finally {
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Stop-Job $tunnelJob -ErrorAction SilentlyContinue
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
}
