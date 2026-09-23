# Demo en vivo — guion

~7 minutos. Todo corre local y sin internet: `demo/app.py` ejecuta el pipeline real de
`centinela_core` sobre cada escena. Los números de este guion son los que salen hoy; si alguno no
coincide en vivo, algo cambió y conviene saberlo antes de presentar.

Hallazgos que respaldan la demo: `docs/resultados-imagen-real.md` §5.

---

## Antes de presentar

**Una sola vez (ya hecho en este equipo):**

```bash
.venv\Scripts\python -m pip install -e ".[dev,demo]"
```

**10 minutos antes:**

1. Doble clic en `demo\iniciar.bat`. A los ~5 s se abre el navegador en `http://localhost:8501`.
   Si no se abre solo, escribe esa dirección.
2. **Calienta el caché:** pasa una vez por cada escena del menú. La primera vez cada una tarda
   2–5 s en procesarse; después cambiar es instantáneo. Así no hay esperas frente al público.
3. Vuelve a la primera escena, método **DBSCAN**, descriptores **Los 7**, `eps` en **0.80**.
4. Navegador en pantalla completa (F11). Si el proyector es chico, zoom del navegador al 90 %.
5. Deja abierta en otra pestaña la consola por si hace falta el plan B.

---

## Recorrido

### 1 · El resultado que ya conocían — 1 min

**Escena:** *Huerto sintético · 80 árboles*. DBSCAN, Los 7, eps 0.80.

**Se ve:** 80 contados, F1 = 1.00. Y el aviso amarillo: *DBSCAN no formó ningún cluster*.
"Decidió el conteo: **Watershed**".

**Decir:** Este es el resultado de la Etapa I: 80 de 80. Pero ahora el pipeline dice quién tomó la
decisión, y no fue DBSCAN. Con esta configuración DBSCAN nunca forma un grupo y el sistema cae a
"toda mancha cuenta". El 100 % lo sacó la segmentación. Lo descubrimos ayer.

*(Opcional, 20 s: pestaña **Pipeline paso a paso** para mostrar imagen → índice → máscara →
watershed.)*

### 2 · Cuando sí hay algo que descartar — 1 min 30 s

**Escena:** *Huerto sintético con maleza*.

| Clic | Se ve |
|---|---|
| Método **Sin agrupar** | 116 contados, F1 **0.82** — la maleza cuenta como árbol |
| Método **DBSCAN**, Los 7 | Igual: 116, aviso de fallback. DBSCAN tampoco decide |
| Descriptores **Solo forma** | **80 contados, 36 descartadas, F1 1.00** |
| Pestaña **¿Quién decide el conteo?** | Verde: **ESTABLE — meseta de 80**. Franja verde en la gráfica |
| Mover `eps` a 1.5 | Salta a 116: la maleza se funde con las copas |

**Decir:** Le metimos maleza con el mismo verde que la copa; solo cambia la forma. Sin agrupar, la
cuenta como árbol. Con los 7 descriptores, DBSCAN tampoco la separa: el color es casi igual y solo
mete ruido. Con solo forma, DBSCAN descarta exactamente las 36 manchas de maleza. Y fíjense en la
gráfica: el conteo se queda en 80 en todo un rango de eps. Eso es una meseta, y significa que hay
un grupo real en los datos.

### 3 · El mismo ajuste, en otra imagen — 45 s

**Escena:** vuelve a *Huerto sintético · 80 árboles*. Deja **Solo forma**.

**Se ve:** **6 contados, F1 0.14**. Rojo: **INESTABLE**.

**Decir:** La misma configuración que acertó en el huerto con maleza destruye el huerto limpio. La
razón: DBSCAN normaliza los descriptores con la varianza de cada imagen, así que el mismo eps
significa algo distinto en cada escena. No existe un eps bueno para todas. Lo importante es que el
sistema lo avisa solo: dice *inestable*, no publica un 6 como si nada.

### 4 · La imagen real — 1 min 30 s

**Escena:** *Huerto real (USDA)*. Vuelve a **Los 7**, eps 0.80, pestaña **Resultado**.

**Se ve:** 6 contados de 218 manchas. Cruces rojas encima de casi todos los árboles.

**Decir:** Esta es la única imagen real que tenemos con árboles separados sobre suelo, la condición
ideal para el método. La segmentación funciona: las 218 manchas caen sobre copas. Y el pipeline
publica 6.

