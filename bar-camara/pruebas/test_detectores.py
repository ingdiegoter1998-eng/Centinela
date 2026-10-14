"""Pruebas de la detección con señales y video sintéticos (sin cámara, sin OpenCV).

    cd bar-camara && python -m unittest discover -s pruebas     (o: python -m pytest pruebas)
"""
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from detectores import (BOGOTA, DetectorSacadas, Horario, MuestreoAforo, Movimiento, Vigia,  # noqa: E402
                        VigilanteBarra, mascara_poligono, punto_en)

T0 = datetime(2026, 10, 14, 20, 0, tzinfo=BOGOTA)
GRIFO = [(0.40, 0.20), (0.60, 0.20), (0.60, 0.50), (0.40, 0.50)]


def t(seg):
    return T0 + timedelta(seconds=seg)


def correr(detector, señal, fps=5):
    """señal: lista de (segundos, fracción) por tramos; devuelve los eventos."""
    eventos, seg = [], 0.0
    for dur, frac in señal:
        for _ in range(int(dur * fps)):
            ev = detector.actualizar(t(seg), frac)
            if ev:
                eventos.append(ev)
            seg += 1 / fps
    return eventos


class Zonas(unittest.TestCase):
    def test_mascara_del_cuadrado_central(self):
        m = mascara_poligono(100, 200, [(0.25, 0.25), (0.75, 0.25), (0.75, 0.75), (0.25, 0.75)])
        self.assertAlmostEqual(m.mean(), 0.25, places=2)
        self.assertTrue(m[50, 100])
        self.assertFalse(m[5, 5])

    def test_triangulo_y_punto(self):
        tri = [(0, 0), (1, 0), (0, 1)]
        self.assertAlmostEqual(mascara_poligono(200, 200, tri).mean(), 0.5, places=1)
        self.assertTrue(punto_en((0.2, 0.2), tri))
        self.assertFalse(punto_en((0.8, 0.8), tri))


class Sacadas(unittest.TestCase):
    def test_alguien_que_pasa_no_cuenta(self):
        self.assertEqual(correr(DetectorSacadas(), [(5, 0), (0.6, 0.3), (5, 0)]), [])
        self.assertEqual(correr(DetectorSacadas(), [(5, 0), (2, 0.3), (5, 0)]), [], 'arranca pero dura < 3 s')

    def test_una_sacada_con_pausas_cortas(self):
        evs = correr(DetectorSacadas(), [(5, 0), (3, 0.3), (1, 0.01), (3, 0.3), (5, 0)])
        self.assertEqual(len(evs), 1)
        self.assertAlmostEqual((evs[0].fin - evs[0].inicio).total_seconds(), 6.8, delta=0.3)
        self.assertEqual(evs[0].inicio, t(5))

    def test_dos_sacadas_separadas(self):
        evs = correr(DetectorSacadas(), [(5, 0), (6, 0.3), (5, 0), (8, 0.3), (5, 0)])
        self.assertEqual(len(evs), 2)
        self.assertNotEqual(evs[0].origen, evs[1].origen)

    def test_actividad_continua_se_marca_una_vez(self):
        evs = correr(DetectorSacadas(), [(2, 0), (150, 0.3), (5, 0), (6, 0.3), (5, 0)])
        self.assertEqual(len(evs), 2, 'una larga marcada y, ya quieto, una normal')
        self.assertIn('revisar', evs[0].nota)
        self.assertEqual(evs[1].nota, '')

    def test_foto_al_arrancar(self):
        d = DetectorSacadas()
        marcas = []
        for i in range(40):
            d.actualizar(t(i / 5), 0.3 if i >= 5 else 0)
            marcas.append(d.recien_empezo)
        self.assertEqual(sum(marcas), 1)


class OtrosDetectores(unittest.TestCase):
    def test_aforo_maximo_por_ventana(self):
        a, evs = MuestreoAforo(ventana=300), []
        for i, n in enumerate([3, 8, 5, 2, 12, 4, 1]):        # una muestra cada 100 s
            ev = a.actualizar(t(i * 100), n)
            if ev:
                evs.append(ev)
        self.assertEqual([e.personas for e in evs], [8, 12])

    def test_barra_sola(self):
        b, evs = VigilanteBarra(minutos=10), []
        for m in range(30):                                     # una muestra por minuto
            personas = 0 if 5 <= m < 20 else 1
            ev = b.actualizar(t(m * 60), personas, abierto=True)
            if ev:
                evs.append(ev)
        self.assertEqual(len(evs), 1)
        self.assertEqual((evs[0].fin - evs[0].inicio).total_seconds(), 15 * 60)
        self.assertIsNone(VigilanteBarra(10).actualizar(t(0), 0, abierto=False))

    def test_horario_que_cruza_medianoche(self):
        h = Horario('16:00', '03:00')
        self.assertTrue(h.abierto(T0.replace(hour=23)))
        self.assertTrue(h.abierto(T0.replace(hour=1)))
        self.assertFalse(h.abierto(T0.replace(hour=10)))
        self.assertTrue(Horario('08:00', '18:00').abierto(T0.replace(hour=12)))


