import { Maximize2, Minus, Plus } from 'lucide-react';

/**
 * The only zoom control in the app. Every canvas (clases, casos de uso, clases
 * de secuencias, secuencia) shows it in the same corner, with the same order
 * and the same names; the toolbar no longer repeats it.
 */
export function CanvasZoom({
  label,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetZoom,
  fitLabel = 'Ajustar el diagrama a la vista',
}: {
  label: string;
  /** When known, the current zoom shows between the buttons and resets to 100 % on click. */
  zoomPercent?: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetZoom?: () => void;
  /** What the fit button does here: the whole diagram, or the width of a PDF page. */
  fitLabel?: string;
}) {
  return (
    <div className="v2-zoom" role="group" aria-label={label} data-export-control="true">
      <button type="button" aria-label="Alejar" title="Alejar" onClick={onZoomOut}>
        <Minus size={14} aria-hidden="true" />
      </button>
      {zoomPercent !== undefined ? (
        <button
          type="button"
          className="v2-zoom-value"
          aria-label={`Zoom ${zoomPercent} %. Restablecer al 100 %`}
          title="Restablecer al 100 %"
          onClick={onResetZoom}
        >
          {zoomPercent}%
        </button>
      ) : null}
      <button type="button" aria-label="Acercar" title="Acercar" onClick={onZoomIn}>
        <Plus size={14} aria-hidden="true" />
      </button>
      <span className="v2-zoom-divider" aria-hidden="true" />
      <button type="button" aria-label={fitLabel} title={fitLabel === 'Ajustar el diagrama a la vista' ? 'Ajustar a la vista' : fitLabel} onClick={onFit}>
        <Maximize2 size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
