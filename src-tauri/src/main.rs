// Sin consola de fondo en la versión instalada de Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Envoltura de Windows de Modelador de Sistemas: la misma app web que en macOS
//! (macos/AppMain.m), servida por Tauri sobre WebView2. Los puentes nativos se
//! exponen con la misma forma que en el Mac (`postMessage` que responde con una
//! promesa, y las banderas `__modeladorNative*`) en `window.__modeladorBridges`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const APP_NAME: &str = "Modelador de Sistemas";
const MAIN_LABEL: &str = "main";
const VIEWER_PREFIX: &str = "viewer-";
const BACKUPS_TO_KEEP: usize = 10;

/// El JS de los puentes. Las vistas reciben solo el de ventanas: nunca guardan.
const SHIM_COMMON: &str = include_str!("shim-common.js");
const SHIM_MAIN: &str = include_str!("shim-main.js");

/// Se activa cuando el frontend ya terminó de guardar y la principal puede cerrarse.
static MAIN_CLOSE_READY: AtomicBool = AtomicBool::new(false);
/// Ya se le pidió al frontend que se prepare: un segundo intento de cerrar no espera más.
static MAIN_CLOSE_REQUESTED: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Respaldo en disco

/// Los proyectos viven en el localStorage de WebView2. Igual que en el Mac, se
/// escribe una copia rotativa en Documentos\Modelador de Sistemas\Respaldos (si
/// Documentos está en OneDrive, viaja con él).
fn backup_directory(app: &AppHandle) -> Result<PathBuf, String> {
    // Para probar la app sin tocar los respaldos reales de la versión instalada
    // (en el Mac es la misma carpeta, y la rotación borraría los de la app real).
    #[cfg(debug_assertions)]
    if let Some(dir) = std::env::var_os("MODELADOR_BACKUP_DIR") {
        let dir = PathBuf::from(dir);
        std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        return Ok(dir);
    }
    let folder = if cfg!(debug_assertions) { "Respaldos-dev" } else { "Respaldos" };

    // La carpeta Documentos real, aunque esté redirigida a OneDrive.
    let documents = app.path().document_dir().map_err(|_| "No se encontró la carpeta Documentos.")?;
    let dir = documents.join(APP_NAME).join(folder);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn prune_backups(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut backups: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if !(name.starts_with("respaldo-") && name.ends_with(".json")) {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();
    if backups.len() <= BACKUPS_TO_KEEP {
        return;
    }
    backups.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    for (_, path) in backups.into_iter().skip(BACKUPS_TO_KEEP) {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
fn backup(window: WebviewWindow, action: String, payload: Option<String>) -> Result<serde_json::Value, String> {
    if window.label() != MAIN_LABEL {
        return Err("Solo la ventana principal guarda respaldos.".into());
    }
    let dir = backup_directory(window.app_handle())?;
    let directory = dir.to_string_lossy().to_string();

    match action.as_str() {
        "reveal" => {
            window.app_handle().opener().open_path(&directory, None::<&str>).map_err(|error| error.to_string())?;
            Ok(serde_json::json!({ "path": directory }))
        }
        "write" | "preserve" => {
            let payload = payload.filter(|text| !text.is_empty()).ok_or("El respaldo llegó vacío.")?;
            if action == "write" {
                let latest = std::fs::read_dir(&dir).ok().into_iter().flatten().flatten()
                    .filter_map(|entry| {
                        let path = entry.path();
                        let name = path.file_name()?.to_str()?;
                        let metadata = entry.metadata().ok()?;
                        if !metadata.is_file() || !name.starts_with("respaldo-") || !name.ends_with(".json") {
                            return None;
                        }
                        Some((metadata.modified().ok()?, path))
                    })
                    .max_by_key(|(modified, _)| *modified);
                if let Some((_, path)) = latest {
                    if std::fs::read_to_string(&path).ok().as_deref() == Some(payload.as_str()) {
                        return Ok(serde_json::json!({ "path": path.to_string_lossy(), "directory": directory }));
                    }
                }
            }
            let prefix = if action == "preserve" { "recuperacion" } else { "respaldo" };
            let stamp = chrono::Local::now().format("%Y-%m-%d-%H%M%S-%f");
            let destination = dir.join(format!("{prefix}-{stamp}.json"));
            // Escritura atómica: primero a un temporal y después se renombra.
            let temporary = dir.join(format!(".{prefix}-{stamp}.tmp"));
            std::fs::write(&temporary, payload).map_err(|error| error.to_string())?;
            std::fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
            if action == "write" { prune_backups(&dir); }
            Ok(serde_json::json!({ "path": destination.to_string_lossy(), "directory": directory }))
        }
        _ => Err("Acción de respaldo desconocida.".into()),
    }
}

// ---------------------------------------------------------------------------
// Propuestas de Claude

/// La extensión de Claude Desktop (claude-mcp/) deja propuestas de cambio en
/// Documentos\Modelador de Sistemas\Claude\Propuestas. Igual que en el Mac,
/// este comando solo las lista y borra la que el usuario aplicó o descartó.
const MAX_PROPOSAL_BYTES: u64 = 8 * 1024 * 1024;

fn proposals_directory(app: &AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    Some(documents.join(APP_NAME).join("Claude").join("Propuestas"))
}

/// Solo un nombre de archivo suelto: nada de rutas que salgan de la carpeta.
fn is_proposal_name(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.') && name.ends_with(".json") && !name.contains(['/', '\\', ':'])
}

fn list_proposals(dir: &Path) -> Vec<serde_json::Value> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut proposals: Vec<(String, String)> = entries.flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            let metadata = entry.metadata().ok()?;
            if !is_proposal_name(&name) || !metadata.is_file() || metadata.len() > MAX_PROPOSAL_BYTES {
                return None;
            }
            Some((name, std::fs::read_to_string(entry.path()).ok()?))
        })
        .collect();
    // Los nombres empiezan con la fecha: así sale primero la más vieja.
    proposals.sort_by(|a, b| a.0.cmp(&b.0));
    proposals.into_iter().map(|(file, text)| serde_json::json!({ "file": file, "text": text })).collect()
}

#[tauri::command]
fn claude_proposals(window: WebviewWindow, action: String, file: Option<String>) -> Result<serde_json::Value, String> {
    if window.label() != MAIN_LABEL {
        return Err("Solo la ventana principal recibe propuestas.".into());
    }
    let dir = proposals_directory(window.app_handle());
    match action.as_str() {
        "list" => Ok(serde_json::json!({ "proposals": dir.map(|dir| list_proposals(&dir)).unwrap_or_default() })),
        "resolve" => {
            let (Some(dir), Some(file)) = (dir, file.filter(|name| is_proposal_name(name))) else {
                return Err("Propuesta inválida.".into());
            };
            let _ = std::fs::remove_file(dir.join(file));
            Ok(serde_json::json!({ "ok": true }))
        }
        _ => Err("Acción desconocida.".into()),
    }
}

// ---------------------------------------------------------------------------
// Guardar archivos (exportaciones)

/// Muestra el diálogo de Guardar y escribe los bytes. Devuelve la ruta, o nada
/// si el usuario canceló. El nombre sugerido viaja en un encabezado porque el
/// cuerpo son los bytes crudos del archivo.
#[tauri::command]
async fn save_file(window: WebviewWindow, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("El archivo llegó en un formato inesperado.".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(|value| windows_file_name(&percent_decode(value)))
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "archivo".into());

    let mut dialog = window.dialog().file().set_parent(&window).set_file_name(&name);
    if let Some(extension) = Path::new(&name).extension().and_then(|ext| ext.to_str()) {
        dialog = dialog.add_filter(extension.to_uppercase(), &[extension]);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Los nombres salen de lo que escribió el usuario («TP 2: Reservas»), y Windows
/// rechaza `\ / : * ? " < > |`, los caracteres de control y el punto o espacio final.
fn windows_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| if character.is_control() || r#"\/:*?"<>|"#.contains(character) { ' ' } else { character })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.trim_end_matches(['.', ' ']).to_string()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let escaped = (bytes[index] == b'%' && index + 2 < bytes.len())
            .then(|| std::str::from_utf8(&bytes[index + 1..index + 3]).ok())
            .flatten()
            .and_then(|hex| u8::from_str_radix(hex, 16).ok());
        if let Some(byte) = escaped {
            out.push(byte);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------------------
// Ventanas de vista (solo lectura)

/// Asíncrono a propósito: crear una ventana desde un comando síncrono traba
/// WebView2 en Windows.
#[tauri::command]
async fn windows_message(
    app: AppHandle,
    action: String,
    project_id: String,
    artifact_id: String,
    title: Option<String>,
) -> Result<(), String> {
    if project_id.is_empty() || artifact_id.is_empty() {
        return Ok(());
    }
    match action.as_str() {
        "open" => open_viewer(&app, &project_id, &artifact_id, title.as_deref().unwrap_or(APP_NAME)),
        "focus-main" => focus_main(&app, &project_id, &artifact_id),
        _ => Ok(()),
    }
}

/// Etiqueta estable por diagrama: abrir dos veces el mismo trae la ventana existente.
fn viewer_label(project_id: &str, artifact_id: &str) -> String {
    // Con el largo adelante, ("p/a", "b") y ("p", "a/b") no chocan.
    let hash = format!("{}:{project_id}{artifact_id}", project_id.len())
        .bytes()
        .fold(0xcbf29ce484222325u64, |hash, byte| (hash ^ byte as u64).wrapping_mul(0x100000001b3));
    format!("{VIEWER_PREFIX}{hash:016x}")
}

fn encode_component(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn open_viewer(app: &AppHandle, project_id: &str, artifact_id: &str, title: &str) -> Result<(), String> {
    let label = viewer_label(project_id, artifact_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    let path = format!("index.html#viewer={}/{}", encode_component(project_id), encode_component(artifact_id));
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(path.into()))
        .title(title)
        .inner_size(980.0, 720.0)
        .min_inner_size(420.0, 320.0)
        .visible(false);
    let viewer = configure_webview(app, builder, false).build().map_err(|error| error.to_string())?;
    disable_browser_accelerators(&viewer);
    place_viewer(app, &viewer);
    let _ = viewer.show();
    let _ = viewer.set_focus();
    Ok(())
}

/// Otro monitor si hay uno; si no, corrida respecto de la ventana principal.
fn place_viewer(app: &AppHandle, viewer: &WebviewWindow) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else { return };
    let main_monitor = main.current_monitor().ok().flatten();
    let monitors = main.available_monitors().unwrap_or_default();
    let other = monitors.into_iter().find(|monitor| {
        main_monitor.as_ref().is_none_or(|current| current.position() != monitor.position())
    });

    if let Some(monitor) = other {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = (980.0 * scale).min(area.size.width as f64) as u32;
        let height = (720.0 * scale).min(area.size.height as f64) as u32;
        let _ = viewer.set_size(PhysicalSize::new(width, height));
        let _ = viewer.set_position(PhysicalPosition::new(
            area.position.x + (area.size.width as i32 - width as i32) / 2,
            area.position.y + (area.size.height as i32 - height as i32) / 2,
        ));
        return;
    }

    let open_viewers = app.webview_windows().keys().filter(|label| label.starts_with(VIEWER_PREFIX)).count() as i32;
    if let Ok(position) = main.outer_position() {
        let scale = main.scale_factor().unwrap_or(1.0);
        let step = (28.0 * scale) as i32;
        let _ = viewer.set_position(PhysicalPosition::new(
            position.x + (60.0 * scale) as i32 + step * (open_viewers - 1).max(0),
            position.y + (40.0 * scale) as i32 + step * (open_viewers - 1).max(0),
        ));
    }
}

fn focus_main(app: &AppHandle, project_id: &str, artifact_id: &str) -> Result<(), String> {
    let main = app.get_webview_window(MAIN_LABEL).ok_or("No está la ventana principal.")?;
    let _ = main.unminimize();
    let _ = main.set_focus();
    let detail = serde_json::json!({ "projectId": project_id, "artifactId": artifact_id });
    main.eval(format!(
        "window.dispatchEvent(new CustomEvent('modelador:select-artifact', {{detail: {detail}}}));"
    ))
    .map_err(|error| error.to_string())
}

// ---------------------------------------------------------------------------
// Cierre de la principal

/// El frontend avisa que ya guardó y respaldó: ahora sí se cierra todo.
#[tauri::command]
fn main_ready_to_close(window: WebviewWindow) {
    if window.label() != MAIN_LABEL {
        return;
    }
    MAIN_CLOSE_READY.store(true, Ordering::SeqCst);
    let _ = window.close();
}

fn close_viewers(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(VIEWER_PREFIX) {
            let _ = window.destroy();
        }
    }
}

// ---------------------------------------------------------------------------
// Webviews

fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" | "data" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost" | "localhost" | "127.0.0.1")),
        _ => false,
    }
}

