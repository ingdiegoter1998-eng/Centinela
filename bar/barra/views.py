"""Pantallas del personal. Sin login: pensado para la red local del bar.

Las pantallas que cambian en vivo (mesas, cuenta) se dividen en la página y un «panel» que es
solo el HTML de lo que cambia. El navegador pide el panel cada pocos segundos y después de cada
toque, y lo reemplaza: así todos los celulares ven lo mismo sin websockets ni librerías.
"""

from __future__ import annotations

import unicodedata
from datetime import date, timedelta

from django.conf import settings
from django.contrib import messages
from django.db.models import Prefetch
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from . import reportes, services
from .models import Categoria, Cliente, Factura, Linea, Mesa, Producto
from .services import CuentaError


def _alfabetico(texto: str) -> str:
    """Clave para ordenar en español: «Águila» va con la A, no después de la Z.

    SQLite ordena por bytes y manda las letras con tilde al final; por eso las listas que se
    muestran se ordenan aquí.
    """
    sin_tildes = unicodedata.normalize("NFD", texto.casefold())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c))


def _clave_producto(producto: Producto) -> tuple:
    return (
        producto.categoria.orden,
        _alfabetico(producto.categoria.nombre),
        _alfabetico(producto.nombre),
    )


# ── Mesas ──────────────────────────────────────────────────────────────────────────────────


def _facturas_abiertas_por_mesa() -> dict[int, Factura]:
    abiertas = (
        Factura.objects.filter(estado=Factura.Estado.ABIERTA)
        .select_related("cliente")
        .prefetch_related("lineas")
    )
    return {f.mesa_id: f for f in abiertas}


def _contexto_mesas() -> dict:
    abiertas = _facturas_abiertas_por_mesa()
    mesas = list(Mesa.objects.filter(activa=True))
    for mesa in mesas:
        mesa.factura = abiertas.get(mesa.pk)
    return {"mesas": mesas, "por_cobrar": sum(f.total for f in abiertas.values())}


def mesas(request: HttpRequest) -> HttpResponse:
    return render(request, "barra/mesas.html", _contexto_mesas())


def mesas_panel(request: HttpRequest) -> HttpResponse:
    return render(request, "barra/_mesas_panel.html", _contexto_mesas())


# ── Cuenta de una mesa ─────────────────────────────────────────────────────────────────────


def _contexto_cuenta(mesa: Mesa, mensaje: str = "") -> dict:
    factura = (
        Factura.objects.filter(mesa=mesa, estado=Factura.Estado.ABIERTA)
        .select_related("cliente")
        .prefetch_related(Prefetch("lineas", queryset=Linea.objects.select_related("producto")))
        .first()
    )
    lineas = list(factura.lineas.all()) if factura else []
    en_cuenta = {linea.producto_id: linea.cantidad for linea in lineas}
    productos = sorted(
        Producto.objects.filter(activo=True).select_related("categoria"), key=_clave_producto
    )
    for producto in productos:
        producto.en_cuenta = en_cuenta.get(producto.pk, 0)
    return {
        "mesa": mesa,
        "factura": factura,
        "lineas": lineas,
        "total": sum(linea.subtotal for linea in lineas),
        "n_items": sum(linea.cantidad for linea in lineas),
        "categorias": sorted(
            Categoria.objects.filter(productos__activo=True).distinct(),
            key=lambda c: (c.orden, _alfabetico(c.nombre)),
        ),
        "productos": productos,
        "clientes": sorted(Cliente.objects.all(), key=lambda c: _alfabetico(c.nombre)),
        "metodos": Factura.Pago.choices,
        "mensaje": mensaje,
    }


def cuenta(request: HttpRequest, mesa_id: int) -> HttpResponse:
    mesa = get_object_or_404(Mesa, pk=mesa_id)
    return render(request, "barra/cuenta.html", _contexto_cuenta(mesa))


def cuenta_panel(request: HttpRequest, mesa_id: int) -> HttpResponse:
    mesa = get_object_or_404(Mesa, pk=mesa_id)
    return render(request, "barra/_cuenta_panel.html", _contexto_cuenta(mesa))


