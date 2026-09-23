"""Analizar mi foto: la app para un usuario sin conocimientos técnicos.

Usa la detección de centros (`centinela_core/centros.py`): un punto por planta, con el
tamaño de planta estimado del periodo de la plantación o fijado a mano. El conteo se
publica con su rango: lo que cambia si ese tamaño estuviera un 10 % corrido
(docs/resultados-centros.md). El pipeline de manchas de la Etapa I sigue en el
Laboratorio.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import streamlit as st
from comun import MAX_LADO, SAMPLES, VERDE, guardar_subida

from centinela_core.centros import detectar, revisar_vigor
from centinela_core.io import load_image

AMBAR = (255, 179, 64)
BLANCO = (255, 255, 255)

FORMAS = {
    "Hojas largas en estrella — plátano, banano, palma vista de cerca": "estrella",
    "Copas redondas — cítricos, cacao, frutales, o palmas vistas desde muy alto": "copa",
}

EJEMPLOS = {
    "Platanal de prueba generado por computador": {
        "img": SAMPLES / "platanal_demo.png",
        "forma": "estrella",
        "tamano": None,
        "nota": "63 matas sobre pasto verde, con las hojas de matas vecinas tocándose. "
        "Sabemos dónde está cada una, así que aquí sí se puede medir el acierto.",
    },
    "Palmas de aceite junto a un río": {
        "img": SAMPLES / "banco" / "palma_aceite_rio.jpg",
        "forma": "copa",
        "tamano": 28,
        "nota": "Foto real. Las palmas no están en cuadrícula, así que el tamaño no se puede "
        "estimar solo: está fijado a mano en 28 px. DrLianPinKoh, CC BY 2.0.",
    },
    "Huerto de prueba generado por computador": {
        "img": SAMPLES / "huerto_demo.png",
        "forma": "copa",
        "tamano": None,
        "nota": "80 árboles de copa redonda sobre suelo.",
    },
    "Plátano con las hojas tocándose (dosel cerrado)": {
        "img": SAMPLES / "platano_div8.png",
        "forma": "estrella",
        "tamano": 150,
        "nota": "El caso más difícil: no hay suelo ni pasto entre matas. Tamaño fijado a mano "
        "en 150 px; el conteo es poco confiable. The Roving Rokibul, CC BY-SA 4.0.",
    },
}
EJEMPLOS = {k: v for k, v in EJEMPLOS.items() if v["img"].exists()}


# --------------------------------------------------------------------------- análisis


@st.cache_data(show_spinner=False)
def contar(ruta: str, mtime: float, forma: str, tamano: int | None) -> dict:
    res = detectar(load_image(ruta), forma, tamano)
    return {
        "rgb": res.rgb,
        "dets": revisar_vigor(res),
        "n": res.n,
        "rango": res.rango,
        "consistente": res.consistente,
        "escala": res.escala.px,
        "fuente": res.escala.fuente,
    }


def avisos_de_calidad(res: dict, original: tuple[int, int] | None) -> list[str]:
    avisos = []
    if original and min(original) < 500:
        avisos.append(
            f"La foto es pequeña ({original[1]}×{original[0]} px). Con pocos píxeles por "
            "planta es difícil distinguir una de otra."
        )
    if res["escala"] and res["escala"] < 12:
        avisos.append(
            "Las plantas se ven muy pequeñas en esta foto. Si puedes, vuela más bajo o "
            "recorta la zona que te interesa."
        )
    return avisos


# --------------------------------------------------------------------------- dibujo


def dibujar(res: dict) -> np.ndarray:
    out = res["rgb"].copy()
    grosor = max(2, round(max(out.shape[:2]) / 450))
    r = max(4, int(0.28 * res["escala"]))
    for _, d in res["dets"].iterrows():
        c = (int(d["x_px"]), int(d["y_px"]))
        color = AMBAR if d["revisar"] else VERDE
        cv2.circle(out, c, r, color, grosor, cv2.LINE_AA)
        cv2.circle(out, c, max(2, grosor), color, -1, cv2.LINE_AA)
    # Referencia: el tamaño de planta que se usó, en la esquina.
    rr = res["escala"] // 2
    cv2.circle(out, (rr + 10, rr + 10), rr, BLANCO, grosor, cv2.LINE_AA)
    return out


def tabla_descarga(res: dict) -> pd.DataFrame:
    d = res["dets"]
    return pd.DataFrame(
        {
            "x_px": d["x_px"].round(1),
            "y_px": d["y_px"].round(1),
            "revisar": np.where(d["revisar"], "si", "no"),
            "motivo": np.where(d["revisar"], "menos verde que el resto", ""),
        }
    )


def png(rgb: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    return buf.tobytes() if ok else b""


# --------------------------------------------------------------------------- página

st.title("Analiza tu foto aérea")
st.write(
    "Sube una foto de tu cultivo tomada desde arriba. Te decimos cuántas plantas "
    "encontramos, qué tan confiable es ese número y cuáles conviene revisar."
)
st.caption(
    "Versión de prueba del Proyecto Centinela. El método todavía se está validando con "
    "fotos reales: tómalo como una ayuda, no como un inventario."
)

with st.expander("Cómo tomar una foto que funcione", expanded="analizada" not in st.session_state):
    a, b = st.columns(2)
    a.markdown(
        "**Funciona mejor con**\n\n"
        "- Foto **desde arriba**, con la cámara mirando al suelo\n"
        "- Plantas **en hileras o en cuadrícula**\n"
        "- Algo de **suelo o pasto visible** entre una planta y otra\n"
        "- Luz del **mediodía** o día nublado: sombras cortas\n"
        "- Cada planta ocupando **al menos 30 píxeles** de ancho"
    )
    b.markdown(
        "**Todavía no funciona bien con**\n\n"
        "- Fotos **inclinadas**, donde se ve el horizonte\n"
        "- **Dosel cerrado**: hojas tapando todo el suelo\n"
        "- Árboles sueltos **sobre franjas de pasto** que se repiten\n"
        "- Sombras muy largas de la tarde\n"
        "- Capturas de pantalla o fotos de muy baja resolución"
    )

fuente = st.radio(
    "¿Qué foto quieres analizar?", ["Subir mi foto", "Usar una foto de ejemplo"], horizontal=True
)

ruta, original, nombre, ejemplo = None, None, None, None
if fuente == "Subir mi foto":
    subida = st.file_uploader("Foto aérea (JPG o PNG, hasta 10 MB)", type=["jpg", "jpeg", "png"])
    if subida is not None:
        try:
            ruta, original = guardar_subida(subida)
            nombre = subida.name
        except ValueError as e:
            st.error(str(e))
else:
    nombre = st.selectbox("Foto de ejemplo", list(EJEMPLOS))
    ejemplo = EJEMPLOS[nombre]
    ruta = ejemplo["img"]
    st.caption(ejemplo["nota"])

if ruta is None:
    st.stop()

ruta = str(ruta)
mtime = Path(ruta).stat().st_mtime

forma_def = ejemplo["forma"] if ejemplo else "estrella"
etiqueta = st.radio(
    "¿Cómo se ven las plantas en tu foto?",
    list(FORMAS),
    index=list(FORMAS.values()).index(forma_def),
    key=f"forma_{ruta}",
)
forma = FORMAS[etiqueta]

clave_tam = f"tam_{ruta}_{forma}"
tamano = st.session_state.get(clave_tam, ejemplo["tamano"] if ejemplo else None)

if st.session_state.get("analizada") != ruta:
    st.image(ruta, caption=nombre, width=520)
    if st.button("Analizar foto", type="primary"):
        with st.status("Analizando la foto…", expanded=True) as estado:
            st.write("Midiendo el tamaño de las plantas…")
            st.write("Buscando el centro de cada planta…")
            res = contar(ruta, mtime, forma, tamano)
            estado.update(label="Análisis listo", state="complete", expanded=False)
        st.session_state["analizada"] = ruta
        st.rerun()
    st.stop()

# ------------------------------------------------------------------ resultado

res = contar(ruta, mtime, forma, tamano)
st.divider()

for aviso in avisos_de_calidad(res, original):
    st.warning(aviso)
if original and max(original) > MAX_LADO:
    st.caption(
        f"Tu foto medía {original[1]}×{original[0]} px; la analizamos reducida a "
        f"{MAX_LADO} px de lado."
    )

sin_escala = res["escala"] is None
if sin_escala:
    st.warning(
        "**No pudimos medir solos el tamaño de las plantas.** Pasa cuando no están en "
        "hileras o cuadrícula. Indícalo abajo: mueve el control hasta que el círculo blanco "
        "de la esquina cubra más o menos una planta."
    )
else:
    lo, hi = res["rango"]
    izq, der = st.columns([1, 2])
    with izq:
        st.metric("Plantas encontradas", res["n"])
        if res["consistente"]:
            st.success(f"**Conteo consistente** — entre {lo} y {hi}.")
            st.write(
                "Si el tamaño de planta que medimos estuviera un poco corrido, el número "
                "casi no cambiaría."
            )
        else:
            st.warning(f"**Conteo aproximado** — entre {lo} y {hi}.")
            st.write(
                "El número depende bastante del tamaño de planta. Revisa en la foto que las "
                "marcas caigan sobre las plantas y, si no, ajusta el tamaño abajo."
            )
        n_rev = int(res["dets"]["revisar"].sum())
        st.metric("Para revisar", n_rev)
        if n_rev:
            st.caption("Marcadas en ámbar: se ven mucho menos verdes que el resto de la foto.")
        st.caption(
            f"Tamaño de planta: {res['escala']} px "
            + ("(medido en la foto)" if res["fuente"] == "autocorrelacion" else "(fijado a mano)")
            + ". Es el círculo blanco de la esquina."
        )
    with der:
        marcada = dibujar(res)
        t1, t2 = st.tabs(["Tu foto marcada", "Foto original"])
        t1.image(marcada, width="stretch")
        t2.image(res["rgb"], width="stretch")

with st.expander(
    "¿Las marcas no caen sobre las plantas? Ajusta el tamaño", expanded=sin_escala
):
    h, w = res["rgb"].shape[:2]
    actual = res["escala"] or tamano or max(12, min(h, w) // 15)
    nuevo = st.slider(
        "Distancia entre una planta y la vecina (píxeles)",
        min_value=8,
        max_value=max(60, min(h, w) // 3),
        value=int(actual),
        help="El círculo blanco de la esquina de la foto marcada tiene este tamaño.",
    )
    c1, c2 = st.columns(2)
    if c1.button("Contar con este tamaño", type="primary"):
        st.session_state[clave_tam] = nuevo
        st.rerun()
    if tamano is not None and c2.button("Volver al tamaño automático"):
        st.session_state[clave_tam] = None
        st.rerun()
    if sin_escala:
        muestra = res["rgb"].copy()
        cv2.circle(muestra, (nuevo // 2 + 10, nuevo // 2 + 10), nuevo // 2, BLANCO, 3, cv2.LINE_AA)
        st.image(muestra, width=520)

if sin_escala:
    st.stop()

revisar = res["dets"][res["dets"]["revisar"]]
if len(revisar):
    with st.expander(f"Plantas para revisar ({len(revisar)})"):
        st.write(
            "Se comparan con el resto de **esta misma foto**: no es un diagnóstico, es una "
            "señal de dónde mirar primero en campo."
        )
        st.dataframe(
            pd.DataFrame(
                {
                    "Posición en la foto (x, y)": [
                        f"{int(x)}, {int(y)}" for x, y in zip(revisar["x_px"], revisar["y_px"])
                    ],
                    "Por qué": "menos verde que el resto",
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

historial = st.session_state.setdefault("historial", [])
fila = {
    "Hora": datetime.now().strftime("%H:%M"),
    "Foto": nombre,
    "Forma": "estrella" if forma == "estrella" else "copa",
    "Plantas": res["n"],
    "Rango": f"{lo}–{hi}",
    "Para revisar": int(res["dets"]["revisar"].sum()),
}
if not historial or {k: v for k, v in historial[-1].items() if k != "Hora"} != {
    k: v for k, v in fila.items() if k != "Hora"
}:
    historial.append(fila)
if len(historial) > 1:
    st.subheader("Fotos analizadas en esta sesión")
    st.dataframe(pd.DataFrame(historial), hide_index=True, width="stretch")

st.divider()
st.caption(
    "Tus fotos se procesan en este servidor solo para analizarlas; no las compartimos. Se "
    "guardan temporalmente mientras la app está encendida y se borran cuando se reinicia. "
    "¿Quieres ver el método anterior, que segmenta manchas? Abre el **Laboratorio** en el "
    "menú de la izquierda."
)
