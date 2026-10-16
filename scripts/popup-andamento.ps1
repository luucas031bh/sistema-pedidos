# Aviso do Windows sobre o andamento do trabalho Adonay.
# Le contexto/andamento.json. Nao grava pedido e nao altera dado do sistema.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$statusPath = Join-Path $root "contexto\andamento.json"

$me = $PID
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | ForEach-Object {
    if ($_.ProcessId -ne $me -and $_.CommandLine -and $_.CommandLine -like "*popup-andamento.ps1*") {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$verde = [System.Drawing.Color]::FromArgb(20, 122, 62)
$vermelho = [System.Drawing.Color]::FromArgb(153, 27, 27)
$cor = $vermelho
$titulo = "Precisa de voce"
$resumo = "Nao foi possivel ler o andamento."
$detalhe = "Abra o projeto e confira o arquivo contexto\andamento.json."
$quando = ""

if (Test-Path -LiteralPath $statusPath) {
    $json = Get-Content -LiteralPath $statusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $estado = [string]$json.estado
    $precisa = $false
    if ($null -ne $json.precisaDeVoce) { $precisa = [System.Convert]::ToBoolean($json.precisaDeVoce) }
    $atencao = $precisa -or $estado -eq "atencao" -or $estado -eq "erro" -or $estado -eq "aprovacao"
    if ($atencao) {
        $cor = $vermelho
    } else {
        $cor = $verde
    }
    if ($json.titulo) { $titulo = [string]$json.titulo }
    if ($json.resumo) { $resumo = [string]$json.resumo }
    if ($json.detalhe) { $detalhe = [string]$json.detalhe }
    if ($json.atualizado) { $quando = [string]$json.atualizado }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Adonay - Andamento"
$form.ClientSize = New-Object System.Drawing.Size(460, 280)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.TopMost = $true
$form.BackColor = $cor
$form.ForeColor = [System.Drawing.Color]::White
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font("Segoe UI", 11)

$lblTitulo = New-Object System.Windows.Forms.Label
$lblTitulo.Text = $titulo
$lblTitulo.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblTitulo.ForeColor = [System.Drawing.Color]::White
$lblTitulo.AutoSize = $false
$lblTitulo.Location = New-Object System.Drawing.Point(20, 16)
$lblTitulo.Size = New-Object System.Drawing.Size(420, 36)

$lblResumo = New-Object System.Windows.Forms.Label
$lblResumo.Text = $resumo
$lblResumo.ForeColor = [System.Drawing.Color]::White
$lblResumo.AutoSize = $false
$lblResumo.Location = New-Object System.Drawing.Point(20, 58)
$lblResumo.Size = New-Object System.Drawing.Size(420, 72)

$lblDetalhe = New-Object System.Windows.Forms.Label
$lblDetalhe.Text = $detalhe
$lblDetalhe.ForeColor = [System.Drawing.Color]::White
$lblDetalhe.AutoSize = $false
$lblDetalhe.Location = New-Object System.Drawing.Point(20, 132)
$lblDetalhe.Size = New-Object System.Drawing.Size(420, 64)

$lblQuando = New-Object System.Windows.Forms.Label
$agora = Get-Date -Format "dd/MM/yyyy HH:mm"
$textoQuando = "Agora: $agora. Proximo aviso em 15 minutos. Se este ainda estiver aberto, ele sai e entra o novo."
if ($quando) { $textoQuando = "Registro: $quando. " + $textoQuando }
$lblQuando.Text = $textoQuando
$lblQuando.ForeColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$lblQuando.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$lblQuando.AutoSize = $false
$lblQuando.Location = New-Object System.Drawing.Point(20, 198)
$lblQuando.Size = New-Object System.Drawing.Size(420, 36)

$botao = New-Object System.Windows.Forms.Button
$botao.Text = "Entendi"
$botao.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$botao.BackColor = [System.Drawing.Color]::White
$botao.ForeColor = $cor
$botao.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$botao.Location = New-Object System.Drawing.Point(330, 236)
$botao.Size = New-Object System.Drawing.Size(110, 32)
$botao.Add_Click({ $form.Close() })

$form.Controls.AddRange(@($lblTitulo, $lblResumo, $lblDetalhe, $lblQuando, $botao))
[void]$form.ShowDialog()
