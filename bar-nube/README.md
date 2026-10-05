# Control del bar — versión en la nube (gratis, siempre activa)

Mismo bar, mismo modelo y mismas reglas que [`bar/`](../bar/README.md), pero sin PC encendida:

| Pieza | Servicio gratis | Qué hace |
|---|---|---|
| Pantallas (`index.html`, `app.js`) | **GitHub Pages**, en `/bar/` del sitio | Lo que abre el personal en el celular |
| Datos, reglas y tiempo real | **Supabase** (plan gratis) | Postgres + funciones + sincronización en vivo |

No hay servidor propio. El front habla directo con Supabase; las reglas (stock, cobro, numeración
consecutiva, jornada de 6:00 a 6:00) viven en funciones de la base: [`supabase/schema.sql`](supabase/schema.sql).

## Puesta en marcha (una sola vez)

1. **Base de datos**: aplicar `supabase/schema.sql` al proyecto. Sin pegar nada a mano:
   `SUPABASE_ACCESS_TOKEN=... ./supabase/aplicar.sh --demo` (el `--demo` carga el catálogo de ejemplo).
   A mano: Supabase → SQL Editor → pegar `schema.sql` → Run. Es seguro repetirlo.
2. **Llave pública**: poner la llave `anon` (Project Settings → API) en `config.js`. Es pública por diseño.
   Nunca la `service_role`.
3. **Publicar**: activar Pages (Settings → Pages → Source: *GitHub Actions*) y hacer merge a `main`.
   El workflow `pages.yml` publica la app en `https://<usuario>.github.io/Centinela/bar/`.
4. Los celulares abren ese link y lo agregan a la pantalla de inicio.

## Uso

Igual que la versión local: **Mesas** → tocar la mesa → tocar productos → cobrar (efectivo, transferencia o
tarjeta). **Inventario** (alertas, entradas, conteo), **Ventas** (por jornada, ganancia, cuentas abiertas) y
**Catálogo** (⚙: productos, precios, categorías, mesas; antes era el admin de Django).

Todo se ve al instante en los demás celulares (Supabase Realtime) y, por si el WiFi falla un momento, se
relee solo cada pocos segundos. Si no hay conexión aparece un aviso rojo y se recupera solo.

## Qué conviene saber

- **Seguridad abierta, a propósito**: quien tenga el link de la app puede leer y escribir (políticas
  `acceso_total` en `schema.sql`). No repartas el link. Si algún día importa, se cierran esas políticas.
- **Supabase gratis pausa el proyecto tras 7 días sin uso**. Un bar abre a diario; si cierras una semana, se
  reactiva con un clic en el panel de Supabase.
- **Respaldo**: Supabase → Database → Backups (el plan gratis no hace copias descargables automáticas);
  conviene exportar de vez en cuando. Los datos viven en Supabase, no en el repo.
- Stock: se descuenta al pedir y puede quedar negativo (no se frena una venta por conteo desactualizado).

## Probar sin tocar Supabase

`supabase/probar.sh` levanta un Postgres desechable, aplica el esquema dos veces, corre `pruebas.sql`
(las mismas reglas que las pruebas de Django) y lanza 200 toques simultáneos y 6 cobros a la vez:
comprueba que no se pierde ninguno y que la numeración sale 1…6 sin repetir. Necesita los binarios de PostgreSQL.
