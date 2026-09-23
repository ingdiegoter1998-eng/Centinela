---
title: Centinela · conteo de árboles
emoji: 🌳
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Conteo de árboles en foto aérea y cuándo no confiar en él
---

# Centinela · demo de laboratorio

Demo interactiva del pipeline de conteo del **Proyecto Centinela** — agricultura de precisión
para Saravena, Arauca. Estudiantes de Ingeniería en Inteligencia Artificial, UIS Sede Saravena.

Toma una imagen aérea cenital, separa la vegetación del suelo, separa las copas y decide cuáles
son árboles. Deja mover el método y el parámetro `eps` para ver en vivo **quién decide el
conteo** y si ese conteo es estable.

**No es una herramienta de inventario.** Sobre fotos reales el conteo todavía no es confiable;
la app lo dice en la pestaña *¿Quién decide el conteo?*.

- Proyecto: <https://ingdiegoter1998-eng.github.io/Centinela/>
- Código y documentación: <https://github.com/ingdiegoter1998-eng/Centinela>

## Imágenes incluidas

| Archivo | Autor | Licencia |
|---|---|---|
| `huerto_demo.png`, `huerto_maleza.png` | sintéticas (`centinela make-synthetic`) | MIT |
| `banco/huerto_reticula_usda.jpg` | USDA | Public Domain Mark 1.0 |
| `banco/palma_aceite_rio.jpg` | DrLianPinKoh (Flickr) | CC BY 2.0 |
| `platano_div8.png` | derivada de *Aerial view of a banana plantation in Bangladesh*, The Roving Rokibul (Wikimedia Commons) | CC BY-SA 4.0 |

El código es MIT; las imágenes conservan la licencia de su autor.

Este Space se genera desde el repositorio con `python despliegue/huggingface/publicar.py`:
no se edita aquí directamente.
