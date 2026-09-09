"""Interfaz de línea de comandos.

    centinela count IMG.jpg [--config config.yaml] [--debug]
    centinela eval  IMG.jpg GT.csv [--config config.yaml] [--errors]
    centinela make-synthetic OUT.png [--seed 0]
    centinela annotate IMG.jpg
"""

from __future__ import annotations

import argparse
from pathlib import Path

from . import __version__


def _cmd_count(args: argparse.Namespace) -> None:
    from . import viz
    from .config import Config
    from .io import save_detections, write_manifest
    from .pipeline import run

    cfg = Config.load(args.config)
    result = run(args.image, cfg)
    stem = Path(args.image).with_suffix("")

    save_detections(result.detections, f"{stem}_detecciones.csv")
    viz.overlay(result, f"{stem}_overlay.png")
    if args.debug:
        viz.debug_panel(result, f"{stem}_debug.png")
    write_manifest(
        f"{stem}_manifest.yaml",
        imagen=Path(args.image).name,
        pipeline_version=__version__,
        indice_vegetacion=cfg.vegetation.index,
        config=args.config or "(defaults)",
        arboles_detectados=result.n_trees,
        manchas_totales=len(result.detections),
    )

    print(f"Árboles detectados: {result.n_trees}")
    print(f"Manchas totales:    {len(result.detections)}")
    print(f"Salida:             {stem}_detecciones.csv, {stem}_overlay.png, {stem}_manifest.yaml")


def _cmd_eval(args: argparse.Namespace) -> None:
    from . import viz
    from .config import Config
    from .evaluate import evaluate
    from .io import load_ground_truth
    from .pipeline import run

    cfg = Config.load(args.config)
    result = run(args.image, cfg)
    gt = load_ground_truth(args.gt)
    det_xy = result.trees[["x_px", "y_px"]].to_numpy()
    res = evaluate(det_xy, gt, cfg.evaluate.match_radius_px)

    print(f"{'detectados':>14}: {res.n_detected}")
    print(f"{'manual (GT)':>14}: {res.n_gt}")
    print(f"{'TP / FP / FN':>14}: {res.tp} / {res.fp} / {res.fn}")
    print(f"{'precision':>14}: {res.precision:.3f}")
    print(f"{'recall':>14}: {res.recall:.3f}")
    print(f"{'F1':>14}: {res.f1:.3f}")
    print(f"{'error conteo':>14}: {res.count_error:.1%}")

    if args.errors:
        stem = Path(args.image).with_suffix("")
        viz.errors_overlay(result, gt, cfg.evaluate.match_radius_px, f"{stem}_errores.png")
        print(f"{'':>14}  {stem}_errores.png")


def _cmd_make_synthetic(args: argparse.Namespace) -> None:
    from .io import save_image
    from .synthetic import make_orchard

    img, gt = make_orchard(seed=args.seed)
    out = Path(args.out)
    save_image(out, img)
    gt.to_csv(out.with_name(out.stem + "_gt.csv"), index=False)
    print(f"{len(gt)} árboles · {out} · {out.with_name(out.stem + '_gt.csv')}")


def _cmd_annotate(args: argparse.Namespace) -> None:
    from .annotate import annotate

    annotate(args.image)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="centinela", description=__doc__)
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("count", help="cuenta árboles en una imagen")
    c.add_argument("image")
    c.add_argument("--config", default=None)
    c.add_argument("--debug", action="store_true", help="guarda el panel de depuración")
    c.set_defaults(func=_cmd_count)

    e = sub.add_parser("eval", help="evalúa contra un conteo manual")
    e.add_argument("image")
    e.add_argument("gt")
    e.add_argument("--config", default=None)
    e.add_argument("--errors", action="store_true", help="guarda overlay de TP/FP/FN")
    e.set_defaults(func=_cmd_eval)

    s = sub.add_parser("make-synthetic", help="genera un huerto sintético con GT")
    s.add_argument("out")
    s.add_argument("--seed", type=int, default=0)
    s.set_defaults(func=_cmd_make_synthetic)

    a = sub.add_parser("annotate", help="marca copas a mano (matplotlib interactivo)")
    a.add_argument("image")
    a.set_defaults(func=_cmd_annotate)

    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
