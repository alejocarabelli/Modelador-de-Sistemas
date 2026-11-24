import { useState } from 'react';
import { FileText, FileType, X } from 'lucide-react';
import type { AlternativeUseCaseFlow } from '../../types/diagram';
import {
  DEFAULT_FLOW_EXPORT_OPTIONS,
  type FlowExportOptions,
} from '../../types/useCaseFlowEditor';
import { formatAlternativeTitle } from '../../utils/useCaseFlowModel';

type FlowExportDialogProps = {
  alternatives: AlternativeUseCaseFlow[];
  initialFormat: 'pdf' | 'docx';
  onClose: () => void;
  onExport: (format: 'pdf' | 'docx', options: FlowExportOptions) => void;
};

export function FlowExportDialog({
  alternatives,
  initialFormat,
  onClose,
  onExport,
}: FlowExportDialogProps) {
  const [format, setFormat] = useState<'pdf' | 'docx'>(initialFormat);
  const [options, setOptions] = useState<FlowExportOptions>(() => ({
    ...DEFAULT_FLOW_EXPORT_OPTIONS,
    selectedAlternativeIds: alternatives.map((a) => a.id),
  }));

  const selectedIds = new Set(options.selectedAlternativeIds ?? alternatives.map((a) => a.id));
  const nothingSelected = !options.includeDescription && !options.includeBasicFlow && (!options.includeAlternatives || selectedIds.size === 0);

  const toggleAlt = (id: string): void => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOptions({ ...options, selectedAlternativeIds: Array.from(next) });
  };

  return (
    <div className="ucf-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="ucf-export-title" aria-modal="true" className="ucf-export-dialog" role="dialog">
        <div className="ucf-export-header">
          <h2 id="ucf-export-title">Exportar especificación de Caso de Uso</h2>
          <button aria-label="Cerrar diálogo" className="v2-tool" type="button" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="ucf-export-body">
          <div className="ucf-export-group">
            <span className="ucf-export-label">Formato</span>
            <div className="ucf-segmented" role="radiogroup">
              <button
                aria-checked={format === 'pdf'}
                className={format === 'pdf' ? 'active' : undefined}
                role="radio"
                type="button"
                onClick={() => setFormat('pdf')}
              >
                <FileText size={13} aria-hidden="true" /> PDF (impresión)
              </button>
              <button
                aria-checked={format === 'docx'}
                className={format === 'docx' ? 'active' : undefined}
                role="radio"
                type="button"
                onClick={() => setFormat('docx')}
              >
                <FileType size={13} aria-hidden="true" /> Word (.docx)
              </button>
            </div>
          </div>

          <div className="ucf-export-group">
            <span className="ucf-export-label">Orientación de hoja (A4)</span>
            <div className="ucf-segmented" role="radiogroup">
              <button
                aria-checked={options.orientation === 'portrait'}
                className={options.orientation === 'portrait' ? 'active' : undefined}
                role="radio"
                type="button"
                onClick={() => setOptions({ ...options, orientation: 'portrait' })}
              >
                Vertical (recomendado)
              </button>
              <button
                aria-checked={options.orientation === 'landscape'}
                className={options.orientation === 'landscape' ? 'active' : undefined}
                role="radio"
                type="button"
                onClick={() => setOptions({ ...options, orientation: 'landscape' })}
              >
                Apaisada
              </button>
            </div>
          </div>

          <div className="ucf-export-group">
            <span className="ucf-export-label">Secciones a incluir</span>
            <label className="ucf-export-check">
              <input
                checked={options.includeDescription}
                type="checkbox"
                onChange={(event) => setOptions({ ...options, includeDescription: event.target.checked })}
              />
              <span>Lista Descriptiva (ficha de 2 columnas)</span>
            </label>

            {options.includeDescription ? (
              <div className="ucf-export-suboptions">
                <label className="ucf-export-radio">
                  <input
                    checked={options.descriptionMode === 'full'}
                    name="descMode"
                    type="radio"
                    onChange={() => setOptions({ ...options, descriptionMode: 'full' })}
                  />
                  <span>Completa (los 9 campos oficiales)</span>
                </label>
                <label className="ucf-export-radio">
                  <input
                    checked={options.descriptionMode === 'brief-and-initial'}
                    name="descMode"
                    type="radio"
                    onChange={() => setOptions({ ...options, descriptionMode: 'brief-and-initial' })}
                  />
                  <span>Solo Breve Descripción y Estado Inicial (modo parcial)</span>
                </label>
              </div>
            ) : null}

            <label className="ucf-export-check">
              <input
                checked={options.includeBasicFlow}
                type="checkbox"
                onChange={(event) => setOptions({ ...options, includeBasicFlow: event.target.checked })}
              />
              <span>Camino Básico (tabla Actor | Sistema | Ref.)</span>
            </label>

            <label className="ucf-export-check">
              <input
                checked={options.includeAlternatives}
                disabled={alternatives.length === 0}
                type="checkbox"
                onChange={(event) => setOptions({ ...options, includeAlternatives: event.target.checked })}
              />
              <span>Caminos Alternativos ({alternatives.length})</span>
            </label>

            {options.includeAlternatives && alternatives.length > 0 ? (
              <div className="ucf-export-alt-list">
                {alternatives.map((alt) => (
                  <label className="ucf-export-check is-sub" key={alt.id}>
                    <input
                      checked={selectedIds.has(alt.id)}
                      type="checkbox"
                      onChange={() => toggleAlt(alt.id)}
                    />
                    <span>{formatAlternativeTitle(alt.number, alt.title)}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ucf-export-footer">
          <button className="secondary-action" type="button" onClick={onClose}>Cancelar</button>
          <button
            className="primary-action"
            disabled={nothingSelected}
            type="button"
            onClick={() => {
              onExport(format, options);
              onClose();
            }}
          >
            Exportar {format === 'pdf' ? 'PDF' : 'Word (.docx)'}
          </button>
        </div>
      </div>
    </div>
  );
}
