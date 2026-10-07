@echo off
rem Builds the Windows 11 context menu package into assets\shellext (needs Visual Studio's C++ tools).
setlocal
cd /d "%~dp0"
set OUT=..\..\assets\shellext
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
rem %%VSWHERE%% expands when the command runs: the parentheses in the path would break the for.
for /f "usebackq delims=" %%i in (`call "%%VSWHERE%%" -latest -property installationPath`) do set "VS=%%i"
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || (echo Visual Studio C++ tools not found & exit /b 1)
if not exist %OUT%\Assets mkdir %OUT%\Assets

cl /nologo /LD /EHsc /std:c++17 /O2 /W3 DevXplorerShellExt.cpp /link /DEF:DevXplorerShellExt.def /OUT:%OUT%\DevXplorerShellExt.dll shlwapi.lib ole32.lib advapi32.lib || exit /b 1
cl /nologo /O2 /W3 Host.cpp /link /SUBSYSTEM:WINDOWS /OUT:%OUT%\DevXplorerMenuHost.exe || exit /b 1
copy /y AppxManifest.xml %OUT%\ >nul
del /q *.obj *.exp *.lib %OUT%\*.exp %OUT%\*.lib 2>nul
echo BUILD OK
