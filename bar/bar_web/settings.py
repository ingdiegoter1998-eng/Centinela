"""Configuración del control del bar: inventario y ventas en tiempo real.

Pensado para correr gratis en una PC del bar (`manage.py servir`): los celulares del personal
entran por el WiFi a http://<IP-de-la-PC>:8000. Todo vive en un solo archivo, `db.sqlite3`.

Variables de entorno opcionales: BAR_SECRET_KEY, BAR_DEBUG=1, BAR_HORA_CORTE (ver abajo).
"""

import os
from pathlib import Path

from django.core.management.utils import get_random_secret_key

BASE_DIR = Path(__file__).resolve().parent.parent


def _clave_secreta() -> str:
    """Clave de sesión: de la variable de entorno, o una al azar guardada junto a la base."""
    clave = os.environ.get("BAR_SECRET_KEY")
    if clave:
        return clave
    archivo = BASE_DIR / ".secret_key"
    if not archivo.exists():
        archivo.write_text(get_random_secret_key())
    return archivo.read_text().strip()


SECRET_KEY = _clave_secreta()
DEBUG = os.environ.get("BAR_DEBUG", "0") == "1"

# Red local del bar: los celulares entran por la IP de la PC, que no se conoce de antemano.
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "barra",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "bar_web.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "bar_web.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        # Varios celulares escriben a la vez: IMMEDIATE toma el candado de escritura al abrir
        # la transacción (en vez de fallar con «database is locked» a mitad de una venta).
        "OPTIONS": {"transaction_mode": "IMMEDIATE", "timeout": 20},
    }
}

LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# Sin `collectstatic`: WhiteNoise busca los estáticos directo en las apps (también el admin).
WHITENOISE_USE_FINDERS = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "admin:login"

# Un bar abre de noche y cierra pasada la medianoche: la «jornada» del lunes va desde las 6:00
# del lunes hasta las 6:00 del martes. Los reportes del día usan esta hora de corte.
HORA_CORTE_JORNADA = int(os.environ.get("BAR_HORA_CORTE", "6"))
