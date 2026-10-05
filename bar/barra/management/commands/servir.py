"""Deja el bar andando: prepara la base y sirve el sitio a toda la red local.

    python manage.py servir [--puerto 8000]

Es lo que ejecutan `iniciar.bat` / `iniciar.sh`. Usa waitress (un servidor real, no el de
desarrollo de Django) y escribe en pantalla la dirección que se abre desde los celulares.
"""

import socket
import sys

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand


def _ip_local() -> str:
    """IP de esta PC en el WiFi. No envía nada: solo pregunta por qué interfaz saldría."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Command(BaseCommand):
    help = "Prepara la base de datos y sirve el bar en la red local."

    def add_arguments(self, parser):
        parser.add_argument("--puerto", type=int, default=8000)

    def handle(self, *args, **opciones):
        from bar_web.wsgi import application
        from waitress import serve

        call_command("migrate", verbosity=0)
        if not get_user_model().objects.filter(is_superuser=True).exists() and sys.stdin.isatty():
            self.stdout.write(
                "\nPrimera vez: crea el usuario del dueño (sirve para entrar a «administración»,\n"
                "donde se editan productos, precios, mesas y clientes). El personal no lo necesita.\n"
            )
            call_command("createsuperuser")

        puerto = opciones["puerto"]
        self.stdout.write(
            self.style.SUCCESS(
                "\nBar en marcha. Ábrelo así:\n"
                f"  en esta PC:   http://localhost:{puerto}\n"
                f"  en celulares: http://{_ip_local()}:{puerto}   (mismo WiFi que esta PC)\n"
                "Ctrl+C para cerrar.\n"
            )
        )
        serve(application, host="0.0.0.0", port=puerto, threads=6)
