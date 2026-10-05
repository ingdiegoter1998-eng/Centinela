"""Totales de ventas por jornada.

La jornada de un bar cruza la medianoche, así que «el día» va de `HORA_CORTE_JORNADA` (por
defecto las 6:00) a la misma hora del día siguiente. Una factura cuenta en la jornada en que
se cobró.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.db.models import ExpressionWrapper, F, IntegerField, Sum
from django.utils import timezone

from .models import Factura, Linea

_VENTA = ExpressionWrapper(F("cantidad") * F("precio"), output_field=IntegerField())
_COSTO = ExpressionWrapper(F("cantidad") * F("costo"), output_field=IntegerField())


def jornada_de(momento: datetime) -> date:
    """Fecha de la jornada a la que pertenece un instante (las 2 a. m. son de la noche anterior)."""
    local = timezone.localtime(momento)
    return (
        local.date() - timedelta(days=1)
        if local.hour < settings.HORA_CORTE_JORNADA
        else local.date()
    )


def rango_jornada(dia: date) -> tuple[datetime, datetime]:
    corte = time(settings.HORA_CORTE_JORNADA)
    zona = timezone.get_current_timezone()
    inicio = timezone.make_aware(datetime.combine(dia, corte), zona)
    fin = timezone.make_aware(datetime.combine(dia + timedelta(days=1), corte), zona)
    return inicio, fin


def resumen(dia: date) -> dict:
    inicio, fin = rango_jornada(dia)
    facturas = Factura.objects.filter(
        estado=Factura.Estado.PAGADA, cerrada_en__gte=inicio, cerrada_en__lt=fin
    )
    lineas = Linea.objects.filter(factura__in=facturas)

    totales = lineas.aggregate(venta=Sum(_VENTA), costo=Sum(_COSTO), unidades=Sum("cantidad"))
    venta = totales["venta"] or 0
    costo = totales["costo"] or 0
    n_facturas = facturas.count()

    por_metodo = {
        fila["factura__metodo_pago"]: fila["total"]
        for fila in lineas.values("factura__metodo_pago").annotate(total=Sum(_VENTA))
    }
    metodos = [
        {"nombre": etiqueta, "total": por_metodo.get(valor, 0)}
        for valor, etiqueta in Factura.Pago.choices
    ]

    productos = (
        lineas.values("producto__nombre", "producto__categoria__nombre")
        .annotate(unidades=Sum("cantidad"), venta=Sum(_VENTA), costo=Sum(_COSTO))
        .order_by("-unidades", "producto__nombre")
    )

    return {
        "dia": dia,
        "inicio": inicio,
        "fin": fin,
        "venta": venta,
        "costo": costo,
        "ganancia": venta - costo,
        "unidades": totales["unidades"] or 0,
        "n_facturas": n_facturas,
        "ticket_promedio": venta // n_facturas if n_facturas else 0,
        "metodos": metodos,
        "productos": [{**fila, "ganancia": fila["venta"] - fila["costo"]} for fila in productos],
        "facturas": facturas.select_related("mesa", "cliente")
        .prefetch_related("lineas")
        .order_by("-cerrada_en"),
    }


def cuentas_abiertas():
    """Lo que está en las mesas y aún no se cobra (se revisa antes de cerrar el bar)."""
    return (
        Factura.objects.filter(estado=Factura.Estado.ABIERTA)
        .select_related("mesa", "cliente")
        .prefetch_related("lineas")
        .order_by("mesa__orden", "mesa__nombre")
    )
