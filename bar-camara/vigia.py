"""Mira la cámara del bar y manda a Supabase solo eventos (sacadas, aforo, barra sola), nunca video.

    python vigia.py                    cámara en vivo (datos en .env, zonas en zonas.yaml)
    python vigia.py --ver              igual, con una ventana que muestra las zonas y el movimiento (para calibrar)
    python vigia.py --video prueba.mp4 sobre un video grabado, para probar sin estar en el bar
    python vigia.py --sin-envio        no manda nada a Supabase (los eventos salen en pantalla)

La foto de cada sacada queda en capturas/<fecha>/ con la hora de la sacada en el nombre, solo en este
computador, y se borra sola a los `fotos_dias` días (camara.yaml).
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import yaml

from detectores import BOGOTA, Vigia
import envio
import personas as mod_personas

AQUI = Path(__file__).resolve().parent


def avisar(texto: str):
    print(f'[{datetime.now(BOGOTA):%H:%M:%S}] {texto}', flush=True)


def cargar_env(ruta: Path) -> dict:
    """Lee un .env sencillo (CLAVE=valor). Lo que ya esté en el entorno manda."""
    datos = {}
    if ruta.exists():
        for linea in ruta.read_text(encoding='utf-8').splitlines():
            linea = linea.strip()
            if linea and not linea.startswith('#') and '=' in linea:
                k, v = linea.split('=', 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    datos.update({k: v for k, v in os.environ.items() if k.startswith(('CAMARA_', 'BAR_CAMARA_'))})
    return datos


def cargar_zonas(ruta: Path) -> dict:
    if not ruta.exists():
        sys.exit(f'Falta {ruta.name}: primero corre «python calibrar.py» y dibuja las zonas.')
    zonas = yaml.safe_load(ruta.read_text(encoding='utf-8')) or {}
    return {k: [tuple(p) for p in v] for k, v in zonas.items() if v and len(v) >= 3}


def url_camara(env: dict, flujo: str) -> str:
    falta = [k for k in ('CAMARA_IP', 'CAMARA_USUARIO', 'CAMARA_CLAVE') if not env.get(k)]
    if falta:
        sys.exit(f'Faltan datos de la cámara en .env: {", ".join(falta)} (copia .env.ejemplo a .env).')
    return f"rtsp://{env['CAMARA_USUARIO']}:{env['CAMARA_CLAVE']}@{env['CAMARA_IP']}:554/{flujo}"


class CamaraEnVivo(threading.Thread):
    """Lee la cámara en un hilo y guarda solo el último cuadro: si el análisis va más lento que la cámara,
    se salta cuadros en vez de atrasarse. Si la cámara se cae (WiFi), reintenta sola."""

    def __init__(self, url: str):
        super().__init__(daemon=True)
        self.url = url
        self.cuadro, self.n = None, 0
        self._candado = threading.Lock()
        self.parar = threading.Event()

    def run(self):
        import cv2
        os.environ.setdefault('OPENCV_FFMPEG_CAPTURE_OPTIONS', 'rtsp_transport;tcp')
        while not self.parar.is_set():
            cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                avisar('No pude abrir la cámara. ¿Está prendida y en la misma red? Reintento en 10 s.')
                self.parar.wait(10)
                continue
            avisar('Cámara conectada.')
            while not self.parar.is_set():
                ok, cuadro = cap.read()
                if not ok:
                    avisar('Se perdió la imagen de la cámara. Reconectando…')
                    break
                with self._candado:
                    self.cuadro, self.n = cuadro, self.n + 1
            cap.release()
            self.parar.wait(3)

    def ultimo(self):
        with self._candado:
            return self.n, self.cuadro


def cuadros_en_vivo(url: str, cada_seg: float):
    cam = CamaraEnVivo(url)
    cam.start()
    visto = 0
    while True:
        n, cuadro = cam.ultimo()
        if cuadro is not None and n != visto:
            visto = n
            yield datetime.now(BOGOTA), cuadro
        time.sleep(cada_seg)


def cuadros_de_video(ruta: str, cada_seg: float, inicio: datetime):
    """Recorre un video con su propio reloj (no el del computador): el resultado no depende de la velocidad."""
    import cv2
    cap = cv2.VideoCapture(ruta)
    if not cap.isOpened():
        sys.exit(f'No pude abrir el video {ruta}')
    siguiente = 0.0
    while True:
        ok, cuadro = cap.read()
        if not ok:
            break
        seg = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if seg + 1e-6 >= siguiente:
            siguiente = seg + cada_seg
            yield inicio + timedelta(seconds=seg), cuadro
    cap.release()


class Fotos:
    def __init__(self, carpeta: Path, dias: int):
        self.carpeta, self.dias = carpeta, dias
        self._limpiado = None

    def guardar(self, cuadro, t: datetime) -> Path:
        import cv2
        ruta = self.carpeta / f'{t:%Y-%m-%d}' / f'sacada {t:%H-%M-%S}.jpg'
        ruta.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(ruta), cuadro, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return ruta

    def limpiar(self, hoy):
        """Borra las carpetas de días viejos (una vez por día)."""
        if self._limpiado == hoy or not self.carpeta.exists():
            return
        self._limpiado = hoy
        limite = hoy - timedelta(days=self.dias)
        for d in self.carpeta.iterdir():
            try:
                if d.is_dir() and datetime.strptime(d.name, '%Y-%m-%d').date() < limite:
                    shutil.rmtree(d)
            except ValueError:
                pass


def dibujar(cuadro, zonas, vigia: Vigia, centros):
    import cv2
    import numpy as np
    img = cuadro.copy()
    alto, ancho = img.shape[:2]
    colores = {'grifo': (0, 200, 255), 'barra': (255, 160, 0), 'salon': (120, 220, 120)}
    for nombre, puntos in zonas.items():
        pts = np.array([(int(x * ancho), int(y * alto)) for x, y in puntos], np.int32)
        cv2.polylines(img, [pts], True, colores.get(nombre, (255, 255, 255)), 2)
        cv2.putText(img, nombre, tuple(pts[0]), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colores.get(nombre, (255, 255, 255)), 2)
    for x, y in centros or []:
        cv2.circle(img, (int(x * ancho), int(y * alto)), 6, (0, 0, 255), -1)
    s = vigia.sacadas
    texto = f'movimiento grifo {vigia.ultima_fraccion:.2f} (umbral {s.umbral:.2f})' + ('  SACANDO' if s.en_curso else '')
    cv2.putText(img, texto, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255) if s.en_curso else (255, 255, 255), 2)
    return img


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--video', help='analizar un video grabado en vez de la cámara')
    ap.add_argument('--inicio', help='hora en que empieza el video, AAAA-MM-DDTHH:MM (por defecto hoy a las 20:00)')
    ap.add_argument('--ver', action='store_true', help='mostrar una ventana con las zonas y el movimiento')
    ap.add_argument('--sin-envio', action='store_true', help='no mandar nada a Supabase')
    ap.add_argument('--config', default=str(AQUI / 'camara.yaml'))
    ap.add_argument('--zonas', default=str(AQUI / 'zonas.yaml'))
    a = ap.parse_args(argv)

    ajustes = yaml.safe_load(Path(a.config).read_text(encoding='utf-8')) or {}
    zonas = cargar_zonas(Path(a.zonas))
    vigia = Vigia(zonas, ajustes)
    cada_seg = 1 / ajustes.get('camara', {}).get('cuadros_por_seg', 5)
    fotos = Fotos(AQUI / 'capturas', ajustes.get('fotos_dias', 15))
    p_aj = ajustes.get('personas', {})
    contador = mod_personas.crear(p_aj, avisar) if ('salon' in zonas or 'barra' in zonas) else None
    cada_personas = p_aj.get('cada_seg', 5)

    cola = enviador = None
    if not a.sin_envio:
        env = cargar_env(AQUI / '.env')
        if not env.get('BAR_CAMARA_CLAVE'):
            sys.exit('Falta BAR_CAMARA_CLAVE en .env (la clave del usuario «camara» de Supabase).')
        url, llave = envio.leer_config_js(AQUI.parent / 'bar-nube' / 'config.js')
        cliente = envio.Supabase(url, llave, env.get('BAR_CAMARA_USUARIO', 'camara'), env['BAR_CAMARA_CLAVE'])
        cola = envio.Cola(AQUI / 'pendientes.jsonl')
        enviador = envio.Enviador(cola, cliente, avisar=avisar)
        enviador.start()

    if a.video:
        inicio = (datetime.fromisoformat(a.inicio).replace(tzinfo=BOGOTA) if a.inicio
                  else datetime.now(BOGOTA).replace(hour=20, minute=0, second=0, microsecond=0))
        cuadros = cuadros_de_video(a.video, cada_seg, inicio)
    else:
        flujo = ajustes.get('camara', {}).get('flujo', 'stream2')
        cuadros = cuadros_en_vivo(url_camara(cargar_env(AQUI / '.env'), flujo), cada_seg)

    avisar(f'Mirando: zonas {", ".join(zonas)}. Ctrl+C para salir.')
    foto, ultimo_personas, n_sacadas = None, None, 0
    try:
        for t, cuadro in cuadros:
            centros = None
            if contador and (ultimo_personas is None or (t - ultimo_personas).total_seconds() >= cada_personas):
                ultimo_personas, centros = t, contador.centros(cuadro)
            for ev in vigia.paso(t, cuadro, centros):
                if ev.tipo == 'sacada':
                    n_sacadas += 1
                    if foto is not None:
                        fotos.guardar(foto, ev.inicio)
                    avisar(f'Sacada {n_sacadas}: {ev.inicio:%H:%M:%S} ({(ev.fin - ev.inicio).total_seconds():.0f} s)'
                           + (f' — {ev.nota}' if ev.nota else ''))
                elif ev.tipo != 'latido':
                    avisar(f'{ev.tipo}: {ev.inicio:%H:%M} a {ev.fin:%H:%M}'
                           + (f', {ev.personas} personas' if ev.personas is not None else ''))
                if cola:
                    cola.agregar(ev.a_json())
            if vigia.foto_pendiente:
                foto = cuadro.copy()
            fotos.limpiar(t.date())
            if a.ver:
                import cv2
                cv2.imshow('Vigía del bar (q para salir)', dibujar(cuadro, zonas, vigia, centros))
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
    except KeyboardInterrupt:
        pass
    finally:
        if enviador:
            enviador.parar.set()
            enviador.join(timeout=20)
        avisar(f'Listo: {n_sacadas} sacadas en esta sesión.')
    return n_sacadas


if __name__ == '__main__':
    main()
