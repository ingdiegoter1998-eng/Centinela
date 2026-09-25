"""Consulta: tablero de fincas y lotes, e historial de conteos de cada lote por fecha."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404, render
from django.views.static import serve

from .models import Analisis, Captura, Finca, Foto, Lote


def _ultimo_analisis(lote: Lote) -> Analisis | None:
    return (
        Analisis.objects.filter(foto__captura__lote=lote, estado=Analisis.COMPLETO)
        .select_related("foto__captura")
        .order_by("-foto__captura__fecha", "-ejecutado")
        .first()
    )


@login_required
def tablero(request):
    fincas = Finca.objects.select_related("productor").prefetch_related(
        Prefetch("lotes", queryset=Lote.objects.select_related("cultivo"))
    )
    filas = []
    for finca in fincas:
        lotes = [(lote, _ultimo_analisis(lote)) for lote in finca.lotes.all()]
        filas.append((finca, lotes))
    totales = {
        "fincas": fincas.count(),
        "lotes": Lote.objects.count(),
        "fotos": Foto.objects.count(),
        "analisis": Analisis.objects.filter(estado=Analisis.COMPLETO).count(),
    }
    return render(request, "campo/tablero.html", {"filas": filas, "totales": totales})


@login_required
def lote(request, pk: int):
    lote = get_object_or_404(Lote.objects.select_related("finca__productor", "cultivo"), pk=pk)
    capturas = []
    for captura in Captura.objects.filter(lote=lote).prefetch_related("fotos__analisis"):
        fotos = [(foto, foto.analisis.filter(estado=Analisis.COMPLETO).first()) for foto in captura.fotos.all()]
        capturas.append((captura, fotos))
    return render(request, "campo/lote.html", {"lote": lote, "capturas": capturas})


@login_required
def foto(request, path: str):
    """Sirve las fotos subidas solo a quien tiene sesión: son datos de las fincas."""
    return serve(request, path, document_root=settings.MEDIA_ROOT)
