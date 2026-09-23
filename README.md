# Proyecto Centinela

Plataforma de agricultura de precisión para Saravena, Arauca. UAV + visión por
computador + IA + análisis geoespacial, aplicados a los cultivos de la región.

Proyecto de estudiantes de Ingeniería en Inteligencia Artificial, UIS — Sede Saravena.
Se construye por etapas: la complejidad técnica crece al ritmo de la carrera.

- **Hoja de ruta completa:** [`ROADMAP.md`](ROADMAP.md) · resumen visual para el equipo: <https://claude.ai/artifact/SF1jDjsshuLq9YmPrq1S9s>
- **Etapa actual (I, reabierta) — plan y resultados:** [`docs/plan-fase-1.md`](docs/plan-fase-1.md) · [`docs/resultados-fase-1.md`](docs/resultados-fase-1.md) · [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md) · [`docs/resultados-centros.md`](docs/resultados-centros.md) (método nuevo, plátano y palma)
- **Presentación:** [adelanto](https://claude.ai/artifact/NTF6K524ypXfsVZiqbGdk6) · [diapositivas](https://claude.ai/artifact/V4NDYPXa7zK4qqJAeULorT) · [guion de exposición](https://claude.ai/artifact/TVDWNvUEYSyEWpGnyHVMzC) — fuentes en `docs/adelanto/`
- **Demo en vivo:** doble clic en `demo\iniciar.bat` · en línea: <https://centinela-demo.streamlit.app/> · guion en [`docs/demo-en-vivo.md`](docs/demo-en-vivo.md)

## Estado

| Componente | Estado |
|---|---|
| Landing pública (Fase 0.5) | 🟢 En línea — <https://ingdiegoter1998-eng.github.io/Centinela/> · fuente en `landing/` |
| Conteo de plantas en una imagen (Etapa I) | 🟠 Reabierta. **Método nuevo de centros** (2026-09-23): un punto por planta, funciona sobre pasto verde y con hojas que se tocan — F1 0,96 en platanal sintético (el de manchas da 0,00) y 224 matas bien ubicadas en una foto real de platanal, sin verdad de terreno todavía. Es el que usa *Analizar mi foto*. Ver [`docs/resultados-centros.md`](docs/resultados-centros.md). El pipeline de manchas + DBSCAN sigue en el Laboratorio: [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md) §5 |
| Caracterización del cultivo (Etapa II) | ✅ Implementada — recall 0.88 / 8.7 % FP en sintético; sobre imagen real hereda el estado de la Etapa I. Ver [`docs/resultados-fase-2.md`](docs/resultados-fase-2.md) |
| Validación con dron propio + georreferencia (Etapa I-B) | ⚪ Backlog — necesita dron con GPS. La validación con imagen real *pública* se adelantó a la Etapa I: [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md) |
| Detección de maleza en arroz (Etapa III) | 🟡 Próximo boss grande (~12 meses) |

## Estructura

```
Centinela/
├── landing/              Landing pública — React + Vite (estática, sin backend)
├── centinela_core/       Conteo de plantas — Python puro (OpenCV / skimage / sklearn)
│                         centros.py = método de centros · pipeline.py = manchas + DBSCAN
├── tests/                Suite pytest (67 tests)
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
│   ├── resultados-centros.md  Método de centros: platanal, palma, comparación con DeepForest
│   ├── demo-en-vivo.md       Guion de la demo en vivo (~7 min) con plan B
│   └── adelanto/             Fuentes de la presentación (página, guion, diapositivas)
├── .github/workflows/    Despliegue de la landing en GitHub Pages
├── LICENSE               MIT
└── ROADMAP.md            Hoja de ruta del proyecto
```

## Etapa I — conteo de plantas en una imagen

A partir de **una sola imagen RGB cenital**, cuenta las plantas y ubica cada una dentro de
la imagen. Visión por computador clásica, sin GPS, sin georreferencia y sin modelos
entrenados. Hay dos métodos:

- **Centros** (`centinela centros`, el de la app): busca un punto por planta. En plátano y
  palma, donde las hojas salen en estrella desde el centro, sigue la convergencia de las hojas;
  en copas redondas, busca manchas del tamaño de la copa. El tamaño de planta se estima solo con
  la autocorrelación de la foto y el conteo sale con su rango. Funciona sobre pasto verde y con
  hojas que se tocan. [`docs/resultados-centros.md`](docs/resultados-centros.md)
- **Manchas + DBSCAN** (`centinela count`, el de la Etapa I original): segmenta la vegetación,
  separa copas con watershed y agrupa con DBSCAN. Solo sirve con copas separadas sobre suelo
  desnudo. [`docs/resultados-imagen-real.md`](docs/resultados-imagen-real.md)

La georreferencia y el trabajo con múltiples imágenes se aplazan a la Etapa I-B, cuando exista
un dron con GPS.

```bash
python -m venv .venv
.venv\Scripts\activate                 # Windows  ·  source .venv/bin/activate en Linux/Mac
pip install -e ".[dev]"
pytest -q

centinela centros FOTO.jpg                          # método de centros: plátano, banano, palma
centinela centros FOTO.jpg --forma copa --tamano 60 # copas redondas, tamaño de planta fijado a mano
centinela annotate FOTO.jpg --desde FOTO_centros.csv # corregir los centros → verdad de terreno

centinela make-synthetic data/samples/huerto.png    # huerto sintético + ground truth
centinela make-synthetic OUT.png --platanal          # platanal sintético (rosetas sobre pasto)
centinela make-synthetic OUT.png --weeds 25          # ídem con maleza entre hileras (no entra al GT)
centinela count data/samples/huerto.png --debug      # conteo + quién decidió + estabilidad + overlay
centinela eval  data/samples/huerto.png data/samples/huerto_gt.csv   # precision / recall / F1
centinela annotate IMG.jpg                           # marcar copas a mano → GT.csv
centinela characterize data/samples/huerto.png        # Etapa II: marca árboles a revisar

python scripts/control_banco.py                       # control sobre el banco real (métricas por etapa)
python scripts/control_banco.py --eps data/samples/banco/huerto_reticula_usda.jpg

pip install -e ".[modelo]"                            # opcional, ~1 GB: DeepForest + PyTorch
python scripts/comparar_deepforest.py FOTO.jpg        # centros contra un detector preentrenado

pip install -e ".[demo]"                              # una vez
streamlit run demo/app.py                             # demo en vivo (o demo\iniciar.bat)
```

**Demo en línea: <https://centinela-demo.streamlit.app/>.** Tiene dos páginas: *Analizar mi foto* (para cualquier persona: sube una foto, dice cómo se ven sus plantas y recibe el conteo con su rango, las plantas a revisar y descargas; usa el método de centros) y *Laboratorio* (el pipeline de manchas + DBSCAN con todos sus controles). La misma app se publica en
Streamlit Community Cloud directo desde este repo (`demo/app.py`, dependencias en `demo/requirements.txt`, configuración en
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
