# Modelo de datos — registro de campo

Centinela registra **quién cultiva qué, dónde, cuándo se fotografió y qué se midió**. El modelo
vive en `web/campo/models.py` (Django) y se consulta en el tablero del sitio web y en el panel
de administración. La página *Modelo de datos* de la demo
(<https://centinela-demo.streamlit.app/modelo_datos>) muestra el diagrama y todas las tablas con
sus campos, tipos y llaves; lee `demo/esquema.py`, que `tests/test_esquema_web.py` compara con
los modelos de Django.

## Diagrama entidad-relación

```mermaid
erDiagram
    PRODUCTOR ||--o{ FINCA : "maneja"
    FINCA ||--o{ LOTE : "se divide en"
    CULTIVO ||--o{ LOTE : "se siembra en"
    LOTE ||--o{ CAPTURA : "se fotografía en"
    CAPTURA ||--o{ FOTO : "produce"
    FOTO ||--o{ ANALISIS : "se analiza en"
    ANALISIS ||--o{ PLANTA : "detecta"
    PLANTA ||--o{ MEDICION : "tiene"
    VARIABLE ||--o{ MEDICION : "define"

    PRODUCTOR {
        string nombre
        string documento "opcional, único"
        string telefono
        string correo
        bool autoriza_datos "consentimiento, Ley 1581 de 2012"
    }
    FINCA {
        string nombre
        string departamento
        string municipio
        string vereda
        decimal latitud
        decimal longitud
        decimal area_ha
    }
    CULTIVO {
        string nombre
        string nombre_cientifico
        string forma_conteo "estrella | copa"
    }
    LOTE {
        string nombre
        string variedad
        decimal area_ha
        date fecha_siembra
        decimal distancia_plantas_m
        decimal distancia_surcos_m
    }
    CAPTURA {
        datetime fecha
        string dispositivo
        decimal altura_vuelo_m
        decimal gsd_cm_px "resolución en el suelo"
        string condiciones
    }
    FOTO {
        image imagen
        int ancho_px
        int alto_px
    }
    ANALISIS {
        string metodo
        string forma
        string version
        string estado "pendiente | completo | error"
        string confianza "consistente | rango | vacio"
        int conteo
        int conteo_min
        int conteo_max
        int escala_px
    }
    PLANTA {
        int numero
        float x_px
        float y_px
        decimal latitud "reservado, Etapa I-B"
        decimal longitud "reservado, Etapa I-B"
        bool revisar
        string motivo
    }
    VARIABLE {
        string codigo
        string nombre
        string unidad
    }
    MEDICION {
        float valor
    }
```

## Entidades

| Entidad | Qué representa | Reglas |
|---|---|---|
| **Productor** | Persona responsable de una o más fincas | Datos personales mínimos; `autoriza_datos` registra el consentimiento |
| **Finca** | Predio, con ubicación administrativa (departamento, municipio, vereda) | Nombre único por productor |
| **Cultivo** | Catálogo: plátano, palma, cítricos, cacao… | `forma_conteo` indica al método cómo reconocer una planta |
| **Lote** | Unidad de manejo con un solo cultivo, su área y su marco de siembra | Nombre único por finca. Del marco se deriva la densidad teórica (plantas/ha) |
| **Captura** | Una salida a fotografiar un lote: fecha, equipo, altura y resolución en el suelo | Es la dimensión **tiempo**: varias capturas del mismo lote forman su historial |
| **Foto** | Imagen de una captura | Ancho y alto se registran al subirla |
| **Análisis** | Una corrida del método de conteo sobre una foto | Guarda método, versión, confianza y conteo o rango. Una foto admite varios análisis (p. ej., tras mejorar el método) |
| **Planta** | Planta detectada dentro de un análisis | Posición en la foto; bandera `revisar` con su motivo |
| **Variable** | Catálogo de lo que se mide en una planta | Hoy: intensidad del centro, vigor (VARI), vigor relativo |
| **Medición** | Valor de una variable en una planta | Una medición por variable y planta |

## Decisiones de diseño

1. **Planta = detección, no planta física.** Sin coordenadas geográficas no es posible saber
   que una planta de la foto de agosto es la misma de la foto de septiembre. Los campos
   `latitud` y `longitud` quedan reservados; con la georreferencia (Etapa I-B) se podrá
   añadir una entidad de planta física que agrupe sus detecciones en el tiempo.
2. **Variables como filas (modelo entidad-atributo-valor).** Añadir una medición nueva
   (NDVI, altura, diámetro de copa) consiste en registrar una `Variable`, sin modificar el
   esquema ni migrar datos.
3. **El análisis se versiona.** Cada análisis guarda la versión de `centinela_core` que lo
   produjo; al mejorar el método, las fotos se reanalizan sin perder los resultados previos.
4. **Densidad por hectárea solo con resolución conocida.** El área que cubre una foto se
   calcula con `gsd_cm_px` de la captura; sin ese dato no se reportan plantas por hectárea.
5. **Datos personales.** El productor puede registrarse sin documento de identidad; el
   consentimiento queda explícito en `autoriza_datos`.

## Uso local

```bash
.venv\Scripts\python -m pip install -e ".[web]"
.venv\Scripts\python web\manage.py migrate
.venv\Scripts\python web\manage.py createsuperuser
.venv\Scripts\python web\manage.py cargar_demo
.venv\Scripts\python web\manage.py runserver
```

Tablero en <http://127.0.0.1:8000/>, administración en <http://127.0.0.1:8000/admin/>.
`cargar_demo` crea dos fincas ficticias con fotos sintéticas y las analiza.
