"""Copia segura de la base de datos (se puede ejecutar con el bar abierto).

    python manage.py respaldar

Deja `respaldos/bar-AAAA-MM-DD-HHMM.sqlite3`. Para volver atrás: cierra el bar y copia ese archivo
encima de `db.sqlite3`.
"""

import sqlite3
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Guarda una copia de la base de datos en la carpeta respaldos/."

    def handle(self, *args, **opciones):
        destino = settings.BASE_DIR / "respaldos"
        destino.mkdir(exist_ok=True)
        archivo = destino / f"bar-{datetime.now():%Y-%m-%d-%H%M}.sqlite3"
        origen = sqlite3.connect(settings.DATABASES["default"]["NAME"])
        copia = sqlite3.connect(archivo)
        try:
            origen.backup(copia)  # consistente aunque otro celular esté escribiendo
        finally:
            copia.close()
            origen.close()
        self.stdout.write(self.style.SUCCESS(f"Respaldo guardado en {archivo}"))
