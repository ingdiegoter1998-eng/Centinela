# Resultados — Confrontación del pipeline con imagen real

Sesiones del 2026-09-21 y 22. Complementa `resultados-fase-1.md` (Etapa I) y `resultados-fase-2.md` (Etapa II).

Hasta estas sesiones el pipeline solo se había medido sobre huerto sintético (F1 = 1,00). Aquí se
confronta con imágenes aéreas reales de varios cultivos y condiciones. **El resultado es negativo en
los cuatro casos probados, y los cuatro fallan por motivos distintos.** Ese es el aporte del
documento: no es "no funcionó", es un mapa de en qué condiciones la Ruta A no puede funcionar.

Los tres primeros (§3) son fallos **de la escena**: la premisa "verde sobre fondo no verde" no se
cumple. El cuarto (§5) es distinto y llegó después, con la prueba de control: en la única escena real
que sí coopera, la segmentación entrega manchas utilizables y el conteo sale mal de todos modos.
Ese fallo es **de la implementación**, y está en el paso de clustering.

---

## 1. Búsqueda de datos públicos — resultado negativo documentado

El objetivo era conseguir imágenes **cenitales de plátano, de fotograma único, sin GPS**, con
licencia que permitiera obra derivada (recortar y redimensionar ya lo es, así que todo lo marcado
`ND` / *NoDerivatives* queda excluido de entrada).

**Fuentes barridas:**

| Fuente | Alcance | Resultado |
|---|---|---|
| Openverse (agrega Flickr y otros) | 18 consultas en 4 idiomas | 71 candidatas |
| Wikimedia Commons | 8 categorías completas (452 archivos) + 9 búsquedas | 75 candidatas |
| Figshare — Neupane et al. 2019, Tailandia | DOI 10.6084/m9.figshare.7981547 | **Embargado desde 2019**, lista de archivos vacía |
| CGSpace — Selvaraj et al. 2020, Congo y Benín | Registro institucional CGIAR | Solo el PDF; además `CC BY-NC-ND` |
| Hugging Face | Búsqueda de conjuntos `banana` / `plantain` | Nada aéreo; todo clasificación de fruta |
| AgML (catálogo UC Davis) | 69 conjuntos agrícolas | Ningún banano aéreo |
| Roboflow Universe | — | Inaccesible por verificación anti-bot |

**Total: 124 candidatas únicas tras filtrar por licencia y resolución mínima.** Se descargaron 114
miniaturas y se revisaron una por una.

**De las 124, exactamente una es Musa cenital.** El resto cayó por ser tomas oblicuas desde
avioneta (Commons tiene un archivo extenso de vuelos sobre Tenerife y La Palma que contamina
cualquier búsqueda con "aerial"), paisajes, zonas urbanas, o fotos de suelo mal etiquetadas.

> **Conclusión para la hoja de ruta:** no existe un banco público de imágenes cenitales de plátano
> apto para este trabajo. Lejos de ser un obstáculo, es el argumento más directo a favor de que el
> proyecto levante su propio vuelo: el dato que hace falta no está y hay que producirlo.

---

## 2. Banco de imágenes de referencia

El banco **sí quedó versionado** en `data/samples/banco/` (commit `8bc635c`), junto con su ficha de
procedencia. Esta tabla la reproduce para poder leerla sin salir del documento.

Revisada imagen por imagen el 2026-09-22. La primera versión de esta tabla describía cada foto
según su pie en la fuente; varias no correspondían (§5.1). La columna **Vista** separa las que
sirven para contar plantas —cenitales, con plantas individuales— de las que no.

