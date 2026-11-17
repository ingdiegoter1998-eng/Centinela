# Documentación del sistema del bar

Escrita el 17-nov-2026, el día que se acabó el acceso a Claude Code. Está pensada para que una persona sola, o una persona con un chat de IA gratis que no ve el repositorio, pueda operar, arreglar y extender todo copiando y pegando.

Sin claves: ningún archivo de aquí tiene contraseñas, tokens ni llaves secretas. Dónde viven cada una está en el mapa.

## Por dónde empezar según lo que te pase

| Situación | Lee |
|---|---|
| No sé qué es cada cosa ni dónde entrar | [01-mapa-y-urls.md](01-mapa-y-urls.md) |
| El bot de WhatsApp no contesta | [02-bot-whatsapp.md](02-bot-whatsapp.md), sección «El bot no contesta» |
| La música no suena o la rockola rechaza pedidos | [04-rockola-spotify-y-artistas.md](04-rockola-spotify-y-artistas.md) |
| Hay que pegar un SQL, desplegar una función o cambiar una clave | [03-supabase-y-despliegue.md](03-supabase-y-despliegue.md) |
| Quiero saber por qué algo funciona como funciona (precios, puntos, comisión, horarios) | [05-decisiones-de-negocio.md](05-decisiones-de-negocio.md) |
| Qué falta por hacer | [06-pendientes.md](06-pendientes.md) |
| Quiero cambiar código con ayuda de una IA gratuita | [07-trabajar-con-ia-gratuita.md](07-trabajar-con-ia-gratuita.md) |
| Necesito el detalle técnico (tablas, funciones, archivos) para pegárselo a una IA | [08-referencia-tecnica.md](08-referencia-tecnica.md) |

## Anexos (documentos de apoyo copiados tal cual)

- [anexos/auditoria-rockola-2026-11-16.md](anexos/auditoria-rockola-2026-11-16.md): auditoría de la rockola y el bot (varias cosas ya se arreglaron; ver pendientes).
- [anexos/planteamiento-camara.md](anexos/planteamiento-camara.md) y [anexos/lista-piezas-caudalimetro.md](anexos/lista-piezas-caudalimetro.md): idea de cámara y caudalímetro, aún sin construir.
- [anexos/top30-canciones-cinicas.md](anexos/top30-canciones-cinicas.md): lista de canciones para las frases de la TV.

Además, los README que ya existían y siguen vigentes: [`../README.md`](../README.md) (app, usuarios, rockola) y [`../bot/README.md`](../bot/README.md) (bot).

## Regla de oro

Esto es un bar real que vende todas las noches. Antes de tocar la base de datos real (Supabase) piensa si lo puedes probar primero en un Postgres desechable (`supabase/probar.sh`) y si el cambio se puede deshacer. Las ventas son dinero: nunca borres facturas.
