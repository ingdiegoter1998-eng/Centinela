"""Administración del catálogo (lo usa el dueño; el personal no entra aquí).

Las facturas y los movimientos son de solo lectura: se corrigen desde Ventas e Inventario para
que el stock y las cuentas nunca queden descuadrados.
"""

from django.contrib import admin

from .models import Categoria, Cliente, Factura, Linea, Mesa, Movimiento, Producto


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "orden")
    list_editable = ("orden",)


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = (
        "nombre",
        "categoria",
        "precio",
        "costo",
        "margen",
        "stock",
        "stock_minimo",
        "activo",
    )
    list_editable = ("precio", "costo", "stock_minimo", "activo")
    list_filter = ("categoria", "activo", "controla_stock")
    search_fields = ("nombre",)

    def get_readonly_fields(self, request, obj=None):
        # El stock inicial se escribe al crear; después solo cambia con ventas, compras y conteos.
        return ("stock",) if obj else ()


@admin.register(Mesa)
class MesaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "orden", "activa")
    list_editable = ("orden", "activa")


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ("nombre", "telefono")
    search_fields = ("nombre", "telefono")


class LineaInline(admin.TabularInline):
    model = Linea
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Factura)
class FacturaAdmin(admin.ModelAdmin):
    list_display = ("__str__", "cliente", "estado", "metodo_pago", "cerrada_en")
    list_filter = ("estado", "metodo_pago", "mesa")
    date_hierarchy = "abierta_en"
    inlines = [LineaInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Movimiento)
class MovimientoAdmin(admin.ModelAdmin):
    list_display = ("fecha", "producto", "motivo", "cantidad", "costo_unitario", "nota")
    list_filter = ("motivo",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
