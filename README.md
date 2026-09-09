# Proyecto Centinela

Plataforma de agricultura de precisión para Saravena, Arauca. UAV + visión por
computador + IA + análisis geoespacial, aplicados a los cultivos de la región.

Proyecto de estudiantes de Ingeniería en Inteligencia Artificial, UIS — Sede Saravena.
Se construye por etapas: la complejidad técnica crece al ritmo de la carrera.

- **Hoja de ruta completa:** [`ROADMAP.md`](ROADMAP.md)
- **Etapa actual — plan y resultados:** [`docs/plan-fase-1.md`](docs/plan-fase-1.md) · [`docs/resultados-fase-1.md`](docs/resultados-fase-1.md)
- **Página de adelanto:** <https://claude.ai/code/artifact/adb9ef22-b694-46af-8c5e-cc5a6457ad8b>

## Estado

| Componente | Estado |
|---|---|
| Landing pública (Fase 0.5) | 🟢 Implementada — `landing/` |
| Conteo de árboles en una imagen (Etapa I) | 🟢 Pipeline validado en sintético (F1 = 1.00, 19 tests) — falta validación sobre imagen real, ver [`docs/resultados-fase-1.md`](docs/resultados-fase-1.md) |
| Georreferencia + múltiples imágenes (Etapa I-B) | ⚪ Backlog — necesita dron con GPS |
| Detección de maleza en arroz (Etapa III) | 🟡 Próximo boss grande (~12 meses) |

## Estructura

```
proyecto-centinela/
├── landing/              Landing pública — React + Vite (estática, sin backend)
├── centinela_core/       Pipeline de conteo — Python puro (OpenCV / skimage / sklearn)
├── tests/                Suite pytest (19 tests)
├── config.yaml           Parámetros del pipeline
├── pyproject.toml        Paquete + CLI `centinela`
├── docs/
│   ├── plan-fase-1.md        Plan y estado de la Etapa I
│   ├── resultados-fase-1.md  Resultados y métricas de la Etapa I
│   └── adelanto/            Fuente de la página de presentación
└── ROADMAP.md            Hoja de ruta del proyecto
```

## Etapa I — conteo de árboles en una imagen

A partir de **una sola imagen RGB cenital** de una parcela de cítricos, cuenta las
copas y ubica cada una dentro de la imagen. Visión por computador clásica +
**DBSCAN** (clustering no supervisado) — sin GPS, sin georreferencia, sin modelos
entrenados. La georreferencia y el trabajo con múltiples imágenes se aplazan a la
Etapa I-B, cuando exista un dron con GPS.

```bash
python -m venv .venv
.venv\Scripts\activate                 # Windows  ·  source .venv/bin/activate en Linux/Mac
pip install -e ".[dev]"
pytest -q

centinela make-synthetic data/samples/huerto.png    # huerto sintético + ground truth
centinela count data/samples/huerto.png --debug      # conteo + overlay + panel de depuración
centinela eval  data/samples/huerto.png data/samples/huerto_gt.csv   # precision / recall / F1
centinela annotate IMG.jpg                           # marcar copas a mano → GT.csv
```

El pipeline vive en `centinela_core/` como paquete **Python puro**, sin dependencia
de ningún framework web, para que la Etapa III lo reutilice tal cual.

## Levantar la landing

```bash
cd landing
npm install
npm run dev          # desarrollo
npm run build        # producción → landing/dist/ (hosting estático)
```

## Requisitos

- Python 3.12+ (para `centinela_core`)
- Node 20+ (para la landing)

## Datos

Las imágenes de vuelo y las capturas de prueba **no están en el repositorio**
(`.gitignore`): pesan y algunas tienen restricciones de licencia. El generador
`centinela make-synthetic` produce datos de prueba reproducibles sin necesidad de
imágenes externas.
