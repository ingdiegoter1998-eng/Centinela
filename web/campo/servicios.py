"""Corre el método de conteo de `centinela_core` sobre una foto y guarda el resultado.

Usa la detección de centros (`centinela_core.centros`), la misma de la página "Analizar mi
foto" de la demo: un punto por planta y el conteo con su sensibilidad a la escala.
"""

from __future__ import annotations

import time

import numpy as np
from django.db import transaction

from centinela_core import __version__ as VERSION_CORE
from centinela_core.centros import detectar, revisar_vigor
from centinela_core.io import load_image

from .models import Analisis, Foto, Medicion, Planta, Variable

VARIABLES = {
    "puntaje": ("Intensidad del centro", "", "Qué tan marcado es el centro de la planta en el mapa del método."),
    "vigor_vari": ("Vigor (VARI)", "", "Índice de verdor VARI promedio alrededor del centro de la planta."),
    "z_vigor": ("Vigor relativo", "z", "Cuántas desviaciones está la planta por debajo del vigor típico de la foto."),
}


def _variables() -> dict[str, Variable]:
    out = {}
    for codigo, (nombre, unidad, descripcion) in VARIABLES.items():
        out[codigo], _ = Variable.objects.get_or_create(
            codigo=codigo, defaults={"nombre": nombre, "unidad": unidad, "descripcion": descripcion}
        )
    return out


def analizar_foto(foto: Foto, forma: str | None = None, tamano_px: float | None = None) -> Analisis:
    """Crea un `Analisis` para la foto, con sus plantas y mediciones. Nunca lanza: si el método
    falla, el análisis queda en estado de error con el mensaje."""
    forma = forma or foto.captura.lote.cultivo.forma_conteo
    analisis = Analisis.objects.create(
        foto=foto,
        forma=forma,
        parametros={"tamano_px": tamano_px} if tamano_px else {},
        version=VERSION_CORE,
    )
    inicio = time.perf_counter()
    try:
        res = detectar(load_image(foto.imagen.path), forma, tamano_px)
        dets = revisar_vigor(res)
    except Exception as e:  # noqa: BLE001 — el error queda registrado en el análisis
        analisis.estado, analisis.mensaje = Analisis.ERROR, f"{type(e).__name__}: {e}"
        analisis.duracion_s = time.perf_counter() - inicio
        analisis.save()
        return analisis

    with transaction.atomic():
        lo, hi = res.rango
        analisis.conteo = res.n
        analisis.conteo_min, analisis.conteo_max = lo, hi
        analisis.escala_px = res.escala.px
        if res.n == 0:
            analisis.confianza = Analisis.VACIO
            analisis.mensaje = "No se encontró un patrón de siembra ni plantas en la foto."
        elif res.consistente:
            analisis.confianza = Analisis.CONSISTENTE
        else:
            analisis.confianza = Analisis.RANGO
        analisis.estado = Analisis.COMPLETO

        variables = _variables()
        plantas = Planta.objects.bulk_create(
            Planta(
                analisis=analisis,
                numero=i + 1,
                x_px=float(d.x_px),
                y_px=float(d.y_px),
                revisar=bool(d.revisar),
                motivo="menos verde que el resto de la foto" if d.revisar else "",
            )
            for i, d in enumerate(dets.itertuples())
        )
        mediciones = []
        for planta, d in zip(plantas, dets.itertuples(), strict=True):
            for codigo, valor in (("puntaje", d.puntaje), ("vigor_vari", d.vigor), ("z_vigor", d.z_vigor)):
                if valor is not None and np.isfinite(valor):
                    mediciones.append(
                        Medicion(planta=planta, variable=variables[codigo], valor=float(valor))
                    )
        Medicion.objects.bulk_create(mediciones)
        analisis.duracion_s = time.perf_counter() - inicio
        analisis.save()
    return analisis