@require_POST
def cuenta_accion(request: HttpRequest, mesa_id: int) -> HttpResponse:
    """Un toque del personal. Responde con el panel actualizado (o a dónde ir si la cuenta se cerró)."""
    mesa = get_object_or_404(Mesa, pk=mesa_id)
    accion = request.POST.get("accion", "")
    producto = _entero(request.POST.get("producto"))
    mensaje = ""
    try:
        if accion == "agregar" and producto:
            services.agregar(mesa, producto)
        elif accion == "quitar" and producto:
            services.quitar(mesa, producto)
        elif accion == "cliente":
            services.asignar_cliente(mesa, _entero(request.POST.get("cliente")))
        elif accion == "cliente_nuevo":
            services.crear_cliente(mesa, request.POST.get("nombre", ""))
        elif accion == "cobrar":
            factura = services.cobrar(mesa, request.POST.get("metodo", ""))
            return JsonResponse({"ir": reverse("factura", args=[factura.pk])})
        elif accion == "anular":
            services.anular(mesa)
            return JsonResponse({"ir": reverse("mesas")})
    except CuentaError as error:
        mensaje = str(error)
    return render(request, "barra/_cuenta_panel.html", _contexto_cuenta(mesa, mensaje))


def _entero(valor: str | None) -> int | None:
    try:
        return int(valor) if valor else None
    except ValueError:
        return None


# ── Inventario ─────────────────────────────────────────────────────────────────────────────


def inventario(request: HttpRequest) -> HttpResponse:
    productos = sorted(
        Producto.objects.filter(activo=True).select_related("categoria"), key=_clave_producto
    )
    bajos = [p for p in productos if p.stock_bajo or p.agotado]
    valor_costo = sum(p.stock * p.costo for p in productos if p.controla_stock and p.stock > 0)
    return render(
        request,
        "barra/inventario.html",
        {"productos": productos, "bajos": bajos, "valor_costo": valor_costo},
    )


@require_POST
def inventario_mover(request: HttpRequest) -> HttpResponse:
    producto = get_object_or_404(Producto, pk=_entero(request.POST.get("producto")))
    cantidad = _entero(request.POST.get("cantidad"))
    nota = request.POST.get("nota", "").strip()[:200]
    try:
        if cantidad is None:
            raise CuentaError("Escribe una cantidad.")
        if request.POST.get("tipo") == "conteo":
            if cantidad < 0:
                raise CuentaError("El conteo no puede ser negativo.")
            services.contar(producto, cantidad, nota)
            messages.success(request, f"{producto.nombre}: quedan {cantidad}.")
        else:
            services.comprar(producto, cantidad, _entero(request.POST.get("costo")), nota)
            messages.success(request, f"{producto.nombre}: entraron {cantidad}.")
    except CuentaError as error:
        messages.error(request, str(error))
    return redirect("inventario")


# ── Ventas ─────────────────────────────────────────────────────────────────────────────────


def ventas(request: HttpRequest) -> HttpResponse:
    hoy = reportes.jornada_de(timezone.now())
    try:
        dia = date.fromisoformat(request.GET.get("fecha", ""))
    except ValueError:
        dia = hoy
    contexto = reportes.resumen(dia)
    contexto.update(
        {
            "es_hoy": dia == hoy,
            "anterior": dia - timedelta(days=1),
            "siguiente": dia + timedelta(days=1) if dia < hoy else None,
            "abiertas": list(reportes.cuentas_abiertas()),
            "hora_corte": settings.HORA_CORTE_JORNADA,
        }
    )
    return render(request, "barra/ventas.html", contexto)


def factura(request: HttpRequest, factura_id: int) -> HttpResponse:
    factura = get_object_or_404(
        Factura.objects.select_related("mesa", "cliente").prefetch_related(
            Prefetch("lineas", queryset=Linea.objects.select_related("producto"))
        ),
        pk=factura_id,
    )
    return render(request, "barra/factura.html", {"factura": factura})
