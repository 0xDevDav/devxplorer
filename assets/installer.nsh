; Removes the "Open in DevXplorer" entries the app may have added to the File Explorer menu when
; it is uninstalled. An update also runs the old uninstaller, so the entries are kept in that case.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\Directory\shell\DevXplorer"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\DevXplorer"
    DeleteRegKey HKCU "Software\Classes\Drive\shell\DevXplorer"
  ${endIf}
!macroend
