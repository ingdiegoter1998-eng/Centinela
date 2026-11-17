# Cámara en el bar: planteamiento

Ronda de diseño, todavía no se construye nada. La idea: una o dos cámaras, un computador pequeño en el bar que analiza el video ahí mismo, y solo los **eventos** (no el video) suben a Supabase para cruzarlos con las ventas de bar-nube.

## 1. Qué se puede medir de verdad

| Qué | Qué tan confiable | Cómo |
|---|---|---|
| Clientes que entran y salen | Alta | Cámara apuntando a la puerta, línea virtual que cuenta cruces |
| Personas en el bar ahora mismo (aforo) | Media-alta | Conteo de personas en la zona de mesas; falla con mucha gente amontonada o poca luz |
| Horas pico por día | Alta | Sale solo del conteo anterior |
| Barman en la barra o ausente | Alta | Zona "detrás de la barra": hay persona o no |
| Una sacada de cerveza y a qué hora | Media | Zona pequeña sobre el grifo: persona + vaso ahí por X segundos = 1 sacada |
| Cuánta cerveza salió (litros) | Baja con cámara | La cámara no ve volumen. Para eso va un caudalímetro (ver sección 2) |
| Tiempo de atención (cliente llega a la barra hasta que recibe) | Media | Seguimiento de personas en la zona frente a la barra |
| Mesas ocupadas y cuánto tiempo | Media | Una zona por mesa |
| Movimiento fuera de horario | Alta | Cualquier persona detectada con el bar cerrado = alerta |
| Quién es el barman (identidad) | No recomendado | Reconocimiento facial = dato biométrico sensible (ver sección 4). Si hay un solo barman por turno, basta saber quién tiene el turno |

## 2. Lo que se te estaba quedando por fuera

- **El cruce es lo que vale.** Contar sacadas solo sirve si se compara contra lo registrado en bar-nube: "a las 9 pm la cámara vio 14 sacadas y en ventas hay 10". Esa diferencia es la alerta que te interesa.
- **Caudalímetro en el grifo.** Un sensor de flujo en la manguera de cada barril mide los litros reales que salen. Es mucho más exacto que la cámara para pérdidas, y es barato. Con eso tienes: litros servidos vs litros vendidos vs litros que bajó el inventario. La cámara queda para el contexto (quién, cuándo, qué pasó).
- **Clip de evidencia.** Cuando hay una diferencia, guardar los 20 segundos de video de esa sacada para revisarla, en vez de tener que buscar en horas de grabación.
- **Cervezas "de la casa".** Cortesías, pruebas, cerveza para el personal. Si no hay forma de registrarlas en la app, todas van a salir como faltantes. Conviene un botón "cortesía / merma" en bar-nube.
- **Soda y Maní.** La cámara no distingue bien qué producto se entrega; eso se queda con el registro manual.
- **Resumen diario por WhatsApp o correo:** clientes del día, hora pico, sacadas vs ventas, alertas.
- **Luz y ángulo.** Con luz de bar (baja, de colores) la detección empeora mucho. Hay que probar en una noche real antes de comprar más equipo.

## 3. Arquitectura

**Recomendado: procesar en el bar, subir solo eventos.**

```
Cámara IP (RTSP) → Computador en el bar (detección) → eventos a Supabase → bar-nube muestra reportes
                                                    ↘ clips cortos guardados en disco local
Caudalímetro + ESP32 → Supabase (litros por grifo)
```

- **Software:** Frigate (gratis, código abierto) ya trae detección de personas, zonas, conteo y clips; publica eventos que se pueden mandar a Supabase con un script pequeño. Si se queda corto para las sacadas, se hace un detector propio con YOLO.
- **Por qué no en la nube:** subir video todo el día exige buen internet, cuesta por mes y saca imágenes de empleados y clientes del bar, que es lo más delicado legalmente. Local es más barato y más privado.

**Hardware y costo aproximado** (precios de referencia en Colombia, verificar al comprar):

| Pieza | Aprox. COP |
|---|---|
| Cámara IP con RTSP (ej. Tapo C200/C210, Imou, Hikvision básica) | 120.000 a 300.000 c/u |
| Computador: Raspberry Pi 5 8 GB + acelerador Hailo, o un mini PC usado con Intel de 8ª gen o más | 600.000 a 1.300.000 |
| Disco o SD para clips (256 GB a 1 TB) | 100.000 a 250.000 |
| Caudalímetro apto para alimentos + ESP32, por grifo | 100.000 a 250.000 |
| **Prototipo (1 cámara + equipo + 1 caudalímetro)** | **~1.000.000 a 2.000.000** |

Si ya tienes un PC viejo que pueda quedar prendido, el arranque baja mucho.

## 4. Privacidad y legal (Colombia)

No soy abogado; esto es lo básico para no meterse en problemas, confirmar con un contador o abogado laboral.

- **Ley 1581 de 2012 y Decreto 1377 de 2013:** la imagen de una persona es dato personal. Necesitas una **política de tratamiento de datos** escrita (una página sirve) que diga para qué es la cámara, cuánto tiempo se guarda y a quién pedirle que se borre.
- **Aviso visible** de "Zona videovigilada" en la entrada, con quién es el responsable y dónde está la política. La SIC tiene una guía de videovigilancia con el modelo.
- **Empleados:** se puede monitorear el puesto de trabajo, pero informado. Lo correcto es un **otrosí o cláusula** en el contrato (o en el reglamento interno) donde el barman firme que sabe de la cámara y para qué se usa. Nada de cámaras en baños, vestier ni zonas de descanso.
- **Sin audio.** Grabar conversaciones es otro nivel de riesgo; las cámaras baratas lo traen activado, hay que apagarlo.
- **Sin reconocimiento facial.** Biometría es dato sensible: pide autorización expresa y separada, y el empleado puede negarse. No hace falta para lo que quieres.
- **Retención corta:** borrar video automáticamente a los 15 a 30 días; los clips de alertas, solo mientras se revisan.
- **Registro Nacional de Bases de Datos:** solo obliga a empresas con activos de más de 100.000 UVT, así que un bar pequeño casi seguro no tiene que registrarse.

## 5. Primer prototipo que recomiendo

Una sola cámara mirando la barra y los grifos desde arriba, Frigate en un computador del bar, durante dos semanas:

1. Zonas: "grifo", "detrás de la barra" y, si el ángulo da, "puerta".
2. Cada evento (sacada, entrada, barman ausente) se guarda en una tabla nueva `eventos_camara` en Supabase.
3. En bar-nube, una vista "Cámara vs ventas" por hora: sacadas detectadas al lado de ventas registradas.
4. Al final de las dos semanas se mira qué tan seguido acierta la detección de sacadas. Si es poco confiable, se agrega el caudalímetro antes de poner más cámaras.

Antes, lo legal: aviso en la puerta, política de una página y el otrosí del barman.

## 6. Preguntas que cambian el diseño

1. ¿La cerveza sale de **grifo con barril** o de garrafa/botella? ¿Cuántos grifos?
2. ¿Ya tienes alguna cámara? ¿Cuál marca?
3. ¿Hay un **PC que pueda quedar prendido** en el bar e internet estable?
4. ¿Qué te importa más: **controlar pérdidas** (barman, sacadas sin registrar) o **datos del negocio** (aforo, horas pico)?
5. ¿Cuántas entradas tiene el local y hay un punto desde donde se vean barra y puerta a la vez?
