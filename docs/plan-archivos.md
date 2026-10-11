# Plan: sección "Archivos" (PDFs) en cada proyecto

App: Modelador de Sistemas (React 19 + Vite, envuelto en WKWebView en Mac por `macos/AppMain.m`; en Windows por Tauri en `src-tauri/`). Los proyectos viven en `localStorage` (`src/storage/projectsStorage.ts`), con respaldos JSON rotativos en `~/Documents/Modelador de Sistemas/Respaldos` vía el puente nativo `modeladorBackup`. Ya existe "abrir artefacto en otra ventana" (solo lectura, pensado para un iPad en Sidecar): `src/storage/nativeWindows.ts`, `#viewer=` en `src/main.tsx`, `openViewerForProject` en AppMain.m.

## Qué quiere el usuario
Guardar PDFs en un proyecto (enunciado, resolución de un compañero) y verlos en una pestaña de la app o en otra ventana (para llevarla al iPad), igual que se trabaja con los artefactos. Pero NO deben parecer artefactos: una sección aparte con varios PDFs. Intuitivo y coherente con el resto.

## Diseño

### UI
- En la barra lateral, dentro del proyecto abierto, debajo de la lista de artefactos: sección **"Archivos"** con su propio "+" ("Agregar PDF…") y la lista de PDFs (ícono de documento, nombre sin `.pdf`, nº de páginas tenue). Menú "…" por fila: Abrir en ventana nueva, Renombrar, Mostrar en Finder (solo Mac), Quitar del proyecto.
- Arrastrar uno o varios PDF desde Finder sobre la ventana (o sobre la sección) los agrega al proyecto abierto.
- Al tocar un PDF se abre como **pestaña** en la misma tira de pestañas que los artefactos (con ícono de PDF para distinguirla; cerrar, reordenar, cerrar otras, Cmd+número funcionan igual). Botón "Abrir en ventana nueva" en la pestaña/visor, igual que los artefactos.
- Visor propio con **pdf.js** (`pdfjs-dist`), no el visor nativo del WebView: se ve igual en Mac, Windows, navegador y en la ventana secundaria, y usa la barra/estética de la app. Barra: página n / N, zoom −/+ / ajustar al ancho, abrir en ventana. Scroll continuo con render perezoso de páginas (IntersectionObserver), nítido en Retina (devicePixelRatio). La hoja queda blanca también en tema oscuro. Recuerda página y zoom por archivo (preferencia de UI).
- Ventana secundaria: hash `#archivo=<projectId>/<fileId>`; `main.tsx` monta el visor solo lectura. En Mac, `modeladorWindows` acepta `{action:'open', kind:'file', ...}` y reutiliza `openViewerForProject` (misma ubicación en la otra pantalla).

### Modelo de datos
- `DesignProject.files?: ProjectFile[]` con `{ id, name, size, pageCount?, addedAt }`. Solo metadatos; el binario nunca va a localStorage (límite ~5 MB).
- La validación/normalización de proyectos (`projectsStorage`, `diagramNormalization`) acepta y conserva `files` y descarta entradas inválidas sin marcar el proyecto como dañado.
- Pestañas: la lista de pestañas abiertas por proyecto pasa a aceptar ids de archivos además de ids de artefactos (los ids no colisionan). El "elemento activo" puede ser un archivo: estado de UI aparte (`activeFileId` por proyecto) para no tocar `project.activeArtifactId` ni el historial de deshacer.

### Almacenamiento del binario (`src/storage/projectFiles.ts`, interfaz única con dos backends)
1. **Mac (puente nativo nuevo `modeladorFiles`)**: los PDF se copian a `~/Documents/Modelador de Sistemas/Archivos/<projectId>/<fileId>.pdf` (junto a Respaldos, se sincroniza con iCloud). Acciones: `save` (base64 → archivo, escritura atómica), `delete` (mueve a la Papelera con `trashItemAtURL`, nunca borrado definitivo), `delete-project` (Papelera de la carpeta del proyecto), `reveal` (Finder). Lectura: el `AppSchemeHandler` sirve `modeladorv2://app/__archivos/<projectId>/<fileId>.pdf` desde esa carpeta (validando que la ruta no se escape de ella), mismo origen que la app, así pdf.js lo lee con `fetch`. Disponible también en las ventanas secundarias (el esquema es compartido).
2. **Navegador / dev / Tauri (por ahora)**: IndexedDB (`modelador-archivos`, clave `projectId/fileId`, valor Blob). Así funciona en `npm run dev` y en Windows sin trabajo nativo extra.
- Se agrega `mjs`, `pdf`, `wasm` (y `bcmap` binario) al mapa de MIME de `AppSchemeHandler`, porque el worker de pdf.js es un módulo `.mjs` y con `application/octet-stream` WebKit no lo carga.

