"""Modelo de datos: el esquema de la base de datos del registro de campo (`web/`).

Lee `esquema.py`, una copia del esquema de Django que `tests/test_esquema_web.py` mantiene
sincronizada con `web/campo/models.py`. La demo en la nube no instala Django.
"""

from __future__ import annotations

from html import escape

import pandas as pd
import streamlit as st
from esquema import TABLAS, relaciones

REPO = "https://github.com/ingdiegoter1998-eng/Centinela/blob/main"

ANALISIS = {"campo_analisis", "campo_planta", "campo_medicion"}
CATALOGO = {"campo_cultivo", "campo_variable", "auth_user"}
COLOR_CABECERA = {"registro": "#1f5c46", "analisis": "#3c3489", "catalogo": "#4a4a46"}
COLOR_CLAVE = {"PK": "#fac775", "FK": "#85b7eb", "UQ": "#b4b2a9"}
# Filas del diagrama, de izquierda a derecha. La segunda va en sentido contrario (zigzag)
# para que Lote → Captura → Foto → Análisis quede seguido y el dibujo quepa a lo ancho.
FILAS_DIAGRAMA = [
    ["auth_user", "campo_productor", "campo_finca", "campo_cultivo"],
    ["campo_analisis", "campo_foto", "campo_captura", "campo_lote"],
    ["campo_planta", "campo_medicion", "campo_variable"],
]


def _grupo(tabla: str) -> str:
    return "analisis" if tabla in ANALISIS else "catalogo" if tabla in CATALOGO else "registro"


def _nodo(t) -> str:
    """Entidad como nodo de Graphviz: cabecera y una fila por campo, con su llave y su tipo."""
    cabecera = (
        f'<tr><td colspan="3" bgcolor="{COLOR_CABECERA[_grupo(t.tabla)]}">'
        f'<font color="#ffffff"><b>{escape(t.entidad)}</b></font><br/>'
        f'<font color="#d8d8d8" point-size="9">{t.tabla}</font></td></tr>'
    )
    filas = [cabecera]
    for c in t.campos:
        claves = " ".join(f'<font color="{COLOR_CLAVE[k]}">{k}</font>' for k in c.clave.split())
        tipo = escape(c.tipo) + (" ?" if c.nulo else "")
        filas.append(
            f'<tr><td align="left">{claves or " "}</td><td align="left">{c.nombre}</td>'
            f'<td align="left"><font color="#9a9a9a" point-size="10">{tipo}</font></td></tr>'
        )
    if t.externa:
        filas.append(
            '<tr><td colspan="3" align="left"><font color="#9a9a9a" point-size="10">'
            "… y otros campos propios de Django</font></td></tr>"
        )
    return (
        f'"{t.tabla}" [label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4" '
        f'color="#555555" bgcolor="#1a1d24">{"".join(filas)}</table>>];'
    )


def diagrama() -> str:
    lineas = []
    for fila in FILAS_DIAGRAMA:
        nodos = " ".join(f'"{t}"' for t in fila)
        lineas.append(f"{{rank=same; {nodos}}}")
        # Aristas invisibles: fijan el orden de izquierda a derecha dentro de la fila.
        lineas.append(" -> ".join(f'"{t}"' for t in fila) + " [style=invis, weight=10];")
    for r in relaciones():
        cabeza = "tee" if r["cardinalidad"] == "1 : 1" else "crow"
        cola = "tee" if r["obligatoria"] else "teeodot"
        estilo = "solid" if r["obligatoria"] else "dashed"
        lineas.append(
            f'"{r["ref"]}" -> "{r["tabla"]}" '
            f"[dir=both, arrowtail={cola}, arrowhead={cabeza}, style={estilo}, constraint=false];"
        )
    return "\n".join(
        [
            "digraph ER {",
            'graph [rankdir=TB, newrank=true, bgcolor="transparent", nodesep=0.7, ranksep=0.8];',
            'node [shape=plain, fontname="Helvetica", fontsize=12, fontcolor="#e8e8e8"];',
            'edge [color="#8a8f98", penwidth=1.3, arrowsize=1.1];',
            *(_nodo(t) for t in TABLAS),
            # Fila 1 sobre fila 2 sobre fila 3.
            '"campo_finca" -> "campo_captura" [style=invis];',
            '"campo_captura" -> "campo_medicion" [style=invis];',
            *lineas,
            "}",
        ]
    )


