# Modelador de Sistemas para Claude (prueba)

Extensión para Claude Desktop en Mac. Le permite a Claude ver lo que estás haciendo en el Modelador de Sistemas, para que puedas estudiar con él ("¿está bien esta secuencia según el flujo?", "¿me falta alguna relación en el diagrama de clases?"), y proponerte cambios que vos aplicás o descartás en la app.

Claude nunca escribe en tus datos. Lee, en modo solo lectura, lo que la app guarda mientras trabajás (cada cambio queda guardado al segundo en `~/Library/WebKit/com.alejocarabelli.disenosistemas.v2/`) y se lo pasa a Claude resumido en texto. Si no lo encuentra, usa el último respaldo automático de **Documentos › Modelador de Sistemas › Respaldos**. No modifica nada y no usa internet.

## Instalar

1. Bajá `modelador-de-sistemas.mcpb`.
2. En Claude Desktop andá a **Configuración › Extensiones › Configuración avanzada** y en **Extension Developer** tocá **Instalar extensión…**. Elegí el archivo. (También suele andar haciendo doble clic en el archivo.)
3. Claude avisa que la extensión no está verificada: es esperable, aceptá.

## Usar

Con la app abierta en lo que estás haciendo, preguntale a Claude, por ejemplo:

- "Mirá lo que estoy haciendo en el Modelador y decime si está bien."
- "Compará mi secuencia con el flujo de sucesos del CU 3."
- "Respondé las dudas que anoté en el proyecto."

Claude tiene estas herramientas:

| Herramienta | Qué hace |
|---|---|
| `ver_lo_que_estoy_haciendo` | El artefacto abierto ahora, resumido, con tus apuntes y dudas. |
| `listar_proyectos` | Tus proyectos y sus artefactos. |
| `leer_artefacto` | Otro artefacto del proyecto, resumido. |
| `leer_mis_dudas` | Las dudas y apuntes de todo el proyecto. |
| `leer_artefacto_json` | El JSON completo; solo si el resumen no alcanza. |
| `ver_guia_de_formato` | La guía del formato JSON de un tipo de artefacto. |
| `proponer_cambio` | Propone un cambio: solo lo que cambia (modificar, agregar, quitar o mover elementos por su id) o un artefacto nuevo. |
| `ver_propuestas_pendientes` | Las propuestas que todavía no aplicaste ni descartaste. |

### Cambios propuestos por Claude

Pedile, por ejemplo, "corregí los retornos de la secuencia". Claude no reescribe el diagrama: manda solo las operaciones (cambiá este mensaje, sacá este otro del loop…), la extensión las aplica sobre la versión actual y frena si alguna referencia quedaría rota, como un retorno sin su llamada. Al tocar **Aplicar**, la app vuelve a aplicar esas mismas operaciones sobre lo que tenés en ese momento, así no se pierde lo que hayas cambiado mientras tanto. Después deja la propuesta en **Documentos › Modelador de Sistemas › Claude › Propuestas** y la app (desde la versión que trae el puente de propuestas) te muestra un aviso debajo de las pestañas con lo que cambia y los botones **Ver**, **Descartar** y **Aplicar**. Aplicar pasa por el mismo historial que un cambio hecho a mano: se deshace con ⌘Z. Si cambiaste el artefacto después de que Claude lo leyó y las operaciones ya no encajan (por ejemplo, borraste el mensaje que Claude quería cambiar), el aviso te lo dice antes de aplicar.

### De dónde lee

Cada respuesta le dice a Claude si está viendo los datos en vivo o, si no los encontró, el último respaldo (que se escribe cada 10 minutos). La carpeta de WebKit es interna de macOS y su formato puede cambiar entre versiones: por eso existe la alternativa de los respaldos.

## Para desarrollar

```sh
npm test       # pruebas (Node 18 o más nuevo, sin dependencias)
npm run pack   # arma modelador-de-sistemas.mcpb
```

Para probar con otras carpetas: `MODELADOR_WEBKIT=/ruta MODELADOR_RESPALDOS=/ruta node server/index.js`.
