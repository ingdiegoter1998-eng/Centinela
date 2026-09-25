"""Modelo de datos de Centinela: quién cultiva qué, dónde, cuándo se fotografió y qué se midió.

    Productor 1─* Finca 1─* Lote *─1 Cultivo
                              Lote 1─* Captura 1─* Foto 1─* Analisis 1─* Planta 1─* Medicion *─1 Variable

Dos decisiones que conviene tener presentes:

- **Una `Planta` es una detección dentro de un análisis, no una planta física.** Sin
  georreferencia (Etapa I-B) no hay forma de saber que el punto (412, 380) de la foto de
  marzo y el (405, 391) de la de abril son la misma mata. Los campos `latitud`/`longitud`
  quedan reservados para cuando exista; entonces se podrá agregar una entidad de planta
  física que agrupe detecciones de distintas fechas.
- **Las variables por planta son filas (`Medicion`), no columnas.** Hoy se mide el vigor;
  mañana puede ser NDVI, altura o diámetro de copa. Agregar una variable es crear una fila
  en `Variable`, sin tocar el esquema.
"""

from __future__ import annotations

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Productor(models.Model):
    """Persona responsable de una o más fincas.

    Datos personales mínimos a propósito (Ley 1581 de 2012, habeas data): solo lo necesario
    para identificar la finca y contactar a quien la maneja.
    """

    nombre = models.CharField(max_length=150)
    documento = models.CharField(
        "documento de identidad", max_length=30, blank=True, null=True, unique=True
    )
    telefono = models.CharField("teléfono", max_length=30, blank=True)
    correo = models.EmailField(blank=True)
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        help_text="Cuenta del sistema, si el productor entra directamente.",
    )
    autoriza_datos = models.BooleanField(
        "autoriza el tratamiento de datos",
        default=False,
        help_text="Consentimiento para registrar y tratar sus datos personales.",
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "productores"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class Finca(models.Model):
    productor = models.ForeignKey(Productor, on_delete=models.PROTECT, related_name="fincas")
    nombre = models.CharField(max_length=150)
    departamento = models.CharField(max_length=80, default="Arauca")
    municipio = models.CharField(max_length=80, default="Saravena")
    vereda = models.CharField(max_length=120, blank=True)
    latitud = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitud = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    area_ha = models.DecimalField(
        "área total (ha)", max_digits=10, decimal_places=2, blank=True, null=True,
        validators=[MinValueValidator(0)],
    )
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(fields=["productor", "nombre"], name="finca_unica_por_productor")
        ]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.municipio})"


class Cultivo(models.Model):
    """Catálogo de cultivos. `forma_conteo` le dice al método cómo buscar cada planta."""

    ESTRELLA, COPA = "estrella", "copa"
    FORMAS = [
        (ESTRELLA, "Estrella — hojas que salen de un centro (plátano, palma)"),
        (COPA, "Copa — mancha redonda (cítricos, cacao, frutales)"),
    ]

    nombre = models.CharField(max_length=80, unique=True)
    nombre_cientifico = models.CharField("nombre científico", max_length=120, blank=True)
    forma_conteo = models.CharField("forma de conteo", max_length=10, choices=FORMAS)

    class Meta:
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class Lote(models.Model):
    """Unidad de manejo dentro de una finca: un área con un solo cultivo."""

    finca = models.ForeignKey(Finca, on_delete=models.CASCADE, related_name="lotes")
    nombre = models.CharField(max_length=80, help_text="Nombre o código del lote en la finca.")
    cultivo = models.ForeignKey(Cultivo, on_delete=models.PROTECT, related_name="lotes")
    variedad = models.CharField(max_length=80, blank=True)
    area_ha = models.DecimalField(
        "área (ha)", max_digits=8, decimal_places=2, validators=[MinValueValidator(0)]
    )
    fecha_siembra = models.DateField("fecha de siembra", blank=True, null=True)
    distancia_plantas_m = models.DecimalField(
        "distancia entre plantas (m)", max_digits=5, decimal_places=2, blank=True, null=True
    )
    distancia_surcos_m = models.DecimalField(
        "distancia entre surcos (m)", max_digits=5, decimal_places=2, blank=True, null=True
    )

    class Meta:
        ordering = ["finca", "nombre"]
        constraints = [
            models.UniqueConstraint(fields=["finca", "nombre"], name="lote_unico_por_finca")
        ]

    def __str__(self) -> str:
        return f"{self.finca.nombre} · {self.nombre}"

    @property
    def densidad_teorica(self) -> float | None:
        """Plantas por hectárea según el marco de siembra declarado."""
        if self.distancia_plantas_m and self.distancia_surcos_m:
            return 10_000 / float(self.distancia_plantas_m * self.distancia_surcos_m)
        return None


class Captura(models.Model):
    """Una salida a tomar fotos de un lote: un vuelo de dron o una sesión en una fecha."""

    CONDICIONES = [
        ("soleado", "Soleado"),
        ("nublado", "Nublado"),
        ("parcial", "Parcialmente nublado"),
        ("lluvia", "Lluvia reciente"),
    ]

    lote = models.ForeignKey(Lote, on_delete=models.CASCADE, related_name="capturas")
    fecha = models.DateTimeField()
    dispositivo = models.CharField(max_length=120, blank=True, help_text="Modelo del dron o cámara.")
    altura_vuelo_m = models.DecimalField(
        "altura de vuelo (m)", max_digits=6, decimal_places=1, blank=True, null=True
    )
    gsd_cm_px = models.DecimalField(
        "resolución en el suelo (cm/px)", max_digits=6, decimal_places=2, blank=True, null=True,
        help_text="Cuántos centímetros del terreno cubre un píxel. Permite pasar a plantas por hectárea.",
    )
    condiciones = models.CharField(max_length=10, choices=CONDICIONES, blank=True)
    operador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, blank=True, null=True,
        related_name="capturas",
    )
    notas = models.TextField(blank=True)

    class Meta:
        ordering = ["-fecha"]

    def __str__(self) -> str:
        return f"{self.lote} · {self.fecha:%Y-%m-%d}"


