; CG Bridge - the installer (CENTRAL-BRIDGE-01 1A, D1). ASCII only: makensis reads a file
; without a BOM in the system codepage, and the repo's control-bytes gate refuses a BOM.
;
; Installs CG Bridge as the Windows service CGBridge, per machine:
;   %ProgramFiles%\CG Bridge\     cg-bridge.exe (the official node.exe), shawl.exe (the service
;                                 host), bridge\caspar-bridge.mjs (the bridge), licenses\
;   %ProgramData%\CG Bridge\      cg-bridge.json (the configuration), .cg-runtime\ (the state),
;                                 logs\ (the service's output, amcp.log, install.log)
;
; Silent:     CG-Bridge_<v>_x64-setup.exe /S [/PLAYOUT=http://host:8080] [/AMCPHOST=127.0.0.1]
;               [/AMCPPORT=5250] [/OSCPORT=6251] [/CONTROLPORT=5280] [/TEMPLATEPORT=7911]
;               [/BRIDGEADDRESS=<ip>]
; Uninstall:  "%ProgramFiles%\CG Bridge\uninstall.exe" /S _?=%ProgramFiles%\CG Bridge
; Exit codes: 0 done; 1 cancelled by the user (interactive only); 2 failed (install.log says why).
;
; The rules it keeps (the Playout team's, docs/integration/playout/CG-BRIDGE-FOR-PLAYOUT.md):
;   - the service depends on nothing (rule 1: never on ApasaiEngine), starts automatically, and
;     is restarted by Windows on failure (5 s, 5 s, 30 s; the count resets after a day);
;   - it touches only OUR service (CGBridge) and OUR three firewall rules, by name;
;   - an upgrade stops and starts our service itself and keeps the configuration and the state;
;   - nothing is downloaded: every byte it installs is inside it;
;   - the configuration is written BY THE BRIDGE (--write-service-config), through the schema every
;     start reads it with, so UDP 6250 (the Playout engine's) is refused here too.

Unicode true

!ifndef VERSION
  !error "Build with: makensis /DVERSION=<x.y.z> cg-bridge.nsi"
!endif

!define PRODUCT "CG Bridge"
!define SERVICE "CGBridge"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CGBridge"
!define DEFAULT_PLAYOUT "http://127.0.0.1:8080"

Name "${PRODUCT} ${VERSION}"
OutFile "CG-Bridge_${VERSION}_x64-setup.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show
BrandingText "APASAI ${PRODUCT} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${PRODUCT} ${VERSION} setup"
VIAddVersionKey "CompanyName" "APASAI"
VIAddVersionKey "LegalCopyright" "APASAI"

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Var DataDir
Var Log
Var ExitCode
Var Output
Var Args
Var Playout
Var AmcpHost
Var AmcpPort
Var OscPort
Var ControlPort
Var TemplatePort
Var BridgeAddress
Var Warnings

; ---------------------------------------------------------------------------------------------
; Run a command; append "[label] exit N" and its output to the log. $ExitCode holds the code.
; Called with: Push `command` / Push `label` / Call RunLogged
; ---------------------------------------------------------------------------------------------
!macro CG_RUN_LOGGED PREFIX
Function ${PREFIX}RunLogged
  Exch $R1
  Exch
  Exch $R0
  Push $R2
  DetailPrint "$R1"
  nsExec::ExecToStack $R0
  Pop $ExitCode
  Pop $Output
  FileOpen $R2 "$Log" a
  FileSeek $R2 0 END
  FileWrite $R2 "[$R1] exit $ExitCode$\r$\n$Output$\r$\n"
  FileClose $R2
  Pop $R2
  Pop $R0
  Pop $R1
FunctionEnd
!macroend
!insertmacro CG_RUN_LOGGED ""
!insertmacro CG_RUN_LOGGED "un."

!macro RUN LABEL COMMAND
  Push `${COMMAND}`
  Push `${LABEL}`
  Call RunLogged
!macroend

!macro UN_RUN LABEL COMMAND
  Push `${COMMAND}`
  Push `${LABEL}`
  Call un.RunLogged
!macroend

; Our service only, by its own name; absent is fine. Waits (30 s) until it has stopped, so no file
; the service holds is replaced under it.
!define STOP_SERVICE `powershell.exe -NoProfile -NonInteractive -Command "$$s = Get-Service -Name ${SERVICE} -ErrorAction SilentlyContinue; if ($$s -and $$s.Status -ne 'Stopped') { Stop-Service -Name ${SERVICE} -Force; $$s.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)) }"`

!define START_SERVICE `powershell.exe -NoProfile -NonInteractive -Command "Start-Service -Name ${SERVICE}; (Get-Service -Name ${SERVICE}).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))"`

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "CG Bridge needs 64-bit Windows." /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
  ; With the all-users context, $APPDATA is %ProgramData%.
  StrCpy $DataDir "$APPDATA\${PRODUCT}"
  StrCpy $Log "$DataDir\logs\install.log"
  StrCpy $Warnings ""
  ${GetParameters} $Args
  ClearErrors
  ${GetOptions} $Args "/PLAYOUT=" $Playout
  ${GetOptions} $Args "/AMCPHOST=" $AmcpHost
  ${GetOptions} $Args "/AMCPPORT=" $AmcpPort
  ${GetOptions} $Args "/OSCPORT=" $OscPort
  ${GetOptions} $Args "/CONTROLPORT=" $ControlPort
  ${GetOptions} $Args "/TEMPLATEPORT=" $TemplatePort
  ${GetOptions} $Args "/BRIDGEADDRESS=" $BridgeAddress
  ClearErrors
FunctionEnd

Section "CG Bridge" SecMain
  CreateDirectory "$DataDir\logs"
  FileOpen $0 "$Log" a
  FileSeek $0 0 END
  FileWrite $0 "$\r$\n==== ${PRODUCT} ${VERSION} setup $Args$\r$\n"
  FileClose $0

  ; 1 - an upgrade stops our service first (never another).
  !insertmacro RUN "stopping the service (if it runs)" `${STOP_SERVICE}`

  ; 2 - the files.
  SetOutPath "$INSTDIR"
  File "payload\cg-bridge.exe"
  File "payload\shawl.exe"
  SetOutPath "$INSTDIR\bridge"
  File "payload\bridge\caspar-bridge.mjs"
  SetOutPath "$INSTDIR\licenses"
  ; Staging warns when a licence text is missing; the build does not fail over it.
  File /nonfatal /r "payload\licenses\*.*"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 3 - the configuration, written by the bridge through its own schema. A first install with no
  ;     /PLAYOUT= takes the Playout on this machine; an upgrade keeps every value it was not given.
  ${IfNot} ${FileExists} "$DataDir\cg-bridge.json"
  ${AndIf} $Playout == ""
    StrCpy $Playout "${DEFAULT_PLAYOUT}"
  ${EndIf}
  !insertmacro RUN "writing the configuration" `"$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --write-service-config "$DataDir\cg-bridge.json" --playout-address "$Playout" --caspar-host "$AmcpHost" --amcp-port "$AmcpPort" --osc-port "$OscPort" --port "$ControlPort" --template-serve-port "$TemplatePort" --template-serve-host "$BridgeAddress"`
  ${If} $ExitCode != 0
    MessageBox MB_ICONSTOP "CG Bridge's configuration was not written:$\r$\n$Output" /SD IDOK
    Abort "CG Bridge's configuration was not written (see $Log)."
  ${EndIf}

  ; 4 - the service, registered once: Shawl runs the bridge and stops it with Ctrl+C (10 s, then the
  ;     whole process tree). Windows restarts it on failure; it depends on nothing.
  nsExec::ExecToStack 'sc.exe query ${SERVICE}'
  Pop $0
  Pop $1
  ${If} $0 != 0
    !insertmacro RUN "registering the service" `"$INSTDIR\shawl.exe" add --name ${SERVICE} --cwd "$DataDir" --log-dir "$DataDir\logs" --log-as cg-bridge-service --log-cmd-as cg-bridge --log-rotate daily --log-retain 14 --stop-timeout 10000 --kill-process-tree --no-restart -- "$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --service-config "$DataDir\cg-bridge.json"`
    ${If} $ExitCode != 0
      MessageBox MB_ICONSTOP "The CG Bridge service could not be registered:$\r$\n$Output" /SD IDOK
      Abort "The CG Bridge service could not be registered (see $Log)."
    ${EndIf}
  ${EndIf}
  !insertmacro RUN "service: automatic start, its own account" `sc.exe config ${SERVICE} start= auto obj= "NT SERVICE\${SERVICE}" DisplayName= "${PRODUCT}"`
  !insertmacro RUN "service: description" `sc.exe description ${SERVICE} "APASAI CG Bridge - the CasparCG control service every CG Control console connects to."`
  !insertmacro RUN "service: restart on failure" `sc.exe failure ${SERVICE} reset= 86400 actions= restart/5000/restart/5000/restart/30000`
  !insertmacro RUN "service: a failed exit counts as a failure" `sc.exe failureflag ${SERVICE} 1`

  ; 5 - the data folder: the service's own account may write it; no other user may read it (it holds
  ;     the bridge's Playout session). SIDs, so a localized Windows names the same groups.
  !insertmacro RUN "data folder access" `icacls "$DataDir" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F "NT SERVICE\${SERVICE}:(OI)(CI)M"`
  !insertmacro RUN "data folder access (contents)" `icacls "$DataDir\*" /reset /T /C /Q`

  ; 6 - one-time import of an older per-user CG Control state (nothing is deleted).
  ReadEnvStr $0 SystemDrive
  !insertmacro RUN "importing an older state (once)" `"$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --service-config "$DataDir\cg-bridge.json" --import-state "$0\Users"`

  ; 7 - our firewall rules, on the ports in force.
  !insertmacro RUN "firewall rules" `"$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --service-config "$DataDir\cg-bridge.json" --firewall add`
  ${If} $ExitCode != 0
    StrCpy $Warnings "$Warnings$\r$\n- A firewall rule was not added: consoles on other machines may not reach CG Bridge."
  ${EndIf}

  ; 8 - Windows' reserved port ranges (rule 12): warned, never changed.
  !insertmacro RUN "checking the ports" `"$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --service-config "$DataDir\cg-bridge.json" --check-ports`
  ${If} $ExitCode == 3
    StrCpy $Warnings "$Warnings$\r$\n- A port CG Bridge uses is reserved by Windows:$\r$\n$Output"
  ${EndIf}

  ; 9 - start it.
  !insertmacro RUN "starting the service" `${START_SERVICE}`
  ${If} $ExitCode != 0
    StrCpy $Warnings "$Warnings$\r$\n- The service did not start; see $DataDir\logs."
  ${EndIf}

  ; 10 - Installed apps.
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "APASAI"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\cg-bridge.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "EstimatedSize" $0

  ${If} $Warnings != ""
    FileOpen $0 "$Log" a
    FileSeek $0 0 END
    FileWrite $0 "WARNINGS:$Warnings$\r$\n"
    FileClose $0
    MessageBox MB_ICONEXCLAMATION "CG Bridge is installed, with warnings:$Warnings" /SD IDOK
  ${EndIf}
  FileOpen $0 "$Log" a
  FileSeek $0 0 END
  FileWrite $0 "==== done$\r$\n"
  FileClose $0
SectionEnd

Function un.onInit
  SetRegView 64
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${PRODUCT}"
  StrCpy $Log "$DataDir\logs\uninstall.log"
FunctionEnd

; The uninstaller removes our service, our rules and our program files - never theirs. The data
; folder (configuration, state, logs) is kept, so a reinstall picks up where this one stopped.
Section "Uninstall"
  CreateDirectory "$DataDir\logs"
  FileOpen $0 "$Log" a
  FileSeek $0 0 END
  FileWrite $0 "$\r$\n==== ${PRODUCT} ${VERSION} uninstall$\r$\n"
  FileClose $0

  !insertmacro UN_RUN "stopping the service" `${STOP_SERVICE}`
  !insertmacro UN_RUN "removing the service" `sc.exe delete ${SERVICE}`
  !insertmacro UN_RUN "removing our firewall rules" `"$INSTDIR\cg-bridge.exe" "$INSTDIR\bridge\caspar-bridge.mjs" --firewall remove`

  Delete "$INSTDIR\bridge\caspar-bridge.mjs"
  RMDir "$INSTDIR\bridge"
  RMDir /r "$INSTDIR\licenses"
  Delete "$INSTDIR\cg-bridge.exe"
  Delete "$INSTDIR\shawl.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"

  FileOpen $0 "$Log" a
  FileSeek $0 0 END
  FileWrite $0 "==== done (the data folder $DataDir is kept)$\r$\n"
  FileClose $0
SectionEnd