def video_sintetico(segundos, sacadas, fps=5, alto=180, ancho=320, semilla=1):
    """Cuadros BGR con ruido de cámara; durante cada (inicio, fin) una «mano» se mueve sobre el grifo.
    También pasa gente fuera de la zona todo el tiempo, que no debe contar."""
    rng = np.random.default_rng(semilla)
    fondo = rng.integers(40, 90, (alto, ancho, 3)).astype(np.int16)
    for i in range(int(segundos * fps)):
        s = i / fps
        img = fondo + rng.integers(-6, 7, fondo.shape)              # ruido de sensor
        x = int((s * 40) % ancho)                                   # alguien caminando abajo
        img[140:175, max(0, x - 15):x + 15] = 200
        if any(a <= s < b for a, b in sacadas):
            dx = int(10 * np.sin(s * 6))                            # la mano sube y baja la manija
            img[50:80, 140 + dx:175 + dx] = 220
            img[80:88, 140:180] = 120 + int(60 * ((s * 3) % 1))     # espuma que sube en el vaso
        yield t(s), np.clip(img, 0, 255).astype(np.uint8)


class VideoSintetico(unittest.TestCase):
    def test_cuenta_las_sacadas_y_no_la_gente_que_pasa(self):
        v = Vigia({'grifo': GRIFO})
        sacadas = [e for ti, c in video_sintetico(90, [(10, 17), (35, 41), (60, 70)]) for e in v.paso(ti, c)
                   if e.tipo == 'sacada']
        self.assertEqual(len(sacadas), 3)
        for e, (a, b) in zip(sacadas, [(10, 17), (35, 41), (60, 70)]):
            self.assertAlmostEqual((e.inicio - T0).total_seconds(), a, delta=1)
            self.assertAlmostEqual((e.fin - T0).total_seconds(), b, delta=1)

    def test_quieto_no_cuenta_nada(self):
        v = Vigia({'grifo': GRIFO})
        self.assertFalse([e for ti, c in video_sintetico(60, []) for e in v.paso(ti, c) if e.tipo == 'sacada'])

    def test_vaso_olvidado_no_es_sacada(self):
        v = Vigia({'grifo': GRIFO})
        base = np.full((180, 320, 3), 60, np.uint8)
        con_vaso = base.copy()
        con_vaso[60:90, 150:170] = 200                               # aparece de golpe y se queda
        evs = [e for i in range(5 * 120) for e in v.paso(t(i / 5), base if i < 50 else con_vaso) if e.tipo == 'sacada']
        self.assertEqual(evs, [])

    def test_cambio_de_luz_no_es_sacada(self):
        m = Movimiento(GRIFO)
        base = np.full((180, 320, 3), 60, np.uint8)
        m(base)
        fracs = [m(np.clip(base.astype(int) + min(i, 20), 0, 255).astype(np.uint8)) for i in range(50)]
        self.assertLess(max(fracs), 0.08, 'una luz que sube despacio la absorbe el fondo')

    def test_fuera_de_horario_y_latido_y_personas(self):
        v = Vigia({'grifo': GRIFO, 'salon': [(0, 0.6), (1, 0.6), (1, 1), (0, 1)], 'barra': [(0, 0), (1, 0), (1, 0.3), (0, 0.3)]},
                  {'horario': {'abre': '21:00', 'cierra': '03:00'}, 'aforo': {'ventana_seg': 30}})
        eventos = []
        for i, (ti, c) in enumerate(video_sintetico(40, [(10, 17)])):
            centros = [(0.5, 0.8), (0.2, 0.9), (0.5, 0.1)] if i % 25 == 0 else None   # 2 en el salón, 1 en la barra
            eventos += v.paso(ti, c, centros)
        tipos = [e.tipo for e in eventos]
        self.assertEqual(tipos.count('latido'), 1)
        sacada = next(e for e in eventos if e.tipo == 'sacada')
        self.assertIn('fuera de horario', sacada.nota, 'a las 20:00 el bar abre a las 21:00')
        aforo = next(e for e in eventos if e.tipo == 'aforo')
        self.assertEqual(aforo.personas, 2)
        j = sacada.a_json()
        self.assertEqual(j['tipo'], 'sacada')
        self.assertTrue(j['inicio'].endswith('-05:00'))


if __name__ == '__main__':
    unittest.main()
