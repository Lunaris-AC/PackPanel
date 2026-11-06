Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "PackPanel"
OutFile "PackPanelStart.exe"

!include "LogicLib.nsh"

Section
  System::Call 'kernel32::CreateMutex(p 0, i 0, t "Local\PackPanel-Setup-${PACK_ID}") p .r0 ?e'
  Pop $1
  ${If} $0 == 0
  ${OrIf} $1 == 183
    Quit
  ${EndIf}

  ${If} ${FileExists} "$EXEDIR\upgrade.pending"
  ${AndIf} ${FileExists} "$EXEDIR\previous\PackPanel.exe"
    ${If} ${FileExists} "$EXEDIR\app\PackPanel.exe"
      ClearErrors
      FileOpen $0 "$EXEDIR\app\PackPanel.exe" a
      IfErrors start
      FileClose $0
    ${EndIf}
    RMDir /r "$EXEDIR\app"
    ClearErrors
    Rename "$EXEDIR\previous" "$EXEDIR\app"
    IfErrors start
    Delete "$EXEDIR\upgrade.pending"
  ${EndIf}
  start:
  ${If} ${FileExists} "$EXEDIR\app\PackPanel.exe"
  ${AndIfNot} ${FileExists} "$EXEDIR\previous\PackPanel.exe"
    Delete "$EXEDIR\upgrade.pending"
  ${EndIf}
  ${If} ${FileExists} "$EXEDIR\app\PackPanel.exe"
    SetOutPath "$EXEDIR\app"
    Exec '"$EXEDIR\app\PackPanel.exe"'
  ${ElseIf} ${FileExists} "$EXEDIR\previous\PackPanel.exe"
    SetOutPath "$EXEDIR\previous"
    Exec '"$EXEDIR\previous\PackPanel.exe"'
  ${EndIf}
SectionEnd
