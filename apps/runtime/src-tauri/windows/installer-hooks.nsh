; CG Control - installer hooks (DESKTOP-APPS-01, ADR 0011). ASCII only: NSIS reads a file
; without a BOM in the system codepage, and the repo's control-bytes gate refuses a BOM.
;
; CasparCG reaches this machine on two inbound ports, both answered by the bridge sidecar
; (cg-bridge.exe) and by nothing else:
;   UDP 6250 - OSC from CasparCG (ADR 0010 rule 7: the core sends OSC to each AMCP client)
;   TCP 7911 - CasparCG fetching templates from the bridge
; Each rule names the sidecar's own program path, so no other program gains the port. The
; uninstaller removes exactly what the installer added. Installing again replaces them.
;
; $0 is preserved around every call: these hooks run inside Tauri's own installer script.

!define CG_RULE_OSC "CG Control - OSC from CasparCG (UDP 6250)"
!define CG_RULE_TEMPLATES "CG Control - templates to CasparCG (TCP 7911)"

!macro CG_NETSH ARGS
  Push $0
  nsExec::ExecToLog 'netsh advfirewall firewall ${ARGS}'
  Pop $0
  Pop $0
!macroend

!macro CG_REMOVE_FIREWALL_RULES
  !insertmacro CG_NETSH 'delete rule name="${CG_RULE_OSC}"'
  !insertmacro CG_NETSH 'delete rule name="${CG_RULE_TEMPLATES}"'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro CG_REMOVE_FIREWALL_RULES
  !insertmacro CG_NETSH 'add rule name="${CG_RULE_OSC}" dir=in action=allow program="$INSTDIR\cg-bridge.exe" protocol=UDP localport=6250 profile=any enable=yes'
  !insertmacro CG_NETSH 'add rule name="${CG_RULE_TEMPLATES}" dir=in action=allow program="$INSTDIR\cg-bridge.exe" protocol=TCP localport=7911 profile=any enable=yes'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CG_REMOVE_FIREWALL_RULES
!macroend
