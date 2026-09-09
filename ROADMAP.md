# Hoja de Ruta — Plataforma de Agricultura de Precisión en Saravena

### v2 · Documento de trabajo interno (contexto para el desarrollo con Claude Code)

---

## 0. Cómo usar este documento

Este documento es la **fuente de verdad conceptual del proyecto**. No es una propuesta formal para un asesor — es el mapa que tú y Claude Code van a usar sesión tras sesión para no perder el hilo.

Reglas de uso:

1. **No se construye infraestructura para una etapa futura antes de necesitarla.** Si estás en la Etapa I, no se monta PostGIS, no se diseña el backend del sistema de consulta, no se define el esquema del dataset completo. Eso se define cuando la etapa correspondiente esté activa.
2. **Cada etapa tiene un "estado"** (🟢 en curso, 🟡 próximo boss, ⚪ backlog, ❓ sin definir). Este documento se actualiza a medida que el estado cambia — no se reescribe desde cero cada vez.
3. **El lenguaje de "bosses" es intencional.** Sirve para mantener foco: hay un boss actual, un próximo boss ya identificado, y bosses de backlog que no se atacan todavía pero conviene tener mapeados para que las decisiones técnicas de hoy no los bloqueen sin querer.
4. **El boss final no está definido**, y eso es correcto — la Sección 12 explica por qué eso es parte del diseño del proyecto, no una omisión.

---

## 1. Visión general

Plataforma de agricultura de precisión para Saravena, Arauca, basada en UAV/drones, visión por computador, IA y análisis geoespacial. No parte de un problema agrícola único, sino de construir progresivamente una infraestructura capaz de **observar, caracterizar, detectar y eventualmente predecir** el comportamiento de los cultivos de la región.

Se desarrolla en paralelo a la carrera de Ingeniería en Inteligencia Artificial: la complejidad técnica del proyecto crece al ritmo en que crecen los conocimientos en matemáticas, estadística, ML, visión por computador y análisis de datos.

---

## 2. Concepto central

```text
CULTIVO → UAV → IMÁGENES/DATOS → PROCESAMIENTO GEOESPACIAL
        → VISIÓN POR COMPUTADOR → IA → {DETECCIÓN, PREDICCIÓN}
        → INFORMACIÓN GIS → TOMA DE DECISIONES
```

---

## 3. Principio rector: complejidad incremental

Cada boss resuelve un problema concreto y deja datos, código y metodología reutilizables para el siguiente. No se asume de entrada qué tecnologías serán necesarias (sensores multiespectrales, modelos avanzados, agentes conversacionales, infraestructura adicional) — su incorporación se condiciona a lo que las etapas anteriores demuestren que hace falta. **La tecnología está subordinada al problema, no al revés.**

---

## 4. Mapa de bosses

| # | Etapa | Nombre | Estado | Horizonte |
|---|-------|--------|--------|-----------|
| 0.5 | — | Landing page del proyecto | 🟢 Implementada — `landing/` | Hecho |
| 1 | I | Conteo de árboles en una imagen (visión clásica + DBSCAN) | 🟢 En curso | Ahora |
| 1b | I-B | Georreferencia, múltiples imágenes, modelos entrenados | ⚪ Backlog — necesita dron con GPS | Cuando haya dron |
| 2 | II | Caracterización del cultivo | ⚪ Soporte paralelo | Puede avanzar en paralelo a III |
| 3 | III | **Detección de maleza en arroz** | 🟡 Próximo boss importante | ~12 meses |
| 4 | IV | Series temporales y predicción | ⚪ Backlog | Año 3 |
| 5 | V/VI | Visión de integración a largo plazo | ⚪ Backlog, no comprometido | Sin fecha |
| — | — | Línea cacao/cadmio | ⚪ Backlog especulativo | Sin fecha |
| — | — | **Boss final** | ❓ No definido | Emergente (ver §12) |

---

## Fase 0.5 — Landing page del proyecto

> Esta sección es un **brief de contenido**, no la implementación. Define qué debe mostrar la landing y con qué tono.

