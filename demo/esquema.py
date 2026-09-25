"""Esquema de la base de datos del registro de campo (`web/campo/models.py`), como datos.

La demo en la nube no instala Django, así que la página *Modelo de datos* lee esta copia.
`tests/test_esquema_web.py` la compara campo por campo con los modelos de Django: si se
cambia un modelo y no esta copia, la prueba falla.
"""

from __future__ import annotations

from dataclasses import dataclass, field

CASCADA, PROTEGIDO, VACIO = "cascada", "protegido", "queda vacío"


@dataclass(frozen=True)
class Campo:
    nombre: str
    tipo: str
    clave: str = ""  # "PK", "FK", "UQ" o "FK UQ"
    nulo: bool = False
    nota: str = ""
    ref: str | None = None  # tabla a la que apunta una llave foránea
    al_borrar: str | None = None  # qué pasa con esta fila si se borra la referenciada


@dataclass(frozen=True)
class Tabla:
    entidad: str
    tabla: str
    descripcion: str
    campos: list[Campo]
    unicos: list[tuple[str, ...]] = field(default_factory=list)
    externa: bool = False  # tabla propia de Django: se listan solo los campos relevantes


def _id() -> Campo:
    return Campo("id", "entero", "PK", nota="autoincremental")


TABLAS: list[Tabla] = [
    Tabla(
        "Productor",
        "campo_productor",
        "Persona responsable de una o más fincas.",
        [
            _id(),
            Campo("nombre", "varchar(150)"),
            Campo(
                "documento", "varchar(30)", "UQ", nulo=True, nota="documento de identidad, opcional"
            ),
            Campo("telefono", "varchar(30)"),
            Campo("correo", "varchar(254)"),
            Campo(
                "usuario_id",
                "entero",
                "FK UQ",
                nulo=True,
                nota="cuenta del sistema, si la tiene",
                ref="auth_user",
                al_borrar=VACIO,
            ),
            Campo("autoriza_datos", "bool", nota="consentimiento, Ley 1581 de 2012"),
            Campo("creado", "fecha-hora", nota="automático"),
        ],
    ),
    Tabla(
        "Finca",
        "campo_finca",
        "Predio, con su ubicación administrativa.",
        [
            _id(),
            Campo("productor_id", "entero", "FK", ref="campo_productor", al_borrar=PROTEGIDO),
            Campo("nombre", "varchar(150)"),
            Campo("departamento", "varchar(80)", nota="por defecto Arauca"),
            Campo("municipio", "varchar(80)", nota="por defecto Saravena"),
            Campo("vereda", "varchar(120)"),
            Campo("latitud", "decimal(9,6)", nulo=True),
            Campo("longitud", "decimal(9,6)", nulo=True),
            Campo("area_ha", "decimal(10,2)", nulo=True, nota="área total, ≥ 0"),
            Campo("creado", "fecha-hora", nota="automático"),
        ],
        unicos=[("productor_id", "nombre")],
    ),
    Tabla(
        "Cultivo",
        "campo_cultivo",
        "Catálogo de cultivos; indica al método cómo reconocer una planta.",
        [
            _id(),
            Campo("nombre", "varchar(80)", "UQ"),
            Campo("nombre_cientifico", "varchar(120)"),
            Campo("forma_conteo", "varchar(10)", nota="estrella | copa"),
        ],
    ),
    Tabla(
        "Lote",
        "campo_lote",
        "Unidad de manejo con un solo cultivo, su área y su marco de siembra.",
        [
            _id(),
            Campo("finca_id", "entero", "FK", ref="campo_finca", al_borrar=CASCADA),
            Campo("cultivo_id", "entero", "FK", ref="campo_cultivo", al_borrar=PROTEGIDO),
            Campo("nombre", "varchar(80)"),
            Campo("variedad", "varchar(80)"),
            Campo("area_ha", "decimal(8,2)", nota="≥ 0"),
            Campo("fecha_siembra", "fecha", nulo=True),
            Campo("distancia_plantas_m", "decimal(5,2)", nulo=True),
            Campo("distancia_surcos_m", "decimal(5,2)", nulo=True),
        ],
        unicos=[("finca_id", "nombre")],
    ),
    Tabla(
        "Captura",
        "campo_captura",
        "Salida a fotografiar un lote en una fecha: la dimensión tiempo.",
        [
            _id(),
            Campo("lote_id", "entero", "FK", ref="campo_lote", al_borrar=CASCADA),
            Campo(
                "operador_id",
                "entero",
                "FK",
                nulo=True,
                nota="quién tomó las fotos",
                ref="auth_user",
                al_borrar=VACIO,
            ),
            Campo("fecha", "fecha-hora"),
            Campo("dispositivo", "varchar(120)", nota="modelo del dron o cámara"),
            Campo("altura_vuelo_m", "decimal(6,1)", nulo=True),
            Campo("gsd_cm_px", "decimal(6,2)", nulo=True, nota="resolución en el suelo"),
            Campo("condiciones", "varchar(10)", nota="soleado | nublado | parcial | lluvia"),
            Campo("notas", "texto"),
        ],
    ),
    Tabla(
        "Foto",
        "campo_foto",
        "Imagen de una captura.",
        [
            _id(),
            Campo("captura_id", "entero", "FK", ref="campo_captura", al_borrar=CASCADA),
            Campo("imagen", "varchar(100)", nota="ruta del archivo: fotos/año/mes/"),
            Campo("ancho_px", "entero ≥ 0", nulo=True, nota="se registra al subir"),
            Campo("alto_px", "entero ≥ 0", nulo=True, nota="se registra al subir"),
            Campo("subida", "fecha-hora", nota="automático"),
        ],
    ),
    Tabla(
        "Análisis",
        "campo_analisis",
        "Una corrida del método de conteo sobre una foto.",
        [
            _id(),
            Campo("foto_id", "entero", "FK", ref="campo_foto", al_borrar=CASCADA),
            Campo("metodo", "varchar(20)", nota="por defecto centros"),
            Campo("forma", "varchar(10)", nota="estrella | copa"),
            Campo("parametros", "JSON", nota="ajustes usados en la corrida"),
            Campo("version", "varchar(20)", nota="versión de centinela_core"),
            Campo("estado", "varchar(10)", nota="pendiente | completo | error"),
            Campo("confianza", "varchar(12)", nota="consistente | rango | vacio"),
            Campo("conteo", "entero ≥ 0", nulo=True),
            Campo("conteo_min", "entero ≥ 0", nulo=True),
            Campo("conteo_max", "entero ≥ 0", nulo=True),
            Campo("escala_px", "entero ≥ 0", nulo=True, nota="distancia entre plantas en la foto"),
            Campo("mensaje", "texto"),
            Campo("ejecutado", "fecha-hora", nota="automático"),
            Campo("duracion_s", "real", nulo=True),
        ],
    ),
    Tabla(
        "Planta",
        "campo_planta",
        "Planta detectada dentro de un análisis (una detección, no la planta física).",
        [
            _id(),
            Campo("analisis_id", "entero", "FK", ref="campo_analisis", al_borrar=CASCADA),
            Campo("numero", "entero ≥ 0", nota="número dentro del análisis"),
            Campo("x_px", "real"),
            Campo("y_px", "real"),
            Campo("latitud", "decimal(9,6)", nulo=True, nota="reservado, Etapa I-B"),
            Campo("longitud", "decimal(9,6)", nulo=True, nota="reservado, Etapa I-B"),
            Campo("revisar", "bool"),
            Campo("motivo", "varchar(200)"),
        ],
        unicos=[("analisis_id", "numero")],
    ),
    Tabla(
        "Variable",
        "campo_variable",
        "Catálogo de lo que se mide en una planta.",
        [
            _id(),
            Campo("codigo", "varchar(40)", "UQ", nota="identificador corto, p. ej. vigor_vari"),
            Campo("nombre", "varchar(80)"),
            Campo("unidad", "varchar(20)"),
            Campo("descripcion", "texto"),
        ],
    ),
    Tabla(
        "Medición",
        "campo_medicion",
        "Valor de una variable en una planta.",
        [
            _id(),
            Campo("planta_id", "entero", "FK", ref="campo_planta", al_borrar=CASCADA),
            Campo("variable_id", "entero", "FK", ref="campo_variable", al_borrar=PROTEGIDO),
            Campo("valor", "real"),
        ],
        unicos=[("planta_id", "variable_id")],
    ),
    Tabla(
        "Usuario",
        "auth_user",
        "Cuenta del sistema. Tabla propia de Django.",
        [
            _id(),
            Campo("username", "varchar(150)", "UQ"),
            Campo("password", "varchar(128)", nota="solo el hash, nunca la contraseña"),
            Campo("email", "varchar(254)"),
            Campo("is_staff", "bool", nota="puede entrar al panel"),
            Campo("is_superuser", "bool"),
            Campo("last_login", "fecha-hora", nulo=True),
        ],
        externa=True,
    ),
]

POR_TABLA = {t.tabla: t for t in TABLAS}


def relaciones() -> list[dict]:
    """Una fila por llave foránea: de la tabla referenciada (1) a la que la contiene (N o 1)."""
    filas = []
    for t in TABLAS:
        for c in t.campos:
            if c.ref:
                filas.append(
                    {
                        "desde": POR_TABLA[c.ref].entidad,
                        "hacia": t.entidad,
                        "cardinalidad": "1 : 1" if "UQ" in c.clave else "1 : N",
                        "obligatoria": not c.nulo,
                        "llave": f"{t.tabla}.{c.nombre}",
                        "al_borrar": c.al_borrar,
                        "ref": c.ref,
                        "tabla": t.tabla,
                    }
                )
    return filas
