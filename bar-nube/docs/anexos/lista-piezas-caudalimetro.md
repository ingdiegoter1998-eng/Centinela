# Piezas para el caudalímetro (1 grifo)

Se programa desde el Arduino IDE, pero la placa es un **ESP32** y no un Arduino Uno: el ESP32 trae wifi, así manda los litros directo a Supabase sin otro equipo. Precios aproximados en Colombia, verificar al comprar.

## Lo necesario

| # | Pieza | Para qué | Aprox. COP |
|---|---|---|---|
| 1 | **ESP32 DevKit V1** (ESP32-WROOM-32, 30 o 38 pines) | El cerebro: cuenta pulsos y manda datos por wifi | 25.000 a 40.000 |
| 2 | **Caudalímetro**: Swissflow SF800 (recomendado) o sensor de flujo Hall grado alimenticio 1/4" | Mide los litros que pasan por la manguera | SF800: USD 50 a 80 importado · barato: 30.000 a 60.000 |
| 3 | **Cable USB de datos** (micro-USB o USB-C, según la placa) | Programar el ESP32. Ojo: muchos cables solo cargan y no pasan datos | 10.000 |
| 4 | **Cargador USB 5 V 2 A** | Alimentación permanente (sirve uno de celular) | 0 a 20.000 |
| 5 | **Resistencias**: 10 kΩ y 20 kΩ (compra un kit surtido) | Pull-up de la señal y divisor de voltaje (ver conexión) | 5.000 a 10.000 el kit |
| 6 | **Protoboard + cables dupont** macho-macho y macho-hembra | Armar y probar sin soldar | 15.000 a 25.000 |
| 7 | **Acoples para la manguera**: 2 conectores espiga (barb) a la medida de tu manguera + 2 abrazaderas | Meter el sensor en la línea de cerveza. Mide el diámetro interno de tu manguera antes de comprar | 10.000 a 30.000 |
| 8 | **Cable de 3 hilos** (1 a 3 metros) | Llevar la señal del sensor (zona fría) hasta el ESP32 | 5.000 |
| 9 | **Caja plástica hermética** (IP65, tipo caja de paso) | Proteger el ESP32 de la humedad y la condensación del barril | 10.000 a 20.000 |

**Total sin el sensor:** unos 80.000 a 180.000 COP.

## Opcionales que valen la pena

- **Pantalla OLED 0,96" SSD1306 (I2C)**, 15.000 a 20.000: muestra los litros en vivo junto al grifo, útil para calibrar.
- **Pulsador**, 1.000: para poner el contador en cero al calibrar.
- **Kit de soldar básico**, 40.000 a 70.000: para pasar del protoboard a algo definitivo que no se suelte.

## Conexión

- Sensor **rojo** a 5 V (pin VIN del ESP32), **negro** a GND, **amarillo** (señal) a un pin GPIO, por ejemplo el GPIO 27.
- **SF800:** su salida es de colector abierto. Pon la resistencia de 10 kΩ entre la señal y 3,3 V.
- **Sensor barato:** muchos sacan la señal a 5 V y el ESP32 aguanta máximo 3,3 V. Usa un divisor: señal → 10 kΩ → GPIO 27 → 20 kΩ → GND. Si no lo pones, puedes quemar el pin.
- Si el sensor queda lejos, junta los cables de señal y GND trenzados para reducir ruido.

## Software (gratis)

- Arduino IDE con el paquete de placas "esp32" de Espressif.
- El programa cuenta pulsos, los convierte a litros con el número de calibración y cada vez que termina una sacada manda a Supabase: grifo, litros, hora de inicio y hora de fin. El código lo hago yo cuando tengas las piezas.

## Calibración

1. Pon el contador en cero.
2. Sirve exactamente 1 litro en una jarra medidora.
3. Anota los pulsos contados: esos son los "pulsos por litro". Repite 3 veces y saca el promedio. Con espuma hay que repetir más.

## La cámara Tapo

Las Tapo con giro (C200, C210, C211 y similares) **sí sirven**: sacan video por RTSP, que es lo que necesita Frigate.

1. En la app Tapo: Configuración de la cámara → Avanzado → **Cuenta de la cámara**. Crea un usuario y una contraseña (distintos a los de tu cuenta Tapo).
2. Dale una IP fija en tu router.
3. El video queda en `rtsp://usuario:clave@IP:554/stream1` (1080p) y `stream2` (baja resolución, la que Frigate usa para detectar).

Detalles:
- Deja la cámara **fija** en una posición (sin giro automático ni seguimiento de movimiento) para que las zonas no se muevan.
- Apaga el **modo privacidad** y, para lo legal, no grabes el audio.
- Solo tiene wifi: la señal tiene que llegar bien a donde la pongas.
