# Resultados — Detección de centros de planta

Sesión del 2026-09-23. Sigue a `resultados-imagen-real.md`, que documentó por qué el pipeline de
manchas de la Etapa I no funciona sobre imagen real. Este documento cuenta qué lo reemplaza en la
app pública y cuánto rinde.

Reproducible con `centinela centros` (CLI), `tests/test_centros.py` y
`scripts/comparar_deepforest.py`.

---

## 1. El detonante: una foto real de platanal

Un usuario probó la app pública con una foto de dron cenital de un platanal (984×1500 px, unas
**200 matas** según su propia estimación). La app devolvió del orden de **mil "posibles plantas"**
(él vio 1.100; sobre la copia probada aquí salen 935 manchas) y **ninguna marca caía sobre una
mata**: marcaba los huecos oscuros y las sombras entre hojas.

| Medición sobre la foto del usuario | Valor |
|---|---|
| Manchas del watershed | 935 |
| Árboles según DBSCAN | 447 |
| Estabilidad | **inestable** — de 447 a 867 según `eps` |
| Marcas sobre el centro de una mata | prácticamente ninguna |

No es un modo de fallo nuevo: es el del §3.3 de `resultados-imagen-real.md` (Musa sobre pasto
verde) combinado con el del §3.2 (hojas que se tocan). El entresurco es **pasto verde**, así que la
máscara de vegetación no separa planta de fondo, y las hojas de matas vecinas se tocan, así que no
hay manchas aisladas que contar. El umbral de Otsu termina separando hoja iluminada de hoja en
sombra, y el pipeline cuenta los pedazos.

## 2. La idea: buscar el centro, no la mancha

En vez de segmentar y contar manchas, el módulo nuevo `centinela_core/centros.py` busca **un punto
por planta**: los máximos locales de un mapa de "centralidad". Hay dos mapas, según cómo se vea la
planta en la foto:

| Forma | Cultivos | Mapa |
|---|---|---|
| **estrella** | plátano, banano, palma vista de cerca | **Convergencia de hojas.** Cada borde con orientación bien definida (tensor de estructura) vota a lo largo de su propia dirección. Las hojas de una roseta salen del mismo punto, así que sus votos se amontonan en el centro; los bordes de pasto votan en direcciones que no coinciden. |
| **copa** | cítricos, cacao, frutales, palma vista desde muy alto | **Mancha a escala de copa.** El índice `combo` filtrado con una diferencia de gaussianas al tamaño de la copa. |

En los dos casos se descartan los centros que no caen sobre algo verde, lo que limpia sombras sobre
una vía o textura de agua.

### 2.1 La escala manda, y se estima sola

Ambos mapas necesitan saber **cuánto mide una planta en la foto**. Una plantación es casi
periódica: la autocorrelación de la imagen tiene un pico a la distancia entre plantas vecinas. El
estimador toma ese pico sobre la luminancia y sobre el índice de vegetación, y se queda con el más
marcado. Tiene dos correcciones, medidas en esta sesión:

- **Armónicos.** Una cuadrícula también da pico al doble de la distancia, a veces un poco más
  prominente. Sin corrección, un platanal a 60 px salía estimado en 124 px. Ahora se toma el pico
  más cercano cuya prominencia sea al menos la mitad de la mayor.
- **Vecinos diagonales.** El promedio por anillos mezcla vecinos directos y diagonales y corre el
  pico hacia afuera: un platanal a 80 px salía en 88 px. Se refina con el máximo local de la
  autocorrelación 2D cerca de esa distancia.

Error del estimador en los sintéticos: **≤ 7 %**. Si la foto no tiene periodo (plantas sueltas,
bordes de lote), el estimador **lo dice** en vez de inventar un número, y el tamaño se fija a mano.

### 2.2 El conteo se publica con su rango

Como la escala es el parámetro que manda, el conteo se repite con la escala ±10 % (el error típico
del estimador). Si el número se mueve menos del 10 %, el conteo es **consistente**; si no, se
publica el rango. Es el mismo criterio del chequeo de estabilidad (`stability.py`), aplicado al
parámetro que aquí importa.

## 3. Resultados

### 3.1 Con verdad de terreno (sintéticos)