class Foto(models.Model):
    captura = models.ForeignKey(Captura, on_delete=models.CASCADE, related_name="fotos")
    imagen = models.ImageField(upload_to="fotos/%Y/%m/", width_field="ancho_px", height_field="alto_px")
    ancho_px = models.PositiveIntegerField(editable=False, null=True)
    alto_px = models.PositiveIntegerField(editable=False, null=True)
    subida = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-subida"]

    def __str__(self) -> str:
        return f"Foto {self.pk} · {self.captura}"

    def save(self, *args, **kwargs):
        # width_field/height_field solo se llenan al asignar el archivo por formulario; al
        # guardarlo desde código (carga de datos, pruebas) quedan vacíos.
        if self.imagen and not (self.ancho_px and self.alto_px):
            self.ancho_px, self.alto_px = self.imagen.width, self.imagen.height
        super().save(*args, **kwargs)

    @property
    def area_ha(self) -> float | None:
        """Área de terreno que cubre la foto, si se conoce la resolución en el suelo."""
        gsd = self.captura.gsd_cm_px
        if gsd and self.ancho_px and self.alto_px:
            lado_m = float(gsd) / 100
            return (self.ancho_px * lado_m) * (self.alto_px * lado_m) / 10_000
        return None


class Analisis(models.Model):
    """Una corrida del método de conteo sobre una foto. Una foto puede tener varias."""

    PENDIENTE, COMPLETO, ERROR = "pendiente", "completo", "error"
    ESTADOS = [(PENDIENTE, "Pendiente"), (COMPLETO, "Completo"), (ERROR, "Error")]

    CONSISTENTE, RANGO, VACIO = "consistente", "rango", "vacio"
    CONFIANZAS = [
        (CONSISTENTE, "Consistente"),
        (RANGO, "Rango — el conteo depende del ajuste"),
        (VACIO, "Sin plantas detectadas"),
    ]

    foto = models.ForeignKey(Foto, on_delete=models.CASCADE, related_name="analisis")
    metodo = models.CharField("método", max_length=20, default="centros")
    forma = models.CharField(max_length=10, choices=Cultivo.FORMAS)
    parametros = models.JSONField(default=dict, blank=True)
    version = models.CharField("versión del método", max_length=20, blank=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default=PENDIENTE)
    confianza = models.CharField(max_length=12, choices=CONFIANZAS, blank=True)
    conteo = models.PositiveIntegerField(null=True, blank=True)
    conteo_min = models.PositiveIntegerField("conteo mínimo", null=True, blank=True)
    conteo_max = models.PositiveIntegerField("conteo máximo", null=True, blank=True)
    escala_px = models.PositiveIntegerField(
        "distancia entre plantas (px)", null=True, blank=True
    )
    mensaje = models.TextField(blank=True)
    ejecutado = models.DateTimeField(auto_now_add=True)
    duracion_s = models.FloatField("duración (s)", null=True, blank=True)

    class Meta:
        verbose_name = "análisis"
        verbose_name_plural = "análisis"
        ordering = ["-ejecutado"]

    def __str__(self) -> str:
        return f"Análisis {self.pk} · {self.foto}"

    @property
    def n_revisar(self) -> int:
        return self.plantas.filter(revisar=True).count()

    @property
    def densidad_ha(self) -> float | None:
        """Plantas por hectárea, si la foto tiene resolución en el suelo conocida."""
        area = self.foto.area_ha
        if area and self.conteo is not None:
            return self.conteo / area
        return None


class Planta(models.Model):
    """Una planta detectada en un análisis (ver la nota del módulo)."""

    analisis = models.ForeignKey(Analisis, on_delete=models.CASCADE, related_name="plantas")
    numero = models.PositiveIntegerField(help_text="Número de la planta dentro del análisis.")
    x_px = models.FloatField()
    y_px = models.FloatField()
    latitud = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitud = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    revisar = models.BooleanField(default=False)
    motivo = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["analisis", "numero"]
        constraints = [
            models.UniqueConstraint(fields=["analisis", "numero"], name="planta_unica_por_analisis")
        ]

    def __str__(self) -> str:
        return f"Planta {self.numero} · análisis {self.analisis_id}"


class Variable(models.Model):
    """Catálogo de lo que se puede medir en una planta."""

    codigo = models.SlugField(max_length=40, unique=True)
    nombre = models.CharField(max_length=80)
    unidad = models.CharField(max_length=20, blank=True)
    descripcion = models.TextField("descripción", blank=True)

    class Meta:
        ordering = ["codigo"]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.unidad})" if self.unidad else self.nombre


class Medicion(models.Model):
    planta = models.ForeignKey(Planta, on_delete=models.CASCADE, related_name="mediciones")
    variable = models.ForeignKey(Variable, on_delete=models.PROTECT, related_name="mediciones")
    valor = models.FloatField()

    class Meta:
        verbose_name = "medición"
        verbose_name_plural = "mediciones"
        constraints = [
            models.UniqueConstraint(fields=["planta", "variable"], name="una_medicion_por_variable")
        ]

    def __str__(self) -> str:
        return f"{self.variable.codigo} = {self.valor:g}"
