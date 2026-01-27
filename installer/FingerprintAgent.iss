; Inno Setup script para instalar o FingerprintAgent como serviço do Windows
; Requer Inno Setup 6.x (iscc.exe)

#define AppName "WDGestor FingerprintAgent"
#define AppVersion "2.4.2"
#define Publisher "WDGestor"
#define DefaultDirName "{pf64}\WDGestor\FingerprintAgent"

[Setup]
AppId={{C1F0A1E8-1B6B-4F9F-9E5D-FA9B4DE5F1A5}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={#DefaultDirName}
DisableDirPage=no
DisableProgramGroupPage=yes
Compression=lzma
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
AllowNoIcons=yes
OutputDir=dist
OutputBaseFilename=FingerprintAgent-Setup-x64
SetupLogging=yes

[Languages]
Name: "br"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
; Copie os artefatos publicados (dotnet publish) para o diretório
Source: "..\FingerprintAgent\publish\win-x64\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Run]
; Registrar e iniciar o serviço após instalar os arquivos
Filename: "sc.exe"; Parameters: "create \"FingerprintAgent\" binPath= \"{app}\\FingerprintAgent.exe\" DisplayName= \"WDGestor Fingerprint Agent\" start= auto"; StatusMsg: "Registrando serviço..."; Flags: runhidden
Filename: "sc.exe"; Parameters: "start \"FingerprintAgent\""; StatusMsg: "Iniciando serviço..."; Flags: runhidden

[UninstallRun]
; Parar e remover serviço ao desinstalar
Filename: "sc.exe"; Parameters: "stop \"FingerprintAgent\""; Flags: runhidden
Filename: "sc.exe"; Parameters: "delete \"FingerprintAgent\""; Flags: runhidden

[Icons]
Name: "{autoprograms}\{#AppName}\Verificar saúde (localhost)"; Filename: "http://127.0.0.1:17890/health"; Flags: dontcloseonexit
