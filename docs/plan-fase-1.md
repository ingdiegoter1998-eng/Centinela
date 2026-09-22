# Plan de desarrollo — Etapa I: Conteo de árboles en una imagen

> Documento de **ejecución**. Define exactamente qué se construye en la próxima sesión.
> Alcance conceptual: `ROADMAP.md` §5. Nivel: visión clásica + DBSCAN. Sin modelos, sin
> Hugging Face, sin georreferencia, sin fine-tuning, sin framework web.

---

## 1. Objetivo (una línea)

Una imagen RGB cenital de un huerto de cítricos/palma → conteo de copas + centroides en
píxeles + grupos de similitud + overlay, validado contra conteo manual con precision /
recall / F1 y error de conteo.

---

## 2. Estructura del paquete

```
centinela_core/
├── __init__.py
├── config.py         # carga y valida config.yaml; dataclass con defaults
├── io.py             # cargar imagen, recorte de overlay, normalización, manifest
├── vegetation.py     # índice ExG + umbral Otsu → máscara binaria
├── morphology.py     # apertura / cierre / relleno de huecos / filtro de área
├── segment.py        # watershed sobre transformada de distancia → etiquetas de instancia
├── features.py       # regionprops → descriptores por mancha
├── cluster.py        # normalización + DBSCAN → cluster_id; selección del cluster dominante
├── pipeline.py       # orquesta: imagen → DataFrame de detecciones
├── evaluate.py       # emparejado espacial detecciones ↔ GT → TP/FP/FN, P/R/F1, error de conteo
├── viz.py            # overlay + panel de depuración (máscara, watershed, clusters)
└── synthetic.py      # generador de huertos sintéticos con GT exacto (para tests)

cli.py                # argparse: count | eval | annotate | make-synthetic
config.yaml           # todos los parámetros ajustables
pyproject.toml        # metadata + deps + entry point de consola `centinela`

data/
├── samples/          # imágenes de trabajo (gitignored; 1 sintética chica versionada)
├── ground_truth/     # CSV de puntos manuales: columnas x,y
└── manifests/        # manifest.yaml por imagen

tests/
├── test_vegetation.py
├── test_segment.py
├── test_cluster.py
├── test_evaluate.py
└── test_pipeline_synthetic.py    # end-to-end sobre imagen sintética con GT conocido

notebooks/
└── 01_exploracion.ipynb          # tuning visual interactivo (opcional)
```

`centinela_core/` va en la raíz del repo, junto a `landing/`.

---

## 3. Dependencias

```toml
# pyproject.toml
[project]
requires-python = ">=3.12"
dependencies = [
    "numpy>=1.26",
    "opencv-python-headless>=4.9",
    "scikit-image>=0.23",
    "scikit-learn>=1.4",
    "pandas>=2.2",
    "matplotlib>=3.8",
    "pyyaml>=6.0",
]

[project.optional-dependencies]
dev = ["pytest>=8", "ruff", "jupyter"]

[project.scripts]
centinela = "cli:main"
```

Instalación (Windows, Python 3.12):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
```

Todo CPU. Nada de torch, nada de GPU, nada de `rasterio`.

---

## 4. Contratos de datos

### Detección (fila del CSV de salida)

| columna | tipo | significado |
|---|---|---|
| `x_px`, `y_px` | float | centroide en píxeles |
| `area_px` | float | área de la mancha |
| `color_l`, `color_a`, `color_b` | float | color medio en CIELAB |
| `circularity` | float | 4πA/P² |
| `eccentricity` | float | [0, 1) |
| `extent` | float | área / área del bounding box |
| `cluster_id` | int | etiqueta DBSCAN; -1 = ruido |
| `is_tree` | bool | pertenece al cluster dominante |
| `lat`, `lon` | float | `NaN` en Etapa I — reservado para I-B |

### Ground truth (`GT.csv`)

Columnas `x, y` — un punto por copa, en píxeles de la misma imagen.

### Config (`config.yaml`)

```yaml
crop:
  overlay_bbox: null          # [x0, y0, x1, y1] o null para usar toda la imagen