| Archivo | Lo que muestra | Vista | ¿Sirve para contar? | Autor | Licencia | px |
|---|---|---|---|---|---|---|
| `huerto_reticula_usda` | Árboles espaciados sobre suelo, franjas de pasto entre hileras | Cenital | ✅ **Control** (§5) | USDA | PDM 1.0 | 1024×683 |
| `palma_aceite_rio` | Palmas separadas sobre suelo, junto a un río | Casi cenital | ✅ **Segundo control** (§5.2) | DrLianPinKoh | CC BY 2.0 | 1024×768 |
| `musa_bangladesh` | Banano en dosel cerrado — la única Musa del barrido | Cenital | ⚠️ Solo como modo de fallo (§3.2) | The Roving Rokibul | CC BY-SA 4.0 | 8064×6048 |
| `huerto_surcos_usda` | Suelo desnudo con franjas de pasto y dos o tres árboles sueltos | Cenital | ❌ No es un huerto | USDA | PDM 1.0 | 683×1024 |
| `cultivo_hileras_wisconsin` | Cultivo en surcos, sin plantas individuales distinguibles | Cenital | ❌ Nada que contar | Jules Verne Times Two | CC BY-SA 4.0 | 3840×2951 |
| `huerto_hileras_usda` | Huerto en hileras, bosque al fondo | **Oblicua** | ❌ | USDA | PDM 1.0 | 1024×767 |
| `huerto_camino_usda` | Huerto junto a una carretera, cielo en el tercio superior | **Oblicua** | ❌ | USDA | PDM 1.0 | 1024×767 |
| `palma_joven_suelo` | Palma joven en terrazas sobre suelo desnudo | **Oblicua** | ❌ | WWF Deutschland | CC BY-NC-SA 2.0 | 1024×683 |
| `palma_dosel` | Palma en dosel cerrado, carretera y claro | **Oblicua** | ❌ | unredd.photo | CC BY-NC 2.0 | 1024×576 |

**De 9 imágenes, 2 sirven como control de conteo.** Las URL de origen están en
`data/samples/banco/PROCEDENCIA.csv`, que además dice cuáles están descargadas.

**Notas de licencia.** Las cuatro del USDA son `PDM` (*Public Domain Mark*, marca de dominio
público): sin restricción. Las dos marcadas `NC` (*NonCommercial*, no comercial) sirven para uso
académico pero deben retirarse si el proyecto se comercializa. Las `BY-SA` exigen atribución y
compartir igual.

Se identificaron dos imágenes más (`campo_curvas_nivel`, dominio público, y `arrozal_terrazas`,
CC BY 4.0) que no se pudieron descargar por límite de tasa de Wikimedia. Ninguna es cultivo de
plátano ni de árbol; su ausencia no cambia el panorama.

---

## 3. Modos de fallo de la escena

Todas las corridas con `centinela count` y la `config.yaml` por defecto.

### 3.1 Cítrico en seto, satélite a 0,25 m/px

Heredado de `resultados-fase-1.md` §4. 110 detecciones donde hay ~350 árboles (exhaustividad ≈ 30 %).

**Causa: falta de resolución.** La copa mide ~15 px y el cítrico comercial se siembra en seto, así
que las copas forman una tira verde continua. El *watershed* no tiene de dónde separarlas.

### 3.2 Banano en dosel cerrado, dron a ~0,27 cm/px

`musa_bangladesh` reducida a 1008×756. **268 detecciones donde hay unas 60–90 matas.**

| Medición | Valor |
|---|---|
| Máscara de vegetación (`combo` + Otsu) | 56,7 % de la imagen |
| Vegetación real (verde dominante sobre rojo y azul) | **92,2 %** |
| Área de mancha mediana | 270 px |
| Área de una mata real (~150 px de diámetro) | ~17.700 px |

**Causa: no hay suelo.** El umbral de Otsu busca los dos modos dominantes del histograma, y todo
el pipeline asume que son *copa* y *suelo*. En dosel cerrado el único corte disponible es hoja
iluminada contra hoja sombreada. Las manchas resultantes son **65 veces más pequeñas que una
planta**: son pedazos de hoja. Con resolución de sobra.

Esta limitación ya estaba anticipada por escrito en `resultados-fase-1.md` §6. Ahora está medida.

### 3.3 Musa sobre pasto verde

Imagen de banco comercial con marca de agua, **descartada por derechos** — se procesó solo como
prueba técnica y no forma parte del banco. 700×618 px. **48 detecciones** donde hay cientos de matas.

| Medición | Valor |
|---|---|
| Máscara de vegetación | 38,1 % |
| Vegetación real | **98,1 %** |

**Causa: no hay contraste planta/fondo.** El entresurco es pasto verde, no suelo desnudo. El índice
`combo` separa "verde" de "no verde" y aquí todo es verde: cultivo verde oscuro sobre pasto verde
claro. La máscara colapsa y sobreviven 48 motas sueltas.

**Este es el modo de fallo más relevante para Saravena.** Arauca es trópico húmedo: un lote de
plátano allí tendrá pasto y arvenses entre surcos casi siempre.

### 3.4 Palma, dron cenital

