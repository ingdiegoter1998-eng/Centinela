# Publica el registro de campo en internet desde este PC, con Tailscale Funnel.
#
#   Doble clic en web\publicar_web.bat   (o: powershell -ExecutionPolicy Bypass -File web\publicar.ps1)
#
# Levanta Django en modo producción (waitress, sin DEBUG) en 127.0.0.1:8000 y abre el túnel
# HTTPS https://<este-pc>.<tu-red>.ts.net. Solo funciona mientras este PC esté encendido y la
# ventana abierta. Ctrl+C cierra el servidor y apaga el túnel.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$python = Join-Path $raiz ".venv\Scripts\python.exe"
$tailscale = "C:\Program Files\Tailscale\tailscale.exe"
$puerto = 8000

if (-not (Test-Path $python)) { throw "No encuentro .venv. Ver docs\modelo-datos.md" }
if (-not (Test-Path $tailscale)) { throw "No encuentro Tailscale en $tailscale" }

$estado = & $tailscale status --json | ConvertFrom-Json
$dominio = $estado.Self.DNSName.TrimEnd(".")
if (-not $dominio) { throw "Tailscale no tiene sesión iniciada en este PC." }

# Clave secreta: se genera una vez y queda solo en este PC (web\.clave_secreta, fuera de git).
$archivoClave = Join-Path $raiz "web\.clave_secreta"
if (-not (Test-Path $archivoClave)) {
    & $python -c "import secrets; print(secrets.token_urlsafe(50))" | Out-File -Encoding ascii -NoNewline $archivoClave
}

$env:CENTINELA_SECRET_KEY = (Get-Content $archivoClave -Raw).Trim()
$env:CENTINELA_DEBUG = "0"
$env:CENTINELA_HOSTS = "$dominio,localhost,127.0.0.1"
$env:CENTINELA_CSRF = "https://$dominio"

& $python web\manage.py migrate -v 0
& $python web\manage.py collectstatic --noinput -v 0
if ($LASTEXITCODE -ne 0) { throw "Falló la preparación de Django." }

Write-Host ""
Write-Host "Abriendo el túnel..." -ForegroundColor Green
& $tailscale funnel --bg $puerto
if ($LASTEXITCODE -ne 0) {
    Write-Host "Si arriba aparece un enlace de login.tailscale.com, ábrelo para habilitar Funnel en tu red y vuelve a correr este script." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Registro de campo en línea:  https://$dominio/" -ForegroundColor Green
Write-Host "Ctrl+C para cerrar el servidor y apagar el túnel."
Write-Host ""

try {
    Push-Location (Join-Path $raiz "web")
    & $python -m waitress --listen="127.0.0.1:$puerto" --threads=4 centinela_web.wsgi:application
}
finally {
    Pop-Location
    & $tailscale funnel reset | Out-Null
    Write-Host "Túnel apagado." -ForegroundColor Yellow
}
