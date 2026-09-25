"""Carga datos de demostración: dos fincas ficticias con lotes, capturas y fotos sintéticas.

    python web/manage.py cargar_demo             # crea los datos (si ya existen, no duplica)
    python web/manage.py cargar_demo --reiniciar # borra los de demostración y los vuelve a crear

Todo lo que crea lleva "(demostración)" en el nombre y las fotos son imágenes sintéticas
generadas por `centinela_core.synthetic`: no hay personas, fincas ni fotos reales.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import cv2
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from campo.models import Captura, Cultivo, Finca, Foto, Lote, Productor
from campo.servicios import analizar_foto
from centinela_core.synthetic import make_orchard, make_plantain

MARCA = "(demostración)"

CULTIVOS = [
    ("Plátano", "Musa × paradisiaca", Cultivo.ESTRELLA),
    ("Palma de aceite", "Elaeis guineensis", Cultivo.ESTRELLA),
    ("Cítricos", "Citrus spp.", Cultivo.COPA),
    ("Cacao", "Theobroma cacao", Cultivo.COPA),
]


def _png(rgb) -> ContentFile:
    _ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    return ContentFile(buf.tobytes())


def _fecha(texto: str) -> datetime:
    return timezone.make_aware(datetime.fromisoformat(texto))


class Command(BaseCommand):
    help = "Carga fincas, lotes, capturas y fotos sintéticas de demostración, y las analiza."

    def add_arguments(self, parser):
        parser.add_argument("--reiniciar", action="store_true", help="borra los datos de demostración antes")

    def handle(self, *args, reiniciar=False, **opts):
        cultivos = {}
        for nombre, cientifico, forma in CULTIVOS:
            cultivos[nombre], _ = Cultivo.objects.get_or_create(
                nombre=nombre, defaults={"nombre_cientifico": cientifico, "forma_conteo": forma}
            )

        demo = Productor.objects.filter(nombre__endswith=MARCA)
        if reiniciar:
            for p in demo:
                Finca.objects.filter(productor=p).delete()
            demo.delete()
        elif demo.exists():
            self.stdout.write("Los datos de demostración ya existen. Usa --reiniciar para recrearlos.")
            return

        p1 = Productor.objects.create(nombre=f"Productora A {MARCA}", autoriza_datos=True)
        p2 = Productor.objects.create(nombre=f"Productor B {MARCA}", autoriza_datos=True)

        f1 = Finca.objects.create(
            productor=p1, nombre=f"Finca El Ejemplo {MARCA}", vereda="Vereda de prueba", area_ha=Decimal("12.0")
        )
        f2 = Finca.objects.create(
            productor=p2, nombre=f"Finca La Muestra {MARCA}", vereda="Vereda de prueba", area_ha=Decimal("8.5")
        )

        platanal = Lote.objects.create(
            finca=f1, nombre="Lote 1", cultivo=cultivos["Plátano"], variedad="Hartón",
            area_ha=Decimal("2.5"), distancia_plantas_m=Decimal(4), distancia_surcos_m=Decimal(4),
        )
        citricos = Lote.objects.create(
            finca=f2, nombre="Lote A", cultivo=cultivos["Cítricos"], variedad="Naranja Valencia",
            area_ha=Decimal("3.0"), distancia_plantas_m=Decimal(5), distancia_surcos_m=Decimal(5),
        )

        # (lote, fecha, gsd cm/px, generador, nombre de archivo)
        capturas = [
            (platanal, "2026-08-15T10:30", "5", lambda: make_plantain(seed=0)[0], "platanal_1.png"),
            (platanal, "2026-09-15T11:00", "5", lambda: make_plantain(seed=3, n_rows=8)[0], "platanal_2.png"),
            (citricos, "2026-09-10T10:00", "8", lambda: make_orchard(seed=0, n_anomalous=4)[0], "citricos_1.png"),
        ]
        for lote, fecha, gsd, generar, archivo in capturas:
            captura = Captura.objects.create(
                lote=lote, fecha=_fecha(fecha), dispositivo="Imagen sintética", gsd_cm_px=Decimal(gsd),
                condiciones="soleado",
                notas="Imagen generada por computador para demostración; no corresponde a un vuelo real.",
            )
            foto = Foto(captura=captura)
            foto.imagen.save(archivo, _png(generar()), save=True)
            a = analizar_foto(foto)
            resultado = (
                f"{a.conteo_min}–{a.conteo_max} (rango)" if a.confianza == "rango" else f"{a.conteo} ({a.confianza})"
            )
            self.stdout.write(f"  {captura}: {resultado}")

        self.stdout.write(self.style.SUCCESS("Datos de demostración cargados."))
