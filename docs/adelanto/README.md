# Adelanto — página de presentación

`index.html` es la fuente de la página de adelanto del proyecto (Etapa I).

Publicada como artefacto:
<https://claude.ai/code/artifact/adb9ef22-b694-46af-8c5e-cc5a6457ad8b>

## Cómo se arma

El HTML usa dos marcadores — `{{METODO_IMG}}` y `{{REAL_IMG}}` — que se sustituyen
por las imágenes de esta carpeta codificadas en base64 (data URIs) antes de publicar:

- `metodo.jpg` — panel de 4 vistas del pipeline sobre huerto sintético
  (de `centinela count data/samples/huerto_demo.png --debug`, redimensionado).
- `real.jpg` — panel sobre la imagen real de cítricos
  (de `centinela count data/samples/sep_topright.png --debug`, redimensionado).
- `sintetico.jpg` — overlay del resultado sintético (no usada en la versión actual).

Sustitución: leer `index.html`, reemplazar cada marcador por
`data:image/jpeg;base64,<contenido>` y guardar el resultado.
