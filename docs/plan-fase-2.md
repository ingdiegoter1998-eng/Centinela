# Plan de desarrollo — Etapa II: Caracterización del cultivo

> Documento de **ejecución**. Alcance conceptual en `ROADMAP.md` §6.
> Nivel: extensión de la Ruta A de la Etapa I. Sin modelos, sin NIR, sin georreferencia.

---

## 1. Objetivo (una línea)

Sobre las detecciones que ya produce la Etapa I, marcar qué árboles se apartan del
resto del huerto **en sentido negativo** (más chicos, menos verdes, con más huecos) y
decir cuál métrica lo disparó.

---

## 2. Qué se añade a `centinela_core`

| Archivo | Cambio |
|---|---|
| `vegetation.py` | Índices `vari` y `gli` (se suman al registro `INDEXES` existente) |
| `features.py` | Descriptores nuevos por instancia: `vari`, `gli`, `gap_fraction`, `solidity` |
| `health.py` | **Nuevo.** z-score robusto direccional + banderas |
| `synthetic.py` | Inyección de árboles anómalos con posición conocida (para poder testear) |
| `viz.py` | `health_overlay()` — verde = normal, ámbar = revisar |
| `cli.py` | Subcomando `characterize` |
| `config.py` / `config.yaml` | Sección `health:` |

Nada de esto toca el camino de la Etapa I: `cluster.py` tiene su lista explícita
`FEATURE_COLS`, así que añadir columnas al DataFrame **no** cambia el comportamiento
de DBSCAN ni el conteo.

---

## 3. Los cuatro descriptores

### `vari` y `gli` — vigor visual

```
VARI = (G − R) / (G + R − B)
GLI  = (2G − R − B) / (2G + R + B)
```

Se calculan por píxel sobre la imagen completa y luego se promedian sobre los píxeles
de cada instancia. VARI tiene un denominador que puede acercarse a cero: hay que
protegerlo y recortar el resultado a `[-1, 1]`. GLI es más estable (denominador siempre
positivo) pero menos sensible; por eso los dos, y el índice de vigor se elige en config.

### `gap_fraction` — huecos internos

```
gap_fraction = 1 − (píxeles de la instancia que son vegetación cruda) / (píxeles de la instancia)
```

**Detalle que importa:** `clean_mask()` ejecuta `binary_fill_holes`, así que para cuando
llegamos al watershed los huecos de la copa **ya están tapados**. La medición hay que
hacerla contra la máscara **cruda** (`result.veg`), no contra la limpia. Por eso
`extract_features()` recibe ahora `veg` como argumento opcional.

### `solidity` — irregularidad del contorno

`área / área_del_casco_convexo`, que `regionprops` ya calcula. Captura copas asimétricas
o mordidas por un costado; complementa a `gap_fraction`, que captura huecos interiores.

---

## 4. El z-score robusto direccional (`health.py`)

Para cada métrica, sobre los árboles del huerto (`is_tree == True`):

```
z_robusto = 0.6745 · (x − mediana) / MAD
```

`MAD` = mediana de las desviaciones absolutas. El factor `0.6745` la pone en la misma
escala que una desviación estándar para datos normales. Se usa mediana/MAD y no
media/desviación porque unos pocos árboles muy malos no deben arrastrar la referencia.

Después se orienta cada métrica hacia "peor":

| Métrica | Peor es… | `z_malo` |
|---|---|---|
| `area_px` | más chico | `−z` |
| vigor (`vari`/`gli`) | menos verde | `−z` |
| `gap_fraction` | más huecos | `+z` |
| `solidity` | menos sólida | `−z` |

**Bandera:** `revisar` si `z_malo > umbral` en al menos una métrica. Se guarda también
cuál(es) la dispararon.

> Esto es lo que distingue la Etapa II de la I: DBSCAN marca "distinto" en cualquier
> dirección, que es lo correcto para separar árbol de sombra. Aquí un árbol más grande o
> más verde que la mediana **no** es un problema.

**Casos borde:** `MAD == 0` pasa cuando más de la mitad de los árboles tienen el mismo
valor — la mediana de las desviaciones es entonces cero. Menos de `min_trees` árboles →
la mediana no significa nada; se devuelve todo `normal`.

> **Corregido durante la implementación.** El plan decía "si `MAD == 0`, no marcar
> nada". Eso resultó ser un fallo silencioso: en un huerto muy uniforme el sistema
> dejaría de marcar por completo. `robust_z()` quedó con una escalera de estimadores:
> **MAD → IQR/1.349 → desviación absoluta media → ceros**.

---

## 5. Contrato de salida

Columnas nuevas en el CSV de detecciones:

| columna | tipo | significado |
|---|---|---|
| `vari`, `gli` | float | índice de vigor medio de la copa |
| `gap_fraction` | float | `[0,1]`, fracción del área de copa sin vegetación cruda |
| `solidity` | float | `[0,1]`, área / área del casco convexo |
| `z_area`, `z_vigor`, `z_gap`, `z_solidity` | float | z robusto **ya orientado** (positivo = peor) |
| `flag` | str | `normal` \| `revisar` |
| `motivo` | str | métricas que dispararon, separadas por `;` (vacío si `normal`) |

---

## 6. `config.yaml` — sección nueva

```yaml
health:
  vigor_index: vari        # vari | gli
  z_threshold: 2.5         # cuántas desviaciones robustas para marcar
  metrics: [area, vigor, gap, solidity]   # cuáles se evalúan
  min_trees: 5             # por debajo de esto no se calculan estadísticos
```

El umbral **2.5 se calibró midiendo**, no a ojo: a 2.0 los falsos positivos suben al
13.8 %, y a partir de 3.0 el recall cae de 0.88 a 0.75. Tabla completa en
`resultados-fase-2.md` §3.

---

## 7. Sintético con anomalías

`make_orchard(..., n_anomalous=k)` inyecta `k` árboles deteriorados en posiciones
aleatorias conocidas, rotando entre **cuatro tipos de defecto — uno por métrica**, para
que el test las ejercite todas:

| Tipo | Defecto | Métrica que dispara |
|---|---|---|
| `small` | radio × 0.5 | `area` |
| `pale` | copa clorótica | `vigor` |
| `gappy` | 3 huecos perforados | `gap` |
| `bitten` | mordida en el borde (deja la instancia cóncava) | `solidity` |

Un solo defecto por árbol, no todos a la vez: si el mismo árbol fuera chico *y* agujereado,
la copa se fragmentaría y no se detectaría siquiera.

El GT gana columnas `anomalous` (bool) y `kind` (str). **Todos los sitios que llamaban
`gt.to_numpy()` pasan a `gt[["x","y"]].to_numpy()`** — hay que tocar
`test_pipeline_synthetic.py`, `test_vegetation.py` y `cli.py`.

---

## 8. Tests nuevos (`tests/test_health.py`)

1. **z robusto:** con datos conocidos, la mediana y el MAD dan lo esperado; `MAD=0` no
   revienta.
2. **Direccionalidad:** un árbol el doble de grande y más verde que el resto **no** se
   marca; uno la mitad de grande **sí**.
3. **End-to-end sobre sintético:** huerto de 80 sanos + 6 anómalos inyectados → recall
   de los anómalos ≥ 0.80 y falsos positivos entre los sanos < 10 % (§6.8).
4. **Huerto uniforme:** sin anomalías, casi nadie marcado.
5. **Pocos árboles:** con menos de `min_trees`, todo `normal`, sin excepción.

---

## 9. Orden de implementación

1. `vegetation.py`: `vari` + `gli`.
2. `features.py`: los cuatro descriptores + `veg` opcional en la firma.
3. `synthetic.py`: anomalías + columna `anomalous`; arreglar los call sites.
4. `health.py`: z robusto direccional + banderas.
5. `config.py` / `config.yaml`: sección `health`.
6. `viz.py`: `health_overlay()`.
7. `cli.py`: `characterize`.
8. `tests/test_health.py` + ajustar los tests existentes.
9. Correr todo: `pytest -q` y `ruff check`.

---

## 10. Estado — implementada (2026-09-14)

Los nueve pasos del §9 están hechos. 36 tests en verde, `ruff` limpio. Recall 0.88 y
8.7 % de falsos positivos sobre sintético, dentro de los umbrales del §6.8 del roadmap.
Resultados y calibración del umbral en `resultados-fase-2.md`.

Una corrección sobre el plan: el z robusto tal como estaba especificado (solo MAD)
fallaba en silencio cuando más de la mitad de los árboles tienen el mismo valor — el
MAD colapsa a cero y no se marca a nadie. Quedó con escalera MAD → IQR → desviación
absoluta media.

---

## 11. Qué NO se hace en esta etapa

- Nada de NIR, multiespectral ni térmico.
- Nada de diagnóstico de causa — la bandera dice "revisar", no "tiene hongo".
- Nada de comparar entre vuelos o fechas (eso es Etapa IV).
- Nada de sectores geográficos reales — sin georreferencia (I-B) un sector sería solo
  una rejilla en píxeles, y eso se deja para cuando haya coordenadas.
- Nada de calibración radiométrica: todo es relativo dentro de la misma imagen.
