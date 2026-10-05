"""Operaciones sobre cuentas e inventario. Todo lo que toca el stock pasa por aquí.

Las vistas solo traducen peticiones a estas funciones. Cada una es una transacción: o queda
completa (línea + stock) o no queda nada, aunque dos celulares toquen la misma mesa a la vez.

Criterio de «personal con prisa»: si la pantalla de un celular quedó desactualizada (otro mesero
ya quitó el producto, ya cobró la mesa), la operación no falla con un error: se aplica sobre el
estado real o se ignora. La pantalla se corrige sola en el siguiente refresco.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from .models import Cliente, Factura, Linea, Mesa, Movimiento, Producto


class CuentaError(Exception):
    """Operación no permitida (p. ej. cobrar una cuenta vacía). El mensaje se muestra al usuario."""


def factura_abierta(mesa: Mesa) -> Factura | None:
    return Factura.objects.filter(mesa=mesa, estado=Factura.Estado.ABIERTA).first()


def _cuenta_de(mesa: Mesa) -> Factura:
    """La cuenta abierta de la mesa; la crea si no hay (la restricción única evita duplicados)."""
    factura, _ = Factura.objects.get_or_create(mesa=mesa, estado=Factura.Estado.ABIERTA)
    return factura


@transaction.atomic
def agregar(mesa: Mesa, producto_id: int, cantidad: int = 1) -> None:
    producto = Producto.objects.filter(pk=producto_id, activo=True).first()
    if producto is None:
        return
    factura = _cuenta_de(mesa)
    linea, _ = Linea.objects.get_or_create(
        factura=factura,
        producto=producto,
        defaults={"cantidad": 0, "precio": producto.precio, "costo": producto.costo},
    )
    Linea.objects.filter(pk=linea.pk).update(cantidad=F("cantidad") + cantidad)
    if producto.controla_stock:
        Producto.objects.filter(pk=producto.pk).update(stock=F("stock") - cantidad)


@transaction.atomic
def quitar(mesa: Mesa, producto_id: int, cantidad: int = 1) -> None:
    factura = factura_abierta(mesa)
    if factura is None:
        return
    linea = factura.lineas.select_related("producto").filter(producto_id=producto_id).first()
    if linea is None:
        return
    n = min(cantidad, linea.cantidad)
    if n == linea.cantidad:
        linea.delete()
    else:
        Linea.objects.filter(pk=linea.pk).update(cantidad=F("cantidad") - n)
    if linea.producto.controla_stock:
        Producto.objects.filter(pk=linea.producto_id).update(stock=F("stock") + n)
    if not factura.lineas.exists():
        factura.delete()  # una cuenta sin nada pedido no existe: la mesa vuelve a estar libre


@transaction.atomic
def asignar_cliente(mesa: Mesa, cliente_id: int | None) -> None:
    """Pone el cliente de la cuenta (`None` = anónimo)."""
    cliente = Cliente.objects.filter(pk=cliente_id).first() if cliente_id else None
    factura = _cuenta_de(mesa)
    factura.cliente = cliente
    factura.save(update_fields=["cliente"])


@transaction.atomic
def crear_cliente(mesa: Mesa, nombre: str) -> None:
    """Crea un cliente al vuelo desde la mesa y se lo asigna a la cuenta."""
    nombre = nombre.strip()
    if not nombre:
        return
    cliente, _ = Cliente.objects.get_or_create(nombre=nombre)
    asignar_cliente(mesa, cliente.pk)


@transaction.atomic
def cobrar(mesa: Mesa, metodo: str) -> Factura:
    if metodo not in Factura.Pago.values:
        raise CuentaError("Elige cómo pagó el cliente.")
    factura = factura_abierta(mesa)
    if factura is None or not factura.lineas.exists():
        raise CuentaError("La cuenta está vacía o ya fue cobrada.")
    ultimo = Factura.objects.aggregate(m=Max("numero"))["m"] or 0
    factura.numero = ultimo + 1
    factura.estado = Factura.Estado.PAGADA
    factura.metodo_pago = metodo
    factura.cerrada_en = timezone.now()
    factura.save()
    return factura


@transaction.atomic
def anular(mesa: Mesa) -> None:
    """Descarta la cuenta abierta y devuelve al inventario todo lo que tenía."""
    factura = factura_abierta(mesa)
    if factura is None:
        return
    for linea in factura.lineas.select_related("producto"):
        if linea.producto.controla_stock:
            Producto.objects.filter(pk=linea.producto_id).update(stock=F("stock") + linea.cantidad)
    if factura.lineas.exists():
        factura.estado = Factura.Estado.ANULADA
        factura.cerrada_en = timezone.now()
        factura.save(update_fields=["estado", "cerrada_en"])
    else:
        factura.delete()


@transaction.atomic
def comprar(producto: Producto, cantidad: int, costo: int | None = None, nota: str = "") -> None:
    """Entra mercancía. Si se informa el costo, queda como el costo de compra vigente."""
    if cantidad <= 0:
        raise CuentaError("La cantidad que entra debe ser mayor que cero.")
    Movimiento.objects.create(
        producto=producto,
        motivo=Movimiento.Motivo.COMPRA,
        cantidad=cantidad,
        costo_unitario=costo,
        nota=nota,
    )
    cambios = {"stock": F("stock") + cantidad}
    if costo is not None:
        cambios["costo"] = costo
    Producto.objects.filter(pk=producto.pk).update(**cambios)


@transaction.atomic
def contar(producto: Producto, stock_real: int, nota: str = "") -> None:
    """Fija el stock a lo que se contó en el estante; guarda la diferencia como movimiento."""
    actual = Producto.objects.select_for_update().get(pk=producto.pk).stock
    if stock_real == actual:
        return
    Movimiento.objects.create(
        producto=producto,
        motivo=Movimiento.Motivo.AJUSTE,
        cantidad=stock_real - actual,
        nota=nota,
    )
    Producto.objects.filter(pk=producto.pk).update(stock=stock_real)
