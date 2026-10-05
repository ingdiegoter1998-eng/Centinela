"""Modelo de datos del bar.

    Categoria 1─* Producto 1─* Movimiento      (compras y conteos de inventario)
    Mesa 1─* Factura *─1 Cliente               (sin cliente = anónimo)
    Factura 1─* Linea *─1 Producto

Decisiones que conviene tener presentes:

- **Una `Factura` abierta es la cuenta de la mesa.** Se abre sola al pedir el primer producto,
  se va llenando durante la noche y al cobrarla pasa a `pagada` y recibe su número. Así
  «mesa → cliente → factura» es un solo flujo y no hay una cuenta aparte de la factura.
  Una mesa tiene a lo sumo una factura abierta (lo garantiza una restricción en la base).
- **La `Linea` guarda una copia del precio y del costo del momento.** Si mañana sube la cerveza,
  las ventas de hoy siguen valiendo lo que valían, y la ganancia se calcula con el costo real
  de entonces.
- **El stock se descuenta al pedir, no al cobrar**, para que el inventario sea el de este
  instante. Quitar un producto de la cuenta o anularla lo devuelve. Los productos sin
  `controla_stock` (cócteles, comida preparada) no descuentan nada.
- **Los pesos son enteros** (COP no usa centavos): sin decimales no hay errores de redondeo.
"""

from __future__ import annotations

from django.db import models
from django.db.models import Q
from django.utils import timezone


class Categoria(models.Model):
    nombre = models.CharField(max_length=60, unique=True)
    orden = models.PositiveSmallIntegerField(
        default=0, help_text="Posición en la pantalla de ventas (menor primero)."
    )

    class Meta:
        ordering = ["orden", "nombre"]

    def __str__(self) -> str:
        return self.nombre


class Producto(models.Model):
    categoria = models.ForeignKey(Categoria, on_delete=models.PROTECT, related_name="productos")
    nombre = models.CharField(max_length=100)
    precio = models.PositiveIntegerField("precio de venta")
    costo = models.PositiveIntegerField(
        "costo de compra", default=0, help_text="Lo que te cuesta una unidad."
    )
    controla_stock = models.BooleanField(
        "controla inventario",
        default=True,
        help_text="Desmárcalo para cócteles, comida preparada u otros que no cuentas por unidad.",
    )
    stock = models.IntegerField(
        "unidades disponibles",
        default=0,
        help_text="Se actualiza solo con las ventas. Para compras y conteos usa Inventario.",
    )
    stock_minimo = models.PositiveIntegerField(
        "avisar cuando queden", default=0, help_text="0 = sin aviso."
    )
    activo = models.BooleanField(
        default=True, help_text="Desmárcalo para ocultarlo de ventas sin perder su historial."
    )

    class Meta:
        ordering = ["categoria__orden", "categoria__nombre", "nombre"]
        constraints = [
            models.UniqueConstraint(
                fields=["categoria", "nombre"], name="producto_unico_en_categoria"
            )
        ]

    def __str__(self) -> str:
        return self.nombre

    @property
    def margen(self) -> int:
        return self.precio - self.costo

    @property
    def agotado(self) -> bool:
        return self.controla_stock and self.stock <= 0

    @property
    def stock_bajo(self) -> bool:
        return self.controla_stock and self.stock_minimo > 0 and self.stock <= self.stock_minimo


class Mesa(models.Model):
    nombre = models.CharField(
        max_length=30, unique=True, help_text="Ej.: Mesa 4, Barra, Terraza 2."
    )
    orden = models.PositiveSmallIntegerField(default=0)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ["orden", "nombre"]

    def __str__(self) -> str:
        return self.nombre


class Cliente(models.Model):
    nombre = models.CharField(max_length=100)
    telefono = models.CharField("teléfono", max_length=30, blank=True)

    class Meta:
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class Factura(models.Model):
    class Estado(models.TextChoices):
        ABIERTA = "abierta", "Abierta"
        PAGADA = "pagada", "Pagada"
        ANULADA = "anulada", "Anulada"

    class Pago(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        TARJETA = "tarjeta", "Tarjeta"

    numero = models.PositiveIntegerField(
        "número", unique=True, blank=True, null=True, help_text="Consecutivo, se asigna al cobrar."
    )
    mesa = models.ForeignKey(Mesa, on_delete=models.PROTECT, related_name="facturas")
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="facturas",
        help_text="Vacío = cliente anónimo.",
    )
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.ABIERTA)
    metodo_pago = models.CharField(max_length=15, choices=Pago.choices, blank=True)
    abierta_en = models.DateTimeField(default=timezone.now)
    cerrada_en = models.DateTimeField(
        blank=True, null=True, help_text="Cuándo se cobró o se anuló."
    )

    class Meta:
        ordering = ["-abierta_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["mesa"],
                condition=Q(estado="abierta"),
                name="una_factura_abierta_por_mesa",
            )
        ]

    def __str__(self) -> str:
        if self.numero:
            return f"Factura {self.numero} · {self.mesa}"
        return f"Cuenta {self.get_estado_display().lower()} · {self.mesa}"

    # Los totales recorren `lineas.all()`: quien liste muchas facturas debe hacer
    # `prefetch_related("lineas")` para no consultar la base una vez por factura.
    @property
    def total(self) -> int:
        return sum(linea.subtotal for linea in self.lineas.all())

    @property
    def n_items(self) -> int:
        return sum(linea.cantidad for linea in self.lineas.all())

    @property
    def abierta(self) -> bool:
        return self.estado == self.Estado.ABIERTA


class Linea(models.Model):
    factura = models.ForeignKey(Factura, on_delete=models.CASCADE, related_name="lineas")
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name="lineas")
    cantidad = models.PositiveIntegerField(default=1)
    precio = models.PositiveIntegerField("precio unitario", help_text="Copia del precio al pedir.")
    costo = models.PositiveIntegerField("costo unitario", help_text="Copia del costo al pedir.")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["factura", "producto"], name="una_linea_por_producto")
        ]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.cantidad} × {self.producto}"

    @property
    def subtotal(self) -> int:
        return self.cantidad * self.precio


class Movimiento(models.Model):
    """Entrada o ajuste manual de inventario. Las ventas no pasan por aquí: están en `Linea`."""

    class Motivo(models.TextChoices):
        COMPRA = "compra", "Compra"
        AJUSTE = "ajuste", "Conteo físico"

    producto = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name="movimientos")
    motivo = models.CharField(max_length=10, choices=Motivo.choices)
    cantidad = models.IntegerField(help_text="Positivo = entra, negativo = sale.")
    costo_unitario = models.PositiveIntegerField(blank=True, null=True)
    nota = models.CharField(max_length=200, blank=True)
    fecha = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"{self.get_motivo_display()} {self.cantidad:+d} · {self.producto}"