Imagen aportada fuera del banco, 1500×999. **522 detecciones de 879 manchas.**

| Medición | Valor |
|---|---|
| Máscara de vegetación | 40,7 % |
| Vegetación real | 80,9 % |
| Área de mancha mediana | 152 px (12 px de lado) |
| Área de copa real (~60 px de diámetro) | ~3.000 px |

Es el mejor resultado real hasta la fecha: las detecciones caen mayoritariamente sobre copas. Pero
las manchas siguen siendo **20 veces más pequeñas** que una copa, y en el bloque denso hay varias
marcas por planta. El 522 es sobrecuenta por fragmentación, no conteo correcto.

---

## 4. Lectura de conjunto

| Escena | Premisa "verde sobre suelo no verde" | Resultado |
|---|---|---|
| Huerto sintético | Se cumple por construcción | F1 = 1,00 |
| Cítrico en seto (satélite) | Se cumple, pero sin resolución | Exhaustividad ≈ 30 % |
| Banano dosel cerrado | **No se cumple** — no hay suelo | Sobresegmenta ×65 |
| Musa sobre pasto | **No se cumple** — el fondo es verde | Subdetecta |
| Palma | Se cumple parcialmente | Sobrecuenta por fragmentación |
| Huerto USDA cenital | **Se cumple** | Segmenta bien y **aun así publica 6** de las 218 manchas (§5) |

**El pipeline funciona exactamente cuando se cumple su premisa, y esa premisa casi nunca se cumple
en el trópico húmedo.** Esto no invalida la Ruta A: delimita su dominio de validez, que es
justamente lo que un resultado negativo bien medido debe hacer.

Consecuencia directa: el salto a un detector entrenado (Ruta B, §5.11 del ROADMAP) deja de ser una
preferencia técnica y pasa a tener justificación empírica. En dosel cerrado y sobre fondo verde no
hay umbral que resolver, porque no hay nada que umbralizar — la tarea real es reconocer la
estructura de la roseta, y eso es reconocimiento de patrón.

> **Añadido tras el §5.** La última fila de la tabla se midió después y obliga a matizar el párrafo
> de arriba: no basta con que se cumpla la premisa. Incluso en la escena cooperativa el conteo
> publicado es indefendible, por una razón que no tiene que ver con el color sino con el clustering.
> El dominio de validez de la Ruta A, tal como está implementada hoy, es más estrecho que
> "donde se cumple la premisa": por ahora es el sintético.

---

## 5. La prueba de control — cuarto modo de fallo, y este sí es del código

Sesión del 2026-09-21, continuación. Ejecuta el primer pendiente de la sesión anterior: correr el
pipeline sobre las cuatro imágenes del USDA, la única condición real donde la premisa "verde sobre
fondo no verde" podría cumplirse, para separar *el código está roto* de *las escenas no le sirven*.

Reproducible con `python scripts/control_banco.py`.

### 5.1 El conjunto de control no era un conjunto de control

Primer hallazgo, antes de mirar métricas. Las descripciones del §2 se habían tomado del pie de foto
de la fuente. Al abrir las imágenes:

| Imagen | Descripción del §2 | Lo que realmente es |
|---|---|---|
| `huerto_hileras_usda` | Huerto joven sobre suelo desnudo | **Oblicua** — línea de horizonte, bosque al fondo, perspectiva fuerte |
| `huerto_reticula_usda` | Retícula de árboles, suelo visible | ✅ Cenital, árboles espaciados, franjas de pasto entre hileras |
| `huerto_surcos_usda` | Surcos con franjas de suelo | **No es un huerto** — suelo desnudo con franjas de pasto y dos árboles sueltos |
| `huerto_camino_usda` | Huerto con camino | **Oblicua**, con cielo y nubes en el tercio superior |

De las cuatro, **una sirve**. En las dos oblicuas el pipeline no tiene forma de funcionar aunque
todo lo demás estuviera bien: una copa cerca del horizonte mide una fracción de lo que mide la misma
copa en primer plano, así que el descriptor `area_px` deja de ser comparable entre manchas — y es
justo el descriptor sobre el que agrupa el DBSCAN. En `huerto_camino` la máscara además se traga el
cielo nublado y el bosque del fondo (61 % de la imagen en una sola mancha gigante).

> Lección de método: una imagen no entra al banco por lo que dice su pie de foto. Hay que abrirla.

### 5.2 Medición