fn configure_webview<'a>(
    app: &AppHandle,
    builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
    is_main: bool,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let navigation_app = app.clone();
    let mut builder = builder
        // Sin esto WebView2 se queda con el arrastre (reordenar atributos, mover pasos).
        .disable_drag_drop_handler()
        .zoom_hotkeys_enabled(false)
        .initialization_script(SHIM_COMMON)
        // Los enlaces externos se abren en el navegador, como en el Mac.
        .on_navigation(move |url| {
            if is_app_url(url) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = navigation_app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        });
    if is_main {
        builder = builder.initialization_script(SHIM_MAIN);
    }
    builder
}

/// En Windows, F5, Ctrl+R, Ctrl+P, Ctrl+F y compañía son del navegador y pisarían
/// los atajos de la app (y recargar a mitad de una edición asusta). Se apagan.
fn disable_browser_accelerators(window: &WebviewWindow) {
    #[cfg(windows)]
    let _ = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
        use windows_core::Interface;
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
        }
    });
    #[cfg(not(windows))]
    let _ = window;
}

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::App("index.html".into()))
        .title(APP_NAME)
        .inner_size(1380.0, 860.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                // Igual que el Mac: si el almacenamiento no persiste, avisar al abrir.
                let _ = window.eval("window.__modeladorCheckStorage && window.__modeladorCheckStorage();");
            }
        });
    let main = configure_webview(app, builder, true).build()?;
    disable_browser_accelerators(&main);
    Ok(main)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![backup, save_file, windows_message, main_ready_to_close, claude_proposals])
        .setup(|app| {
            create_main_window(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_LABEL {
                return;
            }
            match event {
                // Antes de cerrar, el frontend guarda lo pendiente y escribe un
                // último respaldo; después llama a `main_ready_to_close`.
                // Si el frontend no responde, el segundo intento cierra igual.
                WindowEvent::CloseRequested { api, .. }
                    if !MAIN_CLOSE_READY.load(Ordering::SeqCst) && !MAIN_CLOSE_REQUESTED.swap(true, Ordering::SeqCst) =>
                {
                    api.prevent_close();
                    if let Some(main) = window.app_handle().get_webview_window(MAIN_LABEL) {
                        let prepared = main.eval(
                            "window.__modeladorPrepareClose ? window.__modeladorPrepareClose() : window.__TAURI__.core.invoke('main_ready_to_close');",
                        );
                        if prepared.is_err() {
                            MAIN_CLOSE_READY.store(true, Ordering::SeqCst);
                            let _ = main.close();
                        }
                    }
                }
                // Sin la principal no hay con qué editar: las vistas se cierran con ella.
                WindowEvent::Destroyed => close_viewers(window.app_handle()),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Modelador de Sistemas");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proposal_names_stay_inside_the_folder() {
        assert!(is_proposal_name("2026-10-12T10-00-00-abc.json"));
        assert!(!is_proposal_name("../respaldo.json"));
        assert!(!is_proposal_name("..\\x.json"));
        assert!(!is_proposal_name("C:x.json"));
        assert!(!is_proposal_name(".oculta.json"));
        assert!(!is_proposal_name("propuesta.txt"));
    }

    #[test]
    fn file_names_are_valid_on_windows() {
        assert_eq!(windows_file_name("TP 2: Reservas - Clases.json"), "TP 2 Reservas - Clases.json");
        assert_eq!(windows_file_name("a/b\\c*?\"<>|.pdf"), "a b c .pdf");
        assert_eq!(windows_file_name("notas..."), "notas");
        assert_eq!(windows_file_name(" : "), "");
    }

    #[test]
    fn percent_decoding_matches_encode_uri_component() {
        assert_eq!(percent_decode("Diagrama%20de%20clases%20%C3%B1.png"), "Diagrama de clases ñ.png");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn viewer_labels_are_stable_and_distinct() {
        assert_eq!(viewer_label("p", "a"), viewer_label("p", "a"));
        assert_ne!(viewer_label("p/a", "b"), viewer_label("p", "a/b"));
    }
}
