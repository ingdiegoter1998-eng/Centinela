# Proyecto Centinela

Plataforma de agricultura de precisión para Saravena, Arauca. UAV + visión por
computador + IA + análisis geoespacial, aplicados a los cultivos de la región.

Proyecto de estudiantes de Ingeniería en Inteligencia Artificial, UIS — Sede Saravena.
Se construye por etapas: la complejidad técnica crece al ritmo de la carrera.

- **Hoja de ruta completa:** [`ROADMAP.md`](ROADMAP.md) · resumen visual para el equipo: <https://claude.ai/artifact/SF1jDjsshuLq9YmPrq1S9s>
- **Etapa actual (I, reabierta) — plan y resultados:** [`docs/plan-fase-1.md`](docs/plan-fase-1.md) · [`docs/resultados-fase-1.md`](docs/resultados-fase-1.md) · [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md)
- **Presentación:** [adelanto](https://claude.ai/artifact/NTF6K524ypXfsVZiqbGdk6) · [diapositivas](https://claude.ai/artifact/V4NDYPXa7zK4qqJAeULorT) · [guion de exposición](https://claude.ai/artifact/TVDWNvUEYSyEWpGnyHVMzC) — fuentes en `docs/adelanto/`
- **Demo en vivo:** doble clic en `demo\iniciar.bat` · guion en [`docs/demo-en-vivo.md`](docs/demo-en-vivo.md)

## Estado

| Componente | Estado |
|---|---|
| Landing pública (Fase 0.5) | 🟢 En línea — <https://ingdiegoter1998-eng.github.io/Centinela/> · fuente en `landing/` |
| Conteo de árboles en una imagen (Etapa I) | 🟠 Reabierta — el F1 = 1.00 del sintético lo produce el watershed; DBSCAN no llegaba a decidir. El pipeline ahora reporta quién decidió y si el conteo es estable. Ver [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md) §5 |
| Caracterización del cultivo (Etapa II) | ✅ Implementada — recall 0.88 / 8.7 % FP en sintético; sobre imagen real hereda el estado de la Etapa I. Ver [`docs/resultados-fase-2.md`](docs/resultados-fase-2.md) |
| Validación con dron propio + georreferencia (Etapa I-B) | ⚪ Backlog — necesita dron con GPS. La validación con imagen real *pública* se adelantó a la Etapa I: [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md) |
| Detección de maleza en arroz (Etapa III) | 🟡 Próximo boss grande (~12 meses) |

## Estructura

```
Centinela/
├── landing/              Landing pública — React + Vite (estática, sin backend)
├── centinela_core/       Pipeline de conteo — Python puro (OpenCV / skimage / sklearn)
├── tests/                Suite pytest (52 tests)
├── scripts/              Mediciones reproducibles fuera del CLI
├── demo/                 App de demo en vivo (Streamlit) + lanzador para Windows
├── config.yaml           Parámetros del pipeline
├── pyproject.toml        Paquete + CLI `centinela`
├── docs/
│   ├── plan-fase-1.md        Plan y estado de la Etapa I
│   ├── resultados-fase-1.md  Resultados y métricas de la Etapa I
│   ├── plan-fase-2.md        Plan y estado de la Etapa II
│   ├── resultados-fase-2.md  Resultados y métricas de la Etapa II
│   ├── resultados-imagen-real.md  Modos de fallo sobre imagen aérea real + prueba de control
│   ├── demo-en-vivo.md       Guion de la demo en vivo (~7 min) con plan B
│   └── adelanto/             Fuentes de la presentación (página, guion, diapositivas)
├── .github/workflows/    Despliegue de la landing en GitHub Pages
├── LICENSE               MIT
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
centinela make-synthetic OUT.png --weeds 25          # ídem con maleza entre hileras (no entra al GT)
centinela count data/samples/huerto.png --debug      # conteo + quién decidió + estabilidad + overlay
centinela eval  data/samples/huerto.png data/samples/huerto_gt.csv   # precision / recall / F1
centinela annotate IMG.jpg                           # marcar copas a mano → GT.csv
centinela characterize data/samples/huerto.png        # Etapa II: marca árboles a revisar

python scripts/control_banco.py                       # control sobre el banco real (métricas por etapa)
python scripts/control_banco.py --eps data/samples/banco/huerto_reticula_usda.jpg

pip install -e ".[demo]"                              # una vez
streamlit run demo/app.py                             # demo en vivo (o demo\iniciar.bat)
```

**Demo en línea.** La misma app se publica en Streamlit Community Cloud directo desde este
repo (`demo/app.py`, dependencias en `demo/requirements.txt`, configuración en
`.streamlit/config.toml`). Allá corre en modo público: muestra un aviso de que es una demo de
laboratorio y oculta las escenas cuya imagen no tiene licencia clara. Se actualiza sola con
cada push a `main`.

El pipeline vive en `centinela_core/` como paquete **Python puro**, sin dependencia
de ningún framework web, para que la Etapa III lo reutilice tal cual.

## Levantar la landing

```bash
cd landing
npm install
npm run dev          # desarrollo → http://localhost:5173/Centinela/
npm run build        # producción → landing/dist/
```

Se despliega sola en **GitHub Pages** con cada push a `main`
(`.github/workflows/pages.yml`). Hay que activarlo una vez en
*Settings → Pages → Source: GitHub Actions* (activado el 2026-09-22). **En línea:**
<https://ingdiegoter1998-eng.github.io/Centinela/>

El `base` de Vite apunta a `/Centinela/` porque en Pages el sitio vive
bajo la ruta del repositorio. Si cambia el nombre del repo o se usa dominio
propio: `BASE_PATH=/ npm run build`.

## Requisitos

- Python 3.12+ (para `centinela_core`)
- Node 20+ (para la landing)

## Datos

| Carpeta | Qué contiene |
|---|---|
| `data/samples/` | Imágenes de entrada de la demo y los documentos, con verdad de terreno (`*_gt.csv`) cuando existe |
| `data/samples/banco/` | Banco de 9 imágenes aéreas reales con licencia abierta — 2 sirven como control de conteo |
| `data/samples/intermedias/` | Recortes y reducciones de los que salieron las entradas |
| `data/samples/salidas/` | Salidas de corridas anteriores del pipeline, como referencia |
| `data/busqueda/` | Rastro de la búsqueda de imágenes públicas: CSV de candidatas, miniaturas y hojas de contacto |

Las imágenes del banco conservan la licencia de su autor, no la MIT del código:
[`data/ATRIBUCIONES.md`](data/ATRIBUCIONES.md). Las salidas nuevas de `centinela count` quedan
fuera del repo (`.gitignore`), y `centinela make-synthetic` produce datos de prueba
reproducibles sin imágenes externas.
