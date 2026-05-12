# Libera a porta do Bot-ADNY antes de subir de novo.
# - .bot-adny.pid (PID gravado pelo server.js ao subir)
# - Qualquer node escutando na PORT com server.js na linha de comando, exceto helper do Cursor/VS Code
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

function Get-EditorLike {
  param([string]$Exe, [string]$Cmd)
  $blob = "$Exe $Cmd"
  return $blob -match '(?i)[/\\]cursor[/\\]' -or
    $blob -match '(?i)Programs[/\\]Microsoft VS Code[/\\]' -or
    $blob -match '(?i)resources[/\\]app[/\\]resources[/\\]helpers[/\\]node' -or
    $blob -match '(?i)\\\\.vscode\\\\'
}

# --- 1) PID guardado pelo bot na ultima execucao ---
$pidFile = Join-Path $botRoot '.bot-adny.pid'
if (Test-Path $pidFile) {
  $raw = (Get-Content -LiteralPath $pidFile -Raw).Trim()
  $oldPid = 0
  try { $oldPid = [int]$raw } catch { $oldPid = 0 }
  if ($oldPid -gt 0) {
    $w = Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction SilentlyContinue
    if ($w -and $w.Name -match '(?i)^node') {
      $cmd = [string]$w.CommandLine
      if ($cmd -match 'server\.js' -and -not (Get-EditorLike $w.ExecutablePath $cmd)) {
        Write-Host "[start.bat] Encerrando PID $oldPid (.bot-adny.pid)..."
        try { Stop-Process -Id $oldPid -Force } catch { Write-Host "[start.bat] $($_)" }
      }
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500

# --- 2) Quem esta escutando nesta porta? (diagnostico + encerra node "nosso") ---
$pids = @{}
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $pids[$_.OwningProcess] = $true
}

if ($pids.Count -eq 0) {
  Write-Host "[start.bat] Porta $port livre."
  exit 0
}

Write-Host "[start.bat] Processos em LISTEN na porta $port :"
foreach ($procId in $pids.Keys) {
  $w = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $w) {
    Write-Host "  PID $procId (sem dados WMI)"
    continue
  }
  $exe = [string]$w.ExecutablePath
  $cmd = [string]$w.CommandLine
  $shortCmd = if ($cmd.Length -gt 140) { $cmd.Substring(0, 140) + '...' } else { $cmd }
  Write-Host "  PID $procId | $($w.Name) | $exe"
  Write-Host "       cmd: $shortCmd"

  $isNode = $w.Name -match '(?i)^node'
  if (-not $isNode) {
    Write-Host "       ^ nao e Node: feche esse programa ou mude PORT no .env"
    continue
  }

  if ($cmd -notmatch 'server\.js') {
    Write-Host "       ^ Node sem server.js na linha: nao encerro automaticamente (pode ser outro app)"
    continue
  }

  if (Get-EditorLike $exe $cmd) {
    Write-Host "       ^ Parece Node do Cursor/VS Code: nao encerro. Use outra PORT no .env (ex.: 3002) ou feche o recurso que usa a $port."
    continue
  }

  Write-Host "[start.bat] Encerrando este Node (PID $procId) para liberar a porta $port..."
  try { Stop-Process -Id $procId -Force } catch { Write-Host "[start.bat] $($_)" }
}

Start-Sleep -Milliseconds 500