vegetation:
  index: exg                  # exg | exgr | hsv
  threshold: otsu             # otsu | <float fijo 0-1>
morphology:
  open_radius: 3
  close_radius: 5
  min_area_px: 80
  fill_holes: true
watershed:
  min_distance_px: 15         # separación mínima entre picos ≈ radio de copa
  footprint_px: 7
features:
  color_space: lab
cluster:
  eps: 0.6
  min_samples: 8
  dominant: largest           # largest | densest
evaluate:
  match_radius_px: 12
```

---

## 5. Algoritmo, paso a paso

1. **Cargar + recortar.** Leer imagen (BGR→RGB), aplicar `overlay_bbox` si está.
2. **Máscara de vegetación.** ExG = 2·G − R − B sobre canales normalizados [0, 1]. Umbral
   Otsu (o fijo). Salida: máscara binaria.
3. **Morfología.** Apertura (quita motas) → cierre (une copa fragmentada) → relleno de
   huecos → descartar componentes < `min_area_px`.
4. **Watershed.** Transformada de distancia de la máscara → `peak_local_max`
   (`min_distance`) como marcadores → watershed → etiquetas de instancia. Separa copas que
   se tocan.
5. **Descriptores.** `skimage.measure.regionprops_table` por instancia: centroide, área,
   color medio en Lab (muestreado de la imagen original bajo la máscara de esa instancia),
   circularidad, excentricidad, extent.
6. **Clustering.** `StandardScaler` sobre los descriptores → `DBSCAN(eps, min_samples)`.
   Elegir el cluster dominante (más miembros, o mayor densidad). `is_tree = (cluster_id ==
   dominante)`. Los `-1` y otros clusters → outliers (sombra, maleza, suelo).
7. **Conteo.** `n = sum(is_tree)`. Centroides de esas instancias = las copas.
8. **Salida.** CSV de detecciones + overlay PNG (verde = árbol, rojo = outlier descartado)
   + panel de depuración opcional (original / máscara / watershed coloreado / clusters).

---

## 6. Arnés de evaluación (`evaluate.py`)

- Entrada: detecciones con `is_tree=True` + `GT.csv`.
- Emparejado: para cada punto GT, la detección libre más cercana dentro de
  `match_radius_px`. Greedy por distancia ascendente (Hungarian si hiciera falta).
- `TP` = emparejados · `FP` = detecciones sobrantes · `FN` = GT sin emparejar.
- `precision = TP/(TP+FP)` · `recall = TP/(TP+FN)` · `F1 = 2PR/(P+R)`.
- `count_error = |n_det − n_gt| / n_gt`.
- Salida: dict + impresión formateada + overlay de errores opcional (FP rojo, FN amarillo).

---

## 7. Imágenes de desarrollo (no bloquea esperar el dron)

- **(a) Generador sintético** (`centinela make-synthetic`): lienzo con textura de suelo +
  N círculos verdosos en rejilla con jitter, radio variable, algunas copas tocándose,
  sombras simuladas (elipses oscuras desplazadas), ruido. Devuelve imagen + `GT.csv`
  exacto. Uso: tests deterministas y chequeo de robustez (§5.8 del roadmap).
- **(b) 1–2 capturas reales públicas**: huerto de cítricos/palma en vista cenital de
  Google Earth o de un dataset abierto. Solo para tuning realista y ver dónde sufre el
  pipeline. No se versiona (derechos) — va en `data/samples/`, gitignored.
- **(c) La imagen del dron**: cuando exista, entra como una muestra más.

---

## 8. Orden de implementación (próxima sesión)

1. Andamiaje: `pyproject.toml`, estructura de carpetas, `config.py` + `config.yaml`,
   `cli.py` esqueleto. (`.gitignore` ya cubre `data/`, `.venv/`, etc.)
2. `synthetic.py` + `io.py` + test de carga y recorte.
3. `vegetation.py` + `morphology.py` + tests sobre sintética.
4. `segment.py` (watershed) + test: N copas conocidas → N instancias (±tolerancia), con
   copas separadas y con copas tocándose.
5. `features.py` + `cluster.py` + test: el cluster dominante recupera las copas, las
   sombras caen en outliers.
6. `pipeline.py` end-to-end + `test_pipeline_synthetic.py`: F1 ≥ umbral sobre sintética.
7. `evaluate.py` + tests de casos límite (0 detecciones, 0 GT, todo FP).
8. `viz.py` overlay + panel de depuración.
9. Correr sobre la captura pública real, mirar el panel, ajustar `config.yaml` (no el
   código).
10. `notebooks/01_exploracion.ipynb` para el tuning fino (opcional).

**Meta de la sesión:** pasos 1–8 completos y en verde sobre imagen sintética; paso 9
iniciado.

---

## 9. Anotación del ground truth

`centinela annotate IMG.jpg` → ventana matplotlib: clic izquierdo marca copa, clic derecho
deshace, tecla `s` guarda `IMG_gt.csv`. ~30 líneas. Suficiente para una imagen; si más
adelante hay muchas, se migra a labelme / CVAT.

---

## 10. Qué NO se hace en esta sesión

- Nada de georreferencia, EXIF, GSD, `rasterio`.
- Nada de DeepForest, SAM, torch, Hugging Face.
- Nada de Django, API, frontend.
- Nada de `gridprior` (prior de retícula) — segunda pasada solo si el conteo lo pide.
- No se entrena ni afina ningún modelo.

---

## 11. Estado final — etapa cerrada (2026-09-13) · reabierta (2026-09-22)

> **Reabierta el 2026-09-22.** El F1 = 1.00 de abajo lo produjo el watershed: DBSCAN no llegó a
> formar ningún cluster sobre el sintético. Criterios para volver a cerrarla en `ROADMAP.md` §5.8;
> hallazgos en `resultados-imagen-real.md` §5.

**Construido y verde** (resultados completos en `resultados-fase-1.md`):

- Paquete `centinela_core/` completo + CLI `centinela` (`count`, `eval`, `make-synthetic`,
  `annotate`). `count` ahora escribe también `*_manifest.yaml`.
- 19 tests pasando (`pytest -q`).
- **Sintético: F1 = 1.00, error de conteo 0 %** sobre 80 árboles. Los cuatro criterios del
  §5.8 se cumplen sobre sintético.
- **Índice `combo`** (nuevo): ExG + oscuridad, cada uno normalizado por su separación de
  Otsu. Resuelve el fallo de ExG sobre imágenes desaturadas (satélite/bruma). Es el default.
- Entorno: `.venv` con numpy 2.5, opencv 5.0, skimage 0.26, sklearn 1.9.

**Decisión de alcance (2026-09-08): solo copas separadas.** El dosel cerrado (cítrico en
seto visto desde satélite) queda fuera — se retoma en la Etapa III. Ver `ROADMAP.md` §5.2.

**Etapa cerrada.** Los cuatro criterios del §5.8 se cumplen sobre huerto sintético. La
medición sobre imagen real pasa a la Etapa I-B, junto con el vuelo del dron del que depende;
el arnés (`annotate` + `eval`) queda construido y listo para ese día.

## 12. Decisiones tomadas

- Alcance: **solo copas separadas** con suelo visible entre ellas.
- Cultivo objetivo: cítricos.
- CLI con `argparse` puro · salida CSV + PNG + `manifest.yaml` · paquete `centinela_core`
  en la raíz.
- Índice de vegetación por defecto: `combo` (antes `exg`).
- Imagen de desarrollo: recorte de imagen aérea pública (Esri World Imagery, Lindsay CA).
