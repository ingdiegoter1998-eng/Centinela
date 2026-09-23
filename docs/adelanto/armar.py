"""Arma las páginas de presentación en dos destinos:

- `*.build.html` junto a cada fuente (no versionado): lo que se publica como página de Claude.
- `landing/public/*.html`: copias públicas dentro del sitio de GitHub Pages, con documento
  completo, una barra para navegar entre todas las páginas y los enlaces internos apuntando
  al propio sitio. Vite las copia tal cual a la raíz del sitio.

    python docs/adelanto/armar.py
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SITIO = AQUI.parents[1] / "landing" / "public"

IMAGENES = {
    "METODO_IMG": "metodo.jpg",
    "REAL_IMG": "real.jpg",
    "USDA_IMG": "real_usda.jpg",
}

# fuente → (archivo en el sitio, nombre en la barra)
PAGINAS = {
    "hoja-de-ruta.html": ("hoja-de-ruta.html", "Hoja de ruta"),
    "diapositivas.html": ("diapositivas.html", "Diapositivas"),
    "exposicion.html": ("guion.html", "Guion de exposición"),
    "index.html": ("adelanto.html", "Adelanto"),
}
DEMO = "https://centinela-demo.streamlit.app/"

# Enlaces a las páginas de Claude que, en el sitio, pasan a ser páginas propias.
ARTEFACTOS = {
    "https://claude.ai/artifact/SF1jDjsshuLq9YmPrq1S9s": "hoja-de-ruta.html",
    "https://claude.ai/artifact/V4NDYPXa7zK4qqJAeULorT": "diapositivas.html",
    "https://claude.ai/artifact/TVDWNvUEYSyEWpGnyHVMzC": "guion.html",
    "https://claude.ai/artifact/NTF6K524ypXfsVZiqbGdk6": "adelanto.html",
}

BARRA_CSS = """<style>
  .cn-barra { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; height: 38px;
    display: flex; align-items: center; gap: 4px; padding: 0 12px; overflow-x: auto;
    background: #0c1610; border-bottom: 1px solid #1d3225;
    font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .cn-barra a { color: #a2b4a6; text-decoration: none; padding: 6px 10px; border-radius: 4px;
    white-space: nowrap; }
  .cn-barra a:hover { color: #eef2ec; background: #14231a; }
  .cn-barra a[aria-current] { color: #eef2ec; background: #1d3225; }
  .cn-barra a:focus-visible { outline: 2px solid #59b072; outline-offset: 1px; }
  .cn-barra .cn-marca { color: #59b072; font-weight: 600; margin-right: 6px; }
  .cn-barra .cn-demo { margin-left: auto; background: #59b072; color: #0c1610; font-weight: 600; }
  .cn-barra .cn-demo:hover { background: #eef2ec; color: #0c1610; }
  .cn-espacio { height: 38px; }
</style>"""


def barra(actual: str) -> str:
    enlaces = ['<a class="cn-marca" href="./">Centinela</a>']
    for archivo, nombre in PAGINAS.values():
        marca = ' aria-current="page"' if archivo == actual else ""
        enlaces.append(f'<a href="{archivo}"{marca}>{nombre}</a>')
    enlaces.append(f'<a class="cn-demo" href="{DEMO}" target="_blank" rel="noreferrer">Probar la demo</a>')
    return f'<nav class="cn-barra" aria-label="Páginas del proyecto">{"".join(enlaces)}</nav>'


def data_uri(nombre: str) -> str:
    datos = (AQUI / nombre).read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(datos).decode("ascii")


def para_sitio(html: str, archivo: str) -> str:
    for url, local in ARTEFACTOS.items():
        html = html.replace(url, local)
    # Las diapositivas ocupan toda la pantalla: la barra flota sobre su margen superior.
    espacio = "" if archivo == "diapositivas.html" else '<div class="cn-espacio"></div>'
    return (
        '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8" />\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f"{BARRA_CSS}\n</head>\n<body>\n{barra(archivo)}\n{espacio}\n{html}\n</body>\n</html>\n"
    )


def main() -> None:
    uris = {marca: data_uri(archivo) for marca, archivo in IMAGENES.items()}
    SITIO.mkdir(parents=True, exist_ok=True)
    for fuente, (archivo, _) in PAGINAS.items():
        texto = (AQUI / fuente).read_text(encoding="utf-8")
        armada = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: uris[m.group(1)], texto)
        sobrantes = re.findall(r"\{\{[A-Z_]+\}\}", armada)
        if sobrantes:
            raise SystemExit(f"{fuente}: marcadores sin imagen: {sobrantes}")
        build = AQUI / fuente.replace(".html", ".build.html")
        build.write_text(armada, encoding="utf-8")
        (SITIO / archivo).write_text(para_sitio(armada, archivo), encoding="utf-8")
        print(f"{build.name:<26} y landing/public/{archivo:<18} {len(armada) // 1024:>5} KB")


if __name__ == "__main__":
    main()
