Unicode true
RequestExecutionLevel user
CRCCheck force
SetCompressor /SOLID zlib

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!define PACK_ROOT "$LOCALAPPDATA\Programs\PackPanel\${PACK_ID}"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PackPanel-${PACK_ID}"
!define SHORTCUT "$SMPROGRAMS\PackPanel\${PACK_SLUG}.lnk"

Name "${PACK_TITLE}"
OutFile "PackPanelInstaller.exe"
InstallDir "${PACK_ROOT}"
VIProductVersion "2.0.0.0"
VIAddVersionKey "ProductName" "${PACK_TITLE}"
VIAddVersionKey "FileDescription" "PackPanel Setup"
VIAddVersionKey "FileVersion" "${PACK_VERSION}"
VIAddVersionKey "LegalCopyright" "PackPanel"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\app\PackPanel.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "French"

LangString WrongArch ${LANG_ENGLISH} "This launcher requires 64-bit Windows."
LangString WrongArch ${LANG_FRENCH} "Ce launcher nécessite Windows 64 bits."
LangString LaunchOpen ${LANG_ENGLISH} "Close the launcher before installing or uninstalling it."
LangString LaunchOpen ${LANG_FRENCH} "Fermez le launcher avant de l’installer ou de le désinstaller."
LangString InstallFailed ${LANG_ENGLISH} "Setup could not install the launcher."
LangString InstallFailed ${LANG_FRENCH} "L’installation du launcher a échoué."
LangString SetupBusy ${LANG_ENGLISH} "Another installer or uninstaller for this pack is already running."
LangString SetupBusy ${LANG_FRENCH} "Un autre installateur ou désinstallateur de ce pack est déjà ouvert."

!macro AcquireSetupLock
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "Local\PackPanel-Setup-${PACK_ID}") p .r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    MessageBox MB_ICONSTOP "$(SetupBusy)" /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend

Function .onInit
  SetShellVarContext current
  StrCpy $INSTDIR "${PACK_ROOT}"
  !insertmacro AcquireSetupLock
  !insertmacro MUI_LANGDLL_DISPLAY
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "$(WrongArch)" /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

Section
  # Recover the previous installation if setup was interrupted during replacement.
  ${IfNot} ${FileExists} "$INSTDIR\app\PackPanel.exe"
  ${AndIf} ${FileExists} "$INSTDIR\previous\PackPanel.exe"
    ClearErrors
    Rename "$INSTDIR\previous" "$INSTDIR\app"
    IfErrors failed
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\app\PackPanel.exe"
    ClearErrors
    FileOpen $0 "$INSTDIR\app\PackPanel.exe" a
    IfErrors running
    FileClose $0
  ${EndIf}
  RMDir /r "$INSTDIR\incoming"
  ClearErrors
  SetOutPath "$INSTDIR\incoming"
  SetOverwrite on
  File /r "application/*"
  IfErrors failed
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\previous"
  ${If} ${FileExists} "$INSTDIR\app\PackPanel.exe"
    ClearErrors
    Rename "$INSTDIR\app" "$INSTDIR\previous"
    IfErrors failed
  ${EndIf}
  ClearErrors
  Rename "$INSTDIR\incoming" "$INSTDIR\app"
  IfErrors restore
  SetOutPath "$INSTDIR"
  File "PackPanelStart.exe"
  IfErrors restoreInstalled
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  IfErrors restoreInstalled
  CreateDirectory "$SMPROGRAMS\PackPanel"
  SetOutPath "$INSTDIR\app"
  CreateShortCut "${SHORTCUT}" "$INSTDIR\PackPanelStart.exe" "" "$INSTDIR\app\PackPanel.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${PACK_TITLE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${PACK_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\app\PackPanel.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  RMDir /r "$INSTDIR\previous"
  Delete "$INSTDIR\upgrade.pending"
  Goto done

  restoreInstalled:
    RMDir /r "$INSTDIR\app"
  restore:
    ${If} ${FileExists} "$INSTDIR\previous\PackPanel.exe"
      Rename "$INSTDIR\previous" "$INSTDIR\app"
    ${EndIf}
  failed:
    SetOutPath "$INSTDIR"
    RMDir /r "$INSTDIR\incoming"
    MessageBox MB_ICONSTOP "$(InstallFailed)" /SD IDOK
    SetErrorLevel 1
    Abort
  running:
    MessageBox MB_ICONSTOP "$(LaunchOpen)" /SD IDOK
    SetErrorLevel 1
    Abort
  done:
SectionEnd

Function un.onInit
  SetShellVarContext current
  StrCmp "$INSTDIR" "${PACK_ROOT}" 0 stop
  IfFileExists "$INSTDIR\app\PackPanel.exe" 0 stop
  !insertmacro AcquireSetupLock
  Return
  stop:
    Abort
FunctionEnd

Section "Uninstall"
  ClearErrors
  FileOpen $0 "$INSTDIR\app\PackPanel.exe" a
  IfErrors running
  FileClose $0
  SetOutPath "$TEMP"
  ClearErrors
  RMDir /r "$INSTDIR\app"
  IfErrors running
  Delete "${SHORTCUT}"
  RMDir "$SMPROGRAMS\PackPanel"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\PackPanelStart.exe"
  Delete "$INSTDIR\upgrade.pending"
  Delete "$INSTDIR\upgrade.failed"
  Delete "$INSTDIR\upgrade-helper.log"
  RMDir /r "$INSTDIR\upgrade-cache"
  RMDir /r "$INSTDIR\previous"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Goto done
  running:
    MessageBox MB_ICONSTOP "$(LaunchOpen)" /SD IDOK
    SetErrorLevel 1
    Abort
  done:
SectionEnd