| Imagen | px | Máscara | Veg. cruda | Verde real | Manchas | Ruido DBSCAN | Árboles |
|---|---|---|---|---|---|---|---|
| `huerto_hileras_usda` (oblicua) | 1024×767 | 29,0 % | 45,2 % | 62,2 % | 322 | **86 %** | 14 |
| `huerto_reticula_usda` (cenital) | 1024×683 | 21,7 % | 35,7 % | 57,3 % | 218 | **97 %** | 6 |
| `huerto_surcos_usda` (sin huerto) | 683×1024 | 21,6 % | 39,8 % | 43,2 % | 193 | **87 %** | 25 |
| `huerto_camino_usda` (oblicua) | 1024×767 | 61,0 % | 61,9 % | 55,3 % | 189 | **90 %** | 13 |
| `palma_aceite_rio` (casi cenital) | 1024×768 | 56,4 % | 51,8 % | 62,0 % | 197 | **79 %** | 36 |

La última fila se agregó el 2026-09-22, al revisar el banco completo (§2): es la segunda imagen del
banco donde la premisa se cumple, y repite el patrón de `huerto_reticula` — DBSCAN descarta casi
todo y el chequeo de estabilidad (§5.8) la marca *inestable* (el conteo va de 36 a 173 según `eps`).

### 5.3 El cuello de botella no es la máscara ni el watershed

Aquí está el aporte de la sesión. En `huerto_reticula` —la buena— las dos primeras etapas se
comportan:

- la máscara toma el 21,7 % de la imagen, un valor razonable para un huerto joven, y **no colapsa**
  como en el banano (§3.2) ni sobre pasto (§3.3);
- el *watershed* entrega **218 manchas** que caen sobre copas, con mediana de 394 px — del orden de
  una copa real, no 65 veces menor como en Musa.

Es decir: por primera vez sobre imagen real, la segmentación entrega algo utilizable. **Y aun así el
conteo publicado es 6.** El DBSCAN descarta 212 de 218 manchas como ruido y el "cluster dominante"
queda en seis miembros.

Los tres modos de fallo del §3 eran de la escena: la premisa no se cumplía y no había nada que hacer.
**Este es de la implementación.** La escena coopera y el conteo sale mal igual.

### 5.4 Por qué: `eps` no tiene punto de operación

Barrido sobre `huerto_reticula`, todo lo demás fijo (`python scripts/control_banco.py --eps …`):

| `eps` | Ruido | Clusters | Árboles |
|---|---|---|---|
| 0,8 (actual) | 97 % | 1 | **6** |
| 1,0 | 72 % | 4 | 36 |
| 1,2 | 31 % | 2 | 137 |
| 1,5 | 13 % | 1 | 190 |
| 2,0 | 3 % | 1 | 211 |
| 2,5 | 1 % | 1 | 215 |
| 3,0 | 0 % | 1 | 217 |
| 4,0 | 0 % | 1 | 218 |

El conteo recorre **de 6 a 218 sin una sola meseta**. No hay un rango de `eps` donde el resultado se
estabilice, que es lo que uno esperaría si existiera de verdad una nube compacta "copas" separada del
resto: el número de clusters nunca pasa de cuatro y a partir de 1,5 todo es un único cluster que se
va tragando el ruido. La curva no tiene rodilla; es una rampa.

Dicho de otro modo: **el parámetro no selecciona el conteo, el parámetro *es* el conteo.** Cualquier
valor que se elija va a estar justificado por el número que produce, no por una estructura en los
datos. Y sin verdad de terreno no hay forma de elegirlo.

~~En el sintético esto no se ve porque las copas son clones: la nube en el espacio de descriptores es
un punto y cualquier `eps` la captura entera.~~ **Falso — ver §5.6.** En el sintético esto no se veía
por una razón peor: con `eps = 0,8` DBSCAN no forma ningún cluster y el pipeline cae a "toda mancha
cuenta". El 80/80 nunca pasó por el clustering.

### 5.5 Consecuencia

El §4 decía que la Ruta A funciona cuando se cumple su premisa. Hay que matizarlo: **incluso cuando
se cumple, el paso de clustering no produce un conteo defendible.** Lo que separa copas de no-copas
en el sintético es que allí no hay nada que separar.

Esto refuerza la conclusión sobre la Ruta B (§5.11 del ROADMAP) por un segundo camino, independiente
del primero: no solo la premisa de color falla en trópico húmedo, sino que el mecanismo de decisión
—agrupar descriptores geométricos sin etiquetas— no discrimina sobre árboles reales.

