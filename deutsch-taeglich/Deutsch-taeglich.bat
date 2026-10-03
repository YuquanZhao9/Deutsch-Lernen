@echo off
rem Deutsch taeglich - opens the German learning page in its own window (Microsoft Edge app mode).
rem First run also puts a 'Deutsch taeglich' shortcut on the desktop; that shortcut can be pinned to the taskbar.

if not exist "%USERPROFILE%\Desktop\Deutsch taeglich.lnk" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $e=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop).'(default)'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Deutsch taeglich.lnk'); $s.TargetPath=$e; $s.Arguments='--app=https://claude.ai/artifact/Q59g6KiDtPyirydA3PfDTo --window-size=1400,900'; $s.IconLocation=$e+',0'; $s.Description='Deutsch taeglich'; $s.Save() } catch { }"
)

start "" msedge --app=https://claude.ai/artifact/Q59g6KiDtPyirydA3PfDTo --window-size=1400,900
if errorlevel 1 start "" https://claude.ai/artifact/Q59g6KiDtPyirydA3PfDTo
