# Libera a porta do Bot-ADNY:
# 1) Encerra o PID gravado em .bot-adny.pid (npm start nao inclui "Bot-ADNY" na linha de comando).
# 2) Fallback: node na porta cujo comando mencione Bot-ADNY.
$ErrorActionPreference = 'SilentlyContinue'
$botRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $botRoot

$port = 3000
if (Test-Path '.env') {
  foreach ($line in Get-Content '.env') {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') {
      $port = [int]$Matches[1]
      break
    }
  }
}

$pidFile = Join-Path $botRoot '.bot-adny.pid'
if (Test-Path $pidFile) {
  $raw = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  $oldPid = 0
  $parsed = $false
  try {
    $oldPid = [int]$raw
    $parsed = $true
  } catch {
    $parsed = $false
  }
  if ($parsed -and $oldPid -gt 0) {
    $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
      $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid").CommandLine
      if ($cmd -match 'server\.js') {
        Write-Host "[start.bat] Encerrando instancia anterior (PID $oldPid) registrada em .bot-adny.pid..."
        try { Stop-Process -Id $oldPid -Force } catch { Write-Host "[start.bat] $($_)" }
      }
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 400

Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $procId = $_.OwningProcess
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $proc -or $proc.ProcessName -ne 'node') { return }

  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId").CommandLine
  if (-not $cmd) { return }

  $isBot = $cmd -match '(?i)Bot-ADNY' -or $cmd -match '(?i)sistema-pedidos.*Bot-ADNY'
  $exePath = $proc.Path
  $likelyThisBot =
    ($cmd -match 'server\.js') -and
    $exePath -and
    ($exePath -notmatch '(?i)cursor') -and
    ($exePath -notmatch '(?i)Code\\')

  if (-not $isBot -and -not $likelyThisBot) { return }

  Write-Host "[start.bat] Porta $port ocupada por node (PID $procId). Encerrando..."
  try { Stop-Process -Id $procId -Force } catch { Write-Host "[start.bat] $($_)" }
}

Start-Sleep -Milliseconds 300
