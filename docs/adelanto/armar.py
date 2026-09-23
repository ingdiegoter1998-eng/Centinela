"""Arma las páginas publicables: sustituye los marcadores {{..._IMG}} por las imágenes
embebidas en base64 y escribe `*.build.html` (no versionado) junto a cada fuente.

    python docs/adelanto/armar.py
"""

from __future__ import annotations

import base64
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent

IMAGENES = {
    "METODO_IMG": "metodo.jpg",
    "REAL_IMG": "real.jpg",
    "USDA_IMG": "real_usda.jpg",
}
PAGINAS = ("index.html", "exposicion.html", "diapositivas.html")


def data_uri(nombre: str) -> str:
    datos = (AQUI / nombre).read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(datos).decode("ascii")


def main() -> None:
    uris = {marca: data_uri(archivo) for marca, archivo in IMAGENES.items()}
    for pagina in PAGINAS:
        fuente = (AQUI / pagina).read_text(encoding="utf-8")
        armada = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: uris[m.group(1)], fuente)
        sobrantes = re.findall(r"\{\{[A-Z_]+\}\}", armada)
        if sobrantes:
            raise SystemExit(f"{pagina}: marcadores sin imagen: {sobrantes}")
        destino = AQUI / pagina.replace(".html", ".build.html")
        destino.write_text(armada, encoding="utf-8")
        print(f"{destino.name:<26} {len(armada) // 1024:>5} KB")


if __name__ == "__main__":
    main()
