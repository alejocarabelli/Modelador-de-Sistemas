import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { FlowInputParameter } from '../../types/diagram';
import {
  createInputParameter,
  formatInputParameter,
  formatInputParameters,
  parseInputParametersText,
} from '../../utils/useCaseFlowModel';

type InputParametersEditorProps = {
  parameters: FlowInputParameter[];
  onChange: (parameters: FlowInputParameter[]) => void;
};

export function InputParametersEditor({ parameters, onChange }: InputParametersEditorProps) {
  const [draft, setDraft] = useState('');
  const [editingTextMode, setEditingTextMode] = useState(false);
  const [rawText, setRawText] = useState('');

  const addFromDraft = (): void => {
    const parsed = parseInputParametersText(draft);
    if (parsed.length === 0) return;
    onChange([...parameters, ...parsed]);
    setDraft('');
  };

  const toggleOptional = (id: string): void => {
    onChange(
      parameters.map((param) =>
        param.id === id
          ? param.optional
            ? { id: param.id, name: param.name, ...(param.options ? { options: param.options } : {}) }
            : { ...param, optional: true }
          : param,
      ),
    );
  };

  const removeParam = (id: string): void => {
    onChange(parameters.filter((param) => param.id !== id));
  };

  if (editingTextMode) {
    return (
      <div className="ucf-params-raw">
        <input
          aria-label="Parámetros de entrada separados por coma"
          placeholder="ej. pnumeroCaso, [pcodigoTipoCaso], respuesta (Resuelto - NoResuelto)"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onChange(parseInputParametersText(rawText));
              setEditingTextMode(false);
            } else if (event.key === 'Escape') {
              setEditingTextMode(false);
            }
          }}
        />
        <button
          className="is-primary"
          type="button"
          onClick={() => {
            onChange(parseInputParametersText(rawText));
            setEditingTextMode(false);
          }}
        >
          Aplicar
        </button>
        <button type="button" onClick={() => setEditingTextMode(false)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="ucf-params-editor">
      <div className="ucf-params-chips">
        {parameters.map((param) => (
          <span className={`ucf-param-chip${param.optional ? ' is-optional' : ''}`} key={param.id}>
            <button
              className="ucf-param-toggle"
              title={param.optional ? 'Marcar como obligatorio' : 'Marcar como opcional [param]'}
              type="button"
              onClick={() => toggleOptional(param.id)}
            >
              {formatInputParameter(param)}
            </button>
            <button
              aria-label={`Quitar parámetro ${param.name}`}
              className="ucf-param-remove"
              tabIndex={-1}
              type="button"
              onClick={() => removeParam(param.id)}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label="Agregar parámetro de entrada"
          className="ucf-param-input"
          placeholder={parameters.length === 0
            ? 'ej. pnumeroCaso, [pcodigoTipoCaso], respuesta (Resuelto - NoResuelto)'
            : '+ agregar parámetro (Enter o coma)'}
          value={draft}
          onBlur={addFromDraft}
          onChange={(event) => {
            const val = event.target.value;
            if (val.endsWith(',') && !val.includes('(')) {
              const parsed = parseInputParametersText(val);
              if (parsed.length > 0) {
                onChange([...parameters, ...parsed]);
                setDraft('');
                return;
              }
            }
            setDraft(val);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addFromDraft();
            } else if (event.key === 'Backspace' && draft === '' && parameters.length > 0) {
              removeParam(parameters[parameters.length - 1].id);
            }
          }}
        />
      </div>
      <div className="ucf-params-actions">
        <button
          tabIndex={-1}
          title="Agregar parámetro rápido"
          type="button"
          onClick={() => {
            if (draft.trim()) addFromDraft();
            else onChange([...parameters, createInputParameter({ name: 'pParametro' })]);
          }}
        >
          <Plus size={11} aria-hidden="true" />
        </button>
        {parameters.length > 0 ? (
          <button
            className="ucf-params-edit-all"
            tabIndex={-1}
            title="Editar lista completa como texto"
            type="button"
            onClick={() => {
              setRawText(formatInputParameters(parameters));
              setEditingTextMode(true);
            }}
          >
            Editar texto
          </button>
        ) : null}
      </div>
    </div>
  );
}
