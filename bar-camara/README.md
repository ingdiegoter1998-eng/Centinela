# Vigía de la cámara del bar

Un programa que corre en un computador del bar, mira la cámara Tapo y manda a Supabase **solo eventos, nunca
video**. En la app (Ventas, solo el administrador) aparecen junto a lo vendido:

| Qué | Cómo lo ve | Necesita |
|---|---|---|
| **Sacadas de cerveza** con hora de inicio y fin | Movimiento en una zona pequeña dibujada sobre el grifo | Solo la cámara |
| **Servidas sin vender** | Sacadas de la jornada contra pintas y vasos vendidos en la app | Solo la cámara |
| **Aforo** (máximo de personas cada 5 min) | Personas detectadas en la zona del salón | Detector de personas |
| **Barra sola** (nadie atendiendo 10 min o más) | Nadie en la zona detrás de la barra, con el bar abierto | Detector de personas |
| **Sacadas fuera de horario** | Una sacada fuera del horario de `camara.yaml` sale para revisar | Solo la cámara |

La foto del momento en que arranca cada sacada queda **solo en este computador**, en `capturas/<fecha>/sacada
HH-MM-SS.jpg` (la hora es la misma que muestra la app), y se borra sola a los 15 días.

**Es una alerta, no una prueba.** La cámara no sabe si salió una pinta o un vaso, y con mala luz o si alguien
tapa el grifo se equivoca. Cuando la app muestra «servidas sin vender», se miran las fotos de esa hora.

## Qué se necesita

- La cámara Tapo con RTSP activado (abajo cómo) y **fija** apuntando al grifo, sin giro automático.
- Un computador con Windows y Python 3.10 o mayor, en la misma red WiFi de la cámara, prendido mientras el bar
  está abierto. No necesita tarjeta de video.
- Internet para mandar los eventos. Si se cae, se guardan en `pendientes.jsonl` y salen solos cuando vuelve.

## Puesta en marcha

1. **RTSP en la Tapo**: app Tapo → la cámara → Configuración → Avanzado → **Cuenta de la cámara**. Crea un usuario
   y una clave (distintos a los de tu cuenta Tapo). En el router, dale a la cámara una IP fija. Apaga el modo
   privacidad, el seguimiento de movimiento y la grabación de audio.
2. **Usuario «camara» en Supabase**: aplicar el esquema nuevo y crear el usuario (solo puede registrar eventos;
   no ve ni vende nada):
   ```bash
   SUPABASE_ACCESS_TOKEN=... ./bar-nube/supabase/aplicar.sh
   SUPABASE_ACCESS_TOKEN=... ADMIN_CLAVE=... BARMAN_CLAVE=... CAMARA_CLAVE=... ./bar-nube/supabase/crear_usuarios.sh
   ```
3. **Doble clic en `iniciar.bat`**. La primera vez instala lo necesario, abre `.env` para llenar la IP, usuario y
   clave de la cámara y la clave del usuario «camara» (`BAR_CAMARA_CLAVE`, la misma `CAMARA_CLAVE` del paso 2),
   y luego abre `calibrar.py` para dibujar las zonas.
4. **Dibujar las zonas** sobre la foto de la cámara (clic en cada esquina, Enter para terminar cada una):
   - `grifo` (obligatoria): un recuadro **pequeño y ajustado** sobre la manija y donde va el vaso. Que no entre el
     paso de la gente ni una pantalla: cualquier movimiento ahí cuenta.
   - `barra` y `salon` (opcionales): detrás de la barra y donde están los clientes.
5. **Probar una noche** con la ventana de calibración: `.venv\Scripts\python vigia.py --ver --sin-envio`. Arriba
   sale el movimiento del grifo y dice SACANDO mientras detecta una. Si cuenta de más o de menos, ajustar
   `sacadas.umbral` en `camara.yaml` (ver abajo).
6. Ya calibrado, `iniciar.bat` lo deja corriendo. Hay que dejar la ventana abierta.

**Aforo y barra sola** necesitan el detector de personas: `.venv\Scripts\pip install ultralytics` (unos 1 GB con
sus dependencias; la primera vez descarga un modelo de 6 MB). Solo dice dónde hay personas: no reconoce caras ni
identifica a nadie. Sin él, el programa funciona igual y solo cuenta sacadas.

## Ajustar (`camara.yaml`)

| Si pasa esto | Mover |
|---|---|
| Cuenta sacadas cuando nadie sirvió (gente que pasa, luces) | Achicar la zona `grifo` o subir `sacadas.umbral` (0.08 → 0.12) |
| No cuenta sacadas que sí pasaron | Bajar `sacadas.umbral` (0.08 → 0.05) o `sacadas.min_duracion` |
| Una sacada sale partida en dos | Subir `sacadas.pausa` (2 → 3 s) |
| Dos sacadas seguidas salen como una | Bajar `sacadas.pausa` |
| Sacadas marcadas «fuera de horario» que no lo son | `horario.abre` y `horario.cierra` |

Otras opciones: `python vigia.py --video grabacion.mp4 --sin-envio` analiza un video grabado (por ejemplo uno
exportado de la app Tapo) para calibrar sin estar en el bar.

## Privacidad y lo legal

Antes de dejarlo corriendo: aviso de «Zona videovigilada» visible, la política de tratamiento de datos y el
otrosí firmado por el barman donde sabe que hay cámara y para qué se usa (Ley 1581 de 2012). El programa no
graba audio ni video continuo, no reconoce caras y las fotos se borran solas. El barman no ve nada de la cámara
en la app.

## Archivos

| Archivo | Qué es |
|---|---|
| `vigia.py` | El programa: lee la cámara, detecta, guarda fotos y manda eventos |
| `detectores.py` | La detección (solo numpy): movimiento en el grifo, sacadas, aforo, barra sola |
| `envio.py` | Cola en disco y envío a Supabase con el usuario «camara» |
| `personas.py` | Detector de personas opcional (YOLO) |
| `calibrar.py` | Dibuja las zonas y las guarda en `zonas.yaml` (no se sube al repo) |
| `camara.yaml` | Ajustes. Los datos de acceso van en `.env` (no se sube al repo; plantilla en `.env.ejemplo`) |

## Pruebas

```bash
cd bar-camara && python -m unittest discover -s pruebas
```

Cuentan sacadas en un video sintético con gente pasando fuera de la zona, cambios de luz y un vaso olvidado, y
prueban que con el internet caído o un corte a mitad de envío no se pierde ni se duplica ningún evento. Las
reglas de la base (quién puede registrar y ver qué) se prueban con `bar-nube/supabase/probar.sh`.
