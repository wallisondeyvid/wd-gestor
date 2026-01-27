#requires -RunAsAdministrator
param(
  [string]$ServiceName = 'FingerprintAgent'
)

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "Parando serviço..."
  Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  sc.exe delete $ServiceName | Out-Null
  Write-Host "Serviço removido."
} else {
  Write-Host "Serviço não encontrado: $ServiceName"
}
