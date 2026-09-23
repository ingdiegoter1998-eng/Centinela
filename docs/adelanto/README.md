# Adelanto y exposición

Páginas de presentación del proyecto. Fuentes en HTML; las imágenes se embeben en base64 al
publicar. Actualizadas el 2026-09-22 con los resultados sobre imagen real
(`docs/resultados-imagen-real.md` §5).

| Archivo | Qué es | Publicado |
|---|---|---|
| `index.html` | Página de adelanto — el problema, el método, su matemática, los resultados (sintético y foto real) y la hoja de ruta | <https://claude.ai/artifact/NTF6K524ypXfsVZiqbGdk6> |
| `exposicion.html` | Guion de exposición de ~7 min para compañeros de clase, con glosario y preguntas probables | <https://claude.ai/artifact/TVDWNvUEYSyEWpGnyHVMzC> |
| `diapositivas.html` | 12 diapositivas navegables con flechas (← →) | <https://claude.ai/artifact/V4NDYPXa7zK4qqJAeULorT> |
| `hoja-de-ruta.html` | Hoja de ruta de principio a fin, estado actual y qué sigue — para compartir con el equipo. Sin imágenes: se publica tal cual | <https://claude.ai/artifact/SF1jDjsshuLq9YmPrq1S9s> |

El guion de la **demo en vivo** (la app de `demo/`) es otro documento: `docs/demo-en-vivo.md`.

## Imágenes

| Archivo | Marcador | De dónde sale |
|---|---|---|
| `metodo.jpg` | `{{METODO_IMG}}` | Panel de 4 vistas del pipeline sobre huerto sintético (`centinela count data/samples/huerto_demo.png --debug`, redimensionado) |
| `real.jpg` | `{{REAL_IMG}}` | Panel sobre la imagen real de cítricos (`centinela count data/samples/sep_topright.png --debug`, redimensionado) |
| `real_usda.jpg` | `{{USDA_IMG}}` | Foto real del USDA con el conteo por defecto: ○ los 6 árboles contados, ✕ las 212 manchas descartadas |
| `sintetico.jpg` | — | Overlay del resultado sintético (no lo usa ninguna página hoy) |

La gráfica de meseta contra rampa (diapositiva 10 y sección 04 del adelanto) es SVG en línea,
dibujado a partir de `stability.barrido_eps` sobre `huerto_maleza.png` y `huerto_reticula_usda.jpg`.

## Cómo se arma

```bash
python docs/adelanto/armar.py
```

Sustituye cada marcador `{{..._IMG}}` por `data:image/jpeg;base64,…` y escribe
`*.build.html` junto a cada fuente (no versionados). Esos son los que se publican.
