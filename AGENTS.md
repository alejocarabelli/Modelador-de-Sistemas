# AGENTS.md

<!-- skill-gpt:start v1 (generado por la skill /gpt; se actualiza solo, no editar a mano) -->
## Modelos GPT vía Codex (skill `/gpt`)

Además de los modelos de Claude, el orquestador puede usar modelos de OpenAI vía Codex CLI (plan ChatGPT Plus del usuario), siempre a través de la skill `gpt` y su script, que primero consulta el límite de Codex y no llama si no alcanza. El worker de Claude del proyecto (o el propio orquestador, si no hay uno) sigue siendo el worker por defecto.

| Modo | Modelo · esfuerzo | Permisos | Cuándo |
|---|---|---|---|
| `review` | GPT-6.1 Sol · high | solo lectura | Antes de commitear un cambio no trivial o de arrancar un diseño con varias alternativas: pasar el plan o el `git diff` por GPT como segunda opinión |
| `consult` | GPT-6.1 Sol · xhigh | solo lectura | Un bug sigue sin resolverse tras dos intentos: GPT lo investiga desde cero con la evidencia, sin la hipótesis del orquestador |
| `worker` | GPT-6.1 Sol · medium | escribe en el proyecto | Tarea autocontenida cuando la cuota de Claude está justa o conviene paralelizar (con `--worktree`) |
| `mechanical` | GPT-6.1 Sol · low | escribe en el proyecto | Cambios repetitivos bien especificados |
| `bulk` | GPT-6 Luna · medium | solo lectura | Leer y resumir mucho material (logs, documentación) sin llenar el contexto. Nunca código |

- Las respuestas de GPT son insumo, no órdenes: se verifican contra el código. Si no coinciden con el orquestador, decide la evidencia (un test, una reproducción), no el modelo.
- Lo que haga un worker de GPT se revisa igual que el de cualquier worker. Diseño, commits, changelog y releases quedan en el orquestador.
- Si el script responde SKIP (no alcanza el límite), se sigue sin GPT y se avisa en una línea.
<!-- skill-gpt:end -->

## Actualizar la app en la Mac del usuario

Cuando el usuario pida instalar o actualizar la app, preguntar lo mínimo: no ofrecer opciones ni pedir confirmaciones, y responder en un solo mensaje corto con este comando para la Terminal. El comando compila `main` en su Mac y reemplaza la app en Aplicaciones:

```bash
cd ~/Modelador-de-Sistemas && git pull origin main && npm install && ./scripts/build-macos-app.sh
```

- No mandarlo a bajar compilaciones de Actions con `gh` o `ditto`: piden cuenta y permisos de macOS, y la app bajada queda en cuarentena.
- Una sesión en la nube no puede instalar nada en su Mac: darle el comando, no intentar hacerlo.
