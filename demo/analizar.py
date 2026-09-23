"""Analizar mi foto: la app para un usuario sin conocimientos técnicos.

No muestra parámetros del método. Muestra lo que el método puede sostener: un conteo
cuando es consistente, un conteo aproximado cuando no hay nada que separar, y un rango
cuando el número depende del ajuste (docs/resultados-imagen-real.md §5.8).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import streamlit as st
from comun import ESCENAS, MAX_LADO, VERDE, guardar_subida, procesar

from centinela_core.cluster import cluster_blobs
from centinela_core.health import characterize
from centinela_core.stability import estabilidad

AMBAR = (255, 179, 64)
AMARILLO = (255, 214, 10)

MOTIVOS = {
    "area": "más pequeño que el resto",
    "vigor": "menos verde que el resto",
    "gap": "copa con huecos",
    "solidity": "borde irregular o incompleto",
}

EJEMPLOS = {
    "Huerto real con árboles separados (USDA)": "Huerto real (USDA) · cenital, suelo visible",
    "Palmas junto a un río": "Palma junto a un río (real) · segundo control",
    "Huerto de prueba generado por computador": "Huerto sintético · 80 árboles, verdad de terreno exacta",
    "Plátano con las hojas tocándose": "Banano · dosel cerrado",
}
EJEMPLOS = {k: v for k, v in EJEMPLOS.items() if v in ESCENAS}


# --------------------------------------------------------------------------- análisis


def verde_real(rgb: np.ndarray) -> float:
    a = rgb.astype(np.int16)
    return float(((a[..., 1] > a[..., 0]) & (a[..., 1] > a[..., 2])).mean())


@st.cache_data(show_spinner=False)
def analizar(ruta: str, mtime: float) -> dict:
    rgb, _, mask, _, dets0 = procesar(ruta, mtime)
    n = len(dets0)
    est = estabilidad(dets0) if n else None

    if n == 0:
        tipo, dets = "vacio", dets0
    elif est.veredicto == "estable":
        lo, hi = est.meseta
        eps = 0.8 if lo <= 0.8 <= hi else lo
        tipo, dets = "consistente", cluster_blobs(dets0, eps=eps)
    elif est.veredicto == "sin_estructura":
        tipo, dets = "aproximado", cluster_blobs(dets0, method="watershed")
    else:
        tipo, dets = "rango", cluster_blobs(dets0, method="watershed")

    rango = None
    if tipo == "rango":
        b = est.barrido[est.barrido["informativo"]]
        rango = (int(b["arboles"].min()), int(b["arboles"].max()))

    revisar = None
    if tipo in ("consistente", "aproximado") and int(dets["is_tree"].sum()) >= 5:
        dets = characterize(dets)
        revisar = dets[dets["flag"] == "revisar"]

    return {
        "tipo": tipo,
        "dets": dets,
        "n_manchas": n,
        "n_arboles": int(dets["is_tree"].sum()) if n else 0,
        "rango": rango,
        "revisar": revisar,
        "cobertura": float(mask.mean()),
        "verde": verde_real(rgb),
    }


def avisos_de_calidad(res: dict, original: tuple[int, int] | None) -> list[str]:
    avisos = []
    if original and min(original) < 500:
        avisos.append(
            f"La foto es pequeña ({original[1]}×{original[0]} px). Con pocas píxeles por copa "
            "es difícil separar un árbol de otro."
        )
    if res["cobertura"] < 0.02:
        avisos.append(
            "Casi no encontramos vegetación. ¿Es una foto aérea de un cultivo, tomada de día?"
        )
    elif res["verde"] > 0.85:
        avisos.append(
            "Casi toda la foto es verde: parece un cultivo con las copas tocándose o con pasto "
            "entre plantas. El método necesita ver suelo entre una planta y otra."
        )
    if 0 < res["n_manchas"] < 5:
        avisos.append("Encontramos muy pocas plantas para poder comparar unas con otras.")
    return avisos


# --------------------------------------------------------------------------- dibujo


def dibujar(rgb: np.ndarray, res: dict) -> np.ndarray:
    out = rgb.copy()
    grosor = max(2, round(max(rgb.shape[:2]) / 400))
    revisar = set(res["revisar"].index) if res["revisar"] is not None else set()
    for i, d in res["dets"].iterrows():
        if not d["is_tree"]:
            continue
        r = int(max(5, np.sqrt(d["area_px"] / np.pi)))
        c = (int(d["x_px"]), int(d["y_px"]))
        if res["tipo"] == "rango":
            color = AMARILLO
        else:
            color = AMBAR if i in revisar else VERDE
        cv2.circle(out, c, r, color, grosor, cv2.LINE_AA)
    return out


def tabla_descarga(res: dict) -> pd.DataFrame:
    d = res["dets"]
    estado = {
        "consistente": "arbol",
        "aproximado": "arbol",
        "rango": "posible planta",
    }.get(res["tipo"], "")
    t = pd.DataFrame(
        {
            "x_px": d["x_px"].round(1),
            "y_px": d["y_px"].round(1),
            "area_px": d["area_px"].astype(int),
            "estado": np.where(d["is_tree"], estado, "descartado"),
        }
    )
    if "flag" in d:
        t["revisar"] = d["flag"].eq("revisar").map({True: "si", False: "no"})
        t["motivo"] = d["motivo"].map(
            lambda m: ", ".join(MOTIVOS.get(x, x) for x in m.split(";") if x) if m else ""
        )
    return t


def png(rgb: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    return buf.tobytes() if ok else b""


# --------------------------------------------------------------------------- página

st.title("Analiza tu foto aérea")
st.write(
    "Sube una foto de tu cultivo tomada desde arriba. Te decimos cuántos árboles "
    "encontramos, qué tan confiable es ese número y cuáles conviene revisar."
)
st.caption(
    "Versión de prueba del Proyecto Centinela. El método todavía se está validando con "
    "fotos reales: tómalo como una ayuda, no como un inventario."
)

hay_resultado = "analizada" in st.session_state
with st.expander("Cómo tomar una foto que funcione", expanded=not hay_resultado):
    a, b = st.columns(2)
    a.markdown(
        "**Funciona mejor con**\n\n"
        "- Foto **desde arriba**, con la cámara mirando al suelo\n"
        "- **Suelo visible** entre una planta y otra\n"
        "- Árboles o palmas **separados**, en hileras o en cuadrícula\n"
        "- Luz del **mediodía** o día nublado: sombras cortas\n"
        "- Foto de **buena resolución**, sin textos encima"
    )
    b.markdown(
        "**Todavía no funciona con**\n\n"
        "- Fotos **inclinadas**, donde se ve el horizonte\n"
        "- Cultivos con las **hojas tocándose** (dosel cerrado)\n"
        "- **Pasto o maleza** tapando el suelo entre plantas\n"
        "- Sombras muy largas de la tarde\n"
        "- Capturas de pantalla o fotos de muy baja resolución"
    )

fuente = st.radio(
    "¿Qué foto quieres analizar?",
    ["Subir mi foto", "Usar una foto de ejemplo"],
    horizontal=True,
)

ruta, original, nombre = None, None, None
if fuente == "Subir mi foto":
    subida = st.file_uploader(
        "Foto aérea (JPG o PNG, hasta 10 MB)", type=["jpg", "jpeg", "png"]
    )
    if subida is not None:
        try:
            ruta, original = guardar_subida(subida)
            nombre = subida.name
        except ValueError as e:
            st.error(str(e))
else:
    ejemplo = st.selectbox("Foto de ejemplo", list(EJEMPLOS))
    ruta, nombre = ESCENAS[EJEMPLOS[ejemplo]]["img"], ejemplo

if ruta is None:
    st.stop()

ruta = str(ruta)
mtime = Path(ruta).stat().st_mtime
if st.session_state.get("analizada") != ruta:
    st.image(ruta, caption=nombre, width=520)

if st.button("Analizar foto", type="primary", disabled=st.session_state.get("analizada") == ruta):
    with st.status("Analizando la foto…", expanded=True) as estado:
        st.write("Buscando la vegetación y separando las copas…")
        procesar(ruta, mtime)
        st.write("Comprobando si el conteo es confiable…")
        res = analizar(ruta, mtime)
        st.write("Revisando el estado de cada árbol…")
        estado.update(label="Análisis listo", state="complete", expanded=False)
    st.session_state["analizada"] = ruta
    historial = st.session_state.setdefault("historial", [])
    resultado = (
        f"entre {res['rango'][0]} y {res['rango'][1]}" if res["tipo"] == "rango"
        else str(res["n_arboles"])
    )
    historial.append(
        {
            "Hora": datetime.now().strftime("%H:%M"),
            "Foto": nombre,
            "Árboles": resultado,
            "Confianza": {
                "consistente": "consistente",
                "aproximado": "aproximado",
                "rango": "no confiable",
                "vacio": "sin plantas",
            }[res["tipo"]],
            "Para revisar": len(res["revisar"]) if res["revisar"] is not None else "—",
        }
    )
    st.rerun()

if st.session_state.get("analizada") != ruta:
    st.stop()

# ------------------------------------------------------------------ resultado

rgb = procesar(ruta, mtime)[0]
res = analizar(ruta, mtime)
st.divider()

for aviso in avisos_de_calidad(res, original):
    st.warning(aviso)
if original and max(original) > MAX_LADO:
    st.caption(
        f"Tu foto medía {original[1]}×{original[0]} px; la analizamos reducida a "
        f"{MAX_LADO} px de lado."
    )

tipo = res["tipo"]
if tipo == "vacio":
    st.error("**No encontramos plantas en esta foto.**")
    st.stop()

izq, der = st.columns([1, 2])
with izq:
    if tipo == "rango":
        st.metric("Árboles", f"{res['rango'][0]} – {res['rango'][1]}")
        st.error("**No podemos darte un número confiable.**")
        st.write(
            f"Encontramos **{res['n_manchas']} manchas de vegetación**, pero no logramos "
            "distinguir con seguridad cuáles son árboles y cuáles son pasto, maleza o "
            "pedazos de una misma copa: según cómo se mire, el conteo va de "
            f"{res['rango'][0]} a {res['rango'][1]}."
        )
        st.caption("En la foto están marcadas en amarillo todas las manchas: son posibles plantas.")
    else:
        st.metric("Árboles encontrados", res["n_arboles"])
        if tipo == "consistente":
            st.success("**Conteo consistente.**")
            st.write(
                "El resultado no cambia al variar el ajuste del método: los árboles se "
                "distinguen claramente de lo demás."
            )
        else:
            st.warning("**Conteo aproximado.**")
            st.write(
                "Contamos cada mancha de vegetación separada. No encontramos nada que parezca "
                "maleza o sombra para descartar, así que si hay maleza, cuenta como árbol."
            )
        if res["revisar"] is not None:
            n_rev = len(res["revisar"])
            st.metric("Para revisar", n_rev)
            if n_rev:
                st.caption("Marcados en ámbar en la foto: se ven peor que el resto del cultivo.")

with der:
    marcada = dibujar(rgb, res)
    t1, t2 = st.tabs(["Tu foto marcada", "Foto original"])
    t1.image(marcada, width="stretch")
    t2.image(rgb, width="stretch")

if res["revisar"] is not None and len(res["revisar"]):
    with st.expander(f"Árboles para revisar ({len(res['revisar'])})"):
        st.write(
            "Se comparan con el resto de **esta misma foto**: no es un diagnóstico, es una "
            "señal de dónde mirar primero en campo."
        )
        rev = res["revisar"].copy()
        st.dataframe(
            pd.DataFrame(
                {
                    "Posición en la foto (x, y)": [
                        f"{int(x)}, {int(y)}" for x, y in zip(rev["x_px"], rev["y_px"])
                    ],
                    "Por qué": [
                        ", ".join(MOTIVOS.get(m, m) for m in s.split(";") if m)
                        for s in rev["motivo"]
                    ],
                }
            ),
            hide_index=True,
            width="stretch",
        )

d1, d2 = st.columns(2)
base = Path(nombre).stem if nombre else "foto"
d1.download_button(
    "Descargar foto marcada (PNG)", png(marcada), f"{base}_centinela.png", "image/png"
)
d2.download_button(
    "Descargar resultados (CSV)",
    tabla_descarga(res).to_csv(index=False).encode("utf-8"),
    f"{base}_centinela.csv",
    "text/csv",
)

if len(st.session_state.get("historial", [])) > 1:
    st.subheader("Fotos analizadas en esta sesión")
    st.dataframe(pd.DataFrame(st.session_state["historial"]), hide_index=True, width="stretch")

st.divider()
st.caption(
    "Tus fotos se procesan en este servidor solo para analizarlas; no las compartimos. Se "
    "guardan temporalmente mientras la app está encendida y se borran cuando se reinicia. "
    "¿Quieres ver cómo decide el método? Abre el **Laboratorio** en el menú de la izquierda."
)
