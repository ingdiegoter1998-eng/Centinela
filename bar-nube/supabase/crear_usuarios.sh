#!/usr/bin/env bash
# Crea (o actualiza) los usuarios del bar y les da rol. Las contraseñas NO viven en el repo: se pasan por entorno.
#   SUPABASE_ACCESS_TOKEN=... ADMIN_CLAVE=... BARMAN_CLAVE=... ./crear_usuarios.sh
# Se entra con «usuario» + clave; por dentro Supabase pide un correo, así que el usuario se guarda como
# <usuario>@bar.local (la app lo agrega sola). Repetirlo cambia la clave y el nombre, no duplica nada.
# Supabase exige 6+ caracteres y el bar usa claves cortas: por eso la app y este script le agregan
# el mismo sufijo fijo («-bar») a lo que se escribe. El usuario sigue escribiendo la clave corta.
# También cierra el registro público.
set -euo pipefail
REF=${SUPABASE_PROJECT_REF:-xesmbhfgiosrhctjamru}
: "${SUPABASE_ACCESS_TOKEN:?Falta SUPABASE_ACCESS_TOKEN}"; : "${ADMIN_CLAVE:?Falta ADMIN_CLAVE}"; : "${BARMAN_CLAVE:?Falta BARMAN_CLAVE}"
export REF SUPABASE_ACCESS_TOKEN ADMIN_CLAVE BARMAN_CLAVE
python3 - <<'PY'
import json, os, urllib.request, urllib.error
REF, TOKEN = os.environ['REF'], os.environ['SUPABASE_ACCESS_TOKEN']

def api(url, metodo='GET', cuerpo=None, cab=None):
    r = urllib.request.Request(url, json.dumps(cuerpo).encode() if cuerpo is not None else None, method=metodo,
                               headers={'Content-Type': 'application/json', **(cab or {})})
    try:
        with urllib.request.urlopen(r) as x: t = x.read(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{metodo} {url} -> {e.code} {e.read().decode()[:300]}')

SUFIJO = '-bar'   # el mismo que en app.js
mgmt = {'Authorization': f'Bearer {TOKEN}'}
# Sin registro público (la llave anon es pública) y con claves cortas permitidas.
api(f'https://api.supabase.com/v1/projects/{REF}/config/auth', 'PATCH',
    {'disable_signup': True, 'mailer_autoconfirm': True}, mgmt)
print('OK  registro público cerrado')

llaves = api(f'https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true', cab=mgmt)
servicio = next(k['api_key'] for k in llaves if k['name'] == 'service_role')
base = f'https://{REF}.supabase.co/auth/v1/admin/users'
cab = {'apikey': servicio, 'Authorization': f'Bearer {servicio}'}

USUARIOS = [  # usuario, nombre que se muestra, rol, variable con la clave
    ('diego',  'Diego',       'admin',  'ADMIN_CLAVE'),
    ('barman', 'José Manuel', 'barman', 'BARMAN_CLAVE'),
]
existentes = {u['email']: u['id'] for u in api(base + '?per_page=200', cab=cab)['users']}
filas = []
for usuario, nombre, rol, var in USUARIOS:
    email, clave = f'{usuario}@bar.local', os.environ[var] + SUFIJO
    datos = {'password': clave, 'email_confirm': True, 'user_metadata': {'nombre': nombre}}
    if email in existentes:
        uid = existentes[email]; api(f'{base}/{uid}', 'PUT', datos, cab)
    else:
        uid = api(base, 'POST', {'email': email, **datos}, cab)['id']
    filas.append(f"('{uid}', '{nombre}', '{rol}')")
    print(f'OK  {usuario} ({rol})')
sql = ("insert into perfiles (id, nombre, rol) values " + ', '.join(filas) +
       " on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;")
api(f'https://api.supabase.com/v1/projects/{REF}/database/query', 'POST', {'query': sql}, mgmt)
print('OK  perfiles')
PY
