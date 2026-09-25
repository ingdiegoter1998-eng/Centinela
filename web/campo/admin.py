"""Panel de administración: el registro de productores, fincas, lotes, capturas y fotos.

Al subir una foto nueva se analiza automáticamente; la acción "Analizar de nuevo" repite el
análisis (por ejemplo, tras una nueva versión del método).
"""

from __future__ import annotations

from django.contrib import admin, messages
from django.utils.html import format_html

from .models import (
    Analisis,
    Captura,
    Cultivo,
    Finca,
    Foto,
    Lote,
    Medicion,
    Planta,
    Productor,
    Variable,
)
from .servicios import analizar_foto

admin.site.site_header = "Centinela · registro de campo"
admin.site.site_title = "Centinela"
admin.site.index_title = "Fincas, lotes, fotos y análisis"


def _resultado(a: Analisis | None) -> str:
    if a is None:
        return "—"
    if a.estado != Analisis.COMPLETO:
        return a.get_estado_display()
    if a.confianza == Analisis.RANGO:
        return f"{a.conteo_min}–{a.conteo_max} (rango)"
    if a.confianza == Analisis.VACIO:
        return "sin plantas"
    return f"{a.conteo} (consistente)"


class FincaEnLinea(admin.TabularInline):
    model = Finca
    extra = 0
    fields = ["nombre", "vereda", "municipio", "area_ha"]
    show_change_link = True


@admin.register(Productor)
class ProductorAdmin(admin.ModelAdmin):
    list_display = ["nombre", "telefono", "n_fincas", "autoriza_datos"]
    search_fields = ["nombre", "documento"]
    inlines = [FincaEnLinea]

    @admin.display(description="fincas")
    def n_fincas(self, obj):
        return obj.fincas.count()


class LoteEnLinea(admin.TabularInline):
    model = Lote
    extra = 0
    fields = ["nombre", "cultivo", "variedad", "area_ha", "fecha_siembra"]
    show_change_link = True


@admin.register(Finca)
class FincaAdmin(admin.ModelAdmin):
    list_display = ["nombre", "productor", "vereda", "municipio", "area_ha"]
    list_filter = ["municipio", "vereda"]
    search_fields = ["nombre", "productor__nombre", "vereda"]
    inlines = [LoteEnLinea]


@admin.register(Cultivo)
class CultivoAdmin(admin.ModelAdmin):
    list_display = ["nombre", "nombre_cientifico", "forma_conteo"]


class CapturaEnLinea(admin.TabularInline):
    model = Captura
    extra = 0
    fields = ["fecha", "dispositivo", "altura_vuelo_m", "gsd_cm_px", "condiciones"]
    show_change_link = True


@admin.register(Lote)
class LoteAdmin(admin.ModelAdmin):
    list_display = ["nombre", "finca", "cultivo", "variedad", "area_ha", "densidad"]
    list_filter = ["cultivo", "finca__municipio"]
    search_fields = ["nombre", "finca__nombre"]
    inlines = [CapturaEnLinea]

    @admin.display(description="densidad teórica (plantas/ha)")
    def densidad(self, obj):
        d = obj.densidad_teorica
        return f"{d:,.0f}" if d else "—"


class FotoEnLinea(admin.TabularInline):
    model = Foto
    extra = 1
    fields = ["imagen", "ancho_px", "alto_px"]
    readonly_fields = ["ancho_px", "alto_px"]


@admin.register(Captura)
class CapturaAdmin(admin.ModelAdmin):
    list_display = ["__str__", "fecha", "dispositivo", "gsd_cm_px", "n_fotos"]
    list_filter = ["condiciones", "lote__finca"]
    date_hierarchy = "fecha"
    inlines = [FotoEnLinea]

    @admin.display(description="fotos")
    def n_fotos(self, obj):
        return obj.fotos.count()

    def save_formset(self, request, form, formset, change):
        nuevas = [f for f in formset.save(commit=False) if f.pk is None]
        super().save_formset(request, form, formset, change)
        for foto in nuevas:
            _analizar_y_avisar(request, foto)


