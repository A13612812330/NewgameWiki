param(
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "tmp\git-backup"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$safeTimestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$logFile = Join-Path $logDir "backup-$safeTimestamp.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-BackupLog([string]$Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  $line | Tee-Object -FilePath $logFile -Append
}

function Invoke-Git([string[]]$Arguments) {
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  Set-Location $projectRoot
  Write-BackupLog "Starting source-code backup on branch $Branch."

  $insideWorkTree = (& git rev-parse --is-inside-work-tree 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
    throw "Project folder is not a Git worktree."
  }

  Invoke-Git @("fetch", "origin", $Branch)
  $behind = [int]((& git rev-list --count "HEAD..origin/$Branch").Trim())
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to check remote branch state."
  }
  if ($behind -gt 0) {
    Write-BackupLog "Local branch is behind origin/$Branch by $behind commit(s); applying fast-forward update."
    Invoke-Git @("pull", "--ff-only", "origin", $Branch)
  }

  Invoke-Git @("add", "-A")
  $staged = @(& git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect staged files."
  }

  $forbiddenPattern = '^(data/|tmp/|runtime-cache/|archive/|node_modules/|\.env(?:/|$))'
  $forbidden = @($staged | Where-Object { $_ -match $forbiddenPattern })
  if ($forbidden.Count -gt 0) {
    throw "Protected local files were staged: $($forbidden -join ', ')"
  }

  if ($staged.Count -eq 0) {
    Write-BackupLog "No source changes detected. Nothing to commit."
    exit 0
  }

  Invoke-Git @("commit", "-m", "chore: automatic local backup $timestamp")
  Invoke-Git @("push", "origin", $Branch)
  Write-BackupLog "Backup completed successfully."
  exit 0
} catch {
  Write-BackupLog "Backup failed: $($_.Exception.Message)"
  exit 1
}
