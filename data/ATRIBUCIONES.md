# Atribuciones de las imágenes

El código de este repositorio es MIT (ver `LICENSE`). **Las imágenes de `data/` no lo son:**
cada una conserva la licencia de su autor original y se redistribuye aquí bajo sus condiciones.
Este archivo cumple el requisito de atribución que esas licencias exigen.

Ficha completa con las URL de origen: `data/samples/banco/PROCEDENCIA.csv`.

## Banco de referencia (`data/samples/banco/`)

| Archivo | Autor | Licencia | Origen |
|---|---|---|---|
| `musa_bangladesh.jpg` | The Roving Rokibul | CC BY-SA 4.0 | Wikimedia Commons |
| `cultivo_hileras_wisconsin.jpg` | Jules Verne Times Two | CC BY-SA 4.0 | Wikimedia Commons |
| `palma_aceite_rio.jpg` | DrLianPinKoh | CC BY 2.0 | Flickr |
| `palma_joven_suelo.jpg` | WWF Deutschland | CC BY-NC-SA 2.0 | Flickr |
| `palma_dosel.jpg` | unredd.photo | CC BY-NC 2.0 | Flickr |
| `huerto_hileras_usda.jpg` | USDA | Public Domain Mark 1.0 | Flickr |
| `huerto_surcos_usda.jpg` | USDA | Public Domain Mark 1.0 | Flickr |
| `huerto_reticula_usda.jpg` | USDA | Public Domain Mark 1.0 | Flickr |
| `huerto_camino_usda.jpg` | USDA | Public Domain Mark 1.0 | Flickr |

`data/samples/platano_div8.png` y las versiones de `data/samples/intermedias/`
(`platano_crop_full`, `platano_div4`) son derivadas de `musa_bangladesh.jpg` de The Roving
Rokibul (CC BY-SA 4.0). `intermedias/palma_zoom.png` es un recorte de `palma_lote.jpg`.

## Qué implica cada licencia

- **PDM 1.0** (*Public Domain Mark*, marca de dominio público) — sin restricciones de uso.
- **CC BY** — se puede usar y modificar, incluso comercialmente, **citando al autor**.
- **CC BY-SA** — igual que CC BY, pero las obras derivadas deben publicarse con la **misma
  licencia**. Las derivadas de `musa_bangladesh` que aparecen en este repositorio quedan, por
  tanto, bajo CC BY-SA 4.0.
- **CC BY-NC / BY-NC-SA** (*NonCommercial*, no comercial) — **solo uso no comercial**.
  `palma_joven_suelo.jpg` y `palma_dosel.jpg` sirven para el trabajo académico, pero **deben
  retirarse si el proyecto se comercializa**.

## Material excluido a propósito

`data/samples/musa_lote.jpg` es material de banco comercial con derechos reservados y marca de
agua visible (Nature Picture Library). Se procesó como prueba técnica —el hallazgo del fondo
verde documentado en `docs/resultados-imagen-real.md` §3.3 salió de ahí— pero **no se
redistribuye**. Queda ignorado en `.gitignore`.

## Imágenes anteriores a esta sesión

`citricos_lindsay.jpg` y sus recortes (`sep_topright*`) provienen de Esri World Imagery. Su
condición de uso no quedó registrada en su momento; conviene verificarla antes de publicar
cualquier figura derivada de ellas. `palma_lote.jpg` tampoco tiene procedencia registrada:
mismo cuidado.

Los archivos `huerto_demo*`, `huerto_maleza*`, `etapa2*` y `platanal_demo*` los genera
`centinela make-synthetic` (el último con `--platanal`): son sintéticos, sin autor externo.

## Fotos aportadas por usuarios

`data/samples/usuario/` guarda en local las fotos que los usuarios comparten para probar el
método (la primera, un platanal: `docs/resultados-centros.md` §1). Está en `.gitignore`: no se
redistribuyen hasta tener el permiso y la licencia de quien las tomó.

## Cómo está organizado `data/samples/`

| Carpeta | Qué contiene |
|---|---|
| `data/samples/` | Imágenes de entrada que usan la demo, los documentos y los ejemplos, con su verdad de terreno (`*_gt.csv`) cuando existe |
| `data/samples/banco/` | Banco de referencia de imágenes reales, con `PROCEDENCIA.csv` |
| `data/samples/intermedias/` | Recortes y reducciones de las que salieron las entradas |
| `data/samples/salidas/` | Salidas de corridas anteriores del pipeline, conservadas como referencia |

Las salidas nuevas que `centinela count` escribe junto a cada imagen quedan fuera del repo
(`.gitignore`): se regeneran con un comando.
