# Resultados — Etapa II: Caracterización del cultivo

Implementada el 2026-09-14. Alcance y criterios en `ROADMAP.md` §6.
Plan de ejecución en `plan-fase-2.md`.

---

## 1. Qué se construyó

Extensión de `centinela_core` sobre lo que ya dejó la Etapa I. Comando nuevo:

```bash
centinela characterize IMG.png [--config config.yaml]
# → IMG_estado.csv  (detecciones + z-scores + bandera + motivo)
# → IMG_estado.png  (overlay: verde = normal, ámbar = revisar, con el motivo)
```

| Módulo | Qué se añadió |
|---|---|
| `vegetation.py` | Índices `vari` y `gli` |
| `features.py` | `vari`, `gli`, `gap_fraction`, `solidity` por instancia |
| `health.py` | **Nuevo** — `robust_z()`, `characterize()`, `summary()` |
| `synthetic.py` | Inyección de árboles anómalos (4 tipos) con posición conocida |
| `viz.py` | `health_overlay()` |
| `cli.py` | Subcomando `characterize` |
| `config.yaml` | Sección `health:` |

El conteo de la Etapa I **no cambió**: `cluster.py` tiene su lista explícita
`FEATURE_COLS` y no mira los descriptores nuevos. Los 19 tests de la Etapa I siguen
pasando sin tocarse.

---

## 2. Resultados sobre huerto sintético

88 árboles, de los cuales **8 anómalos inyectados** a propósito (seed 7), rotando entre
los cuatro tipos de defecto:

| Tipo | Defecto | Métrica que debe dispararse |
|---|---|---|
| `small` | copa a la mitad del radio | `area` |
| `pale` | copa clorótica, poco verde | `vigor` |
| `gappy` | huecos perforados en la copa | `gap` |
| `bitten` | mordida en el borde | `solidity` |

| Métrica | Valor | Umbral (§6.8) |
|---|---|---|
| **Recall sobre anómalos** | **0.88** | ≥ 0.80 |
| **Falsos positivos entre sanos** | **8.7 %** | < 10 % |
| Tests automáticos | 36 / 36 | — |

---

## 3. Calibración del umbral

`z_threshold` se eligió midiendo, no a ojo:

| `z_threshold` | Recall | Falsos positivos |
|---|---|---|
| 2.0 | 0.88 | 13.8 % ✗ |
| **2.5** | **0.88** | **8.7 %** ✓ |
| 3.0 | 0.75 ✗ | 1.3 % |
| 3.5 | 0.75 ✗ | 0.0 % |

A 2.5 se conserva todo el recall y los falsos positivos caen por debajo del objetivo.
A partir de 3.0 se empiezan a perder anómalos reales. Queda como default en
`config.yaml`, ajustable por parcela.

---

## 4. El bug que encontró el test: el MAD colapsado

El plan original decía "z robusto = 0.6745·(x − mediana) / MAD". Al escribir el test de
direccionalidad (19 árboles idénticos + 1 más chico) salió que **no se marcaba nadie**.

La razón: cuando más de la mitad de los valores son idénticos, la mediana de las
desviaciones absolutas es **cero**, y la división queda degenerada. Es un caso
perfectamente alcanzable en un huerto muy uniforme — y el efecto es que el sistema
deja de marcar, en silencio.

`robust_z()` quedó con una escalera de estimadores de dispersión:

1. **MAD** — el normal, siempre que haya dispersión real.
2. **IQR / 1.349** — cuando el MAD colapsa.
3. **Desviación absoluta media** — último recurso.
4. Ceros, si no hay ninguna dispersión (nadie puede destacar).

---

## 5. Limitaciones conocidas

- **Es triage, no diagnóstico.** La bandera dice "revisar", nunca la causa. Con RGB no
  se distingue hongo de deficiencia de nitrógeno (ROADMAP §6.4).
- **Todo es relativo a la misma imagen.** Sin panel de calibración, los valores no son
  reflectancia real. No se pueden comparar dos fotos distintas.
- **`solidity` no ve huecos interiores**, solo irregularidad del contorno: las
  instancias vienen de la máscara ya rellenada por `binary_fill_holes`. Los huecos los
  mide `gap_fraction`, que se calcula contra la máscara **cruda**.
- **Sin validación sobre imagen real**, igual que la Etapa I. Llega con el vuelo del
  dron (Etapa I-B).
- **`min_trees: 5`** — por debajo de eso la mediana del huerto no significa nada y no se
  marca a nadie.