**Mover `eps` en vivo** de 0.8 a 1.5 (flecha → en el slider): 6 → 36 → 137 → 190.

**Pestaña ¿Quién decide el conteo?** Rojo: **INESTABLE**. La curva es una rampa, sin meseta.

**Decir:** Moviendo un solo parámetro el conteo va de 6 a 190. El parámetro no elige el conteo:
el parámetro *es* el conteo. En el sintético con maleza vimos cómo se ve cuando hay estructura: una
meseta. Aquí no la hay.

*(Opcional: **Solo forma** → sigue INESTABLE. No es problema de descriptores.)*

### 5 · Cierre — 1 min

**Decir, en tres puntos:**

1. **Encontramos un error en nuestro propio resultado.** El 100 % de la Etapa I era de la
   segmentación, no del clustering. Está corregido en la documentación y el sistema ahora dice
   quién decidió cada conteo.
2. **El sistema ahora sabe cuándo no confiar en sí mismo.** El chequeo de estabilidad no necesita
   conteo manual: si no hay meseta, avisa. En las pruebas con verdad de terreno, solo dijo
   *estable* en el caso que de verdad acertó.
3. **Lo que sigue:** contar a mano los árboles de la imagen USDA para tener el primer F1 real;
   normalizar con escalas fijas en vez de por imagen; y con datos propios, pasar a un detector
   entrenado (Ruta B del ROADMAP).

---

## Plan B

**Si la app no abre** (puerto ocupado, error de Streamlit): la misma historia desde la consola, en
la carpeta del repo. Tarda ~2 s por comando.

```bash
.venv\Scripts\centinela count data\samples\huerto_demo.png
```

```bash
.venv\Scripts\centinela count data\samples\banco\huerto_reticula_usda.jpg --debug
```

```bash
.venv\Scripts\python scripts\control_banco.py --eps data\samples\banco\huerto_reticula_usda.jpg
```

Cada `count` imprime "Decidió el conteo" y "Estabilidad (eps)". El segundo guarda el panel de 4 vistas
junto a la imagen (`huerto_reticula_usda_debug.png`). El tercero imprime la tabla de la rampa
6 → 218.

`count` escribe sus salidas al lado de la imagen (`*_detecciones.csv`, `*_overlay.png`,
`*_manifest.yaml`, `*_debug.png`). Git las ignora, así que no ensucian el repo; se pueden borrar
cuando quieras.

**Si el PC falla del todo:** la misma app está en línea en
<https://centinela-demo.streamlit.app/>, desde cualquier computador con internet. Si nadie la
ha abierto en unos días puede estar dormida: la primera carga tarda. Ábrela antes de
presentar para despertarla. En línea no están las escenas de palma del lote ni del cítrico
satelital (licencia sin verificar); el recorrido del guion no las usa.

**Si el puerto 8501 está ocupado:** cierra la otra ventana de consola de Streamlit, o edita el
`8501` en `demo\iniciar.bat`.

---

## Preguntas probables

**¿Entonces DBSCAN no sirve?** Sirve cuando hay grupos distintos y los descriptores los separan: el
huerto con maleza lo muestra. Lo que no sirve es elegir `eps` a ciegas. Por eso el chequeo.

**¿Por qué no simplemente elegir el mejor eps?** Porque para saber cuál es el mejor hay que conocer
la respuesta. En USDA no tenemos conteo manual todavía; con él se puede calibrar, pero solo para
esa imagen, porque la escala cambia por imagen.

**¿Cuántos árboles hay de verdad en la imagen USDA?** No lo sabemos todavía: es el siguiente paso.
Contarlos a mano con `centinela annotate` da el primer F1 real del proyecto.

**¿La maleza sintética no está hecha a la medida para que funcione?** En parte sí: la diseñamos
para que difiera en forma. Por eso lo importante no es el F1 = 1.00 del sintético, sino que el
mismo ajuste falla en el huerto limpio y en la imagen real, y que el chequeo lo detecta en ambos.

**¿Qué es la meseta?** Si hay un grupo compacto de copas bien separado del resto, al agrandar
`eps` un poco el grupo no cambia: el conteo se queda quieto. Si no hay grupo, cada `eps` da un
número distinto.