**Estado:** implementada en `landing/` (React + Vite, estática, sin backend). El contenido vive en `landing/src/content.js`, separado del layout.

**Nombre del proyecto:** *Proyecto Centinela* — nombre público de cara afuera. El nombre técnico/descriptivo largo ("Plataforma de Agricultura de Precisión en Saravena") funciona como subtítulo o descripción, no como título principal.

**Público objetivo:** mixto — público general, comunidad académica y posibles colaboradores/instituciones a la vez. Debe entenderse sin conocimiento técnico previo, sin sacrificar rigor.

**Tono:** profesional pero cercano.

**Énfasis narrativo:** balance entre "dónde estamos hoy" y "hacia dónde va el proyecto" — no debe sentirse solo como visión a futuro, ni solo como estado actual.

**Quiénes somos:** proyecto de estudiantes de Ingeniería en Inteligencia Artificial, UIS Saravena. Se presenta en plural ("somos"), no como autor individual.

### Secciones que debe incluir (contenido, no maquetación)

1. **Hero / apertura** — nombre del proyecto (Proyecto Centinela) + una frase que explique en una línea qué hace y por qué importa para Saravena/Arauca, sin jerga técnica.
2. **Qué es el proyecto** — versión divulgativa de la visión general (§1): observar, caracterizar, detectar, predecir — sin el diagrama técnico completo.
3. **Qué será (visión)** — versión simplificada de la evolución conceptual del proyecto, sin comprometerse con fechas ni con arquitectura técnica de infraestructura.
4. **Las fases del proyecto** — resumen visual del mapa de bosses (§4): nombre de cada fase, una frase de qué resuelve, y su estado (en curso / próxima / futura). **No** debe incluir el detalle técnico interno (rutas A/B, pipelines, criterios de éxito numéricos) — eso vive en este documento de trabajo, no en la landing pública.
5. **Dónde estamos ahora** — estado real: Etapa I en curso (conteo de plantas por similitud visual sobre imágenes UAV), sin prometer fechas de entrega que no existen (el roadmap es autogestionado, sin cortes académicos fijos).
6. **Quiénes somos** — estudiantes de Ingeniería en IA, UIS Saravena, en plural.
7. **Cierre / contacto (opcional)** — espacio reservado para futuro contacto o colaboración; no es prioritario definirlo ahora.

### Explícitamente fuera de alcance para la landing

- Detalle técnico de arquitecturas de modelos (Ruta A / Ruta B, U-Net, YOLO, etc.) — pertenece al documento técnico interno.
- Diagramas de infraestructura (PostGIS, backend, LLM) de §9 — son visión especulativa; no deben aparecer como si fueran compromisos reales.
- Fechas de entrega — no existen fechas académicas fijas; no inventarlas para la landing.
- La línea de cacao/cadmio (§10) puede mencionarse a lo sumo como "línea de investigación futura", sin detalle — es especulativa.

---

## 5. 🟢 Boss actual — Etapa I: Conteo de árboles en una imagen

> Alcance recortado a propósito (ver §5.4). Nivel técnico: **visión clásica + DBSCAN**. Sin modelos entrenados, sin descargas de Hugging Face, sin georreferenciación, sin fine-tuning. Plan de ejecución detallado en `docs/plan-fase-1.md`.

### 5.1 Objetivo preciso

A partir de **una sola imagen RGB cenital** de una parcela de plantación uniforme (cítricos o palma, copas circulares en retícula regular), **contar automáticamente las copas de árbol presentes, agrupándolas por similitud de color, tamaño y geometría** para separar los árboles del cultivo del resto (sombras, maleza, suelo) — sin ningún modelo entrenado, sin GPS y sin georreferenciación.

El componente de "aprendizaje" de esta etapa es **DBSCAN** (clustering no supervisado) sobre los descriptores de cada mancha detectada. No se entrena nada, no se descarga ningún modelo.

### 5.2 Alcance — qué SÍ incluye la Etapa I

