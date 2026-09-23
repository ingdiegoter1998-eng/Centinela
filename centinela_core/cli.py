"""Interfaz de línea de comandos.

    centinela count IMG.jpg [--config config.yaml] [--debug]
    centinela centros IMG.jpg [--forma estrella|copa] [--tamano PX] [--gt GT.csv]
    centinela eval  IMG.jpg GT.csv [--config config.yaml] [--errors]
    centinela characterize IMG.jpg [--config config.yaml]
    centinela make-synthetic OUT.png [--seed 0] [--platanal]
    centinela annotate IMG.jpg [--desde PUNTOS.csv]
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
    from .stability import estabilidad

    cfg = Config.load(args.config)
    result = run(args.image, cfg)
    stem = Path(args.image).with_suffix("")
    est = (
        estabilidad(result.detections, min_samples=cfg.cluster.min_samples,
                    dominant=cfg.cluster.dominant, features=cfg.cluster.features)
        if cfg.cluster.method == "dbscan"
        else None
    )

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
        metodo=cfg.cluster.method,
        decision=result.decision,
        estabilidad=est.veredicto if est else None,
    )

    print(f"Árboles detectados: {result.n_trees}")
    print(f"Manchas totales:    {len(result.detections)}")
    print(f"Decidió el conteo:  {_DECISION[result.decision]}")
    if est:
        print(f"Estabilidad (eps):  {est.resumen()}")
    print(f"Salida:             {stem}_detecciones.csv, {stem}_overlay.png, {stem}_manifest.yaml")


_DECISION = {
    "dbscan": "DBSCAN (cluster dominante)",
    "fallback": "watershed — DBSCAN no formó ningún cluster y toda mancha cuenta",
    "watershed": "watershed (método sin agrupar)",
}


_FUENTE_ESCALA = {
    "autocorrelacion": "estimada (periodo de la plantación)",
    "manual": "fijada a mano",
    "sin_periodo": "no se pudo estimar — la foto no tiene periodo claro; usa --tamano",
}


def _cmd_centros(args: argparse.Namespace) -> None:
    from . import viz
    from .centros import detectar
    from .evaluate import evaluate
    from .io import load_ground_truth, load_image, save_detections

    res = detectar(load_image(args.image), args.forma, args.tamano)
    stem = Path(args.image).with_suffix("")
    save_detections(res.detecciones, f"{stem}_centros.csv")
    viz.centros_overlay(res, f"{stem}_centros.png")

    lo, hi = res.rango
    print(f"Plantas detectadas: {res.n}")
    if res.escala.px:
        print(f"Con la escala ±10 %: entre {lo} y {hi}"
              + (" — consistente" if res.consistente else " — el conteo depende de la escala"))
    escala = f"{res.escala.px} px, " if res.escala.px else ""
    print(f"Escala:             {escala}{_FUENTE_ESCALA[res.escala.fuente]}")
    print(f"Forma:              {res.forma}")
    if args.gt and res.escala.px:
        r = evaluate(res.detecciones[["x_px", "y_px"]].to_numpy(), load_ground_truth(args.gt),
                     0.4 * (res.escala.px or 0))
        print(f"Contra {Path(args.gt).name}: P {r.precision:.3f} · R {r.recall:.3f} · "
              f"F1 {r.f1:.3f} (radio {0.4 * (res.escala.px or 0):.0f} px)")
    print(f"Salida:             {stem}_centros.csv, {stem}_centros.png")


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
    from .synthetic import make_orchard, make_plantain

    if args.platanal:
        img, gt = make_plantain(seed=args.seed)
    else:
        img, gt = make_orchard(seed=args.seed, n_anomalous=args.anomalous, n_weeds=args.weeds)
    out = Path(args.out)
    save_image(out, img)
    gt[["x", "y"]].to_csv(out.with_name(out.stem + "_gt.csv"), index=False)
    print(f"{len(gt)} plantas · {out} · {out.with_name(out.stem + '_gt.csv')}")


def _cmd_annotate(args: argparse.Namespace) -> None:
    from .annotate import annotate

    annotate(args.image, args.desde)


def _cmd_characterize(args: argparse.Namespace) -> None:
    from . import viz
    from .config import Config
    from .health import characterize, summary
    from .io import save_detections
    from .pipeline import run

    cfg = Config.load(args.config)
    result = run(args.image, cfg)
    result.detections = characterize(
        result.detections,
        vigor_index=cfg.health.vigor_index,
        z_threshold=cfg.health.z_threshold,
        metrics=cfg.health.metrics,
        min_trees=cfg.health.min_trees,
    )
    stem = Path(args.image).with_suffix("")
    save_detections(result.detections, f"{stem}_estado.csv")
    viz.health_overlay(result, f"{stem}_estado.png")

    s = summary(result.detections)
    print(f"{'árboles':>16}: {s['n_trees']}")
    print(f"{'para revisar':>16}: {s['n_flagged']} ({s['pct_flagged']:.1f} %)")
    for motivo, n in s["por_motivo"].items():
        print(f"{motivo:>16}: {n}")
    print(f"{'salida':>16}: {stem}_estado.csv, {stem}_estado.png")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="centinela", description=__doc__)
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("count", help="cuenta árboles en una imagen")
    c.add_argument("image")
    c.add_argument("--config", default=None)
    c.add_argument("--debug", action="store_true", help="guarda el panel de depuración")
    c.set_defaults(func=_cmd_count)

    ce = sub.add_parser(
        "centros", help="cuenta plantas buscando su centro (plátano, palma, copas pegadas)"
    )
    ce.add_argument("image")
    ce.add_argument(
        "--forma", choices=["estrella", "copa"], default="estrella",
        help="estrella: plátano, banano, palma · copa: cítricos, cacao, frutales",
    )
    ce.add_argument(
        "--tamano", type=float, default=None,
        help="distancia entre plantas vecinas en px (por defecto se estima)",
    )
    ce.add_argument("--gt", default=None, help="CSV x,y de conteo manual para medir P/R/F1")
    ce.set_defaults(func=_cmd_centros)

    e = sub.add_parser("eval", help="evalúa contra un conteo manual")
    e.add_argument("image")
    e.add_argument("gt")
    e.add_argument("--config", default=None)
    e.add_argument("--errors", action="store_true", help="guarda overlay de TP/FP/FN")
    e.set_defaults(func=_cmd_eval)

    s = sub.add_parser("make-synthetic", help="genera un huerto sintético con GT")
    s.add_argument("out")
    s.add_argument("--seed", type=int, default=0)
    s.add_argument(
        "--anomalous", type=int, default=0,
        help="cuántos árboles deteriorados inyectar (Etapa II)",
    )
    s.add_argument(
        "--weeds", type=int, default=0,
        help="cuántas manchas de maleza sembrar entre hileras (no entran al GT)",
    )
    s.add_argument(
        "--platanal", action="store_true",
        help="platanal (rosetas de hojas sobre pasto) en vez de huerto de copas redondas",
    )
    s.set_defaults(func=_cmd_make_synthetic)

    ch = sub.add_parser("characterize", help="marca árboles a revisar (Etapa II)")
    ch.add_argument("image")
    ch.add_argument("--config", default=None)
    ch.set_defaults(func=_cmd_characterize)

    a = sub.add_parser("annotate", help="marca copas a mano (matplotlib interactivo)")
    a.add_argument("image")
    a.add_argument(
        "--desde", default=None,
        help="CSV con puntos de partida (p. ej. IMG_centros.csv): se corrige en vez de marcar todo",
    )
    a.set_defaults(func=_cmd_annotate)

    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
