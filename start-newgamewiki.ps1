$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ProjectRoot "tmp"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $LogDir "start-newgamewiki-$Stamp.log"
$Url = "http://127.0.0.1:64111/"
$IconFile = Join-Path $ProjectRoot "public\newgamewiki.ico"
$SilentLauncherFile = Join-Path $ProjectRoot "start-newgamewiki-silent.vbs"

Write-Host "正在启动：NewgameWiki"
Write-Host "项目目录：$ProjectRoot"
Write-Host "页面地址：$Url"
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

function Update-NewgameWikiShortcut {
  param([string]$TargetPath)
  if (-not $TargetPath) { return }
  try {
    $Shell = New-Object -ComObject WScript.Shell
    $Shortcut = $Shell.CreateShortcut($TargetPath)
    $Shortcut.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
    $Shortcut.Arguments = [char]34 + $SilentLauncherFile + [char]34
    $Shortcut.WorkingDirectory = $ProjectRoot
    $Shortcut.Description = "启动 NewgameWiki 本地后台与前端"
    if (Test-Path $IconFile) {
      $Shortcut.IconLocation = "$IconFile,0"
    }
    $Shortcut.Save()
  } catch {
    Write-Host "快捷方式更新失败：$TargetPath"
  }
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

  $DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "NewgameWiki.lnk"
  $ProjectShortcut = Join-Path (Split-Path -Parent $ProjectRoot) "NewgameWiki.lnk"
  Update-NewgameWikiShortcut $DesktopShortcut
  Update-NewgameWikiShortcut $ProjectShortcut

  $connections = Get-NetTCPConnection -LocalPort 64111 -ErrorAction SilentlyContinue
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
    "`$OutputEncoding = [System.Text.UTF8Encoding]::new(); `$PSDefaultParameterValues['Out-File:Encoding']='utf8'; cd '$ProjectRoot'; `$env:SERVE_WEB='1'; `$env:PORT='64111'; npm run start *>&1 | Tee-Object -FilePath '$LogFile' -Append"
  ) -WindowStyle Hidden

  $Ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
      $Status = Invoke-WebRequest -Uri "$Url/api/system/status" -UseBasicParsing -TimeoutSec 2
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
  Start-Process $Url
}
finally {
  Pop-Location
}
