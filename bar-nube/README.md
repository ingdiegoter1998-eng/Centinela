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
   `SUPABASE_ACCESS_TOKEN=... ./supabase/aplicar.sh --catalogo` (carga el catálogo real del bar; `--demo` carga uno de
   ejemplo). A mano: Supabase → SQL Editor → pegar `schema.sql` → Run. Es seguro repetirlo.
   **Usuarios**: `SUPABASE_ACCESS_TOKEN=... ADMIN_CLAVE=... BARMAN_CLAVE=... ./supabase/crear_usuarios.sh`
   (las claves no viven en el repo; repetirlo las cambia).
2. **Llave pública**: poner la llave `anon` (Project Settings → API) en `config.js`. Es pública por diseño.
   Nunca la `service_role`.
3. **Publicar**: activar Pages (Settings → Pages → Source: *GitHub Actions*) y hacer merge a `main`.
   El workflow `pages.yml` publica la app en `https://<usuario>.github.io/Centinela/bar/`.
4. Los celulares abren ese link y lo agregan a la pantalla de inicio.

## Usuarios y permisos

Se entra con usuario y contraseña. Quien no inició sesión no ve ni escribe nada (la llave pública `anon` quedó sin
permisos); lo que cada rol puede lo impone la base (RLS y funciones), no la pantalla.

| Usuario | Rol | Puede |
|---|---|---|
| `diego` | admin (super administrador) | Todo: mesas, inventario (sumar/contar), ventas y ganancias, catálogo y precios |
| `barman` (José Manuel) | barman | Abrir, editar y cobrar cuentas; ver el inventario sin modificarlo. No ve ventas ni catálogo |

Detalle: Supabase exige claves de 6+ caracteres y aquí se usan claves cortas, así que la app (y `crear_usuarios.sh`) le
suma el sufijo fijo `-bar` a lo que se escribe. Por dentro el usuario es `<usuario>@bar.local`. El registro público
está cerrado: usuarios nuevos solo con el script.

**Cerveza artesanal por litros**: la pinta (490 ml) y el vaso (330 ml) descuentan del mismo recipiente («Cerveza
artesanal negra (litros)», se cuenta en ml y se muestra en litros). El administrador lo ajusta con *Mover* en Inventario,
escribiendo litros.

## Uso

Igual que la versión local: **Mesas** → tocar la mesa → tocar productos → cobrar (efectivo, transferencia o
tarjeta). **Inventario** (alertas, entradas, conteo), **Ventas** (por jornada, ganancia, cuentas abiertas) y
**Catálogo** (⚙: productos, precios, categorías, mesas; antes era el admin de Django).

Todo se ve al instante en los demás celulares (Supabase Realtime) y, por si el WiFi falla un momento, se
relee solo cada pocos segundos. Si no hay conexión aparece un aviso rojo y se recupera solo.

## Qué conviene saber

- **Costos visibles por la API**: la pantalla del barman esconde costos y ganancias, pero técnicamente puede leer la
  columna `costo` de `productos` si consulta la API a mano. Si importa, hay que mover el costo a otra tabla.
- **Supabase gratis pausa el proyecto tras 7 días sin uso**. Un bar abre a diario; si cierras una semana, se
  reactiva con un clic en el panel de Supabase.
- **Respaldo**: Supabase → Database → Backups (el plan gratis no hace copias descargables automáticas);
  conviene exportar de vez en cuando. Los datos viven en Supabase, no en el repo.
- Stock: se descuenta al pedir y puede quedar negativo (no se frena una venta por conteo desactualizado).

## Probar sin tocar Supabase

`supabase/probar.sh` levanta un Postgres desechable, aplica el esquema dos veces, corre `pruebas.sql`
(las mismas reglas que las pruebas de Django) y lanza 200 toques simultáneos y 6 cobros a la vez:
comprueba que no se pierde ninguno y que la numeración sale 1…6 sin repetir. Necesita los binarios de PostgreSQL.