### Reglas
- Solo PDF (se valida la firma `%PDF`), máx. 50 MB por archivo, con mensaje claro si no.
- Quitar un archivo pide confirmación (diálogo de la app) y en Mac va a la Papelera. Borrar un proyecto manda su carpeta de archivos a la Papelera.
- Exportar/importar proyecto JSON y los respaldos llevan solo los metadatos. Si un archivo falta (otra máquina, restauración), la fila y la pestaña muestran "Archivo no disponible" con opción de quitarlo o volver a agregarlo; nada se rompe.
- No entra en deshacer/rehacer de los diagramas.

## Fuera de alcance (por ahora)
Vista dividida (PDF al lado del diagrama en la misma ventana), anotar/subrayar PDFs, otros formatos (imágenes), puente nativo en Windows, empaquetar los PDF dentro del JSON exportado.

## Verificación
Tests unitarios (normalización con `files`, pestañas mixtas, backend IndexedDB con fake), `npm run build`, `npm test`, `npm run lint`; prueba en el navegador (dev) agregando un PDF, abriéndolo en pestaña y en ventana; build de la app Mac con `scripts/build-macos-app.sh` y prueba real del puente nativo.

## Cambios tras la revisión de GPT (verificados contra el código; mandan sobre lo de arriba)

1. **Binarios por id de archivo, no por proyecto.** Carpeta `~/Documents/Modelador de Sistemas/Archivos/<fileId>.pdf` (y clave `fileId` en IndexedDB). `copyProject` (`src/utils/projectRecovery.ts`) conserva `files` tal cual (mismos fileId → comparten binario). `sameProjectContent` incluye `files` (id y nombre) en la comparación.
2. **Un único elemento activo.** Nada de `activeFileId` paralelo que deje vivo el diagrama oculto: con un PDF activo no se monta el editor del artefacto, y deshacer/rehacer, atajos de pestañas (Cmd+W, Cmd+número, cerrar otras/derecha) y la reconciliación de pestañas actúan sobre la pestaña realmente activa (`App.tsx` ~387 `activeHistoryKey`, ~641 atajos). Modelar la pestaña activa de forma discriminada (artefacto | archivo) donde haga falta, sin romper `project.activeArtifactId` ni los tests existentes.
3. **Detección de backend por bandera, no por presencia del handler.** En Mac se inyecta `window.__modeladorNativeFiles = true` en la principal Y en las ventanas secundarias (la secundaria solo lee por el esquema; no necesita el puente). Sin bandera → IndexedDB.
   **Windows/Tauri:** NO se toca `src-tauri/` (el usuario pide Windows solo a pedido). Ahí los PDF funcionan en pestaña con IndexedDB, y "Abrir en ventana nueva" se oculta para archivos (el shim descarta `kind` y construiría `#viewer=`). El puente de ventanas del Mac sí acepta `kind: 'file'` + `fileId`.
4. **Orden y fallos.** Agregar: primero se escribe el binario y recién con éxito se agregan los metadatos; si falla, mensaje claro y nada en el proyecto. Quitar: solo se quitan los metadatos (no se borra el binario en ese momento). Un binario huérfano es inofensivo.
5. **No romper respaldos: recolección de basura conservadora en vez de borrar.** Ni "quitar archivo" ni "borrar proyecto" tocan binarios. Al iniciar (main window, después de cargar proyectos), JS manda al puente `{action:'gc', referenced:[fileIds de todos los proyectos actuales]}`; el nativo manda a la Papelera (nunca borrado definitivo) los `<fileId>.pdf` que no estén en `referenced`, que no aparezcan como texto en ningún `Respaldos/*.json` y que tengan más de 7 días. En IndexedDB, GC equivalente pero solo contra los proyectos actuales y con la misma antigüedad mínima (guardar `addedAt` en el registro).
6. **Compatibilidad de pdf.js.** La app declara macOS 11.3 como mínimo. Usar `pdfjs-dist` con versión exacta y su build `legacy` (el más compatible), worker servido por el esquema con MIME correcto. Si pdf.js no carga o falla al abrir el documento, el visor muestra un estado claro con botón "Abrir en Vista Previa" (Mac: acción nativa `open-external` → `NSWorkspace openURL` del archivo) o "Abrir en el navegador" (web: blob URL). Nunca pantalla en blanco.
7. **Validación estricta en el nativo.** Toda acción del puente `modeladorFiles` y la ruta `__archivos/` del esquema aceptan solo `fileId` que cumpla `^[A-Za-z0-9_-]{1,64}$`; ruta final resuelta con `URLByResolvingSymlinksInPath` y verificada dentro de la carpeta Archivos. Se rechaza todo lo demás.
8. **Memoria.** El visor virtualiza: renderiza solo las páginas visibles ± 1, libera los canvas (width/height = 0) y cancela `renderTask` de las que salen de pantalla o al cambiar de pestaña/desmontar; destruye el documento al cerrar. Límite 50 MB por archivo; en Mac el botón "+" usa selección nativa con copia directa (acción `pick` → NSOpenPanel filtrado a PDF → copia a Archivos → devuelve `{id,name,size}`), sin pasar el binario por base64; arrastrar desde Finder sí manda base64 (mismo límite).
