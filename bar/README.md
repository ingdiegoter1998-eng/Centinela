# Control del bar

Inventario y ventas en tiempo real para un bar. **Gratis y sin internet**: corre en una PC del
bar y el personal lo usa desde el celular, conectado al mismo WiFi.

- Django + SQLite + waitress. Sin servicios de pago, sin cuentas en la nube, sin librerías
  externas en el navegador (funciona aunque se caiga el internet).
- Carpeta autocontenida: no depende del resto del repositorio.

## Arrancar

Necesitas Python 3.10 o mayor en la PC del bar.

| Sistema | Cómo |
|---|---|
| Windows | doble clic en `iniciar.bat` *(escrito para Windows, pero aún sin probar en uno)* |
| Linux / macOS | `./iniciar.sh` |

La primera vez prepara todo solo (tarda un minuto) y te pide crear el usuario del **dueño**.
Al arrancar escribe en pantalla la dirección para los celulares, algo como
`http://192.168.1.20:8000`. El personal la abre en el navegador (mismo WiFi que la PC) y la agrega
a la pantalla de inicio. La PC debe quedar encendida mientras el bar atiende.

Para probarlo con un catálogo de ejemplo: `python manage.py cargar_demo` (se puede repetir sin
duplicar). Después se cambian los productos y precios reales desde administración.

## Cómo lo usa el personal

1. **Mesas**: tablero con todas las mesas. Verde = libre; ámbar = ocupada, con su total.
2. Tocar una mesa → tocar productos para pedirlos (cada toque suma uno). `＋ / −` en la cuenta
   corrigen cantidades. El cliente es anónimo salvo que se elija uno (o se cree con `＋ Cliente`).
3. Al final, **Efectivo / Transferencia / Tarjeta** cobra, emite la factura con su número y libera la
   mesa. `Anular cuenta` devuelve todo al inventario.

Todos los celulares se refrescan solos cada 4 segundos: lo que pide un mesero lo ve el otro, y dos
personas no pueden abrir dos cuentas a la vez en la misma mesa.

## Lo que hace el dueño

- **Administración** (`⚙`, con el usuario del dueño): categorías, productos (nombre, precio, costo de
  compra, inventario), mesas y clientes. Precio, costo y alerta de stock se editan directo en la lista.
- **Inventario**: stock de cada producto, alertas de lo que hay que reponer, y por producto
  `Mover` → *entró mercancía* (suma y, si das el costo, lo actualiza) o *conté en el estante*
  (fija el stock a lo contado; guarda la diferencia).
- **Ventas**: por jornada, lo vendido, la ganancia (precio − costo), facturas, lo más vendido, cómo
  pagaron y las cuentas que quedaron abiertas. La **jornada** va de las 6:00 a las 6:00 del día
  siguiente, porque un bar cierra pasada la medianoche (se cambia con la variable `BAR_HORA_CORTE`).

## Modelo de datos

```
Categoria 1─* Producto 1─* Movimiento      compras y conteos de inventario
Mesa 1─* Factura *─1 Cliente               sin cliente = anónimo
Factura 1─* Linea *─1 Producto
```

- Una **factura abierta es la cuenta de la mesa**: se abre sola con el primer producto y al cobrarla
  recibe su número consecutivo.
- La **línea guarda el precio y el costo del momento**: si sube la cerveza, las ventas de ayer no cambian.
- El **stock se descuenta al pedir**, no al cobrar, para que el inventario sea el de este instante.
  Quitar de la cuenta o anular lo devuelve. Los productos con *controla inventario* apagado
  (cócteles, comida) no descuentan.
- **No se bloquea una venta por stock en cero**: el conteo puede estar desactualizado y no se le
  va a decir «no» a un cliente. El producto sale marcado como *agotado* y el stock puede quedar negativo,
  señal de que falta contar.
- Pesos **enteros** (sin centavos).

## Datos y respaldos

Todo está en `bar/db.sqlite3`. `python manage.py respaldar` guarda una copia en `bar/respaldos/`
(se puede hacer con el bar abierto). Conviene sacarla de la PC de vez en cuando (USB, Drive).

## Lo que NO tiene todavía

Pensado para seguir creciendo; faltan, entre otros: usuarios por mesero (quién vendió qué), cambiar de
mesa o dividir la cuenta, propinas, descuentos, impresión en impresora térmica, ingredientes por
cóctel (que descuenten del licor), historial de precios, gastos del bar.

**Seguridad:** las pantallas del personal no piden clave, a propósito; quien esté en el WiFi del bar
puede usarlas. Por eso conviene un WiFi con contraseña. La administración sí exige el usuario del dueño.

## Desarrollo

```bash
cd bar
python -m venv .venv && .venv/bin/pip install -r requirements.txt   # Windows: .venv\Scripts\...
python manage.py test        # 39 pruebas: inventario, cuentas, jornadas, vistas, admin
BAR_DEBUG=1 python manage.py runserver   # errores detallados y recarga automática
```

Para ponerlo en internet gratis habría que cambiar SQLite por una base externa: los planes gratuitos de
hosting borran los archivos locales al reiniciar. Por eso se eligió la PC del bar.