El platanal sintético (`centinela make-synthetic --platanal`) reproduce las dos condiciones que
rompen la Etapa I: rosetas de 6 a 9 hojas **sobre pasto verde**, con hojas de matas vecinas
tocándose. Radio de emparejamiento: 0,4 veces la escala.

| Escena | Método | Detectadas / reales | P | R | F1 | Rango ±10 % |
|---|---|---|---|---|---|---|
| Huerto sintético | centros · copa | 80 / 80 | 1,00 | 1,00 | **1,00** | 80–80 |
| Huerto con 25 manchas de maleza | centros · copa | 80 / 80 | 1,00 | 1,00 | **1,00** | 80–80 |
| Platanal (semilla 0, `platanal_demo.png`) | **manchas (Etapa I)** | **0** / 63 | — | 0,00 | **0,00** | — |
| Platanal (semilla 0) | centros · estrella | 62 / 63 | 0,97 | 0,95 | **0,96** | 58–63 |
| Platanal (semilla 1) | centros · estrella | 57 / 63 | 1,00 | 0,90 | 0,95 | 57–61 |
| Platanal (semilla 2) | centros · estrella | 61 / 63 | 0,98 | 0,95 | 0,97 | 60–64 |
| Platanal de hojas largas | centros · estrella | 61 / 63 | 1,00 | 0,97 | 0,98 | 61–66 |
| Platanal a 70 px | centros · estrella | 63 / 63 | 0,94 | 0,94 | 0,94 | 61–64 |
| Platanal a 100 px | centros · estrella | 63 / 63 | 1,00 | 1,00 | 1,00 | 63–63 |
| Platanal a 60 px | centros · estrella | 51 / 63 | 0,96 | 0,78 | **0,86** | 49–66 · *aproximado* |

El caso más débil es el platanal más apretado (60 px entre matas): pierde una de cada cinco. El
rango lo avisa: es el único que sale *aproximado*.

Los parámetros del modo estrella (alcance del voto 0,55 × escala, distancia mínima entre centros
0,5 × escala, umbral 0,25 del percentil 90 de los picos) se eligieron con una grilla sobre estos
siete platanales. Están calibrados contra el mismo generador con el que se miden, y eso es una
limitación: el F1 de esta tabla es optimista. El número honesto sale de la verdad de terreno real
(§6).

### 3.2 Sobre imagen real (sin verdad de terreno todavía)

| Foto | Forma | Escala | Conteo | Rango | Lectura visual |
|---|---|---|---|---|---|
| Platanal del usuario, 984×1500 | estrella | 74 px (medida) | **224** | 221–239 · consistente | Casi todos los puntos sobre el centro de una mata. Se escapan matas jóvenes pequeñas (esquina superior derecha) y algunas del borde. |
| `palma_lote` (procedencia sin registrar) | estrella | 62 px (medida) | 267 | 255–299 | Un punto por palma, ninguno en la vía. Faltan algunas en el bloque denso. |
| `palma_aceite_rio` (CC BY 2.0) | copa | **sin periodo** → 28 px a mano | 389 | 369–417 | Puntos sobre las palmas, ninguno en el río. |
| `huerto_reticula_usda` (PDM) | copa | 79 px (medida) | 66 | 57–74 | ❌ **Falla.** El periodo que encuentra es el de las franjas de pasto, no el de los árboles, y marca pasto. |
| `platano_div8`, dosel cerrado (CC BY-SA) | estrella | 46 px (medida) | 223 | 197–283 | ❌ La escala sale de la textura de hojas. Con 150 px a mano: 25 matas, rango 17–28. Poco confiable. |

Contra el pipeline de manchas, sobre la foto del usuario: de ~1.000 marcas sobre huecos a 224
puntos sobre matas. No hay todavía un F1 real; ver §6.

## 4. Comparación con un modelo preentrenado: DeepForest

DeepForest (`weecology/deepforest-tree` en Hugging Face, MIT) es una RetinaNet entrenada con copas
de bosque de EE. UU. Se probó **sin reentrenar** como comparación externa: un método aprendido,
independiente del nuestro. Script: `scripts/comparar_deepforest.py` (dependencia opcional
`pip install -e ".[modelo]"`, ~1 GB con PyTorch).

**La escala también manda aquí.** Sobre la foto del usuario, con umbral de confianza 0,2:

