"""Pruebas del registro de campo: modelo, análisis de una foto y páginas de consulta.

    python web/manage.py test campo
"""

from __future__ import annotations

import shutil
import tempfile
from datetime import UTC, datetime
from decimal import Decimal

import cv2
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.urls import reverse

from centinela_core.synthetic import make_plantain

from .models import Analisis, Captura, Cultivo, Finca, Foto, Lote, Medicion, Productor
from .servicios import analizar_foto

MEDIA = tempfile.mkdtemp(prefix="centinela_test_media_")


@override_settings(MEDIA_ROOT=MEDIA)
class RegistroDeCampo(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.platano = Cultivo.objects.create(nombre="Plátano", forma_conteo=Cultivo.ESTRELLA)
        self.productor = Productor.objects.create(nombre="Productor de prueba")
        self.finca = Finca.objects.create(productor=self.productor, nombre="Finca de prueba")
        self.lote = Lote.objects.create(
            finca=self.finca, nombre="L1", cultivo=self.platano, area_ha=Decimal(2),
            distancia_plantas_m=Decimal(4), distancia_surcos_m=Decimal(4),
        )
        self.captura = Captura.objects.create(
            lote=self.lote, fecha=datetime(2026, 9, 1, 10, tzinfo=UTC), gsd_cm_px=Decimal(5)
        )

    def _foto(self, rgb) -> Foto:
        _ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        foto = Foto(captura=self.captura)
        foto.imagen.save("prueba.png", ContentFile(buf.tobytes()), save=True)
        return foto

    def test_densidad_teorica_del_marco_de_siembra(self):
        self.assertAlmostEqual(self.lote.densidad_teorica, 625.0)

    def test_analizar_foto_guarda_plantas_y_mediciones(self):
        rgb, gt = make_plantain(seed=0)
        foto = self._foto(rgb)
        self.assertEqual((foto.ancho_px, foto.alto_px), (rgb.shape[1], rgb.shape[0]))

        a = analizar_foto(foto)
        self.assertEqual(a.estado, Analisis.COMPLETO)
        self.assertEqual(a.forma, Cultivo.ESTRELLA)  # la toma del cultivo del lote
        self.assertLessEqual(abs(a.conteo - len(gt)), 0.1 * len(gt))
        self.assertEqual(a.plantas.count(), a.conteo)
        self.assertTrue(Medicion.objects.filter(planta__analisis=a, variable__codigo="vigor_vari").exists())
        # 80 px entre plantas × 5 cm/px = 4 m, igual al marco de siembra: ~625 plantas/ha
        self.assertAlmostEqual(a.densidad_ha, 625, delta=150)

    def test_un_error_del_metodo_queda_registrado(self):
        foto = self._foto(make_plantain(seed=0)[0])
        foto.imagen.storage.delete(foto.imagen.name)  # el archivo desaparece
        a = analizar_foto(foto)
        self.assertEqual(a.estado, Analisis.ERROR)
        self.assertTrue(a.mensaje)

    def test_las_paginas_piden_sesion_y_luego_responden(self):
        self.assertEqual(self.client.get(reverse("tablero")).status_code, 302)
        usuario = get_user_model().objects.create_user("revisor", password="clave-de-prueba-123")
        self.client.force_login(usuario)
        analizar_foto(self._foto(make_plantain(seed=0)[0]))
        r = self.client.get(reverse("tablero"))
        self.assertContains(r, "Finca de prueba")
        r = self.client.get(reverse("lote", args=[self.lote.pk]))
        self.assertContains(r, "Historial de capturas")
        self.assertContains(r, "Consistente")
