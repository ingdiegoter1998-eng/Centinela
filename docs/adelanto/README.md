# Adelanto y exposición

Páginas de presentación del proyecto (Etapa I). Fuentes en HTML; las imágenes se
embeben en base64 al publicar.

| Archivo | Qué es | Publicado |
|---|---|---|
| `index.html` | Página de adelanto — qué plantea el proyecto, cómo funciona la Etapa I, su matemática y la hoja de ruta | <https://claude.ai/code/artifact/adb9ef22-b694-46af-8c5e-cc5a6457ad8b> |
| `exposicion.html` | Guion de exposición de ~7 min para compañeros de clase, con glosario | <https://claude.ai/code/artifact/d67e235c-c71f-467f-b498-5f984b31d7e5> |

## Imágenes

- `metodo.jpg` — panel de 4 vistas del pipeline sobre huerto sintético
  (de `centinela count data/samples/huerto_demo.png --debug`, redimensionado).
- `real.jpg` — panel sobre la imagen real de cítricos
  (de `centinela count data/samples/sep_topright.png --debug`, redimensionado).
- `sintetico.jpg` — overlay del resultado sintético.

## Cómo se arma

El HTML usa marcadores `{{METODO_IMG}}` / `{{REAL_IMG}}` que se sustituyen por
`data:image/jpeg;base64,<contenido>` de las imágenes de esta carpeta. El resultado
se guarda como `*.build.html` (no versionado) y ese es el que se publica.
