"""Pruebas del envío a Supabase con un servidor falso: no se pierde ni se duplica nada."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import envio  # noqa: E402


class Respuesta:
    def __init__(self, codigo, datos=None):
        self.status_code, self._datos, self.text = codigo, datos, json.dumps(datos)

    def json(self):
        return self._datos

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class SupabaseFalso:
    """Imita /auth/v1/token y /rest/v1/rpc/registrar_eventos."""

    def __init__(self):
        self.base, self.caido, self.entradas, self.vencer = {}, False, 0, False

    def post(self, url, json=None, headers=None, timeout=None):
        if self.caido:
            raise ConnectionError('sin internet')
        if '/auth/v1/token' in url:
            if json['password'] != 'clave-bar' or json['email'] != 'camara@bar.local':
                return Respuesta(400, {'error': 'invalid_grant'})
            self.entradas += 1
            return Respuesta(200, {'access_token': f't{self.entradas}', 'expires_in': 3600})
        if self.vencer:
            self.vencer = False
            return Respuesta(401, {'message': 'JWT expired'})
        nuevos = [e for e in json['p_eventos'] if e['origen'] not in self.base]
        self.base.update({e['origen']: e for e in nuevos})
        return Respuesta(200, len(nuevos))


def ev(i):
    return {'origen': f'sacada--{i}', 'tipo': 'sacada', 'inicio': f'2026-10-14T20:00:{i:02d}-05:00'}


class Envio(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cola = envio.Cola(Path(self.dir.name) / 'pendientes.jsonl')
        self.srv = SupabaseFalso()
        self.cliente = envio.Supabase('https://x.supabase.co', 'anon', 'camara', 'clave', sesion=self.srv)

    def tearDown(self):
        self.dir.cleanup()

    def test_sin_internet_quedan_guardados_y_salen_despues(self):
        for i in range(5):
            self.cola.agregar(ev(i))
        self.srv.caido = True
        with self.assertRaises(ConnectionError):
            self.cola.enviar(self.cliente)
        self.assertEqual(len(self.cola.pendientes()), 5)
        self.srv.caido = False
        self.assertEqual(self.cola.enviar(self.cliente), 5)
        self.assertEqual(self.cola.pendientes(), [])
        self.assertEqual(len(self.srv.base), 5)

    def test_corte_a_mitad_no_pierde_ni_duplica(self):
        for i in range(5):
            self.cola.agregar(ev(i))
        original = self.cliente.registrar
        llamadas = []

        def falla_el_segundo(lote):
            llamadas.append(len(lote))
            if len(llamadas) == 2:
                raise ConnectionError('se cayó')
            return original(lote)
        self.cliente.registrar = falla_el_segundo
        with self.assertRaises(ConnectionError):
            self.cola.enviar(self.cliente, lote=2)
        self.assertEqual([e['origen'] for e in self.cola.pendientes()], ['sacada--2', 'sacada--3', 'sacada--4'])
        self.cliente.registrar = original
        self.cola.agregar(ev(1))                                        # un reenvío repetido
        self.cola.enviar(self.cliente)
        self.assertEqual(sorted(self.srv.base), [f'sacada--{i}' for i in range(5)])

    def test_token_vencido_vuelve_a_entrar(self):
        self.cliente.registrar([ev(0)])
        self.srv.vencer = True
        self.assertEqual(self.cliente.registrar([ev(1)]), 1)
        self.assertEqual(self.srv.entradas, 2)

    def test_clave_mala(self):
        malo = envio.Supabase('https://x.supabase.co', 'anon', 'camara', 'otra', sesion=self.srv)
        with self.assertRaises(PermissionError):
            malo.registrar([ev(0)])

    def test_linea_cortada_por_apagon_se_ignora(self):
        self.cola.agregar(ev(0))
        with open(self.cola.ruta, 'a', encoding='utf-8') as f:
            f.write('{"origen": "sacada--9", "ti')
        self.assertEqual(len(self.cola.pendientes()), 1)

    def test_lee_la_llave_de_config_js(self):
        url, llave = envio.leer_config_js(Path(__file__).resolve().parents[2] / 'bar-nube' / 'config.js')
        self.assertTrue(url.startswith('https://') and url.endswith('.supabase.co'))
        self.assertTrue(llave.startswith('eyJ'))



class UrlCamara(unittest.TestCase):
    def test_puerto_y_clave_con_simbolos(self):
        import vigia
        env = {'CAMARA_IP': 'micasa.ddns.net', 'CAMARA_PUERTO': '8554', 'CAMARA_USUARIO': 'tapo', 'CAMARA_CLAVE': 'a@b:c/d'}
        self.assertEqual(vigia.url_camara(env, 'stream2'), 'rtsp://tapo:a%40b%3Ac%2Fd@micasa.ddns.net:8554/stream2')
        env.pop('CAMARA_PUERTO')
        self.assertTrue(vigia.url_camara(env, 'stream1').endswith('@micasa.ddns.net:554/stream1'))

if __name__ == '__main__':
    unittest.main()
