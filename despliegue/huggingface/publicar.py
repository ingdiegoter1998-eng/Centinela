"""Arma la demo pública y la sube a un Space de Hugging Face.

    python despliegue/huggingface/publicar.py                 # arma y sube a <usuario>/centinela-demo
    python despliegue/huggingface/publicar.py --armar-solo D  # solo arma el paquete en D (para probar)

Requiere haber iniciado sesión una vez con `hf auth login` (token de escritura).

El Space lleva solo lo que la app necesita, y de las imágenes solo las de licencia clara
(ver README.md de esta carpeta). `palma_lote.jpg` y `sep_topright.png` quedan fuera: su
procedencia no está registrada (data/ATRIBUCIONES.md).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent
NOMBRE_SPACE = "centinela-demo"

ARCHIVOS = [
    "pyproject.toml",
    "config.yaml",
    "LICENSE",
    "demo/app.py",
    "data/samples/huerto_demo.png",
    "data/samples/huerto_demo_gt.csv",
    "data/samples/huerto_maleza.png",
    "data/samples/huerto_maleza_gt.csv",
    "data/samples/banco/huerto_reticula_usda.jpg",
    "data/samples/banco/palma_aceite_rio.jpg",
    "data/samples/platano_div8.png",
]
CARPETAS = ["centinela_core"]
# Lo que el script administra en el Space: se borra antes de subir para no dejar restos.
ADMINISTRADO = ["centinela_core/**", "demo/**", "data/**"]


def armar(destino: Path) -> Path:
    destino.mkdir(parents=True, exist_ok=True)
    for rel in ARCHIVOS:
        (destino / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(RAIZ / rel, destino / rel)
    for rel in CARPETAS:
        shutil.copytree(
            RAIZ / rel, destino / rel, dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
        )
    shutil.copy2(AQUI / "Dockerfile", destino / "Dockerfile")
    shutil.copy2(AQUI / "README.md", destino / "README.md")
    return destino


def commit_actual() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=RAIZ, capture_output=True,
            text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "sin git"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--armar-solo", metavar="DIR", help="solo arma el paquete en DIR, no sube nada")
    p.add_argument("--space", help=f"id del Space (por defecto <usuario>/{NOMBRE_SPACE})")
    p.add_argument("--privado", action="store_true", help="crea el Space privado")
    args = p.parse_args()

    if args.armar_solo:
        print(f"Paquete armado en {armar(Path(args.armar_solo))}")
        return

    from huggingface_hub import HfApi

    api = HfApi()
    usuario = api.whoami()["name"]
    repo_id = args.space or f"{usuario}/{NOMBRE_SPACE}"

    api.create_repo(
        repo_id, repo_type="space", space_sdk="docker", private=args.privado, exist_ok=True
    )
    with tempfile.TemporaryDirectory() as tmp:
        api.upload_folder(
            folder_path=armar(Path(tmp) / "space"),
            repo_id=repo_id,
            repo_type="space",
            commit_message=f"Sincroniza con GitHub {commit_actual()}",
            delete_patterns=ADMINISTRADO,
        )
    print(f"Subido. El Space se está construyendo: https://huggingface.co/spaces/{repo_id}")


if __name__ == "__main__":
    main()
