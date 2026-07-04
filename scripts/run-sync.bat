@echo off
REM Ejecuta la sincronización mensual de ELOs desde FIDE -> Firestore.
REM Diseñado para ser llamado por el Programador de Tareas de Windows al iniciar sesion.
REM Si ya se actualizó este mes, no hace nada (sale en ~2s).

cd /d "%~dp0"

REM Log con timestamp en carpeta logs/
if not exist "logs" mkdir logs
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value 2^>nul') do set "dt=%%a"
set "logfile=logs\sync-%dt:~0,8%.log"

echo ==== Sincronizacion ELO %date% %time% ==== >> "%logfile%"
node syncFideElos.js >> "%logfile%" 2>&1
echo Exit code: %errorlevel% >> "%logfile%"
exit /b 0