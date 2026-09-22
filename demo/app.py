"""Demo en vivo del pipeline de conteo — Proyecto Centinela.

    streamlit run demo/app.py        (o doble clic en demo/iniciar.bat)

Corre el pipeline real de `centinela_core` sobre la escena elegida y deja mover
el método y `eps` para ver en vivo quién decide el conteo.
"""

from __future__ import annotations

import hashlib
import sys
import tempfile
from pathlib import Path

import altair as alt
import cv2
import matplotlib
import numpy as np
import pandas as pd
import streamlit as st
from skimage.color import label2rgb

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # por si el paquete no está instalado en modo editable

from centinela_core.cluster import FEATURE_COLS, SHAPE_COLS, cluster_blobs
from centinela_core.config import Config
from centinela_core.evaluate import evaluate
from centinela_core.io import load_ground_truth
from centinela_core.pipeline import run
from centinela_core.stability import barrido_eps, veredicto

SAMPLES = ROOT / "data" / "samples"

ESCENAS = {
    "Huerto sintético · 80 árboles, verdad de terreno exacta": {
        "img": SAMPLES / "huerto_demo.png",
        "gt": SAMPLES / "huerto_demo_gt.csv",
        "nota": "Generado por `centinela make-synthetic`. Copas sobre suelo desnudo, "
        "posición exacta de cada árbol conocida.",
    },
    "Huerto sintético con maleza · 80 árboles + 25 manchas de maleza": {
        "img": SAMPLES / "huerto_maleza.png",
        "gt": SAMPLES / "huerto_maleza_gt.csv",
        "nota": "El mismo huerto con maleza entre hileras: mismo verde y misma luminancia "
        "que la copa, forma irregular. La maleza no está en la verdad de terreno.",
    },
    "Huerto real (USDA) · cenital, suelo visible": {
        "img": SAMPLES / "banco" / "huerto_reticula_usda.jpg",
        "gt": None,
        "nota": "La única imagen real del banco donde la premisa se cumple: árboles "
        "espaciados sobre suelo. Dominio público (USDA).",
    },
    "Palma de aceite · dron cenital": {
        "img": SAMPLES / "palma_lote.jpg",
        "gt": None,
        "nota": "Copas grandes, bloque denso. El mejor resultado real hasta la fecha.",
    },
    "Banano · dosel cerrado": {
        "img": SAMPLES / "platano_div8.png",
        "gt": None,
        "nota": "No hay suelo entre plantas: el umbral separa hoja iluminada de hoja "
        "sombreada. The Roving Rokibul, CC BY-SA 4.0.",
    },
    "Cítrico en seto · satélite 0,25 m/px": {
        "img": SAMPLES / "sep_topright.png",
        "gt": None,
        "nota": "Copas de ~15 px pegadas en hilera. Falta resolución.",
    },
}
SUBIR = "Subir una imagen…"

DESCRIPTORES = {
    "todos": ("Los 7 (Etapa I)", FEATURE_COLS),
    "forma": ("Solo forma (4)", SHAPE_COLS),
}

DECISION = {
    "dbscan": ("DBSCAN", "el cluster dominante es el conteo"),
    "fallback": ("Watershed", "DBSCAN no formó ningún cluster; toda mancha cuenta"),
    "watershed": ("Watershed", "método sin agrupar; toda mancha cuenta"),
}

VERDE = (48, 209, 88)
ROJO = (229, 72, 77)
MAX_LADO = 1600  # las imágenes subidas se reducen para que la demo siga siendo en vivo


# --------------------------------------------------------------------------- cálculo


@st.cache_data(show_spinner="Corriendo el pipeline…")
def procesar(ruta: str, mtime: float):
    r = run(ruta, Config())
    return r.rgb, r.index, r.mask, r.labels, r.detections


@st.cache_data(show_spinner=False)
def curva(ruta: str, mtime: float, min_samples: int, desc: str) -> pd.DataFrame:
    """Barrido fino para la gráfica (el veredicto usa la grilla gruesa del CLI)."""
    dets = procesar(ruta, mtime)[4]
    grid = tuple(np.round(np.arange(0.2, 4.01, 0.1), 2))
    return barrido_eps(dets, grid, min_samples=min_samples, features=DESCRIPTORES[desc][1])


@st.cache_data(show_spinner=False)
def estabilidad_cli(ruta: str, mtime: float, min_samples: int, desc: str):
    dets = procesar(ruta, mtime)[4]
    e = veredicto(barrido_eps(dets, min_samples=min_samples, features=DESCRIPTORES[desc][1]))
    return e.veredicto, e.meseta, e.conteo_meseta, e.resumen()


