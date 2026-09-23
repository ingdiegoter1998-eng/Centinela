"""Herramienta mínima de anotación manual del ground truth.

    centinela annotate IMG.jpg [--desde IMG_centros.csv]

Clic izquierdo = marca una copa · clic derecho = borra el punto más cercano ·
tecla 's' = guarda IMG_gt.csv · tecla 'q' = cierra.

La lupa de la barra de matplotlib sirve para acercarse: mientras está activa, los clics
no marcan. Con `--desde` arranca con los puntos de ese CSV (columnas x,y o x_px,y_px), por ejemplo
la salida de `centinela centros`: se corrigen los errores en vez de marcar cada planta.

Requiere un backend interactivo de matplotlib (no funciona headless).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .io import load_image


def _puntos_iniciales(path: str | Path | None) -> list[tuple[float, float]]:
    if path is None:
        return []
    df = pd.read_csv(path)
    cols = ("x_px", "y_px") if "x_px" in df.columns else ("x", "y")
    return [(float(x), float(y)) for x, y in df[list(cols)].to_numpy()]


def annotate(image_path: str | Path, desde: str | Path | None = None) -> Path:
    import matplotlib.pyplot as plt

    image_path = Path(image_path)
    rgb = load_image(image_path)
    points = _puntos_iniciales(desde)

    fig, ax = plt.subplots(figsize=(12, 9))
    ax.imshow(rgb)
    ax.set_title("clic izq: marcar · clic der: borrar el más cercano · 's': guardar · 'q': salir")
    scatter = ax.scatter([], [], s=40, facecolors="none", edgecolors="#30d158", linewidths=1.5)
    out_path = image_path.with_name(image_path.stem + "_gt.csv")

    def redraw():
        scatter.set_offsets(points if points else [[None, None]][:0] or [])
        ax.set_xlabel(f"{len(points)} copas marcadas")
        fig.canvas.draw_idle()

    def on_click(event):
        if event.inaxes != ax or event.xdata is None:
            return
        barra = fig.canvas.toolbar
        if barra is not None and barra.mode:  # usando lupa o desplazamiento: no marcar
            return
        if event.button == 1:
            points.append((float(event.xdata), float(event.ydata)))
        elif event.button == 3 and points:
            d = [(px - event.xdata) ** 2 + (py - event.ydata) ** 2 for px, py in points]
            points.pop(d.index(min(d)))
        redraw()

    def on_key(event):
        if event.key == "s":
            pd.DataFrame(points, columns=["x", "y"]).to_csv(out_path, index=False)
            print(f"Guardado: {out_path} ({len(points)} puntos)")
        elif event.key == "q":
            plt.close(fig)

    fig.canvas.mpl_connect("button_press_event", on_click)
    fig.canvas.mpl_connect("key_press_event", on_key)
    redraw()
    plt.show()
    return out_path