Dos salidas posibles, ninguna cara:

1. **Quitar el DBSCAN del camino crítico.** Publicar el conteo de manchas del watershed con un filtro
   de área explícito y justificable, en vez de esconder la decisión dentro de un `eps` que nadie
   puede defender. Menos sofisticado y más honesto.
2. **Medir antes de decidir.** Anotar a mano `huerto_reticula` con `centinela annotate` y ver contra
   qué número hay que calibrar. Es la misma tarea que ya estaba en la lista, ahora con un caso
   concreto donde rinde de inmediato.

La salida 1 quedó implementada como `cluster.method: watershed` (§5.8). No se cambió el default: sin
verdad de terreno real no hay con qué justificar que 218 sea mejor que 6.

### 5.6 El sintético nunca ejercitó el DBSCAN

Sesión del 2026-09-22. Al barrer `eps` también sobre el sintético para tener el contraste, apareció
esto:

| `eps` | 0,3 | 0,5 | 0,8 | 1,0 | 1,2 | 1,5 | 2,0 | 2,5 | 3,0 |
|---|---|---|---|---|---|---|---|---|---|
| Árboles (`huerto_demo`) | 80 | 80 | **80** | 80 | 80 | 80 | 61 | 77 | 79 |
| Clusters formados | 0 | 0 | **0** | 0 | 0 | 0 | 1 | 1 | 1 |

Con la config por defecto **DBSCAN no forma ningún cluster**: las 80 manchas son ruido y el pipeline
cae al *fallback* de `cluster.py` ("si no hay cluster, toda mancha cuenta"). El 80/80 es el conteo
del watershed, sin filtrar.

Lo mismo pasa con `sep_topright`, el cítrico satelital de la Etapa I: sus 110 detecciones son también
fallback. **Todos los números publicados de la Etapa I los produjo el watershed; DBSCAN no votó en
ninguno.** El F1 = 1,00 sigue siendo cierto, pero lo que valida es la segmentación, no el clustering.

Por qué no lo detectó ningún test: el generador sintético no produce manchas distractoras (la sombra
oscurece la copa pero no forma mancha aparte), así que el watershed entrega exactamente 80 manchas
y el fallback acierta por construcción. El único test de DBSCAN (`test_cluster.py`) usa descriptores
inventados con varianza mínima, que no se parecen a los que salen de una imagen.

Corrección aplicada: el pipeline ahora registra **quién decidió el conteo** (`dbscan`, `fallback` o
`watershed`) y `centinela count` lo imprime. Un test documenta que en el sintético el conteo sale igual
con y sin DBSCAN.

### 5.7 Cuando sí hay algo que separar: maleza sintética

Para ver si DBSCAN funciona *cuando tiene algo que descartar*, el generador aceptó un parámetro nuevo:
`centinela make-synthetic OUT --weeds 25` siembra manchas de maleza entre hileras, con casi el mismo
verde y la misma luminancia que la copa — el pipeline la segmenta igual que al pasto real — pero de
forma irregular y alargada. La maleza no entra a la verdad de terreno.

Los descriptores sí separan las dos clases:

| Descriptor (media) | Copa | Maleza |
|---|---|---|
| Área (px) | 1085 | 225 |
| Excentricidad | 0,23 | 0,77 |
| Circularidad | 0,90 | 0,73 |
| Extent | 0,77 | 0,65 |
| Color L / a / b | 42 / −31 / 29 | 41 / −20 / 32 |

Y aun así, con los 7 descriptores de la Etapa I, DBSCAN no encuentra meseta: cae en fallback a
`eps = 0,8` (F1 = 0,82, cuenta la maleza como árbol) y solo acierta en un `eps` estrecho que no se
puede elegir sin conocer la respuesta. **Quitando los tres canales de color** —casi iguales entre
clases, que solo aportan ruido a las distancias— aparece la meseta:

| Configuración | Huerto limpio | Huerto con maleza | USDA real |
|---|---|---|---|
| Sin agrupar (watershed) | F1 1,00 | F1 0,82 | 218 |
| DBSCAN, 7 descriptores | F1 1,00 · *sin estructura* (fallback) | F1 0,82 · **inestable** | 6 · **inestable** |
| DBSCAN, solo forma | **F1 0,14** · **inestable** | **F1 1,00 · estable, meseta 80** | 176 · **inestable** |

