"""Herramienta mínima de anotación manual del ground truth.

    centinela annotate IMG.jpg

Clic izquierdo = marca una copa · clic derecho = deshace la última ·
tecla 's' = guarda IMG_gt.csv · tecla 'q' = cierra.

Requiere un backend interactivo de matplotlib (no funciona headless).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .io import load_image


def annotate(image_path: str | Path) -> Path:
    import matplotlib.pyplot as plt

    image_path = Path(image_path)
    rgb = load_image(image_path)
    points: list[tuple[float, float]] = []

    fig, ax = plt.subplots(figsize=(12, 9))
    ax.imshow(rgb)
    ax.set_title("clic izq: marcar · clic der: deshacer · 's': guardar · 'q': salir")
    scatter = ax.scatter([], [], s=40, facecolors="none", edgecolors="#30d158", linewidths=1.5)
    out_path = image_path.with_name(image_path.stem + "_gt.csv")

    def redraw():
        scatter.set_offsets(points if points else [[None, None]][:0] or [])
        ax.set_xlabel(f"{len(points)} copas marcadas")
        fig.canvas.draw_idle()

    def on_click(event):
        if event.inaxes != ax or event.xdata is None:
            return
        if event.button == 1:
            points.append((float(event.xdata), float(event.ydata)))
        elif event.button == 3 and points:
            points.pop()
        redraw()

    def on_key(event):
        if event.key == "s":
            pd.DataFrame(points, columns=["x", "y"]).to_csv(out_path, index=False)
            print(f"Guardado: {out_path} ({len(points)} puntos)")
        elif event.key == "q":
            plt.close(fig)

    fig.canvas.mpl_connect("button_press_event", on_click)
    fig.canvas.mpl_connect("key_press_event", on_key)
    plt.show()
    return out_path