def _analizar_y_avisar(request, foto: Foto) -> None:
    a = analizar_foto(foto)
    if a.estado == Analisis.COMPLETO:
        messages.success(request, f"Foto {foto.pk} analizada: {_resultado(a)} plantas.")
    else:
        messages.error(request, f"No se pudo analizar la foto {foto.pk}: {a.mensaje}")


class AnalisisEnLinea(admin.TabularInline):
    model = Analisis
    extra = 0
    fields = ["ejecutado", "forma", "estado", "resultado", "version"]
    readonly_fields = fields
    show_change_link = True
    can_delete = False

    @admin.display(description="resultado")
    def resultado(self, obj):
        return _resultado(obj)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Foto)
class FotoAdmin(admin.ModelAdmin):
    list_display = ["miniatura", "__str__", "tamano", "ultimo_resultado"]
    list_filter = ["captura__lote__cultivo", "captura__lote__finca"]
    readonly_fields = ["vista", "ancho_px", "alto_px"]
    inlines = [AnalisisEnLinea]
    actions = ["analizar_de_nuevo"]

    @admin.display(description="")
    def miniatura(self, obj):
        return format_html('<img src="{}" style="height:48px;border-radius:3px">', obj.imagen.url)

    @admin.display(description="vista previa")
    def vista(self, obj):
        return format_html('<img src="{}" style="max-width:520px;border-radius:4px">', obj.imagen.url)

    @admin.display(description="tamaño")
    def tamano(self, obj):
        return f"{obj.ancho_px}×{obj.alto_px} px"

    @admin.display(description="último conteo")
    def ultimo_resultado(self, obj):
        return _resultado(obj.analisis.first())

    def save_model(self, request, obj, form, change):
        nueva = obj.pk is None
        super().save_model(request, obj, form, change)
        if nueva:
            _analizar_y_avisar(request, obj)

    @admin.action(description="Analizar de nuevo las fotos seleccionadas")
    def analizar_de_nuevo(self, request, queryset):
        for foto in queryset:
            _analizar_y_avisar(request, foto)


class PlantaEnLinea(admin.TabularInline):
    model = Planta
    extra = 0
    fields = ["numero", "x_px", "y_px", "revisar", "motivo"]
    readonly_fields = fields
    can_delete = False
    max_num = 0


@admin.register(Analisis)
class AnalisisAdmin(admin.ModelAdmin):
    list_display = ["__str__", "ejecutado", "forma", "estado", "resultado", "densidad", "duracion"]
    list_filter = ["estado", "confianza", "forma"]
    readonly_fields = [
        "foto", "metodo", "forma", "parametros", "version", "estado", "confianza", "conteo",
        "conteo_min", "conteo_max", "escala_px", "densidad", "mensaje", "ejecutado", "duracion_s",
    ]
    inlines = [PlantaEnLinea]

    def has_add_permission(self, request):
        return False

    @admin.display(description="resultado")
    def resultado(self, obj):
        return _resultado(obj)

    @admin.display(description="plantas/ha")
    def densidad(self, obj):
        d = obj.densidad_ha
        return f"{d:,.0f}" if d else "— (falta resolución en el suelo)"

    @admin.display(description="duración")
    def duracion(self, obj):
        return f"{obj.duracion_s:.1f} s" if obj.duracion_s else "—"


class MedicionEnLinea(admin.TabularInline):
    model = Medicion
    extra = 0


@admin.register(Planta)
class PlantaAdmin(admin.ModelAdmin):
    list_display = ["__str__", "x_px", "y_px", "revisar", "motivo"]
    list_filter = ["revisar"]
    inlines = [MedicionEnLinea]


@admin.register(Variable)
class VariableAdmin(admin.ModelAdmin):
    list_display = ["codigo", "nombre", "unidad"]
