; Removes the "Open in DevXplorer" entries the app may have added to the File Explorer menu when
; it is uninstalled, and gives folders and Win+E back to File Explorer if DevXplorer was the
; default, and removes the Windows 11 menu package. An update also runs the old uninstaller, so
; everything is kept in that case.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "Software\Classes\Directory\shell" ""
    ${if} $0 == "DevXplorer"
      DeleteRegValue HKCU "Software\Classes\Directory\shell" ""
      DeleteRegValue HKCU "Software\Classes\Drive\shell" ""
      DeleteRegKey HKCU "Software\Classes\CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}"
    ${endIf}
    DeleteRegKey HKCU "Software\Classes\Directory\shell\DevXplorer"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\DevXplorer"
    DeleteRegKey HKCU "Software\Classes\Drive\shell\DevXplorer"
    nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -Command "Get-AppxPackage -Name 0xDevDav.DevXplorer.ContextMenu | Remove-AppxPackage"'
  ${endIf}
!macroend
