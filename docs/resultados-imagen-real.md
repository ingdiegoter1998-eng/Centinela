# Resultados — Confrontación del pipeline con imagen real

Sesiones del 2026-09-21. Complementa `resultados-fase-1.md` (Etapa I) y `resultados-fase-2.md` (Etapa II).

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

| Archivo | Contenido | Autor | Licencia | Tamaño |
|---|---|---|---|---|
| `musa_bangladesh` | **Banano cenital** — única Musa del barrido | The Roving Rokibul | CC BY-SA 4.0 | 8064×6048 |
| `huerto_hileras_usda` | Huerto joven, árboles sobre suelo desnudo | USDA | PDM 1.0 | 1024×767 |
| `huerto_reticula_usda` | Retícula de árboles, suelo visible | USDA | PDM 1.0 | 1024×683 |
| `huerto_surcos_usda` | Surcos con franjas de suelo | USDA | PDM 1.0 | 683×1024 |
| `huerto_camino_usda` | Huerto con camino | USDA | PDM 1.0 | 1024×767 |
| `cultivo_hileras_wisconsin` | Hileras de cultivo cenital | Jules Verne Times Two | CC BY-SA 4.0 | 7524×5783 |
| `palma_aceite_rio` | Palma de aceite junto a río | DrLianPinKoh | CC BY 2.0 | 1024×768 |
| `palma_joven_suelo` | Palma joven sobre suelo desnudo | WWF Deutschland | CC BY-NC-SA 2.0 | 1024×683 |
| `palma_dosel` | Palma, dosel cerrado | unredd.photo | CC BY-NC 2.0 | 1024×576 |

Las URL de origen de cada una quedan en `data/samples/banco/PROCEDENCIA.csv`.

> **Corrección (§5).** Las descripciones de las cuatro del USDA se tomaron del pie de foto de la
> fuente y no de la imagen. Al inspeccionarlas una por una para la prueba de control resultó que
> solo `huerto_reticula_usda` es cenital con árboles espaciados; las otras tres no sirven como
> control. Ver §5.1.

**Notas de licencia.** Las cuatro del USDA son `PDM` (*Public Domain Mark*, marca de dominio
público): sin restricción. Las dos marcadas `NC` (*NonCommercial*, no comercial) sirven para uso
académico pero deben retirarse si el proyecto se comercializa. Las `BY-SA` exigen atribución y
compartir igual.

Se identificaron dos imágenes más (`campo_curvas_nivel`, dominio público, y `arrozal_terrazas`,
CC BY 4.0) que no se pudieron descargar por límite de tasa de Wikimedia. Ninguna es cultivo de
plátano ni de árbol; su ausencia no cambia el panorama.

---

## 3. Los tres modos de fallo

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

En el sintético esto no se ve porque las copas son clones: mismo tamaño, mismo color, misma forma.
La nube en el espacio de descriptores es un punto, cualquier `eps` la captura entera y `eps = 0,8`
parecía un valor sensato. Sobre árboles reales, con variación natural de tamaño, iluminación y
solape, esa nube se estira hasta ocupar todo el espacio y el criterio "cluster más numeroso" pierde
sentido.

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

---

## 6. Pendiente inmediato

- ~~Prueba de control sobre las cuatro imágenes del USDA.~~ **Hecha — §5.** Resultado: la
  segmentación está sana sobre escena cooperativa y el fallo está en el clustering.
- **Verdad de terreno sobre `huerto_reticula_usda`.** `centinela annotate` sobre esa imagen da el
  primer F1 honesto del proyecto fuera del sintético, y es lo único que permite decidir entre las dos
  salidas del §5.5. Subió de prioridad: ahora bloquea una decisión de diseño, no solo una métrica.
- **Revisar el resto del banco imagen por imagen**, como se hizo en §5.1, y corregir la tabla del §2.
  Las oblicuas deberían quedar marcadas como no aptas.
- **Detección de centros por simetría radial** como alternativa clásica sin etiquetas: la roseta de
  Musa y la copa de palma son radialmente simétricas y las nervaduras convergen en un punto.
