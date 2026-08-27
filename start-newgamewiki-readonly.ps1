param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ProjectRoot "tmp"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "start-newgamewiki-readonly-$Stamp.log"
$Port = "64112"
$LocalUrl = "http://127.0.0.1:$Port/"
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress)
$ShareUrl = if ($LanIp) { "http://$LanIp`:$Port/" } else { $LocalUrl }

Write-Host "正在启动：NewgameWiki 局域网访客只读服务"
Write-Host "项目目录：$ProjectRoot"
Write-Host "访客网址：$ShareUrl"
Write-Host "日志位置：$LogFile"

function Test-FrontendBuildNeeded {
  $DistIndex = Join-Path $ProjectRoot "dist\index.html"
  if (-not (Test-Path $DistIndex)) { return $true }
  $DistTime = (Get-Item $DistIndex).LastWriteTimeUtc
  $CheckPaths = @(
    (Join-Path $ProjectRoot "src"),
    (Join-Path $ProjectRoot "public"),
    (Join-Path $ProjectRoot "index.html"),
    (Join-Path $ProjectRoot "package.json"),
    (Join-Path $ProjectRoot "vite.config.js")
  )
  foreach ($Path in $CheckPaths) {
    if (-not (Test-Path $Path)) { continue }
    $Newest = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($Newest -and $Newest.LastWriteTimeUtc -gt $DistTime) { return $true }
  }
  return $false
}

Push-Location $ProjectRoot
try {
  if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
    Write-Host "首次启动，正在安装依赖..."
    npm install *>&1 | Tee-Object -FilePath $LogFile
  }

  if (Test-FrontendBuildNeeded) {
    Write-Host "检测到前端有更新，正在构建..."
    npm run build *>&1 | Tee-Object -FilePath $LogFile
  } else {
    Write-Host "前端构建已是最新，跳过构建。"
    "前端构建已是最新，跳过构建。" | Out-File -FilePath $LogFile -Append -Encoding utf8
  }

  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    if ($processId -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-WindowStyle", "Hidden",
    "-Command",
    "`$OutputEncoding = [System.Text.UTF8Encoding]::new(); `$PSDefaultParameterValues['Out-File:Encoding']='utf8'; cd '$ProjectRoot'; `$env:SERVE_WEB='1'; `$env:NEWWIKI_READONLY='1'; `$env:HOST='0.0.0.0'; `$env:PORT='$Port'; npm run start *>&1 | Tee-Object -FilePath '$LogFile' -Append"
  ) -WindowStyle Hidden

  $Ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $Status = Invoke-WebRequest -Uri "$LocalUrl/api/health" -UseBasicParsing -TimeoutSec 2
      if ($Status.StatusCode -eq 200) {
        $Ready = $true
        break
      }
    } catch {
      $Ready = $false
    }
  }
  if (-not $Ready) {
    Write-Host "服务仍在启动中，若页面未打开请稍后刷新。"
  }
  if ($OpenBrowser) {
    Start-Process $ShareUrl
  }
}
finally {
  Pop-Location
}
