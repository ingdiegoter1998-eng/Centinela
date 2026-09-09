# Resultados — Etapa I: Conteo de árboles en una imagen

Documento vivo. Última actualización: 2026-09-08.
Alcance y criterios en `ROADMAP.md` §5. Plan de ejecución en `plan-fase-1.md`.

---

## 1. Qué se construyó

Paquete `centinela_core/` (Python puro, sin framework web) + CLI `centinela`:

| Comando | Qué hace |
|---|---|
| `centinela make-synthetic OUT.png` | Genera un huerto sintético con ground truth exacto |
| `centinela count IMG --debug` | Conteo → `*_detecciones.csv`, `*_overlay.png`, `*_manifest.yaml`, panel `*_debug.png` |
| `centinela eval IMG GT.csv --errors` | Precision / recall / F1 + error de conteo, overlay de TP/FP/FN |
| `centinela annotate IMG` | Marcar copas a mano (matplotlib) → `IMG_gt.csv` |

**Pipeline (Ruta A, sin modelos):**

```
imagen RGB
  → índice de vegetación `combo` (ExG + oscuridad) + umbral de Otsu
  → morfología (apertura / cierre / relleno de huecos / descarte de áreas pequeñas)
  → watershed sobre la transformada de distancia  (separa copas que se tocan)
  → descriptores por mancha (área, color medio en Lab, circularidad, excentricidad, extent)
  → DBSCAN sobre los descriptores estandarizados  → cluster dominante = árboles
  → conteo + centroides en píxeles + overlay
```

Dependencias: numpy, scipy, opencv, scikit-image, scikit-learn, pandas, matplotlib, pyyaml.
Todo CPU. 19 tests (`pytest -q`).

---

## 2. Aporte de esta etapa: el índice `combo`

El plan original usaba **ExG** (Excess Green) para la máscara de vegetación. Al probar sobre
imágenes aéreas reales se vio que ExG falla cuando la imagen está **desaturada** (satélite,
bruma, compresión): el verde de la copa casi desaparece y Otsu no logra separarla del suelo
(máscara casi vacía, 0–1 detecciones).

`combo` añade una segunda señal — la copa es **más oscura** que el suelo seco — y normaliza
cada señal (verde y oscuridad) por su propia separación de Otsu antes de sumarlas, de modo
que ninguna domina por el simple hecho de que la copa ocupe más o menos área. Resultado:

| Imagen | ExG (máscara) | `combo` (máscara) |
|---|---|---|
| Huerto sintético | 0.99 F1 | **1.00 F1** |
| Recorte real `sep_topright` | 1 detección | **110 detecciones** |

`exg` puro sigue disponible en `config.yaml` para imágenes de dron con verde intenso.

---

## 3. Validación sobre huerto sintético  ✅

El generador produce un huerto con retícula + jitter, copas de tamaño variable, sombra corta
de mediodía, gradiente de iluminación y ruido; el ground truth (centro de cada copa) es exacto.

**Caso principal — 8×10 = 80 árboles:**

| Métrica | Valor | Umbral (§5.8) |
|---|---|---|
| Precision | 1.00 | — |
| Recall | 1.00 | — |
| **F1** | **1.00** | (principal) |
| Error de conteo | **0.0 %** | < 10 % |
| Reproducible (2 corridas idénticas) | sí | sí |
| Robustez brillo ±20 % / ruido | recall ≥ 0.7 | no colapsa |

Los cuatro criterios de éxito del §5.8 se cumplen. El pipeline, sus parámetros y el arnés
de evaluación funcionan de punta a punta.

> El sintético valida la **mecánica** del pipeline con verdad de terreno exacta y controlada.
> No sustituye a una imagen real; la complementa.

---

## 4. Validación sobre imagen real  ⏳ pendiente de datos

**Imagen usada:** `data/samples/citricos_lindsay.jpg` — huerto de cítricos de Lindsay,
California (Esri World Imagery, ~0.25 m/px). Recorte `sep_topright.png`.

**Resultado:** con `combo` la máscara de vegetación captura bien el dosel, pero el **watershed
subsegmenta**: 110 detecciones donde hay ~350 árboles (recall ≈ 30 %). En las zonas donde las
copas están separadas con suelo visible el conteo es correcto; donde el dosel se cierra, varias
copas quedan en una sola mancha y no se separan.

**Causa:** el cítrico comercial se cultiva en **seto** (hedgerow) — las copas se tocan dentro
de la fila. A resolución de satélite (~0.25 m/px) eso se ve como tiras verdes continuas, no
como copas individuales. Es exactamente el **dosel cerrado que el §5.2 declara fuera de alcance**.

**Qué falta para cerrar el criterio real del §5.8** (cualquiera de los dos):

1. **Un frame del dron a baja altura.** A ~2 cm/px, incluso el cítrico en seto resuelve la
   estructura de cada árbol y las copas quedan separadas. Es la fuente de datos objetivo del
   proyecto.
2. **Un huerto público con copas genuinamente separadas** — cítrico joven, olivar, o parcela
   de secano — con conteo manual (`centinela annotate`).

Con esa imagen: `annotate` → `eval` → ajustar `config.yaml` mirando el panel `--debug` →
reportar P/R/F1 y error de conteo aquí.

---

## 5. Estado de los entregables (§5.7)

| Entregable | Estado |
|---|---|
| Paquete `centinela_core/` + CLI reproducible | ✅ |
| `config.yaml` con toda la parametrización | ✅ |
| `manifest.yaml` por imagen | ✅ (lo escribe `count`) |
| Arnés de evaluación P/R/F1 + error de conteo | ✅ |
| Validación sintética (§5.8) | ✅ F1 1.00 |
| Validación real de copas separadas (§5.8) | ⏳ pendiente de imagen |
| `docs/resultados-fase-1.md` | ✅ (este documento) |

---

## 6. Limitaciones conocidas

- **Dosel cerrado:** fuera de alcance por decisión (§5.2). Se retoma con la segmentación
  densa de la Etapa III.
- **Sin georreferencia:** posiciones en píxeles. Etapa I-B.
- **`combo` con `threshold: otsu`** asume que la copa y el suelo son los dos modos dominantes
  del histograma. Si la imagen es casi todo copa o casi todo suelo, conviene un `threshold`
  fijo ajustado a mano.
- **Validación real** hecha solo sobre recortes de una imagen de satélite; falta el frame
  del dron.