| Foto pasada a DeepForest al… | Cajas |
|---|---|
| 100 % (tal cual) | 669 — parte cada mata en pedazos |
| 54 % (separación ≈ 40 px, con la escala de `centros.py`) | **240** |
| 50 % | 223 |
| 33 % | 151 — junta matas vecinas |

El script usa la escala estimada por `centros.py` para reducir la foto hasta que la separación
entre plantas quede en ~40 px.

| Escena | Centros | DeepForest | Coinciden | Solo centros | Solo DeepForest |
|---|---|---|---|---|---|
| Platanal sintético (63 reales) | 62 · **F1 0,96** | 61 · **F1 0,95** | 56 | 6 | 5 |
| Platanal del usuario | 224 | 240 | **192** | 32 (bordes de la foto) | 48 (matas jóvenes pequeñas) |

Tres lecturas:

1. **Un método clásico de pocos segundos y sin dependencias nuevas rinde como un detector profundo
   sin afinar**
   sobre el sintético, y los dos coinciden en 192 matas de la foto real.
2. **Se complementan.** DeepForest encuentra las matas jóvenes pequeñas que al detector de estrella
   se le escapan; el detector de estrella encuentra las de los bordes, que DeepForest pierde. En la
   foto del usuario, el número real está probablemente entre 224 y ~270.
3. **DeepForest no entra a la app pública.** PyTorch y sus dependencias pesan ~1 GB: en la capa
   gratuita de Streamlit Community Cloud harían el arranque muy lento y arriesgan pasar su límite
   de memoria. Queda como herramienta local de comparación.

## 5. Sobre el dataset `Project-AgML/tree_crown_segmentation`

Se revisó a pedido del usuario, que lo vio en Hugging Face y lo propuso como modelo a copiar. Lo
que es y lo que no es:

- **Es solo datos, no trae modelo ni código.** 595 recortes de 256×256 px de *Camellia oleifera*
  (arbusto de aceite de té) en China, tomados con un DJI Mavic 3M, con máscaras binarias
  *copa / no copa* y bandas multiespectrales. CC BY 4.0. Viene del artículo de Peng et al. (2026,
  *Ecological Informatics*), cuyo modelo no está publicado ahí.
- **Lo que se ve en el visor son las etiquetas hechas a mano, no predicciones.** Por eso "se ve
  tan bien": es la respuesta correcta, no la salida de un modelo.
- **Es otro cultivo en otra escena:** copas redondas de arbusto sobre suelo rojo desnudo. Un
  modelo entrenado con él aprende "copa redonda sobre suelo", que es justo lo que ya resuelve el
  modo *copa*, y no la roseta de plátano sobre pasto. En uno de los cuatro recortes revisados la
  máscara además no parece alineada con la foto.

Dónde sí sirve: como **preentrenamiento** para la segmentación densa de la Etapa III, o para medir
el modo *copa* con verdad de terreno real (las máscaras separan copa por copa y se pueden convertir
en centros). Para plátano, el dato que hace falta sigue siendo el propio: fotos de Saravena con
matas marcadas a mano.

## 6. Pendiente

- **Verdad de terreno de la foto del usuario.** `centinela centros FOTO` y después
  `centinela annotate FOTO --desde FOTO_centros.csv`: arranca con los 224 puntos y solo hay que
  borrar los que sobran (clic derecho) y marcar los que faltan. Da el primer F1 real del método.
- **Permiso para versionar la foto.** Sin saber quién la tomó y con qué licencia, queda fuera del
  repo (`data/samples/usuario/` está en `.gitignore`). Con permiso, entra al banco como el primer
  platanal real con verdad de terreno.
- **Unir los dos métodos.** Si la verdad de terreno confirma que se complementan (§4), la unión
  de centros y DeepForest podría subir el recall en local.
- **Plantas jóvenes pequeñas.** Son el fallo principal del modo estrella: una mata chica vota
  menos que una grande y queda bajo el umbral. Opción: umbral relativo al vecindario, no a la foto.
- **Huertos sobre franjas de pasto** (`huerto_reticula_usda`): el periodo dominante es el de las
  franjas. El pipeline de manchas sigue siendo el que mejor segmenta esa escena.
