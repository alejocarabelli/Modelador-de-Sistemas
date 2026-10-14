import { Keyboard, X } from 'lucide-react';
import { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { AppUpdateStatus } from '../hooks/useAppUpdate';
import { APP_VERSION } from '../constants/appInfo';
import type { LatestRelease } from '../utils/appUpdate';
import { shortcutLabel } from '../utils/shortcutLabel';

type Shortcut = [keys: string, description: string];

/**
 * Every shortcut in the app, in one place. It replaces the flow editor's own
 * "Atajos" menu and the sequence shortcuts that were only discoverable in
 * tooltips. Opens with `?` or from the sidebar.
 */
const SECTIONS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: 'En toda la app',
    shortcuts: [
      ['⌘Z', 'Deshacer'],
      ['⇧⌘Z', 'Rehacer'],
      ['?', 'Mostrar estos atajos'],
      ['⇧⌘E', 'Abrir o cerrar los apuntes'],
      ['⌘\\', 'Mostrar u ocultar la barra lateral'],
      ['Esc', 'Cerrar un menú o cancelar la edición'],
    ],
  },
  {
    title: 'Apuntes',
    shortcuts: [
      ['↵ en una duda', 'Otra duda debajo'],
      ['↵ en una duda vacía', 'Convertirla en texto'],
      ['Esc', 'Volver al diagrama'],
      ['⌘Z  ⇧⌘Z', 'Deshacer o rehacer en el boceto'],
      ['⌫', 'Borrar la selección del boceto'],
    ],
  },
  {
    title: 'Pestañas de artefactos',
    shortcuts: [
      ['⌃Tab  ⌃⇧Tab', 'Pestaña siguiente o anterior'],
      ['⌘1…⌘8', 'Ir a la pestaña por su posición'],
      ['⌘9', 'Ir a la última pestaña'],
      ['⌘W', 'Cerrar la pestaña activa'],
      ['←  →  Home  End', 'Mover el foco entre pestañas'],
      ['↵  Espacio', 'Activar la pestaña enfocada'],
      ['Supr', 'Cerrar la pestaña enfocada'],
    ],
  },
  {
    title: 'Diagramas de clases y casos de uso',
    shortcuts: [
      ['Doble clic', 'Crear en el lugar (clase o caso de uso)'],
      ['⌫', 'Eliminar la selección'],
      ['1 … 6', 'Clases: relación con la que se crean las conexiones nuevas (asociación, herencia, agregación, composición, dependencia, realización)'],
      ['⇧ arrastrar', 'Seleccionar un área'],
      ['⌘ clic', 'Sumar o quitar de la selección'],
      ['↵  Esc', 'Confirmar o cancelar al editar un nombre'],
    ],
  },
  {
    title: 'Diagrama de secuencia',
    shortcuts: [
      ['M', 'Entrar o salir del modo teclado'],
      ['N', 'Crear una nota'],
      ['↵', 'Editar la nota seleccionada'],
      ['⌘D', 'Duplicar el elemento seleccionado'],
      ['⌘C  ⌘V', 'Copiar y pegar mensajes'],
      ['⌥↑  ⌥↓', 'Mover el elemento en la línea de tiempo'],
      ['⇧⌘U', 'Desempaquetar el fragmento seleccionado'],
      ['⌫', 'Eliminar la selección'],
    ],
  },
  {
    title: 'Secuencia · modo teclado',
    shortcuts: [
      ['M', 'Salir del modo teclado'],
      ['Esc', 'Volver un paso'],
      ['←  →', 'Elegir participante'],
      ['1 … 9  0', 'Ir a esa línea de vida (origen, o destino al elegirlo)'],
      ['⇧←  ⇧→', 'Volver a la línea anterior o rehacer'],
      ['⇧→ en el destino', 'Ir al último destino usado'],
      ['⌘↑  ⌘↓', 'Ir al principio o al final'],
      ['clic', 'Mover el cursor a ese punto'],
      ['↵', 'Mensaje síncrono'],
      ['⌥↵', 'Guardar el mensaje y quedarse en el origen'],
      ['S  R  C  D', 'Tipo de mensaje: síncrono, retorno, creación, destrucción (también con clic)'],
      ['P', 'Nuevo participante'],
      ['F', 'Fragmento combinado'],
      ['G', 'Editar la condición del operando'],
      ['E', 'Editar el elemento actual'],
    ],
  },
  {
    title: 'Flujo de sucesos',
    shortcuts: [
      ['↵', 'Paso siguiente, ya numerado'],
      ['Tab  ⇧Tab', 'Bajar o subir un nivel'],
      ['- al inicio', 'Viñeta de detalle'],
      ['⌘↵', 'Pasarle el turno al otro lado'],
      ['⇧⌘↵', 'Turno al revés (dentro o fuera del bloque)'],
      ['⌘.', 'Plegar o desplegar el paso'],
      ['⇧⌘A', 'Camino alternativo desde esta línea'],
      ['⌘ clic', 'Ir al paso o camino mencionado'],
    ],
  },
];