Tres lecturas:

1. **DBSCAN sí sirve cuando hay grupos distintos y los descriptores correctos.** Con maleza y solo
   forma, descarta exactamente las 36 manchas de maleza y el conteo es estable en un rango de `eps`.
2. **El mismo ajuste destruye la escena sin maleza** (F1 = 0,14). La causa es el `StandardScaler`:
   reescala cada descriptor con la varianza *de la propia imagen*. Sin maleza, la varianza es solo la
   natural entre copas y `eps = 0,8` la corta en pedazos; con maleza, la varianza la domina la
   diferencia copa/maleza y las copas quedan compactas. **Un mismo `eps` significa cosas distintas en
   cada imagen**, y por eso ningún valor fijo sirve en todas.
3. **Sobre la imagen real no hay configuración estable.** No es un problema de descriptores: en USDA
   no hay dos grupos limpios que separar.

### 5.8 El guardarraíl: chequeo de estabilidad

De §5.4 y §5.7 sale un criterio que el pipeline puede aplicarse solo, sin verdad de terreno: si
existe estructura real, el conteo hace meseta en `eps`; si no, es una rampa. `centinela_core/stability.py`
barre `eps` sobre una grilla y da un veredicto:

- **estable** — ≥ 3 valores consecutivos de `eps` con el conteo dentro de ±5 % *y* DBSCAN
  descartando al menos 5 % de las manchas (una meseta por saturación, donde todo cae en un cluster,
  no cuenta);
- **inestable** — DBSCAN descarta, pero el conteo no se estabiliza;
- **sin estructura** — DBSCAN casi nunca descarta nada: el conteo lo decide el watershed.

Validación sobre las seis combinaciones con verdad de terreno de la tabla del §5.7: **el único
veredicto *estable* es el único caso con F1 = 1,00 decidido por DBSCAN.** El caso destructivo
(solo forma sobre huerto limpio, F1 = 0,14) sale *inestable*. Hay tests para ambos.

`centinela count` imprime ahora el veredicto en cada corrida y lo guarda en el manifiesto:

```
Árboles detectados: 6
Manchas totales:    218
Decidió el conteo:  DBSCAN (cluster dominante)
Estabilidad (eps):  INESTABLE — el conteo va de 6 a 190 según eps; no hay meseta
```

Además quedaron configurables `cluster.method` (`dbscan` | `watershed`) y `cluster.features`. Los
defaults no cambiaron: el sintético de las Etapas I y II da exactamente los mismos números.

---

## 6. Pendiente inmediato

- ~~Prueba de control sobre las cuatro imágenes del USDA.~~ **Hecha — §5.** Resultado: la
  segmentación está sana sobre escena cooperativa y el fallo está en el clustering.
- **Verdad de terreno sobre `huerto_reticula_usda`** (y después `palma_aceite_rio`).
  `centinela annotate` sobre esa imagen da el primer F1 honesto del proyecto fuera del sintético, y
  es lo único que permite decidir entre las dos salidas del §5.5. Subió de prioridad: ahora bloquea
  una decisión de diseño, no solo una métrica.
- **Normalización con escala fija en vez de `StandardScaler`** (§5.7, lectura 2). Si `eps` se mide
  en unidades con significado físico —área relativa a la copa esperada según el GSD, excentricidad
  tal cual— deja de depender de qué más haya en la imagen. Es la corrección de fondo al problema del
  §5.4, y se puede probar ya sobre el sintético con y sin maleza.
- ~~Revisar el resto del banco imagen por imagen.~~ **Hecho — §2.** De 9 imágenes, 2 sirven como
  control (`huerto_reticula_usda`, `palma_aceite_rio`); 4 son oblicuas.
- ~~**Detección de centros por simetría radial** como alternativa clásica sin etiquetas: la roseta de
  Musa y la copa de palma son radialmente simétricas y las nervaduras convergen en un punto.~~
  **Hecho el 2026-09-23 — `docs/resultados-centros.md`.** Convergencia de hojas para plátano y
  palma, mancha a escala de copa para copas redondas, escala por autocorrelación. Resuelve el modo
  de fallo del §3.3 (Musa sobre pasto verde) en sintético y en una foto real de platanal; no
  resuelve el del §3.2 (dosel totalmente cerrado) ni el huerto USDA sobre franjas de pasto.
