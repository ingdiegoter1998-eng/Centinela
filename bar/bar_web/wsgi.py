"""WSGI del control del bar (lo usa `manage.py servir` a través de waitress)."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bar_web.settings")
application = get_wsgi_application()
