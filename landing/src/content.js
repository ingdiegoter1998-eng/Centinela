// Contenido de la landing (Fase 0.5).
// Separado del layout para poder editar texto sin tocar el diseño.
// Reglas del brief: sin fechas de entrega, sin detalle técnico de arquitecturas,
// sin diagramas de infraestructura, y la línea de cacao solo como mención futura.

export const proyecto = {
  nombre: 'Proyecto Centinela',
  subtitulo: 'Plataforma de agricultura de precisión',
  lugar: 'Saravena, Arauca',
  pitch: [
    'Centinela desarrolla métodos de visión por computador e inteligencia artificial para analizar cultivos mediante imágenes aéreas obtenidas con drones.',
    'El proyecto busca extraer información sobre la distribución, características y condiciones del cultivo a escala de parcela.',
  ],
}

export const queEs = {
  titulo: 'Análisis de cultivos mediante imágenes aéreas',
  parrafos: [
    'Las imágenes obtenidas desde drones permiten observar una parcela completa y analizar su distribución espacial.',
    'Centinela procesa estas imágenes mediante técnicas de visión por computador para identificar patrones de vegetación, localizar plantas y generar información cuantificable sobre el cultivo.',
    'El desarrollo se estructura en etapas sucesivas, desde la identificación de plantas hasta el análisis temporal de una misma parcela.',
  ],
}

export const pilares = [
  {
    verbo: 'Observar',
    texto: 'Capturar imágenes aéreas de parcelas mediante vuelos de dron.',
  },
  {
    verbo: 'Caracterizar',
    texto: 'Extraer variables del cultivo y analizar su distribución dentro de la parcela.',
  },
  {
    verbo: 'Detectar',
    texto:
      'Identificar maleza, anomalías y otras condiciones relevantes a partir de patrones presentes en las imágenes.',
  },
  {
    verbo: 'Predecir',
    texto: 'Utilizar series históricas de observaciones para estimar la evolución del cultivo.',
  },
]

export const queSera = {
  titulo: 'Construcción progresiva del sistema',
  parrafos: [
    'Cada etapa incorpora datos, modelos y procedimientos que pueden reutilizarse en las siguientes.',
    'El objetivo es construir una base de información georreferenciada que permita analizar la evolución de los cultivos de la región a partir de observaciones realizadas en distintos momentos.',
    'A largo plazo, Centinela busca convertir ese análisis en una herramienta de consulta para productores e investigadores.',
  ],
}

export const fasesTitulo = 'Desarrollo por etapas'

export const fases = [
  {
    n: 'I',
    nombre: 'Inventario y conteo',
    resumen:
      'Identificación y conteo automático de plantas en imágenes aéreas, con localización individual de cada ejemplar.',
    estado: 'en-curso',
    etiqueta: 'En validación',
  },
  {
    n: 'II',
    nombre: 'Caracterización del cultivo',
    resumen:
      'Análisis de variables como vigor, cobertura y variación espacial dentro de una misma parcela.',
    estado: 'paralelo',
    etiqueta: 'En desarrollo',
  },
  {
    n: 'III',
    nombre: 'Detección de maleza en arroz',
    resumen:
      'Clasificación de cultivo, maleza y suelo para generar mapas de distribución de maleza.',
    estado: 'proxima',
    etiqueta: 'Próxima',
  },
  {
    n: 'IV',
    nombre: 'Análisis temporal y predicción',
    resumen:
      'Comparación de observaciones sucesivas de una misma parcela para analizar su evolución y desarrollar modelos predictivos.',
    estado: 'futura',
    etiqueta: 'Futura',
  },
  {
    n: 'V',
    nombre: 'Integración',
    resumen:
      'Integración de los datos y modelos desarrollados en las distintas etapas dentro de una plataforma de consulta.',
    estado: 'futura',
    etiqueta: 'Futura',
  },
]

export const notaFases = {
  titulo: 'Línea de investigación',
  texto:
    'Se mantiene una línea de investigación futura orientada al análisis de cultivos de cacao y a la detección de condiciones asociadas a la presencia de metales pesados.',
}

export const paginas = [
  {
    nombre: 'Hoja de ruta',
    url: 'hoja-de-ruta.html',
    nota: 'Desarrollo completo del proyecto',
    accion: 'Ver etapas',
  },
  {
    nombre: 'Diapositivas',
    url: 'diapositivas.html',
    nota: 'Material utilizado para la presentación del proyecto.',
    accion: 'Ver diapositivas',
  },
  {
    nombre: 'Guion de exposición',
    url: 'guion.html',
    nota: 'Guion de presentación de aproximadamente 7 minutos, con términos técnicos y conceptos principales.',
    accion: 'Ver guion',
  },
  {
    nombre: 'Adelanto',
    url: 'adelanto.html',
    nota: 'Descripción del método de conteo y fundamentos matemáticos utilizados en la etapa actual.',
    accion: 'Ver adelanto',
  },
  {
    nombre: 'Código',
    url: 'https://github.com/ingdiegoter1998-eng/Centinela',
    nota: 'Repositorio del proyecto y código fuente disponible en GitHub.',
    accion: 'Ver repositorio',
  },
]

export const dondeEstamos = {
  titulo: 'Etapa I · Validación del método de conteo',
  parrafos: [
    'La versión actual procesa imágenes aéreas para separar vegetación y suelo, identificar copas de árboles y determinar su distribución espacial.',
    'En imágenes de prueba con un número conocido de árboles, el método identifica correctamente cada ejemplar.',
    'Las primeras pruebas sobre fotografías aéreas reales permitieron identificar una sensibilidad del método a determinadas condiciones de segmentación. Actualmente se está realizando una validación cuantitativa sobre imágenes reales mediante conteo manual y comparación con los resultados automáticos.',
  ],
  demo: {
    texto: 'Probar la demo en el navegador',
    url: 'https://centinela-demo.streamlit.app/',
    nota: 'La demo corresponde a una versión experimental del método de conteo y permite visualizar su funcionamiento sobre imágenes de prueba.',
  },
}

export const quienesSomos = {
  titulo: 'Un proyecto desarrollado en Saravena',
  parrafos: [
    'Centinela es desarrollado por estudiantes de Ingeniería en Inteligencia Artificial de la Universidad Industrial de Santander, sede Saravena.',
    'El proyecto combina programación, matemáticas, estadística, visión por computador y análisis de datos para abordar problemas relacionados con los cultivos de la región.',
    'El trabajo se desarrolla a partir de datos e imágenes obtenidos en el contexto local, con el propósito de estudiar la aplicación de técnicas de inteligencia artificial a condiciones agrícolas propias de Saravena.',
  ],
  colaboracion: {
    titulo: 'Colaboración',
    texto:
      'Estamos abiertos a establecer contacto con productores, instituciones y grupos de investigación interesados en agricultura de precisión y análisis de datos agrícolas.',
  },
}
