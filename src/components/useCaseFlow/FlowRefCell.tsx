import { useEffect, useRef, useState } from 'react';
import { Monitor, Plus, Split, X } from 'lucide-react';
import type { AlternativeUseCaseFlow, FlowRef, UseCaseFlowContent } from '../../types/diagram';
import { createId } from '../../utils/id';
import { formatAlternativeRef, formatFlowRef, getNextAlternativeNumber } from '../../utils/useCaseFlowModel';

type FlowRefCellProps = {
  content: UseCaseFlowContent;
  /** Exclude self when inside an alternative flow so a CA doesn't suggest itself. */
  currentFlowId: 'basic' | string;
  refs: FlowRef[];
  /** True on Comprobar / Controlar consistencia / Buscar to surface a direct "+ Crear CA" affordance. */
  suggestCreateCa?: boolean;
  onChangeRefs: (refs: FlowRef[]) => void;
  onCreateAlternativeAndLink: () => void;
  onJumpToAlternative: (flowId: string) => void;
};

const getNextGuiLabel = (content: UseCaseFlowContent): string => {
  const used = new Set<number>();
  const scanRefs = (list: FlowRef[]): void => {
    list.forEach((r) => {
      if (r.kind === 'gui') {
        const m = /(\d+)/.exec(r.label);
        if (m) used.add(Number(m[1]));
      }
    });
  };
  const scanSteps = (steps: UseCaseFlowContent['basicFlow']): void => {
    steps.forEach((step) => {
      scanRefs(step.refs);
      const walk = (nodes: typeof step.children): void => {
        nodes.forEach((n) => {
          scanRefs(n.refs);
          if (n.kind === 'loop') walk(n.children);
          else if (n.kind === 'conditional') {
            walk(n.thenChildren);
            if (n.elseChildren) walk(n.elseChildren);
          }
        });
      };
      walk(step.children);
    });
  };
  scanSteps(content.basicFlow);
  content.alternativeFlows.forEach((a) => scanSteps(a.steps));
  let next = 1;
  while (used.has(next)) next += 1;
  return `GUI-${next}`;
};

export function FlowRefCell({
  content,
  currentFlowId,
  refs,
  suggestCreateCa = false,
  onChangeRefs,
  onCreateAlternativeAndLink,
  onJumpToAlternative,
}: FlowRefCellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [guiDraft, setGuiDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside, true);
    return () => document.removeEventListener('mousedown', onOutside, true);
  }, [menuOpen]);

  const availableAlternatives: AlternativeUseCaseFlow[] = content.alternativeFlows.filter(
    (alt) => alt.id !== currentFlowId && !refs.some((r) => r.kind === 'ca' && r.flowId === alt.id),
  );
  const nextCaNumber = getNextAlternativeNumber(content.alternativeFlows);
  const hasCaRef = refs.some((r) => r.kind === 'ca' || r.kind === 'ca-missing');

  const removeRef = (refId: string): void => {
    onChangeRefs(refs.filter((r) => r.id !== refId));
  };

  const addAlternativeRef = (flowId: string): void => {
    onChangeRefs([...refs, { id: createId(), kind: 'ca', flowId }]);
    setMenuOpen(false);
  };

  const addGuiRef = (label: string): void => {
    const clean = label.trim() || getNextGuiLabel(content);
    onChangeRefs([...refs, { id: createId(), kind: 'gui', label: clean }]);
    setGuiDraft('');
    setMenuOpen(false);
  };

  return (
    <div className="ucf-ref-cell" ref={wrapRef}>
      <div className="ucf-ref-chips">
        {refs.map((ref) => {
          const label = formatFlowRef(ref, content);
          const isCa = ref.kind === 'ca';
          const isMissing = ref.kind === 'ca-missing'
            || (ref.kind === 'ca' && !content.alternativeFlows.some((a) => a.id === ref.flowId));
          const isGui = ref.kind === 'gui';

          return (
            <span
              className={`ucf-ref-chip${isGui ? ' is-gui' : ''}${isMissing ? ' is-missing' : isCa ? ' is-ca' : ''}`}
              key={ref.id}
            >
              {isCa && !isMissing ? (
                <button
                  className="ucf-ref-jump"
                  title={`Ir a ${label}`}
                  type="button"
                  onClick={() => onJumpToAlternative(ref.flowId)}
                >
                  {label}
                </button>
              ) : (
                <span className="ucf-ref-label">{label}</span>
              )}
              <button
                aria-label={`Quitar referencia ${label}`}
                className="ucf-ref-remove"
                tabIndex={-1}
                type="button"
                onClick={() => removeRef(ref.id)}
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          );
        })}

        {suggestCreateCa && !hasCaRef ? (
          <button
            className="ucf-quick-ca-btn"
            tabIndex={-1}
            title={`Crear ${formatAlternativeRef(nextCaNumber)} desde esta línea`}
            type="button"
            onClick={onCreateAlternativeAndLink}
          >
            <Split size={11} aria-hidden="true" />
            <span>+ CA</span>
          </button>
        ) : null}

        <button
          aria-expanded={menuOpen}
          aria-label="Agregar referencia (CA o GUI)"
          className={`ucf-ref-add-btn${refs.length > 0 || suggestCreateCa ? ' is-subtle' : ''}`}
          tabIndex={-1}
          title="Agregar referencia CA N°X o GUI-N"
          type="button"
          onClick={() => {
            setGuiDraft(getNextGuiLabel(content));
            setMenuOpen((open) => !open);
          }}
        >
          <Plus size={11} aria-hidden="true" />
        </button>
      </div>

      {menuOpen ? (
        <div className="ucf-ref-popover" role="dialog" aria-label="Elegir referencia">
          <button
            className="ucf-ref-menu-primary"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onCreateAlternativeAndLink();
            }}
          >
            <Split size={13} aria-hidden="true" />
            <span>Crear {formatAlternativeRef(nextCaNumber)}</span>
          </button>

          {availableAlternatives.length > 0 ? (
            <div className="ucf-ref-menu-group">
              <span className="ucf-ref-menu-heading">Caminos existentes</span>
              {availableAlternatives.map((alt) => (
                <button
                  className="ucf-ref-menu-item"
                  key={alt.id}
                  type="button"
                  onClick={() => addAlternativeRef(alt.id)}
                >
                  <strong>{formatAlternativeRef(alt.number)}</strong>
                  <span>{alt.title.trim() || 'Sin causa'}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="ucf-ref-menu-group">
            <span className="ucf-ref-menu-heading">Pantalla (GUI)</span>
            <form
              className="ucf-ref-gui-form"
              onSubmit={(event) => {
                event.preventDefault();
                addGuiRef(guiDraft);
              }}
            >
              <Monitor size={13} aria-hidden="true" />
              <input
                aria-label="Código de pantalla"
                placeholder="GUI-1"
                value={guiDraft}
                onChange={(event) => setGuiDraft(event.target.value)}
              />
              <button type="submit">Agregar</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
