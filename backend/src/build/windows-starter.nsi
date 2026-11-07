Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "PackPanel"
!ifdef BUILD_ID
  CRCCheck force
  SetCompressor /SOLID lzma
  OutFile "PackPanel.exe"
!else
  OutFile "PackPanelStart.exe"
!endif

!include "LogicLib.nsh"

Section
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "Local\PackPanel-Setup-${PACK_ID}") p .r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    Quit
  ${EndIf}

!ifdef BUILD_ID
  StrCpy $2 "$LOCALAPPDATA\PackPanel\Runtime\${PACK_ID}\${BUILD_ID}"
  ${IfNot} ${FileExists} "$2\ready"
    RMDir /r "$2\app"
    ClearErrors
    SetOutPath "$2\app"
    File /r "application/*"
    IfErrors failed
    ClearErrors
    FileOpen $3 "$2\ready" w
    IfErrors failed
    FileClose $3
  ${EndIf}
!else
  StrCpy $2 "$EXEDIR"
!endif

  ${If} ${FileExists} "$2\upgrade.pending"
  ${AndIf} ${FileExists} "$2\previous\PackPanel.exe"
    ${If} ${FileExists} "$2\app\PackPanel.exe"
      ClearErrors
      FileOpen $0 "$2\app\PackPanel.exe" a
      IfErrors start
      FileClose $0
    ${EndIf}
    RMDir /r "$2\app"
    ClearErrors
    Rename "$2\previous" "$2\app"
    IfErrors start
    Delete "$2\upgrade.pending"
  ${EndIf}
  start:
  ${If} ${FileExists} "$2\app\PackPanel.exe"
  ${AndIfNot} ${FileExists} "$2\previous\PackPanel.exe"
    Delete "$2\upgrade.pending"
  ${EndIf}
  ${If} ${FileExists} "$2\app\PackPanel.exe"
    SetOutPath "$2\app"
    Exec '"$2\app\PackPanel.exe"'
  ${ElseIf} ${FileExists} "$2\previous\PackPanel.exe"
    SetOutPath "$2\previous"
    Exec '"$2\previous\PackPanel.exe"'
  ${EndIf}
  Quit

!ifdef BUILD_ID
  failed:
    MessageBox MB_ICONSTOP "PackPanel could not start. Close the launcher and try reinstalling it." /SD IDOK
    SetErrorLevel 1
!endif
SectionEnd