type ShortcutsDialogProps = {
  onClose: () => void;
  onDownloadArtifactGuide?: () => void;
  onCheckUpdate?: () => void;
  update?: LatestRelease | null;
  updateStatus?: AppUpdateStatus;
};

/** What the update line says: a search in progress, the newest release, or «up to date» after a search. */
const updateMessage = (update: LatestRelease | null | undefined, status: AppUpdateStatus | undefined) => {
  if (status === 'checking') return 'Buscando…';
  if (update) {
    return (
      <>
        {`Hay una versión nueva (${update.version}). `}
        <a href={update.url} rel="noreferrer">Ver la versión nueva</a>
      </>
    );
  }
  if (status === 'error') return 'No se pudo consultar. Probá más tarde.';
  return status === 'up-to-date' ? 'Tenés la última versión.' : null;
};

export function ShortcutsDialog({ onClose, onDownloadArtifactGuide, onCheckUpdate, update, updateStatus }: ShortcutsDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useFocusTrap(dialogRef, true, onClose);
  const message = updateMessage(update, updateStatus);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        aria-labelledby="shortcuts-title"
        aria-modal="true"
        className="project-dialog v2-shortcuts"
        ref={dialogRef}
        role="dialog"
      >
        <header className="v2-dialog-header">
          <span className="v2-dialog-icon" aria-hidden="true"><Keyboard size={18} /></span>
          <h2 id="shortcuts-title">Atajos de teclado</h2>
          <button aria-label="Cerrar" className="v2-tool" type="button" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="v2-shortcuts-grid">
          {SECTIONS.map((section) => (
            <section key={section.title} className="v2-shortcuts-section">
              <h3>{section.title}</h3>
              <dl>
                {section.shortcuts.map(([keys, description]) => (
                  <div key={keys}>
                    <dt>{keys.split(/\s{2,}/).map((key) => {
                      // "↵ en una duda": the key is the cap, where it applies reads as plain text.
                      const [cap, context] = key.split(/ (?=en )/);
                      return (
                        <span className="v2-kbd-group" key={key}>
                          <kbd className="v2-kbd">{shortcutLabel(cap)}</kbd>
                          {context ? <span className="v2-kbd-context">{context}</span> : null}
                        </span>
                      );
                    })}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        {onDownloadArtifactGuide ? (
          <p className="v2-shortcuts-guide">
            ¿Usás una IA para armar artefactos?{' '}
            <button type="button" onClick={onDownloadArtifactGuide}>Descargá la guía de formato (.md)</button>
          </p>
        ) : null}
        <div className="v2-shortcuts-update">
          <p>
            {`Modelador de Sistemas v${APP_VERSION}`}
            {onCheckUpdate ? (
              <>
                {' · '}
                {/* aria-disabled, not disabled: a disabled button drops the focus and Escape stops reaching the dialog. */}
                <button
                  aria-disabled={updateStatus === 'checking'}
                  type="button"
                  onClick={updateStatus === 'checking' ? undefined : onCheckUpdate}
                >
                  Buscar actualizaciones
                </button>
              </>
            ) : null}
          </p>
          {message ? <p aria-live="polite">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}
