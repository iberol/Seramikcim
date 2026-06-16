@echo off
set SCRIPT_DIR=%~dp0
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%convert_dwg_to_png.ps1" -InputDir "%SCRIPT_DIR%" -OutputDir "%SCRIPT_DIR%png_out" -Width 2400 -Height 1600 -Bg White
pause
