$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ProjectRoot "tmp"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "start-newgamewiki-$Stamp.log"
$Url = "http://127.0.0.1:64111/"

Write-Host "正在启动：NewgameWiki"
Write-Host "项目目录：$ProjectRoot"
Write-Host "页面地址：$Url"
Write-Host "日志位置：$LogFile"

Push-Location $ProjectRoot
try {
  if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "首次启动，正在安装依赖..."
    npm install *>&1 | Tee-Object -FilePath $LogFile
  }

  Write-Host "正在构建最新前端..."
  npm run build *>&1 | Tee-Object -FilePath $LogFile

  $connections = Get-NetTCPConnection -LocalPort 64111 -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "cd '$ProjectRoot'; `$env:SERVE_WEB='1'; `$env:PORT='64111'; npm run start *>&1 | Tee-Object -FilePath '$LogFile' -Append"
  ) -WindowStyle Hidden

  Start-Sleep -Seconds 2
  Start-Process $Url
}
finally {
  Pop-Location
}
