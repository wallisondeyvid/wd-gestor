# FingerprintAgent (Windows)

Agente local para leitura biométrica (serial) com API HTTP em `http://127.0.0.1:17890`.

- Framework: .NET 8
- Execução: Serviço do Windows (sem janela)
- Endpoints principais: `/health`, `/pico/devices`, `/pico/open`, `/pico/close`, `/pico/ping`, `/pico/template`, `/pico/search`

## Como gerar e instalar (admin)

1) Publicar build self-contained (x64, single file):

```
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o FingerprintAgent\publish\win-x64
```

2) Instalar como serviço (PowerShell, administrador):

```
Set-ExecutionPolicy Bypass -Scope Process -Force
PowerShell -ExecutionPolicy Bypass -File .\FingerprintAgent\install-service.ps1
```

- Serviço: `FingerprintAgent`
- Inicia automático; porta local: `http://127.0.0.1:17890/health`

3) Desinstalar serviço (opcional):

```
PowerShell -ExecutionPolicy Bypass -File .\FingerprintAgent\uninstall-service.ps1
```

## Criando um instalador .exe (Inno Setup)

Se preferir um instalador único `.exe`:

1) Instale o [Inno Setup 6](https://jrsoftware.org/isinfo.php) (inclui `iscc.exe`).
2) Garanta que os arquivos publicados existem em `FingerprintAgent\publish\win-x64`.
3) Compile o script:

```
"C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe" installer\FingerprintAgent.iss
```

Isso gera `dist\FingerprintAgent-Setup-x64.exe` que:
- Copia os binários para `C:\\Program Files\\WDGestor\\FingerprintAgent`
- Registra o serviço `FingerprintAgent` (start=auto)
- Inicia o serviço ao final da instalação
- Remove o serviço ao desinstalar

## Observações

- O serviço grava logs no Visualizador de Eventos do Windows (Fonte: `FingerprintAgent`).
- Programas clientes devem usar `http://127.0.0.1:17890` (loopback). Não expõe rede externa.
- Caso precise mudar a porta, ajuste `Program.cs` e republique.