- **Una imagen** cenital (cámara a ~90° hacia abajo) de una parcela de plantación uniforme.
- Un solo tipo de planta dominante, en filas o patrón regular.
- Conteo basado en **similitud visual** (color + tamaño + geometría de copa), no en reconocimiento de especie.
- Salida: conteo total + posición en **píxeles** de cada copa detectada + a qué grupo de similitud pertenece + imagen con las detecciones dibujadas encima.
- Validación contra conteo manual de **esa misma imagen**: precision / recall / F1 + error de conteo.

**Cultivo objetivo:** cítricos — copas circulares, **separadas con suelo visible entre ellas**, en retícula de siembra regular.

**Fuente de imagen actual:** frame capturado del video que el dron transmite al celular (el dron disponible no guarda a microSD). Resolución modesta (~720–1080p), con posible compresión y overlay de la app que hay que recortar. Ver §5.10.

**Régimen de copa separada (decisión de alcance, 2026-09-08):** la Etapa I asume que cada copa está rodeada de suelo visible — que es lo que produce un vuelo de dron a baja altura. El **dosel cerrado** (copas que se tocan formando tiras continuas, típico de cítrico comercial visto desde satélite) queda **fuera**: ahí ni el watershed ni la retícula separan árbol por árbol sin un modelo. Ese caso se retoma con la segmentación densa de la Etapa III.

### 5.3 Explícitamente fuera de alcance

- **Georreferenciación / coordenadas del mundo real.** La posición es en píxeles dentro de la imagen. Georreferencia = Etapa I-B (§5.11).
- **Múltiples imágenes, ortomosaico, deduplicación de solape.** Una imagen no tiene solape consigo misma — el problema no existe en esta etapa.
- **Modelos pre-entrenados (DeepForest, SAM) o de Hugging Face.** Documentados como comparación futura en §5.11; no se usan ahora.
- **Fine-tuning / detector entrenado (YOLO, etc.).** Necesita varias imágenes para entrenar y validar con hold-out. Etapa I-B.
- **Dosel cerrado / copas que se tocan formando tiras continuas.** Ver nota de régimen en §5.2. Se retoma en la Etapa III.
- Clasificación de especie o variedad.
- Vegetación mixta o bosque natural.
- Evaluación de salud, vigor o estrés — eso es Etapa II.
- Detección de maleza — eso es Etapa III.

### 5.4 Por qué una sola imagen (qué se gana y qué se aplaza)

Restricción real: hoy no hay dron con GPS ni presupuesto para uno. El dron disponible (~$40) solo transmite video al celular. En vez de bloquear la etapa, se recorta al núcleo.

**Lo que elimina** (a favor):

- El problema más difícil de la etapa: el doble conteo entre fotos que se solapan (fotogrametría, ortomosaico, homografías, GPS). Todo eso desaparece.
- La dependencia de hardware que no se tiene.

**Lo que aplaza** (costo asumido, va a Etapa I-B):

- El entregable "mapa de densidad georreferenciado" pasa a ser "imagen anotada + conteo + coordenadas en píxeles".
- La validación de generalización entre parcelas/vuelos distintos. Con una imagen se valida que el pipeline funciona sobre esa imagen; que generalice se prueba en I-B con más imágenes.
- El código de georreferencia que la Etapa III necesita — se difiere junto con el resto, pero no se elimina (§5.9).

**Decisión de formato para no reescribir después:** cada detección se guarda con `(x_px, y_px)` + descriptores + un campo vacío `(lat, lon)`. Así, añadir georreferencia en I-B es aditivo, no una reescritura.

### 5.5 Enfoque técnico — Ruta A (visión clásica + DBSCAN)

Única ruta de esta etapa. Sin entrenar nada, iteración rápida, resultado interpretable.

```text
Máscara de vegetación (índice `combo` sobre RGB, umbral por Otsu)
 → limpieza morfológica (apertura / cierre / relleno de huecos)
 → separación de copas que se tocan (watershed sobre transformada de distancia)
 → extracción de manchas → descriptores por mancha (área, color medio en Lab, circularidad, excentricidad)
 → DBSCAN sobre los descriptores normalizados
 → el cluster dominante = árboles del cultivo; el resto (sombra, maleza, suelo) se descarta
 → conteo + centroides + overlay
```

