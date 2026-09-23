@echo off
title IMG CRM server - keep this window open (Ctrl+C to stop)
rem O: is a mapped network drive and may not exist for a scheduled task, so use the full network path.
pushd "\\194.166.65.176\Employees\___Shared\To Hamzeh Jaber\project-portal\jordan-crm" || (echo Cannot reach the shared folder & pause & exit /b 1)
:loop
echo [%date% %time%] starting IMG CRM on http://localhost:4000
node --no-warnings=ExperimentalWarning server.js
echo [%date% %time%] server stopped - restarting in 5 seconds (close this window to stop for good)
timeout /t 5 /nobreak >nul
goto loop