"""Demo del Proyecto Centinela — punto de entrada.

    streamlit run demo/app.py        (o doble clic en demo/iniciar.bat)

Dos páginas:

- **Analizar mi foto** (`analizar.py`): para cualquier persona. Sube una foto y recibe el
  conteo con su nivel de confianza, sin parámetros técnicos.
- **Laboratorio** (`laboratorio.py`): el pipeline con todos sus controles, para ver en vivo
  quién decide el conteo. Es la que usa el guion de la demo (docs/demo-en-vivo.md).

En local abre en el Laboratorio; en la copia pública (Streamlit Community Cloud), en
Analizar mi foto.
"""

from __future__ import annotations

import streamlit as st
from comun import PUBLICO

st.set_page_config(page_title="Centinela", page_icon="🌳", layout="wide")
st.markdown(
    "<style>[data-testid='stMetricValue']{font-size:2.6rem}</style>", unsafe_allow_html=True
)

analizar = st.Page("analizar.py", title="Analizar mi foto", icon="📷", default=PUBLICO)
laboratorio = st.Page("laboratorio.py", title="Laboratorio", icon="🔬", default=not PUBLICO)

with st.sidebar:
    st.markdown(
        "[Proyecto Centinela](https://ingdiegoter1998-eng.github.io/Centinela/) · "
        "[Código](https://github.com/ingdiegoter1998-eng/Centinela)"
    )

st.navigation([analizar, laboratorio]).run()