**Índice de vegetación `combo` (implementado):** la copa se distingue del suelo por dos señales — es **más verde** (ExG) y **más oscura** (el suelo seco refleja más). `combo` normaliza cada señal por su propia separación de Otsu y las suma, así funciona tanto con imágenes de dron (verde vivo, manda ExG) como con imágenes aéreas desaturadas (verde casi nulo, manda la oscuridad) sin re-parametrizar. `exg` puro sigue disponible en `config.yaml`.

**Por qué DBSCAN y no umbrales a mano:** si los umbrales de tamaño y forma se fijan manualmente, el clustering casi no aporta. Su valor es que **fija los umbrales solo**: encuentra el grupo compacto de manchas parecidas entre sí (las copas del cultivo, que son visualmente muy uniformes) y marca todo lo demás como outlier. Eso es lo que cumple el §5.1 de "sin modelo entrenado".

**Ayudas específicas para cítricos/palma:**

- **Copas que se tocan:** watershed sobre la transformada de distancia de la máscara. Remedio clásico, Ruta A pura.
- **Prior de retícula:** la siembra es regular. Detectar el espaciamiento dominante (FFT o autocorrelación sobre los centroides) da un chequeo de cordura del conteo casi gratis, y permite señalar copas obviamente faltantes en la reja. Se implementa en una segunda pasada solo si el conteo lo necesita.
- **Enemigo #1: las sombras.** El término de oscuridad de `combo` podría arrastrarlas; se mantiene a raya porque la sombra sobre suelo no es verde (ExG bajo) y DBSCAN la empuja al grupo de outliers por color y forma distintos. En pruebas con sombra corta de mediodía no es un problema.

**Ruta B (futuro, Etapa I-B):** detector entrenado. Ver §5.11.

### 5.6 Pipeline técnico

```text
Imagen RGB (una) → [recorte de overlay de la app] → máscara de vegetación (ExG + Otsu)
 → morfología → watershed (separar copas pegadas) → manchas + descriptores
 → DBSCAN (cluster dominante = cultivo) → conteo + centroides en píxeles
 → overlay PNG + tabla CSV (x_px, y_px, cluster_id, área, ...)
```

### 5.7 Entregable concreto

- Paquete Python `centinela_core/` (puro, sin framework web) + CLI reproducible:
  - `centinela count IMG.jpg` → conteo + `IMG_overlay.png` + `IMG_detecciones.csv`
  - `centinela eval IMG.jpg GT.csv` → precision / recall / F1 + error de conteo
- Un archivo de configuración (`config.yaml`) con todos los parámetros ajustables (método de umbral, tamaños de kernel morfológico, `min_distance` del watershed, `eps` / `min_samples` de DBSCAN, filtros de tamaño de mancha). Requisito de reproducibilidad.
- `manifest.yaml` por imagen con la metadata mínima (§11), aunque sea parcial.

**Decisión de arquitectura:** el pipeline vive en `centinela_core/`, paquete **Python puro** (OpenCV / numpy / scikit-image / scikit-learn) más un CLI, sin dependencia de ningún framework web ni de `rasterio` (no hay georreferencia todavía). Django entra solo cuando haya resultados que valga la pena servir y persistir. Esto mantiene el núcleo reutilizable tal cual por la Etapa III (§5.9).

### 5.8 Criterios de éxito medibles

Contra conteo manual de la misma imagen:

- **Precision / recall / F1** sobre detecciones emparejadas espacialmente (centroide detectado ↔ punto manual más cercano dentro de un radio de tolerancia ≈ medio radio de copa). Métrica principal. No basta el error de conteo agregado: 50 falsos positivos + 50 falsos negativos sobre 500 dan 0 % de error neto y esconden un pipeline malo. F1 es también lo que pide la Etapa III (§7.5), se construye una sola vez.
- **Error relativo de conteo** `|n_detectado − n_manual| / n_manual`, reportado siempre junto al F1. Umbral: <10 %.
- **Reproducibilidad:** correr el CLI dos veces sobre la misma imagen y config da resultado idéntico; toda la parametrización está en `config.yaml`, nada hardcodeado.
- **Robustez básica:** el pipeline no se cae ni degrada catastróficamente sobre variaciones sintéticas de la imagen (brillo global ±20 %, ruido gaussiano) — chequeo con imágenes generadas.

