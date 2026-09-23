import {
  proyecto,
  pilares,
  queEs,
  queSera,
  fases,
  notaFases,
  dondeEstamos,
  quienesSomos,
  cierre,
} from './content'

/* Fondo del hero: retícula de siembra vista a nadir, con algunas copas
   "detectadas". Es decorativo — alude a la Etapa I sin explicarla. */
function PlotGrid() {
  const cols = 42
  const rows = 24
  const step = 34
  const puntos = []
  const lineas = []

  // Pseudo-aleatorio determinista: el fondo se ve igual en cada render.
  const rnd = (i, j) => {
    const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453
    return v - Math.floor(v) // 0..1
  }

  for (let j = 0; j < rows; j++) {
    // Línea de siembra: la retícula debe leerse como surcos, no como puntos sueltos.
    lineas.push({ y: j * step, w: (cols - 1) * step })
    for (let i = 0; i < cols; i++) {
      puntos.push({
        x: i * step + (rnd(i, j) - 0.5) * 5,
        y: j * step + (rnd(j, i) - 0.5) * 5,
        r: 5.2 + rnd(i + 3, j + 7) * 1.6,
        detectada: rnd(i + 1, j + 2) > 0.94,
      })
    }
  }

  return (
    <svg
      className="hero__bg"
      viewBox="0 0 1200 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g transform="rotate(-8 600 320) translate(-160 -110)">
        {lineas.map((l, k) => (
          <line
            key={`l${k}`}
            x1="0"
            y1={l.y}
            x2={l.w}
            y2={l.y}
            stroke="rgba(89,176,114,0.07)"
            strokeWidth="1"
          />
        ))}
        {puntos.map((p, k) => (
          <g key={k}>
            <circle cx={p.x} cy={p.y} r={p.r} fill="rgba(89,176,114,0.16)" />
            {p.detectada && (
              <>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r + 5}
                  fill="none"
                  stroke="rgba(89,176,114,0.55)"
                  strokeWidth="1"
                />
                <path
                  d={`M${p.x - p.r - 10} ${p.y} h4 M${p.x + p.r + 6} ${p.y} h4`}
                  stroke="rgba(89,176,114,0.55)"
                  strokeWidth="1"
                />
              </>
            )}
          </g>
        ))}
      </g>
    </svg>
  )
}

function Seccion({ id, eyebrow, titulo, children, className = '' }) {
  return (
    <section id={id} className={`section ${className}`}>
      <div className="wrap">
        <p className={`eyebrow ${className.includes('vision') ? 'eyebrow--onDark' : ''}`}>
          {eyebrow}
        </p>
        <h2 className="section__title">{titulo}</h2>
        {children}
      </div>
    </section>
  )
}

export default function App() {
  return (
    <>
      <nav className="nav">
        <div className="wrap nav__inner">
          <a className="nav__brand" href="#inicio">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="#59b072" />
              <circle cx="8" cy="8" r="7" fill="none" stroke="#59b072" strokeWidth="1" />
            </svg>
            Centinela
          </a>
          <div className="nav__links">
            <a href="#proyecto">El proyecto</a>
            <a href="#fases">Fases</a>
            <a href="#ahora">Dónde estamos</a>
            <a href="#nosotros">Quiénes somos</a>
          </div>
        </div>
      </nav>

      <header className="hero" id="inicio">
        <PlotGrid />
        <div className="hero__scrim" />
        <div className="hero__glow" />
        <div className="wrap">
          <div className="hero__inner">
            <h1 className="hero__title">{proyecto.nombre}</h1>
            <p className="hero__sub">
              {proyecto.subtitulo} · <strong>{proyecto.lugar}</strong>
            </p>
            <p className="hero__pitch">{proyecto.pitch}</p>
            <div className="hero__meta">
              <span className="chip">
                <span className="chip__dot" />
                Etapa I en curso
              </span>
              <span className="chip">UIS Saravena</span>
              <span className="chip">Ingeniería en IA</span>
            </div>
          </div>
        </div>
      </header>

      <main>
        <Seccion id="proyecto" eyebrow="Qué es" titulo="Mirar el cultivo desde arriba y entender lo que se ve">
          <div className="prose">
            {queEs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="pilares">
            {pilares.map((p, i) => (
              <div className="pilar" key={p.verbo}>
                <span className="pilar__n">0{i + 1}</span>
                <h3 className="pilar__verbo">{p.verbo}</h3>
                <p className="pilar__texto">{p.texto}</p>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion
          eyebrow="Hacia dónde va"
          titulo="Construir el camino, no solo el destino"
          className="vision"
        >
          <div className="prose">
            {queSera.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Seccion>

        <Seccion id="fases" eyebrow="Las fases" titulo="Una etapa a la vez, cada una apoyada en la anterior">
          <div className="fases">
            {fases.map((f) => (
              <article className={`fase fase--${f.estado}`} key={f.n}>
                <span className="fase__n">{f.n}</span>
                <div>
                  <h3 className="fase__nombre">{f.nombre}</h3>
                  <p className="fase__resumen">{f.resumen}</p>
                </div>
                <span className={`estado estado--${f.estado}`}>{f.etiqueta}</span>
              </article>
            ))}
          </div>
          <p className="fases__nota">{notaFases}</p>
        </Seccion>

        <Seccion id="ahora" eyebrow="Dónde estamos" titulo="El estado real del proyecto, hoy" className="ahora">
          <div className="ahora__card">
            <p className="ahora__fase">{dondeEstamos.fase}</p>
            <div className="prose">
              {dondeEstamos.parrafos.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {dondeEstamos.demo && (
              <p className="ahora__demo">
                <a href={dondeEstamos.demo.url} target="_blank" rel="noreferrer">
                  {dondeEstamos.demo.texto} →
                </a>
                <span>{dondeEstamos.demo.nota}</span>
              </p>
            )}
          </div>
        </Seccion>

        <Seccion id="nosotros" eyebrow="Quiénes somos" titulo="Un proyecto de la región, hecho desde la región">
          <div className="prose">
            {quienesSomos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Seccion>
      </main>

      <footer className="pie">
        <div className="wrap">
          <h2 className="pie__titulo">{cierre.titulo}</h2>
          <p className="pie__texto">{cierre.texto}</p>
          <div className="pie__base">
            <span>{proyecto.nombre} · {proyecto.lugar}</span>
            <span>Universidad Industrial de Santander — Sede Saravena</span>
          </div>
        </div>
      </footer>
    </>
  )
}