ANCHOS = {"Clave": 60, "Campo": 160, "Tipo": 110, "Vacío": 55, "Referencia": 260}


def _filas(t) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Clave": c.clave,
                "Campo": c.nombre,
                "Tipo": c.tipo,
                "Vacío": "sí" if c.nulo else "",
                "Referencia": f"{c.ref}.id · al borrar: {c.al_borrar}" if c.ref else "",
                "Descripción": c.nota,
            }
            for c in t.campos
        ]
    )


st.title("Modelo de datos")
st.markdown(
    "Estructura de la base de datos del **registro de campo** (`web/`, Django). Cada foto "
    "queda asociada a una captura con fecha, a un lote, a una finca y a su productor; cada "
    "análisis de la foto guarda las plantas detectadas y sus mediciones."
)

st.subheader("Diagrama entidad-relación")
st.graphviz_chart(diagrama(), width="stretch")
st.caption(
    "Verde: registro de campo · morado: resultado del análisis · gris: catálogos y cuentas. "
    "**PK** llave primaria · **FK** llave foránea · **UQ** valor único · **?** admite vacío. "
    "Líneas: una raya = uno, pata de gallo = muchos, círculo = opcional; punteada = relación "
    "opcional. El detalle de cada campo está en las tablas de abajo."
)

st.subheader("Tablas")
st.caption(
    "En los campos de texto opcionales Django guarda una cadena vacía en lugar de NULL; por "
    "eso no figuran como *vacío* aunque puedan dejarse en blanco."
)
for t in TABLAS:
    st.markdown(f"##### {t.entidad} · `{t.tabla}`")
    st.caption(t.descripcion)
    df = _filas(t)
    st.dataframe(
        df,
        hide_index=True,
        width="stretch",
        height=35 * (len(df) + 1) + 3,
        column_config={k: st.column_config.TextColumn(k, width=v) for k, v in ANCHOS.items()},
    )
    notas = [f"Único: ({', '.join(u)})" for u in t.unicos]
    if t.externa:
        notas.append("Se muestran solo los campos relevantes.")
    if notas:
        st.caption(" · ".join(notas))

st.subheader("Relaciones")
st.dataframe(
    pd.DataFrame(
        [
            {
                "Relación": f"{r['desde']} → {r['hacia']}",
                "Cardinalidad": r["cardinalidad"] + ("" if r["obligatoria"] else ", opcional"),
                "Llave foránea": r["llave"],
                "Al borrar el registro referenciado": r["al_borrar"],
            }
            for r in relaciones()
        ]
    ),
    hide_index=True,
    width="stretch",
    height=35 * (len(relaciones()) + 1) + 3,
)
st.caption(
    "*Cascada*: se borran también las filas que dependen de él. *Protegido*: no se puede borrar "
    "mientras otras filas lo usen. *Queda vacío*: la referencia pasa a NULL."
)

st.subheader("Decisiones de diseño")
st.markdown(
    "- **Una planta es una detección, no la planta física.** Sin georreferencia no es posible "
    "establecer que una planta de la foto de agosto es la misma de la foto de septiembre. "
    "`latitud` y `longitud` quedan reservadas para la Etapa I-B.\n"
    "- **Las variables son filas, no columnas.** Una medición nueva (NDVI, altura, diámetro "
    "de copa) se registra como una `Variable`, sin modificar el esquema.\n"
    "- **El análisis se versiona.** Cada análisis guarda la versión del método que lo "
    "produjo; al mejorar el método, las fotos se reanalizan sin perder los resultados previos.\n"
    "- **Densidad por hectárea solo con resolución conocida.** El área que cubre una foto se "
    "calcula con `gsd_cm_px` de la captura.\n"
    "- **Datos personales mínimos.** El productor puede registrarse sin documento de "
    "identidad; el consentimiento queda en `autoriza_datos` (Ley 1581 de 2012)."
)
st.caption(
    f"Fuente: [`web/campo/models.py`]({REPO}/web/campo/models.py) · "
    f"[`docs/modelo-datos.md`]({REPO}/docs/modelo-datos.md)"
)