**Estado (2026-09-08):** los cuatro criterios se cumplen sobre **huerto sintético** (F1 = 1.00, error de conteo 0 %, 19 tests). La validación sobre **imagen real de copas separadas** queda pendiente de datos: las imágenes de satélite de cítrico comercial son de dosel cerrado (fuera de alcance, §5.2) y no sirven; se cierra cuando haya un frame del dron o un huerto público con copas genuinamente separadas. Resultados completos en `docs/resultados-fase-1.md`.

La validación de **generalización entre parcelas distintas** se aplaza a la Etapa I-B.

### 5.9 Por qué importa más allá de sí mismo

El pipeline imagen → máscara de vegetación → segmentación de instancias (watershed) → descriptores → clasificación por similitud es la base técnica directa de la Etapa III: mismo procesamiento, cambiando el paso final de "¿esta mancha pertenece al cluster del cultivo?" por "¿esta zona es cultivo, maleza o suelo?". El arnés de evaluación (emparejado espacial → P/R/F1) se reutiliza tal cual. No es un ejercicio aislado — es la base técnica del próximo boss.

### 5.10 Cómo capturar la imagen

Con el dron actual (transmite al celular, no guarda a microSD):

- **Grabar el video** del sobrevuelo y extraer un frame nítido después, mejor que intentar una captura en el momento.
- **Cámara lo más cerca de 90° hacia abajo posible.** Una inclinación pequeña se tolera; 45° no.
- **Vuelo lo más estable y alto posible** dentro de lo que permita el dron, en un momento de poco viento. Cuanto más alto, más copas entran y menos varía la escala dentro del frame.
- **Cerca del mediodía solar** (10–14 h) o con nublado uniforme, para minimizar sombras largas — son el enemigo #1 de la Ruta A.
- **Recortar** cualquier overlay de telemetría de la app antes de procesar (el pipeline incluye un paso de recorte configurable).
- **Conteo manual de referencia** sobre el frame elegido: marcar el centro de cada copa (herramienta simple de clics incluida en el repo) → `GT.csv`.

Si el dron no da un frame cenital usable, el pipeline se desarrolla igual con (a) imágenes sintéticas para los tests y (b) una captura pública de un huerto (Google Earth / dataset abierto) como referencia realista. Ver `docs/plan-fase-1.md`.

### 5.11 Etapa I-B — georreferencia y modelos (futuro, cuando haya dron con GPS)

No se ataca ahora. Se deja mapeado para que las decisiones de hoy no lo bloqueen:

- **Georreferenciación:** con un dron que escriba GPS en el EXIF, convertir centroides de píxel a coordenadas usando GSD + altura + orientación. `GSD = (altura × ancho_sensor) / (focal × ancho_px)`. Ojo: el GPS de consumo sin RTK tiene error de 1–3 m y la altitud barométrica deriva; no confiar el conteo final a deduplicación por GPS puro.
- **Múltiples imágenes y solape:** ortomosaico con OpenDroneMap, o deduplicación por homografía (features SIFT/ORB entre frames). Recomendación: solape ~75 % frontal / ~65 % lateral desde el primer vuelo con GPS.
- **Comparación con modelos pre-entrenados (zero-shot):** DeepForest (`weecology/deepforest-tree`, Hugging Face, MIT) y SAM/SAM2 como baselines contra la Ruta A, con el mismo arnés de evaluación. Mini-estudio defendible.
- **Ruta B — detector entrenado:** YOLO o DeepForest afinado con ~200–500 copas etiquetadas a mano de los propios vuelos. Requiere varias imágenes para entrenar y validar con hold-out honesto. Es la evolución si la Ruta A no alcanza la precisión objetivo.
- **Protocolo de vuelo** (cuando exista el dron): exposición y balance de blancos en manual bloqueados; volar 10–14 h o con nublado; registrar altura y GSD objetivo antes de despegar.

