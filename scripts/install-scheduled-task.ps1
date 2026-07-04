# Instala una tarea programada de Windows que ejecuta run-sync.bat
# al iniciar sesión y también diariamente a las 10:00 (por si la sesión
# estaba abierta antes del inicio).
#
# Uso (PowerShell, puede ser normal o administrador):
#   cd "D:\Visual Studio Projects\ELO Sierra Norte\scripts"
#   .\install-scheduled-task.ps1
#
# Para desinstalar:
#   Unregister-ScheduledTask -TaskName "ELO Sierra Norte - Sync FIDE" -Confirm:$false

$ErrorActionPreference = "Stop"

$taskName = "ELO Sierra Norte - Sync FIDE"
$batPath  = Join-Path $PSScriptRoot "run-sync.bat"

if (-not (Test-Path -LiteralPath $batPath)) {
    Write-Error "No se encuentra $batPath"
    exit 1
}

# Eliminar tarea previa si existe (usando cmdlet nativo, no schtasks.exe)
$existing = $null
try { $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch { }
if ($existing) {
    Write-Host "Tarea existente encontrada. Eliminando..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$description = "Sincroniza ELOs desde FIDE a Firestore (descarga ZIP oficial). Solo actua si hay nuevo mes."

$action       = New-ScheduledTaskAction -Execute $batPath
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerDaily = New-ScheduledTaskTrigger -Daily -At 10:00am
$settings     = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
    -TaskName $taskName `
    -Description $description `
    -Action $action `
    -Trigger @($triggerLogon, $triggerDaily) `
    -Settings $settings `
    -RunLevel Limited | Out-Null

Write-Host "Tarea '$taskName' instalada correctamente." -ForegroundColor Green
Write-Host "Se ejecutara:"
Write-Host "  - Al iniciar sesion"
Write-Host "  - Diariamente a las 10:00 (si el PC esta encendido)"
Write-Host ""
Write-Host "Para probar ahora manualmente:"
Write-Host "  cd `"$PSScriptRoot`""
Write-Host "  .\run-sync.bat"
Write-Host ""
Write-Host "Para desinstalar:"
Write-Host "  Unregister-ScheduledTask -TaskName `"$taskName`" -Confirm:`$false"