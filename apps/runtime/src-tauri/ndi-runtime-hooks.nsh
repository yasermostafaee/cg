; Keep the regular NSIS compression behavior used by the other APASAI installers.
SetCompress auto

; CG Control can preview NDI sources directly. The official NDI redistributable is
; bundled as an app resource and installed only when a supported x64 runtime is absent.
!macro NSIS_HOOK_POSTINSTALL
  ReadEnvStr $0 "NDI_RUNTIME_DIR_V6"
  StrCmp $0 "" ndi_runtime_check_v5_env
  IfFileExists "$0\Processing.NDI.Lib.x64.dll" ndi_runtime_done

ndi_runtime_check_v5_env:
  ReadEnvStr $0 "NDI_RUNTIME_DIR_V5"
  StrCmp $0 "" ndi_runtime_check_program_files
  IfFileExists "$0\Processing.NDI.Lib.x64.dll" ndi_runtime_done

ndi_runtime_check_program_files:
  IfFileExists "$PROGRAMFILES64\NDI\NDI 6 Runtime\Processing.NDI.Lib.x64.dll" ndi_runtime_done
  IfFileExists "$PROGRAMFILES64\NDI\NDI 6 Runtime\v6\Processing.NDI.Lib.x64.dll" ndi_runtime_done
  IfFileExists "$PROGRAMFILES64\NDI\NDI 5 Runtime\Processing.NDI.Lib.x64.dll" ndi_runtime_done
  IfFileExists "$PROGRAMFILES64\NDI\NDI 5 Runtime\v5\Processing.NDI.Lib.x64.dll" ndi_runtime_done

  DetailPrint "Installing the NDI Runtime required for direct input preview..."
  ExecWait '"$INSTDIR\resources\NDI 6 Runtime.exe"' $0

  ; Some vendor installers return a restart status even though the runtime is ready.
  IfFileExists "$PROGRAMFILES64\NDI\NDI 6 Runtime\Processing.NDI.Lib.x64.dll" ndi_runtime_done
  IfFileExists "$PROGRAMFILES64\NDI\NDI 6 Runtime\v6\Processing.NDI.Lib.x64.dll" ndi_runtime_done
  MessageBox MB_OK|MB_ICONEXCLAMATION "CG Control was installed, but the NDI Runtime was not confirmed. NDI input previews will remain unavailable until the NDI Runtime is installed. Run the CG Control installer again and complete the NDI setup if needed."

ndi_runtime_done:
!macroend

; CG Control Setup writes the initial language after the interactive installer succeeds.
; Standard uninstall removes it. An explicit update keeps it.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    Delete "$INSTDIR\cg-control-install-language"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