---

## 6. ⚪ Etapa II — Caracterización del cultivo (soporte, en paralelo)

**Pregunta que responde:** no "qué existe", sino "cómo está" el cultivo — vigor vegetal, cobertura, variabilidad espacial, estrés hídrico, anomalías, diferencias entre sectores.

**Nota de dependencia:** esta etapa **no es un bloqueante estricto** para atacar la Etapa III. La detección de maleza puede arrancar principalmente con lo que deja la Etapa I (imágenes + georreferenciación) más un nuevo modelo de segmentación. Etapa II puede avanzar en paralelo, alimentando a III con mapas de vigor que ayuden a interpretar por qué una zona tiene más infestación que otra, pero no es requisito de entrada.

---

## 7. 🟡 Próximo boss (~12 meses) — Etapa III: Detección y cuantificación de maleza en arroz

Esta es la pieza que **se define ahora, aunque no se ataque todavía**. Vale la pena dejarla completamente especificada para que, cuando llegue el momento, no se pierda tiempo re-pensando el problema desde cero.

### 7.1 Por qué es un boss importante (y no el final)

- Es **autocontenido**: no depende de series temporales (Etapa IV) ni de datos históricos multiespectrales (Etapa V) para tener valor. Un solo vuelo + un modelo de segmentación ya produce un mapa de infestación útil.
- Tiene **métrica de éxito clara** y aplicación práctica directa: manejo localizado de herbicida en vez de aplicación uniforme sobre toda la parcela.
- El arroz es un cultivo real y relevante en Arauca — la pertinencia regional no necesita apoyarse en la retórica de "inteligencia agrícola" de etapas posteriores.
- Es **defendible como tesis por sí solo**, sin necesitar que el resto de la hoja de ruta avance al mismo ritmo. Pero no se trata como el boss final del proyecto — es un hito fuerte de mitad de camino.

### 7.2 Definición del problema

Distinguir espacialmente entre **cultivo / maleza / suelo** dentro de una parcela de arroz, y traducir esa clasificación en un **mapa de infestación por sector**, no solo en una clasificación de imagen.

Ejemplo del tipo de salida esperada:

```text
Parcela: 4,2 ha — Infestación total: 11,8 %
Sector A: 2,1 %   Sector B: 7,4 %   Sector C: 24,7 %
```

### 7.3 Enfoque técnico propuesto (a validar cuando se active la etapa)

- **Filtro inicial barato:** índices de vegetación derivados de RGB (ExG, ExGR u otros índices que no requieran sensor multiespectral) para una primera separación vegetación/suelo antes de invertir en un modelo pesado.
- **Segmentación semántica:** arquitecturas candidatas — U-Net como baseline razonable por su desempeño en datasets pequeños, DeepLabV3+ o Mask R-CNN si el volumen de datos etiquetados lo justifica.
- **Transfer learning:** partir de encoders preentrenados (ImageNet u otros) dado que el dataset propio será pequeño al inicio.
- **Etiquetado:** máscaras a nivel de píxel (no solo bounding boxes), porque la salida final es un porcentaje de área infestada por sector, no solo "hay o no hay maleza".
- **Multiespectral:** se evalúa como mejora posterior, no como requisito de entrada — coherente con el principio de la Sección 3.

### 7.4 Qué necesita existir antes de atacarlo

- Pipeline de vuelo → imágenes → georreferenciación funcionando (hereda de Etapa I-B).
- Acceso a una parcela de arroz real para captura de datos y etiquetado.
- Criterio de validación: comparación contra conteo/estimación manual de infestación en campo.

### 7.5 Criterios de éxito

- Métricas de segmentación por clase (IoU, F1) reportables.
- Error del % de infestación estimado vs. referencia de campo, por sector.
- Mapa de infestación georreferenciado como entregable visual, no solo tabla de métricas.

---

## 8. ⚪ Etapa IV — Análisis temporal y predicción (backlog, año 3)

