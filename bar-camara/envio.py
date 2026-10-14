"""Manda los eventos a Supabase sin perder ninguno.

Cada evento se escribe primero en un archivo (pendientes.jsonl) y de ahí se manda en lotes. Si se cae el
internet o se apaga el computador, quedan en el archivo y salen en el próximo intento. La base ignora los
repetidos (cada evento trae un `origen` único), así que reenviar nunca duplica.

Entra con el usuario «camara» (rol que solo puede llamar registrar_eventos; ver bar-nube/supabase/schema.sql).
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
from pathlib import Path

import requests

SUFIJO = '-bar'          # el mismo que le suma la app a las claves (ver bar-nube/app.js)
DOMINIO = '@bar.local'


def leer_config_js(ruta: Path) -> tuple[str, str]:
    """Saca SUPABASE_URL y SUPABASE_ANON_KEY de bar-nube/config.js, para no tenerlos en dos lugares."""
    texto = Path(ruta).read_text(encoding='utf-8')
    url = re.search(r'SUPABASE_URL\s*:\s*["\']([^"\']+)', texto)
    llave = re.search(r'SUPABASE_ANON_KEY\s*:\s*["\']([^"\']+)', texto)
    if not url or not llave:
        raise ValueError(f'No encontré SUPABASE_URL y SUPABASE_ANON_KEY en {ruta}')
    return url.group(1), llave.group(1)


class Supabase:
    def __init__(self, url: str, llave_anon: str, usuario: str, clave: str, sesion=None, tope_seg=15):
        self.url, self.anon = url.rstrip('/'), llave_anon
        self.email, self.clave = usuario + DOMINIO, clave + SUFIJO
        self.http = sesion or requests.Session()
        self.tope = tope_seg
        self._token, self._vence = None, 0.0

    def _entrar(self):
        r = self.http.post(f'{self.url}/auth/v1/token?grant_type=password', timeout=self.tope,
                           headers={'apikey': self.anon, 'Content-Type': 'application/json'},
                           json={'email': self.email, 'password': self.clave})
        if r.status_code in (400, 401):
            raise PermissionError('Usuario o clave de la cámara incorrectos (BAR_CAMARA_CLAVE en .env).')
        r.raise_for_status()
        d = r.json()
        self._token, self._vence = d['access_token'], time.time() + d.get('expires_in', 3600) - 60

    def registrar(self, eventos: list[dict]) -> int:
        """Manda un lote. Devuelve cuántos eran nuevos para la base."""
        for intento in (1, 2):
            if not self._token or time.time() >= self._vence:
                self._entrar()
            r = self.http.post(f'{self.url}/rest/v1/rpc/registrar_eventos', timeout=self.tope,
                               headers={'apikey': self.anon, 'Authorization': f'Bearer {self._token}',
                                        'Content-Type': 'application/json'},
                               json={'p_eventos': eventos})
            if r.status_code == 401 and intento == 1:          # token vencido o revocado: entrar otra vez
                self._token = None
                continue
            if r.status_code >= 400:
                raise RuntimeError(f'Supabase respondió {r.status_code}: {r.text[:200]}')
            return int(r.json() or 0)
        return 0


class Cola:
    """Eventos pendientes en disco, una línea JSON por evento."""

    def __init__(self, ruta: Path):
        self.ruta = Path(ruta)
        self._candado = threading.Lock()

    def agregar(self, evento: dict):
        with self._candado, open(self.ruta, 'a', encoding='utf-8') as f:
            f.write(json.dumps(evento, ensure_ascii=False) + '\n')
            f.flush()
            os.fsync(f.fileno())

    def pendientes(self) -> list[dict]:
        if not self.ruta.exists():
            return []
        with self._candado:
            lineas = self.ruta.read_text(encoding='utf-8').splitlines()
        eventos = []
        for linea in lineas:
            try:
                eventos.append(json.loads(linea))
            except json.JSONDecodeError:
                pass                                              # línea cortada por un apagón: se descarta
        return eventos

    def enviar(self, cliente: Supabase, lote: int = 200) -> int:
        """Manda todo lo pendiente. Lo que salió se borra del archivo; si falla, queda para la próxima."""
        eventos = self.pendientes()
        enviados = set()
        try:
            for i in range(0, len(eventos), lote):
                parte = eventos[i:i + lote]
                cliente.registrar(parte)
                enviados.update(e['origen'] for e in parte)
        finally:
            if enviados:
                with self._candado:
                    # Se relee: mientras se mandaba pudieron llegar eventos nuevos.
                    actuales = self.ruta.read_text(encoding='utf-8').splitlines() if self.ruta.exists() else []
                    quedan = [l for l in actuales if l.strip() and _origen(l) not in enviados]
                    tmp = self.ruta.with_suffix('.tmp')
                    tmp.write_text(''.join(l + '\n' for l in quedan), encoding='utf-8')
                    os.replace(tmp, self.ruta)
        return len(enviados)


def _origen(linea: str):
    try:
        return json.loads(linea).get('origen')
    except json.JSONDecodeError:
        return None


class Enviador(threading.Thread):
    """Hilo que vacía la cola cada `cada_seg` segundos sin frenar la lectura de la cámara."""

    def __init__(self, cola: Cola, cliente: Supabase, cada_seg: float = 15, avisar=print):
        super().__init__(daemon=True)
        self.cola, self.cliente, self.cada, self.avisar = cola, cliente, cada_seg, avisar
        self.parar = threading.Event()
        self._fallando = False

    def run(self):
        while not self.parar.is_set():
            self.vaciar()
            self.parar.wait(self.cada)
        self.vaciar()

    def vaciar(self):
        try:
            n = self.cola.enviar(self.cliente)
            if self._fallando:
                self.avisar('Conexión con Supabase recuperada.')
            self._fallando = False
            return n
        except Exception as e:                                    # sin internet, Supabase pausado, clave mala
            if not self._fallando:
                self.avisar(str(e) if isinstance(e, PermissionError)
                            else f'No pude mandar los eventos ({e}). Quedan guardados y reintento solo.')
            self._fallando = True
        return 0
