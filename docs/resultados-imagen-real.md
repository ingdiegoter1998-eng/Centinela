# Resultados — Confrontación del pipeline con imagen real

Sesión del 2026-09-21. Complementa `resultados-fase-1.md` (Etapa I) y `resultados-fase-2.md` (Etapa II).

Hasta esta sesión el pipeline solo se había medido sobre huerto sintético (F1 = 1,00). Aquí se
confronta con imágenes aéreas reales de varios cultivos y condiciones. **El resultado es negativo
en los tres casos reales probados, y los tres fallan por motivos distintos.** Ese es el aporte del
documento: no es "no funcionó", es un mapa de en qué condiciones la Ruta A no puede funcionar.

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

Las imágenes **no van al repositorio** (`.gitignore` línea 30: pesan y tienen condiciones de uso).
Esta tabla es la ficha de procedencia para poder reconstruirlo.

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

Las URL de origen de cada una quedan en `data/samples/banco/PROCEDENCIA.csv` (local, no versionado).

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

**El pipeline funciona exactamente cuando se cumple su premisa, y esa premisa casi nunca se cumple
en el trópico húmedo.** Esto no invalida la Ruta A: delimita su dominio de validez, que es
justamente lo que un resultado negativo bien medido debe hacer.

Consecuencia directa: el salto a un detector entrenado (Ruta B, §5.11 del ROADMAP) deja de ser una
preferencia técnica y pasa a tener justificación empírica. En dosel cerrado y sobre fondo verde no
hay umbral que resolver, porque no hay nada que umbralizar — la tarea real es reconocer la
estructura de la roseta, y eso es reconocimiento de patrón.

---

## 5. Pendiente inmediato

- **Prueba de control sobre las cuatro imágenes del USDA.** Árboles espaciados sobre suelo desnudo:
  la única condición real donde la premisa sí se cumple. Responde si el código está sano y el
  problema son las escenas, o si está roto de raíz. Es el control que el proyecto nunca ha tenido
  fuera del generador sintético.
- **Detección de centros por simetría radial** como alternativa clásica sin etiquetas: la roseta de
  Musa y la copa de palma son radialmente simétricas y las nervaduras convergen en un punto.
- **Verdad de terreno real.** `centinela annotate` sobre cualquiera de las imágenes del banco
  produciría el primer F1 honesto del proyecto fuera del sintético.