def guardar_subida(archivo) -> Path:
    datos = archivo.getvalue()
    h = hashlib.sha1(datos).hexdigest()[:16]
    destino = Path(tempfile.gettempdir()) / "centinela_demo" / f"{h}.png"
    if not destino.exists():
        destino.parent.mkdir(parents=True, exist_ok=True)
        img = cv2.imdecode(np.frombuffer(datos, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("No se pudo leer la imagen.")
        lado = max(img.shape[:2])
        if lado > MAX_LADO:
            f = MAX_LADO / lado
            img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(destino), img)
    return destino


# --------------------------------------------------------------------------- dibujo


def dibujar_detecciones(rgb: np.ndarray, dets: pd.DataFrame) -> np.ndarray:
    out = rgb.copy()
    grosor = max(1, round(max(rgb.shape[:2]) / 500))
    for _, d in dets.iterrows():
        r = int(max(5, np.sqrt(d["area_px"] / np.pi)))
        c = (int(d["x_px"]), int(d["y_px"]))
        if d["is_tree"]:
            cv2.circle(out, c, r, VERDE, grosor + 1, cv2.LINE_AA)
        else:
            k = max(3, r // 2)
            cv2.line(out, (c[0] - k, c[1] - k), (c[0] + k, c[1] + k), ROJO, grosor, cv2.LINE_AA)
            cv2.line(out, (c[0] - k, c[1] + k), (c[0] + k, c[1] - k), ROJO, grosor, cv2.LINE_AA)
    return out


def colorear_indice(idx: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(idx, [2, 98])
    norm = np.clip((idx - lo) / (hi - lo + 1e-9), 0, 1)
    return (matplotlib.colormaps["RdYlGn"](norm)[..., :3] * 255).astype(np.uint8)


def grafica_eps(c: pd.DataFrame, eps: float, n_manchas: int, meseta) -> alt.Chart:
    c = c.copy()
    c["quién decide"] = c["decision"].map(
        {"dbscan": "DBSCAN", "fallback": "fallback (watershed)", "watershed": "watershed"}
    )
    x = alt.X("eps:Q", title="eps de DBSCAN", scale=alt.Scale(domain=[0.2, 4.0], nice=False))
    y = alt.Y("arboles:Q", title="árboles contados", scale=alt.Scale(domain=[0, n_manchas * 1.05]))
    capas = []
    if meseta:
        capas.append(
            alt.Chart(pd.DataFrame({"a": [meseta[0]], "b": [meseta[1]]}))
            .mark_rect(opacity=0.15, color="#30d158")
            .encode(x="a:Q", x2="b:Q")
        )
    capas += [
        alt.Chart(pd.DataFrame({"y": [n_manchas]}))
        .mark_rule(strokeDash=[2, 3], color="#888")
        .encode(y="y:Q"),
        alt.Chart(c).mark_line(color="#888", strokeWidth=1.5).encode(x=x, y=y),
        alt.Chart(c)
        .mark_circle(size=60)
        .encode(
            x=x,
            y=y,
            color=alt.Color(
                "quién decide:N",
                scale=alt.Scale(
                    domain=["DBSCAN", "fallback (watershed)"], range=["#0a84ff", "#ff9f0a"]
                ),
                legend=alt.Legend(orient="bottom", title=None),
            ),
            tooltip=[
                alt.Tooltip("eps:Q"),
                alt.Tooltip("arboles:Q", title="árboles"),
                alt.Tooltip("descartadas_pct:Q", title="% descartadas", format=".0f"),
                alt.Tooltip("quién decide:N"),
            ],
        ),
        alt.Chart(pd.DataFrame({"eps": [eps]}))
        .mark_rule(color="#e5484d", strokeWidth=2)
        .encode(x="eps:Q"),
    ]
    return alt.layer(*capas).properties(height=360)


# --------------------------------------------------------------------------- página

st.set_page_config(page_title="Centinela · demo", page_icon="🌳", layout="wide")
st.markdown(
    "<style>[data-testid='stMetricValue']{font-size:2.6rem}</style>", unsafe_allow_html=True
)

with st.sidebar:
    st.header("Escena")
    nombre = st.selectbox("Imagen", [*ESCENAS, SUBIR], label_visibility="collapsed")
    gt_path = None
    if nombre == SUBIR:
        subida = st.file_uploader("Imagen aérea cenital", type=["jpg", "jpeg", "png"])
        if subida is None:
            st.info("Sube una imagen para procesarla.")
            st.stop()
        try:
            ruta = guardar_subida(subida)
        except ValueError as e:
            st.error(str(e))
            st.stop()
        st.caption(f"Se reduce a {MAX_LADO} px de lado como máximo para que corra en vivo.")
    else:
        escena = ESCENAS[nombre]
        ruta, gt_path = escena["img"], escena["gt"]
        st.caption(escena["nota"])

    st.header("Clustering")
    metodo = st.radio(
        "Método",
        ["dbscan", "watershed"],
        format_func={"dbscan": "DBSCAN (Etapa I)", "watershed": "Sin agrupar (watershed)"}.get,
    )
    eps = st.slider(
        "eps", 0.2, 4.0, 0.8, 0.1, disabled=metodo != "dbscan",
        help="Radio de vecindad de DBSCAN en el espacio de descriptores normalizados. "
        "0.8 es el valor de config.yaml.",
    )
    desc = st.radio(
        "Descriptores",
        list(DESCRIPTORES),
        format_func=lambda k: DESCRIPTORES[k][0],
        disabled=metodo != "dbscan",
        help="Sobre qué descriptores de cada mancha agrupa DBSCAN. Los 7 incluyen el "
        "color medio en Lab; solo forma usa área, circularidad, excentricidad y extent.",
    )
    min_samples = st.slider("min_samples", 3, 15, 6, 1, disabled=metodo != "dbscan")

mtime = Path(ruta).stat().st_mtime
rgb, idx, mask, labels, dets0 = procesar(str(ruta), mtime)
dets = cluster_blobs(
    dets0, eps=eps, min_samples=min_samples, method=metodo, features=DESCRIPTORES[desc][1]
)
decision = dets.attrs["decision"]
n_manchas = len(dets)
n_arboles = int(dets["is_tree"].sum()) if n_manchas else 0

st.title("Centinela · conteo de árboles en una imagen aérea")

m = st.columns(4)
m[0].metric("Árboles contados", n_arboles)
m[1].metric("Manchas del watershed", n_manchas)
m[2].metric("Descartadas", n_manchas - n_arboles)
quien, porque = DECISION[decision]
m[3].metric("Decidió el conteo", quien, help=porque)

if gt_path is not None and n_manchas:
    gt = load_ground_truth(gt_path)
    ev = evaluate(dets.loc[dets["is_tree"], ["x_px", "y_px"]].to_numpy(), gt, 14.0)
    g = st.columns(4)
    g[0].metric("Verdad de terreno", ev.n_gt)
    g[1].metric("Precisión", f"{ev.precision:.2f}")
    g[2].metric("Exhaustividad", f"{ev.recall:.2f}")
    g[3].metric("F1", f"{ev.f1:.2f}")

if decision == "fallback":
    st.warning(
        f"**DBSCAN no formó ningún cluster con eps = {eps}.** El pipeline cae al modo "
        "\"toda mancha cuenta\": el conteo lo está decidiendo el watershed, no el clustering."
    )

t1, t2, t3 = st.tabs(["Resultado", "Pipeline paso a paso", "¿Quién decide el conteo?"])

with t1:
    st.image(
        dibujar_detecciones(rgb, dets),
        caption="○ verde: contado como árbol   ✕ rojo: descartado por el clustering",
        width="stretch",
    )

with t2:
    a, b = st.columns(2)
    a.image(rgb, caption="1 · Imagen original", width="stretch")
    b.image(
        colorear_indice(idx),
        caption="2 · Índice de vegetación (combo: verde + oscuridad)",
        width="stretch",
    )
    c, d = st.columns(2)
    c.image(
        (mask * 255).astype(np.uint8),
        caption=f"3 · Máscara tras Otsu y morfología — {100 * mask.mean():.1f} % de la imagen",
        width="stretch",
    )
    d.image(
        (label2rgb(labels, bg_label=0) * 255).astype(np.uint8),
        caption=f"4 · Watershed — {int(labels.max())} manchas separadas",
        width="stretch",
    )

with t3:
    if metodo != "dbscan":
        st.info("Con el método sin agrupar no hay nada que barrer: el conteo es el del watershed.")
    else:
        ver, meseta, conteo_meseta, resumen = estabilidad_cli(
            str(ruta), mtime, min_samples, desc
        )
        {"estable": st.success, "inestable": st.error, "sin_estructura": st.warning}[ver](
            f"**{resumen}**"
        )
        st.altair_chart(
            grafica_eps(curva(str(ruta), mtime, min_samples, desc), eps, n_manchas, meseta),
            width="stretch",
        )
        st.caption(
            "Cada punto es el conteo que publicaría el pipeline con ese eps. "
            "Línea roja: eps actual. Línea punteada: total de manchas (tope). "
            "Si hubiera una nube compacta de copas, la curva haría una meseta (franja verde)."
        )
