#requires -RunAsAdministrator
param(
  [string]$ServiceName = 'FingerprintAgent',
  [string]$DisplayName = 'WDGestor Fingerprint Agent',
  [string]$Description = 'Agente local do leitor biométrico (HTTP em 127.0.0.1:17890).',
  [string]$InstallDir = "$PSScriptRoot\publish\win-x64",
  [string]$ExeName = 'FingerprintAgent.exe'
)

$exePath = Join-Path $InstallDir $ExeName
if (-not (Test-Path $exePath)) {
  Write-Error "Executável não encontrado em: $exePath. Publique primeiro (dotnet publish)."
  exit 1
}

# Para serviços .NET modernos, usar New-Service funciona bem
# Se já existir, remova/atualize
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Parando serviço existente..."
  Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 1
}

Write-Host "Registrando serviço $ServiceName..."
New-Service -Name $ServiceName -BinaryPathName "`"$exePath`"" -DisplayName $DisplayName -Description $Description -StartupType Automatic | Out-Null

Write-Host "Iniciando serviço..."
Start-Service -Name $ServiceName

Write-Host "Instalação concluída. Porta: http://127.0.0.1:17890/health"
