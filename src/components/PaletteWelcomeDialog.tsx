import { useId, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ThemePreference } from '../hooks/useTheme';
import { getTheme, PALETTES, type DiagramTheme, type PaletteId, type ThemeAppearance } from '../theme/themes';
import type { SequenceParticipant } from '../types/diagram';
import { isMacPlatform } from '../utils/shortcutLabel';
import { resolveParticipantVisualIdentity } from '../utils/sequenceParticipantColors';

const PALETTE_BLURBS: Record<PaletteId, string> = {
  indigo: 'Dos colores, uno por papel: las cajas de los participantes en índigo y las activaciones en ámbar.',
  cuaderno: 'Cada clase con su color, para seguirla de un diagrama a otro.',
};

const APPEARANCES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

type PreviewParticipant = Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName'>;

const PREVIEW_PARTICIPANTS: PreviewParticipant[] = [
  { id: 'actor', kind: 'actor', name: 'Consultor', classifierName: '' },
  { id: 'pantalla', kind: 'object', name: '', classifierName: 'PantallaCambioEstado' },
  { id: 'gestor', kind: 'object', name: '', classifierName: 'GestorCambioEstado' },
  { id: 'tramite', kind: 'object', name: 'actual', classifierName: 'Tramite' },
];

const PREVIEW_X = [34, 118, 202, 286];

/**
 * A small sequence diagram drawn with the same participant identities and ink
 * the canvas uses, so each card shows exactly what that palette looks like.
 */
export function PalettePreview({ theme }: { theme: DiagramTheme }) {
  const ink = theme.sequence;
  const identities = PREVIEW_PARTICIPANTS.map((participant) => resolveParticipantVisualIdentity(participant, { theme }));
  const message = (from: number, to: number, y: number) => (
    <g key={`${from}-${to}-${y}`}>
      <line x1={PREVIEW_X[from] + (from === 0 ? 0 : 3)} y1={y} x2={PREVIEW_X[to] - 4} y2={y} stroke={ink.stroke} strokeWidth="1" />
      <path d={`M${PREVIEW_X[to] - 4},${y} l-5,-2.5 v5 z`} fill={ink.stroke} />
    </g>
  );
  return (
    <svg className="palette-preview" viewBox="0 0 320 132" aria-hidden="true">
      <rect width="320" height="132" fill={ink.canvasBackground} />
      <rect x="160" y="74" width="150" height="40" fill={ink.fragmentFill} stroke={ink.fragmentStroke} strokeWidth="0.75" />
      <path d="M160,74 h26 v6 l-4,4 h-22 z" fill={ink.fragmentTabFill} stroke={ink.fragmentStroke} strokeWidth="0.75" />
      {PREVIEW_PARTICIPANTS.map((participant, index) => {
        const x = PREVIEW_X[index];
        const identity = identities[index];
        if (participant.kind === 'actor') {
          return (
            <g key={participant.id} fill="none" stroke={identity.glyphStroke} strokeWidth="1">
              <line x1={x} y1="34" x2={x} y2="124" stroke={identity.lifelineStroke} strokeDasharray="3 3" />
              <circle cx={x} cy="12" r="4" fill={ink.canvasBackground} />
              <path d={`M${x},16 v10 M${x - 6},20 h12 M${x},26 l-5,7 M${x},26 l5,7`} />
            </g>
          );
        }
        return (
          <g key={participant.id}>
            <line x1={x} y1="30" x2={x} y2="124" stroke={identity.lifelineStroke} strokeWidth="1" strokeDasharray="3 3" />
            <rect x={x - 38} y="10" width="76" height="20" rx="1.5" fill={identity.headerFill} stroke={identity.headerBorder} strokeWidth="1" />
            <rect x={x - 38 + 14} y="17" width="48" height="5" rx="1" fill={ink.text} opacity="0.75" />
          </g>
        );
      })}
      <rect x={PREVIEW_X[1] - 3} y="42" width="6" height="70" fill={identities[1].activationFill} stroke={identities[1].activationBorder} strokeWidth="0.75" />
      <rect x={PREVIEW_X[2] - 3} y="58" width="6" height="46" fill={identities[2].activationFill} stroke={identities[2].activationBorder} strokeWidth="0.75" />
      <rect x={PREVIEW_X[3] - 3} y="90" width="6" height="12" fill={identities[3].activationFill} stroke={identities[3].activationBorder} strokeWidth="0.75" />
      {message(0, 1, 44)}
      {message(1, 2, 60)}
      {message(2, 3, 92)}
    </svg>
  );
}

type PaletteWelcomeDialogProps = {
  palette: PaletteId;
  appearance: ThemeAppearance;
  themePreference: ThemePreference;
  onPreviewPalette: (palette: PaletteId) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onConfirm: (palette: PaletteId) => void;
};

/**
 * Shown once, until a palette is picked. The choice previews live on the whole
 * app behind the dialog; Apariencia, at the foot of the sidebar, changes it later.
 */
export function PaletteWelcomeDialog({
  palette,
  appearance,
  themePreference,
  onPreviewPalette,
  onThemePreferenceChange,
  onConfirm,
}: PaletteWelcomeDialogProps) {
  const [selected, setSelected] = useState<PaletteId>(palette);
  const dialogRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(dialogRef, true, () => onConfirm(selected));

  const choose = (next: PaletteId): void => {
    setSelected(next);
    onPreviewPalette(next);
  };

  return (
    <div className="modal-backdrop palette-welcome-backdrop" role="presentation">
      <form
        ref={dialogRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="project-dialog palette-welcome"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(selected);
        }}
        role="dialog"
        tabIndex={-1}
      >
        <span className="palette-welcome-eyebrow">Bienvenida</span>
        <h2 id={titleId}>¿Cómo querés ver tus diagramas?</h2>
        <p className="dialog-description" id={descriptionId}>
          Elegí una paleta para todos tus proyectos. La podés cambiar cuando quieras desde Apariencia, al pie de la barra lateral.
        </p>
        <fieldset className="palette-welcome-choices">
          <legend className="visually-hidden">Paleta</legend>
          {PALETTES.map((option) => (
            <label className="palette-welcome-card" key={option.id}>
              <PalettePreview theme={getTheme(option.id, appearance)} />
              <span className="palette-welcome-card-text">
                <input
                  type="radio"
                  name={`${titleId}-palette`}
                  value={option.id}
                  checked={selected === option.id}
                  onChange={() => choose(option.id)}
                />
                <strong>{option.name}</strong>
                <span>{PALETTE_BLURBS[option.id]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="palette-welcome-footer">
          <div className="palette-welcome-appearance" role="radiogroup" aria-label="Apariencia">
            {APPEARANCES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={themePreference === option.value}
                title={option.value === 'system' ? (isMacPlatform() ? 'Según macOS' : 'Según el sistema') : undefined}
                onClick={() => onThemePreferenceChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="primary-action" type="submit">Empezar</button>
        </div>
      </form>
    </div>
  );
}
