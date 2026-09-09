// Contenido de la landing (Fase 0.5).
// Separado del layout para poder editar texto sin tocar el diseño.
// Reglas del brief: sin fechas de entrega, sin detalle técnico de arquitecturas,
// sin diagramas de infraestructura, y la línea de cacao solo como mención futura.

export const proyecto = {
  nombre: 'Proyecto Centinela',
  subtitulo: 'Plataforma de agricultura de precisión',
  lugar: 'Saravena, Arauca',
  pitch:
    'Usamos drones e inteligencia artificial para ver lo que ocurre dentro de los cultivos de la región: cuántas plantas hay, cómo están y qué las amenaza. Información concreta, parcela por parcela.',
}

export const pilares = [
  {
    verbo: 'Observar',
    texto: 'Capturar el cultivo desde el aire con vuelos de dron sobre parcelas reales.',
  },
  {
    verbo: 'Caracterizar',
    texto: 'Traducir esas imágenes en medidas: cuántas plantas, dónde, en qué estado.',
  },
  {
    verbo: 'Detectar',
    texto: 'Encontrar lo que no debería estar ahí — maleza, anomalías, zonas en problemas.',
  },
  {
    verbo: 'Predecir',
    texto: 'Con suficiente historia, anticipar cómo va a evolucionar la parcela.',
  },
]

export const queEs = [
  'Un cultivo visto desde arriba dice mucho más de lo que parece. Cada vuelo captura cientos de imágenes que, procesadas con visión por computador e inteligencia artificial, se convierten en información concreta sobre el terreno: cuántas plantas hay y dónde está cada una, qué sectores crecen mejor que otros, en qué zonas aparece la maleza.',
  'Proyecto Centinela construye, paso a paso, la capacidad de responder esas preguntas en los cultivos de Saravena.',
]

export const queSera = [
  'No partimos de una tecnología buscando dónde aplicarla. Partimos de problemas concretos del campo araucano y construimos únicamente lo que hace falta para resolverlos.',
  'Cada etapa deja datos, código y métodos que la siguiente reutiliza. Con el tiempo eso se acumula en algo que hoy no existe para la región: un registro detallado y georreferenciado de cómo se comportan sus cultivos.',
]

export const fases = [
  {
    n: 'I',
    nombre: 'Inventario y conteo',
    resumen:
      'Contar automáticamente cuántas plantas hay en una imagen aérea de la parcela y ubicar cada una.',
    estado: 'en-curso',
    etiqueta: 'En curso',
  },
  {
    n: 'II',
    nombre: 'Caracterización del cultivo',
    resumen:
      'Medir cómo está el cultivo: vigor, cobertura y diferencias entre sectores de una misma parcela.',
    estado: 'paralelo',
    etiqueta: 'En paralelo',
  },
  {
    n: 'III',
    nombre: 'Detección de maleza en arroz',
    resumen:
      'Distinguir cultivo, maleza y suelo para producir un mapa de infestación sector por sector.',
    estado: 'proxima',
    etiqueta: 'Próxima',
  },
  {
    n: 'IV',
    nombre: 'Análisis temporal y predicción',
    resumen:
      'Seguir la misma parcela a lo largo de varios vuelos para anticipar cómo evoluciona.',
    estado: 'futura',
    etiqueta: 'Futura',
  },
  {
    n: 'V',
    nombre: 'Integración',
    resumen:
      'Reunir los datos y modelos de todas las etapas en una plataforma consultable.',
    estado: 'futura',
    etiqueta: 'Futura',
  },
]

export const notaFases =
  'Además mantenemos abierta una línea de investigación futura sobre cacao y presencia de metales pesados.'

export const dondeEstamos = {
  fase: 'Etapa I — en curso',
  parrafos: [
    'Estamos desarrollando el proceso que toma una imagen aérea de una parcela y cuenta las plantas agrupándolas por similitud visual — color, tamaño y forma de la copa — sin necesitar un modelo entrenado para cada especie. Cada planta detectada queda ubicada dentro de la imagen, no solamente contada.',
    'El avance es autogestionado: vamos al ritmo que permiten los resultados y el aprendizaje, sin fechas de entrega impuestas desde afuera.',
  ],
}

export const quienesSomos = [
  'Somos estudiantes de Ingeniería en Inteligencia Artificial de la UIS, sede Saravena. El proyecto crece en paralelo a la carrera: cada etapa exige matemáticas, estadística, visión por computador y análisis de datos un poco más avanzados que la anterior.',
  'Trabajamos sobre cultivos de nuestra propia región porque las herramientas de agricultura de precisión casi nunca se diseñan pensando en ella.',
]

export const cierre = {
  titulo: '¿Te interesa el proyecto?',
  texto:
    'Estamos abiertos a conversar con productores, instituciones y grupos de investigación de la región.',
}
