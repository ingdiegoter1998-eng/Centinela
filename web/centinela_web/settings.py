"""Configuración del sitio web de Centinela (registro de fincas, lotes, fotos y análisis).

Desarrollo local por defecto. En producción: CENTINELA_SECRET_KEY, CENTINELA_DEBUG=0 y
CENTINELA_HOSTS (separados por comas) como variables de entorno.
"""

import os
import sys
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# centinela_core vive en la raíz del repo, un nivel arriba de web/.
sys.path.insert(0, str(BASE_DIR.parent))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    "CENTINELA_SECRET_KEY", "solo-para-desarrollo-local-no-usar-en-produccion"
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get("CENTINELA_DEBUG", "1") == "1"

if not DEBUG and SECRET_KEY.startswith("solo-para-desarrollo"):
    raise RuntimeError("En producción hace falta CENTINELA_SECRET_KEY (web/publicar.ps1 la genera).")

ALLOWED_HOSTS = [h for h in os.environ.get("CENTINELA_HOSTS", "localhost,127.0.0.1").split(",") if h]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'campo',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'centinela_web.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'centinela_web.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.1/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = 'es-co'

TIME_ZONE = 'America/Bogota'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'  # collectstatic; lo sirve WhiteNoise

# Fotos subidas. No van al repositorio (.gitignore).
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGIN_URL = 'admin:login'

# Publicación por túnel HTTPS (Tailscale Funnel): el túnel termina el TLS y reenvía en HTTP.
CSRF_TRUSTED_ORIGINS = [o for o in os.environ.get("CENTINELA_CSRF", "").split(",") if o]
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = 3600
    # Funnel solo acepta HTTPS desde afuera y reenvía a Django en HTTP: redirigir aquí a
    # HTTPS no aporta y, sin X-Forwarded-Proto, entraría en un ciclo.
    # W005/W021: HSTS para subdominios y precarga no aplican: ts.net es dominio de Tailscale.
    SILENCED_SYSTEM_CHECKS = ["security.W008", "security.W005", "security.W021"]