Transición de imágenes individuales a series temporales (múltiples vuelos sobre la misma parcela). Preguntas de investigación candidatas: qué variables explican mejor la evolución del cultivo, si puede predecirse el crecimiento de una infestación, si una anomalía puede detectarse antes de ser visible, cuánto mejora un modelo con historial, y qué tan bien generaliza entre parcelas distintas.

No se detalla más a fondo hasta que la Etapa III esté resuelta — su diseño depende de qué datos y modelos hayan quedado disponibles.

---

## 9. ⚪ Visión de integración a largo plazo (backlog, sin compromiso técnico)

Lo que sí vale la pena dejar anotado como intención, sin comprometerse a ello:

- **Infraestructura:** eventualmente los datos y modelos de cada etapa necesitarán un lugar común de almacenamiento con metadatos consistentes (fecha/hora de vuelo, ubicación, cultivo, sensor, altura de vuelo, modelo y versión usados, métricas de validación). Se diseña cuando haya más de una etapa produciendo datos que necesiten convivir.
- **Dataset regional:** la construcción progresiva de un dataset georreferenciado de Saravena es un activo científico valioso a largo plazo, pero su esquema se define con datos reales de al menos dos etapas, no de forma especulativa.
- **Interfaz de consulta en lenguaje natural:** una capa conversacional sobre datos y modelos verificables (no un LLM que "adivine" sobre el cultivo) tiene sentido solo cuando exista suficiente infraestructura madura debajo. Es una capa de interacción, no el núcleo del proyecto.

Describir hoy el esquema de PostgreSQL/PostGIS o la arquitectura de un LLM conversacional sobre datos que todavía no existen le resta credibilidad al documento y no aporta nada accionable en este momento.

---

## 10. ⚪ Línea de investigación especializada: cacao y metales pesados (backlog especulativo)

Hipótesis a estudiar: si características espectrales, fisiológicas, ambientales y geográficas permiten **estimar indirectamente** el riesgo de acumulación de cadmio en cultivos de cacao, usando muestras de laboratorio como referencia para entrenar y validar modelos.

```text
UAV → Información espectral → Características de la planta
→ Muestras de laboratorio → Modelo estadístico/ML → Estimación espacial del riesgo
```

Se trata explícitamente como **problema de investigación abierto**, no como capacidad asumida del sistema. Su viabilidad depende de resultados experimentales y de disponibilidad real de datos de laboratorio representativos — no se compromete recurso alguno a esta línea hasta que eso se confirme.

---

## 11. Convenciones mínimas de datos (para no tener que rediseñar después)

Aunque el dataset regional completo (§9) no se diseña todavía, conviene que **desde la Etapa I** cada captura registre lo mínimo necesario para no perder trazabilidad más adelante. En la Etapa I varios de estos campos serán parciales o desconocidos (dron sin telemetría útil) — se anota lo que se sepa:

- fecha/hora de la captura, ubicación (finca/parcela), cultivo y variedad si aplica
- dispositivo usado, altura de vuelo aproximada, resolución espacial aproximada (GSD) si se puede estimar
- condiciones ambientales relevantes al momento de la captura (hora solar, nublado/despejado)
- versión del pipeline usada para procesar esa imagen, y métricas obtenidas

**Formato:** un `manifest.yaml` por imagen, no solo nombres de carpeta. Cuesta lo mismo de mantener y es parseable — cuando llegue §9 los metadatos ya están estructurados en vez de tener que reconstruirlos de nombres de archivo.

Esto no es una arquitectura de base de datos — es una convención que cuesta poco mantener desde ya y evita trabajo de limpieza retroactiva.

---

## 12. Sobre el boss final (y por qué no está definido)

El proyecto no define de antemano cuál etapa será la tesis de grado. La tesis podrá surgir de cualquiera de las líneas que, tras la experimentación acumulada, demuestre mayor relevancia científica y viabilidad técnica — muy probablemente la Etapa III (maleza en arroz) sea una candidata fuerte precisamente por ser autocontenida y defendible por sí sola, pero eso se confirma con resultados, no se decreta ahora.

**No se construye primero la tesis y después el camino. Se construye el camino que permite descubrir cuál debe ser la tesis.**
