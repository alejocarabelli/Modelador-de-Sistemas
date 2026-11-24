import { Fragment, useState, type KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  GitBranch,
  Link2,
  Plus,
  Repeat,
  Trash2,
  User,
  Cpu,
} from 'lucide-react';
import type {
  FlowConditionalNode,
  FlowDetailItem,
  FlowMainStep,
  FlowRef,
  FlowSubNode,
  StepAnchorRef,
  SystemPrimitive,
  UseCaseFlowContent,
} from '../../types/diagram';
import type { FlowVocabulary } from '../../utils/flowDocument';
import type { ProjectSymbolIndex } from '../../utils/projectSymbolIndex';
import { buildFlowLineSuggestions } from '../../utils/useCaseFlowCompletion';
import {
  createFlowActionNode,
  createFlowConditionalNode,
  createFlowDetailItem,
  createFlowLoopNode,
  createFlowMainStep,
  detectActorPrimitive,
  detectSystemPrimitive,
  formatAlternativeRef,
  formatJumpTargetText,
  formatStepAnchorSuffix,
  inferActionSemantic,
  insertSubNodeAfterId,
  mapSubNodes,
  moveSubNodeById,
  removeSubNodeById,
  SYSTEM_PRIMITIVE_DEFS,
  type FlowNumberingIndex,
} from '../../utils/useCaseFlowModel';
import { shortcutLabel } from '../../utils/shortcutLabel';
import { FlowRefCell } from './FlowRefCell';
import { FlowRichLineInput } from './FlowRichLineInput';

type FlowStepsTableProps = {
  content: UseCaseFlowContent;
  flowId: 'basic' | string;
  steps: FlowMainStep[];
  numbering: FlowNumberingIndex;
  symbolIndex: ProjectSymbolIndex;
  vocabulary: FlowVocabulary;
  useCaseNames: string[];
  highlightedStepId?: string | null;
  collapsedStepIds: Set<string>;
  registerFieldRef: (key: string, el: HTMLTextAreaElement | null) => void;
  onFocusEditable: (el: HTMLTextAreaElement, applyInsert: (token: string) => void) => void;
  onChangeSteps: (steps: FlowMainStep[]) => void;
  onCreateAlternativeFromStep: (flowId: 'basic' | string, stepId: string, isMainStep: boolean) => void;
  onJumpToAlternative: (flowId: string) => void;
  onJumpToStep: (anchor: StepAnchorRef) => void;
  onToggleCollapseStep: (stepId: string) => void;
  onRequestFocusKey: (key: string) => void;
};

const QUICK_PRIMITIVES: Array<{ id: string; label: string }> = [
  { id: 'buscar', label: 'Buscar' },
  { id: 'leer', label: 'Leer' },
  { id: 'mostrar-mensaje', label: 'Mostrar' },
  { id: 'comprobar', label: 'Comprobar' },
  { id: 'controlar-consistencia', label: 'Consistencia' },
  { id: 'crear', label: 'Crear' },
  { id: 'modificar', label: 'Modificar' },
  { id: 'loop-por-cada', label: 'Por cada' },
  { id: 'loop-mientras', label: 'Mientras' },
  { id: 'conditional', label: 'SI / SINO' },
  { id: 'definir-pseudoentidad', label: 'Pseudoentidad' },
  { id: 'invocar-servicio', label: 'Servicio' },
  { id: 'guardar-cambios', label: 'Guardar' },
  { id: 'ir-a-paso', label: 'Ir a paso' },
  { id: 'fin-cu', label: 'Fin CU' },
];

const BULLET_GLYPHS = ['•', '◦', '▪'] as const;

const buildSubNodeFromPalette = (id: string): FlowSubNode => {
  if (id === 'loop-por-cada') return createFlowLoopNode('por-cada', 'Por cada instancia de :');
  if (id === 'loop-mientras') return createFlowLoopNode('mientras', 'Mientras :');
  if (id === 'conditional') return createFlowConditionalNode('');
  const def = SYSTEM_PRIMITIVE_DEFS.find((d) => d.id === id);
  const primitive = (def?.primitive ?? 'custom') as SystemPrimitive;
  const node = createFlowActionNode(primitive, def?.template ?? '');
  if (primitive === 'buscar' || primitive === 'crear' || primitive === 'modificar') {
    node.details = [createFlowDetailItem('Con ')];
  }
  return node;
};

const extractOwnerClassFromText = (text: string): string | undefined => {
  const m = /(?:Buscar|Crear|Modificar|Seleccionar|Por\s+cada|Leer(?:\s+de)?|Relacionad[ao]s?\s+a)\s+(?:la\s+|las\s+)?(?:instancias?|instancia\/s)?\s*(?:de\s+)?([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/i.exec(text);
  return m?.[1];
};

function StepAnchorPicker({
  anchor,
  content,
  currentFlowId,
  numbering,
  labelPrefix = '(paso …)',
  mode = 'inline',
  onChange,
  onJump,
}: {
  anchor?: StepAnchorRef;
  content: UseCaseFlowContent;
  currentFlowId: 'basic' | string;
  numbering: FlowNumberingIndex;
  labelPrefix?: string;
  mode?: 'inline' | 'jump';
  onChange: (next: StepAnchorRef | undefined) => void;
  onJump: (anchor: StepAnchorRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const altById = new Map(content.alternativeFlows.map((a) => [a.id, a]));
  const options = mode === 'jump'
    ? numbering.entries.filter((entry) => entry.isMain)
    : numbering.entries;

  const badgeText = mode === 'jump'
    ? formatJumpTargetText(anchor, content, numbering, 'Elegir paso destino...')
    : formatStepAnchorSuffix(anchor, content, numbering, currentFlowId);

  return (
    <span className="ucf-step-anchor-wrap">
      {anchor ? (
        <span className="ucf-step-anchor-chip">
          <button
            className="ucf-step-anchor-jump"
            title="Saltar al paso referenciado"
            type="button"
            onClick={() => onJump(anchor)}
          >
            {badgeText}
          </button>
          <button
            aria-label="Cambiar paso referenciado"
            className="ucf-step-anchor-edit"
            tabIndex={-1}
            title="Cambiar paso"
            type="button"
            onClick={() => setOpen((o) => !o)}
          >
            ▾
          </button>
          <button
            aria-label="Quitar referencia de paso"
            className="ucf-step-anchor-remove"
            tabIndex={-1}
            type="button"
            onClick={() => onChange(undefined)}
          >
            ×
          </button>
        </span>
      ) : (
        <button
          className="ucf-step-anchor-add"
          tabIndex={-1}
          title={mode === 'jump' ? 'Elegir paso destino de Ir a paso' : 'Vincular referencia (paso X.Y)'}
          type="button"
          onClick={() => setOpen((o) => !o)}
        >
          <Link2 size={10} aria-hidden="true" />
          <span>{labelPrefix}</span>
        </button>
      )}
      {open ? (
        <div className="ucf-step-anchor-menu" role="listbox">
          {options.length === 0 ? (
            <div className="ucf-step-anchor-empty">Todavía no hay pasos numerados.</div>
          ) : (
            options.map((entry) => {
              const flowShort = entry.flowId === 'basic'
                ? 'Principal'
                : formatAlternativeRef(altById.get(entry.flowId)?.number ?? 1);
              return (
                <button
                  className={anchor?.stepId === entry.stepId ? 'active' : undefined}
                  key={`${entry.flowId}:${entry.stepId}`}
                  type="button"
                  onClick={() => {
                    onChange({ flowId: entry.flowId, stepId: entry.stepId });
                    setOpen(false);
                  }}
                >
                  <strong>{entry.number}.</strong>
                  <span>{entry.label || '(sin texto)'}</span>
                  <small>{flowShort}</small>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </span>
  );
}

export function FlowStepsTable({
  content,
  flowId,
  steps,
  numbering,
  symbolIndex,
  vocabulary,
  useCaseNames,
  highlightedStepId,
  collapsedStepIds,
  registerFieldRef,
  onFocusEditable,
  onChangeSteps,
  onCreateAlternativeFromStep,
  onJumpToAlternative,
  onJumpToStep,
  onToggleCollapseStep,
  onRequestFocusKey,
}: FlowStepsTableProps) {
  const [activeMainStepId, setActiveMainStepId] = useState<string | null>(null);

  const updateMainStep = (stepId: string, updater: (step: FlowMainStep) => FlowMainStep): void => {
    onChangeSteps(steps.map((s) => (s.id === stepId ? updater(s) : s)));
  };

  const removeMainStep = (stepId: string): void => {
    onChangeSteps(steps.filter((s) => s.id !== stepId));
  };

  const moveMainStep = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChangeSteps(next);
  };

  const insertMainStepAfter = (index: number | undefined, speaker: 'actor' | 'system', title = '', primitive?: FlowMainStep['primitive']): void => {
    const nextStep = createFlowMainStep(speaker, title, primitive ? { primitive } : {});
    const next = [...steps];
    next.splice(index === undefined ? next.length : index + 1, 0, nextStep);
    onChangeSteps(next);
    setActiveMainStepId(nextStep.id);
    onRequestFocusKey(`main:${nextStep.id}`);
  };

  const addQuickSubNode = (mainStepId: string, paletteId: string): void => {
    const subNode = buildSubNodeFromPalette(paletteId);
    updateMainStep(mainStepId, (step) => ({
      ...step,
      children: [...step.children, subNode],
    }));
    setActiveMainStepId(mainStepId);
    onRequestFocusKey(`sub:${subNode.id}`);
  };

  const makeInsertHandler = (currentValue: string, onChangeValue: (next: string) => void) =>
    (el: HTMLTextAreaElement): void => {
      onFocusEditable(el, (token: string) => {
        const start = el.selectionStart ?? currentValue.length;
        const end = el.selectionEnd ?? start;
        const next = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
        onChangeValue(next);
        window.requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start + token.length, start + token.length);
        });
      });
    };

  const renderDetailsEditor = (
    details: FlowDetailItem[],
    ownerClass: string | undefined,
    depth: number,
    onChangeDetails: (next: FlowDetailItem[]) => void,
    bulletDepth = 0,
  ) => {
    if (details.length === 0) return null;
    const glyph = BULLET_GLYPHS[Math.min(bulletDepth, BULLET_GLYPHS.length - 1)];

    const updateDetailAt = (idx: number, patch: Partial<FlowDetailItem>): void => {
      onChangeDetails(details.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
    };
    const insertDetailAfter = (idx: number): void => {
      const created = createFlowDetailItem('Con ');
      const next = [...details];
      next.splice(idx + 1, 0, created);
      onChangeDetails(next);
      onRequestFocusKey(`detail:${created.id}`);
    };
    const removeDetailAt = (idx: number): void => {
      onChangeDetails(details.filter((_, i) => i !== idx));
    };

    return (
      <div className="ucf-detail-list" style={{ paddingLeft: `${depth * 14 + 14}px` }}>
        {details.map((detail, idx) => (
          <div className="ucf-detail-item" key={detail.id}>
            <div className="ucf-detail-line">
              <span aria-hidden="true" className="ucf-detail-bullet">{glyph}</span>
              <FlowRichLineInput
                ariaLabel={`Detalle ${idx + 1}`}
                className="ucf-detail-input"
                detectKeyword={false}
                getSuggestions={(val, pos) =>
                  buildFlowLineSuggestions('system', val, pos, {
                    content,
                    flowId,
                    symbolIndex,
                    ownerClassName: ownerClass,
                    useCaseNames,
                  })
                }
                inputRef={(el) => registerFieldRef(`detail:${detail.id}`, el)}
                placeholder="Con atributo igual a valor / Relacionada a instancia de ..."
                value={detail.text}
                vocabulary={vocabulary}
                onChange={(val) => updateDetailAt(idx, { text: val })}
                onFocusField={makeInsertHandler(detail.text, (val) => updateDetailAt(idx, { text: val }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    insertDetailAfter(idx);
                  } else if (event.key === 'Backspace' && detail.text === '') {
                    event.preventDefault();
                    removeDetailAt(idx);
                  }
                }}
              />
              <StepAnchorPicker
                anchor={detail.stepRef}
                content={content}
                currentFlowId={flowId}
                labelPrefix="(paso)"
                numbering={numbering}
                onChange={(stepRef) => updateDetailAt(idx, { stepRef })}
                onJump={onJumpToStep}
              />
              <button
                aria-label="Quitar viñeta"
                className="ucf-tiny-btn is-danger"
                tabIndex={-1}
                type="button"
                onClick={() => removeDetailAt(idx)}
              >
                <Trash2 size={11} aria-hidden="true" />
              </button>
            </div>
            {detail.children && detail.children.length > 0
              ? renderDetailsEditor(
                  detail.children,
                  extractOwnerClassFromText(detail.text) ?? ownerClass,
                  1,
                  (children) => updateDetailAt(idx, { children }),
                  bulletDepth + 1,
                )
              : null}
          </div>
        ))}
      </div>
    );
  };

  /**
   * Renders a list of sub-nodes as aligned 3-column rows (`Actor | Sistema | Ref.`)
   * inside the current main step. Every sub-step aligns its Ref. cell to the exact pixel,
   * and `loop` nodes draw a crisp visual frame around header + body.
   */
  const renderSubNodes = (
    mainStep: FlowMainStep,
    mainIndex: number,
    nodes: FlowSubNode[],
    depth: number,
    loopDepth: number,
  ) =>
    nodes.map((node) => {
      const stepNum = numbering.stepNumberById.get(node.id) ?? '';
      const isHighlighted = highlightedStepId === node.id;

      const patchNode = (updater: (current: FlowSubNode) => FlowSubNode): void => {
        updateMainStep(mainStep.id, (step) => ({
          ...step,
          children: mapSubNodes(step.children, (candidate) =>
            candidate.id === node.id ? updater(candidate) : candidate,
          ),
        }));
      };

      const replaceNode = (replacement: FlowSubNode): void => {
        updateMainStep(mainStep.id, (step) => ({
          ...step,
          children: mapSubNodes(step.children, (candidate) =>
            candidate.id === node.id ? replacement : candidate,
          ),
        }));
        onRequestFocusKey(`sub:${replacement.id}`);
      };

      const deleteNode = (): void => {
        updateMainStep(mainStep.id, (step) => ({
          ...step,
          children: removeSubNodeById(step.children, node.id),
        }));
      };

      const moveNode = (dir: -1 | 1): void => {
        updateMainStep(mainStep.id, (step) => ({
          ...step,
          children: moveSubNodeById(step.children, node.id, dir),
        }));
      };

      const insertSiblingAfter = (): void => {
        const created = createFlowActionNode('custom', '');
        updateMainStep(mainStep.id, (step) => ({
          ...step,
          children: insertSubNodeAfterId(step.children, node.id, created),
        }));
        onRequestFocusKey(`sub:${created.id}`);
      };

      const handleSubKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, currentText: string): void => {
        const cmd = event.metaKey || event.ctrlKey;
        if (cmd && event.key === 'Enter') {
          event.preventDefault();
          insertMainStepAfter(mainIndex, 'actor');
          return;
        }
        if (cmd && event.shiftKey && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          onCreateAlternativeFromStep(flowId, node.id, false);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (node.kind === 'action' && currentText.trimEnd().endsWith(':')) {
            const detail = createFlowDetailItem('Con ');
            patchNode((cur) => cur.kind === 'action' ? { ...cur, details: [...cur.details, detail] } : cur);
            onRequestFocusKey(`detail:${detail.id}`);
          } else {
            insertSiblingAfter();
          }
          return;
        }
        if (event.key === 'Backspace' && currentText === '' && node.kind === 'action' && node.details.length === 0) {
          event.preventDefault();
          deleteNode();
        }
      };

      // ---- ACTION SUB-NODE ----
      if (node.kind === 'action') {
        const isActorInside = node.speaker === 'actor';
        const ownerClass = node.semantic?.targetClass
          ?? node.semantic?.sourceClass
          ?? extractOwnerClassFromText(node.text);
        const suggestsCa = node.primitive === 'comprobar'
          || node.primitive === 'controlar-consistencia'
          || node.primitive === 'buscar'
          || node.primitive === 'seleccionar';

        const actionBody = (
          <div className={`ucf-sub-content${loopDepth > 0 ? ' is-in-loop' : ''}`} style={{ paddingLeft: `${depth * 16}px` }}>
            <div className="ucf-sub-line">
              <span className={`ucf-step-num${isActorInside ? ' is-bold' : ''}`}>{stepNum}.</span>
              {node.primitive === 'ir-a-paso' ? (
                <div className="ucf-jump-inline">
                  <StepAnchorPicker
                    anchor={node.jumpTarget}
                    content={content}
                    currentFlowId={flowId}
                    labelPrefix="Elegir paso destino..."
                    mode="jump"
                    numbering={numbering}
                    onChange={(jumpTarget) => {
                      const nextText = formatJumpTargetText(jumpTarget, content, numbering, node.text);
                      patchNode((cur) => cur.kind === 'action' ? { ...cur, jumpTarget, text: nextText } : cur);
                    }}
                    onJump={onJumpToStep}
                  />
                </div>
              ) : (
                <FlowRichLineInput
                  ariaLabel={`Subpaso ${stepNum}`}
                  bold={isActorInside}
                  className="ucf-sub-input"
                  getSuggestions={(val, pos) =>
                    buildFlowLineSuggestions(isActorInside ? 'actor' : 'system', val, pos, {
                      content,
                      flowId,
                      symbolIndex,
                      ownerClassName: ownerClass,
                      useCaseNames,
                    })
                  }
                  inputRef={(el) => registerFieldRef(`sub:${node.id}`, el)}
                  placeholder="Escribí acción o «/» para primitivas..."
                  value={node.text}
                  vocabulary={vocabulary}
                  onChange={(val) => {
                    const primitive = isActorInside ? detectActorPrimitive(val) : detectSystemPrimitive(val);
                    const semantic = isActorInside ? undefined : inferActionSemantic(primitive, val);
                    patchNode((cur) => cur.kind === 'action' ? { ...cur, text: val, primitive, semantic } : cur);
                  }}
                  onFocusField={(el) => {
                    setActiveMainStepId(mainStep.id);
                    makeInsertHandler(node.text, (val) => {
                      const primitive = isActorInside ? detectActorPrimitive(val) : detectSystemPrimitive(val);
                      const semantic = isActorInside ? undefined : inferActionSemantic(primitive, val);
                      patchNode((cur) => cur.kind === 'action' ? { ...cur, text: val, primitive, semantic } : cur);
                    })(el);
                  }}
                  onKeyDown={(event) => handleSubKeyDown(event, node.text)}
                  onSlashBlockCommand={(cmd) => replaceNode(buildSubNodeFromPalette(cmd))}
                />
              )}

              {node.primitive !== 'ir-a-paso' && node.primitive !== 'fin-cu' && node.primitive !== 'guardar-cambios' ? (
                <StepAnchorPicker
                  anchor={node.stepRef}
                  content={content}
                  currentFlowId={flowId}
                  labelPrefix="(paso)"
                  numbering={numbering}
                  onChange={(stepRef) => patchNode((cur) => cur.kind === 'action' ? { ...cur, stepRef } : cur)}
                  onJump={onJumpToStep}
                />
              ) : null}

              <div className="ucf-sub-hover-actions">
                <button
                  tabIndex={-1}
                  title="Agregar viñeta de atributo o relación"
                  type="button"
                  onClick={() => {
                    const detail = createFlowDetailItem('Con ');
                    patchNode((cur) => cur.kind === 'action' ? { ...cur, details: [...cur.details, detail] } : cur);
                    onRequestFocusKey(`detail:${detail.id}`);
                  }}
                >
                  + •
                </button>
                <button aria-label="Mover subpaso arriba" tabIndex={-1} type="button" onClick={() => moveNode(-1)}>↑</button>
                <button aria-label="Mover subpaso abajo" tabIndex={-1} type="button" onClick={() => moveNode(1)}>↓</button>
                <button aria-label="Eliminar subpaso" className="is-danger" tabIndex={-1} type="button" onClick={deleteNode}>
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            </div>

            {renderDetailsEditor(node.details, ownerClass, 1, (details) =>
              patchNode((cur) => cur.kind === 'action' ? { ...cur, details } : cur),
            )}
          </div>
        );

        return (
          <div className={`ucf-grid-row is-sub${isHighlighted ? ' is-highlighted' : ''}`} key={node.id}>
            <div className="ucf-col-actor">{isActorInside ? actionBody : null}</div>
            <div className="ucf-col-system">{!isActorInside ? actionBody : null}</div>
            <div className="ucf-col-ref">
              <FlowRefCell
                content={content}
                currentFlowId={flowId}
                refs={node.refs}
                suggestCreateCa={suggestsCa}
                onChangeRefs={(refs: FlowRef[]) =>
                  patchNode((cur) => ({ ...cur, refs }))
                }
                onCreateAlternativeAndLink={() => onCreateAlternativeFromStep(flowId, node.id, false)}
                onJumpToAlternative={onJumpToAlternative}
              />
            </div>
            <div className="ucf-col-actions" />
          </div>
        );
      }

      // ---- LOOP SUB-NODE (visual box frame around header + body!) ----
      if (node.kind === 'loop') {
        const ownerClass = node.targetClass ?? extractOwnerClassFromText(node.header);
        const addLoopChild = (speaker: 'actor' | 'system' = 'system'): void => {
          const child = createFlowActionNode(
            speaker === 'actor' ? 'ingresar' : 'custom',
            speaker === 'actor' ? 'Ingresar ' : '',
            speaker === 'actor' ? { speaker: 'actor' } : {},
          );
          patchNode((cur) => cur.kind === 'loop' ? { ...cur, children: [...cur.children, child] } : cur);
          onRequestFocusKey(`sub:${child.id}`);
        };
        const addLoopDetail = (): void => {
          const detail = createFlowDetailItem('Leer ');
          patchNode((cur) => cur.kind === 'loop' ? { ...cur, details: [...cur.details, detail] } : cur);
          onRequestFocusKey(`detail:${detail.id}`);
        };

        return (
          <div className="ucf-loop-block" data-loop-depth={loopDepth + 1} key={node.id}>
            <div className={`ucf-grid-row is-sub is-loop-header${isHighlighted ? ' is-highlighted' : ''}`}>
              <div className="ucf-col-actor" />
              <div className="ucf-col-system">
                <div className="ucf-loop-frame-head" style={{ marginLeft: `${depth * 16}px` }}>
                  <div className="ucf-sub-line">
                    <Repeat size={12} aria-hidden="true" className="ucf-loop-icon" />
                    <span className="ucf-step-num">{stepNum}.</span>
                    <FlowRichLineInput
                      ariaLabel={`Cabecera de bucle ${stepNum}`}
                      className="ucf-sub-input"
                      getSuggestions={(val, pos) =>
                        buildFlowLineSuggestions('system', val, pos, {
                          content,
                          flowId,
                          symbolIndex,
                          ownerClassName: ownerClass,
                          useCaseNames,
                        })
                      }
                      inputRef={(el) => registerFieldRef(`sub:${node.id}`, el)}
                      placeholder={node.loopKind === 'por-cada' ? 'Por cada instancia de Clase encontrada:' : 'Mientras [condición]:'}
                      value={node.header}
                      vocabulary={vocabulary}
                      onChange={(val) => {
                        const targetClass = extractOwnerClassFromText(val);
                        patchNode((cur) =>
                          cur.kind === 'loop' ? { ...cur, header: val, targetClass } : cur,
                        );
                      }}
                      onFocusField={(el) => {
                        setActiveMainStepId(mainStep.id);
                        makeInsertHandler(node.header, (val) => {
                          const targetClass = extractOwnerClassFromText(val);
                          patchNode((cur) => cur.kind === 'loop' ? { ...cur, header: val, targetClass } : cur);
                        })(el);
                      }}
                      onKeyDown={(event) => handleSubKeyDown(event, node.header)}
                    />
                    <StepAnchorPicker
                      anchor={node.stepRef}
                      content={content}
                      currentFlowId={flowId}
                      labelPrefix="(paso)"
                      numbering={numbering}
                      onChange={(stepRef) => patchNode((cur) => cur.kind === 'loop' ? { ...cur, stepRef } : cur)}
                      onJump={onJumpToStep}
                    />
                    <div className="ucf-sub-hover-actions">
                      <button aria-label="Mover bucle arriba" tabIndex={-1} type="button" onClick={() => moveNode(-1)}>↑</button>
                      <button aria-label="Mover bucle abajo" tabIndex={-1} type="button" onClick={() => moveNode(1)}>↓</button>
                      <button aria-label="Eliminar bucle" className="is-danger" tabIndex={-1} type="button" onClick={deleteNode}>
                        <Trash2 size={11} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {renderDetailsEditor(node.details, ownerClass, 1, (details) =>
                    patchNode((cur) => cur.kind === 'loop' ? { ...cur, details } : cur),
                  )}
                </div>
              </div>
              <div className="ucf-col-ref">
                <FlowRefCell
                  content={content}
                  currentFlowId={flowId}
                  refs={node.refs}
                  onChangeRefs={(refs) => patchNode((cur) => ({ ...cur, refs }))}
                  onCreateAlternativeAndLink={() => onCreateAlternativeFromStep(flowId, node.id, false)}
                  onJumpToAlternative={onJumpToAlternative}
                />
              </div>
              <div className="ucf-col-actions" />
            </div>

            {renderSubNodes(mainStep, mainIndex, node.children, depth + 1, loopDepth + 1)}

            <div className="ucf-grid-row is-sub is-loop-footer">
              <div className="ucf-col-actor" />
              <div className="ucf-col-system">
                <div className="ucf-loop-frame-foot" style={{ marginLeft: `${depth * 16}px` }}>
                  <button tabIndex={-1} type="button" onClick={() => addLoopChild('system')}>
                    <Plus size={11} aria-hidden="true" /> Paso dentro del bucle
                  </button>
                  <button tabIndex={-1} type="button" onClick={addLoopDetail}>
                    + Viñeta corta
                  </button>
                  <button tabIndex={-1} type="button" onClick={() => addLoopChild('actor')}>
                    + Turno Actor
                  </button>
                </div>
              </div>
              <div className="ucf-col-ref" />
              <div className="ucf-col-actions" />
            </div>
          </div>
        );
      }

      // ---- CONDITIONAL SUB-NODE (SI [cond] / SINO / FINSI with SINO & FINSI unnumbered!) ----
      const condNode: FlowConditionalNode = node;
      const addCondChild = (branch: 'then' | 'else'): void => {
        const child = createFlowActionNode('custom', '');
        patchNode((cur) => {
          if (cur.kind !== 'conditional') return cur;
          if (branch === 'then') return { ...cur, thenChildren: [...cur.thenChildren, child] };
          return { ...cur, elseChildren: [...(cur.elseChildren ?? []), child] };
        });
        onRequestFocusKey(`sub:${child.id}`);
      };

      return (
        <div className="ucf-cond-block" key={condNode.id}>
          <div className={`ucf-grid-row is-sub${isHighlighted ? ' is-highlighted' : ''}`}>
            <div className="ucf-col-actor" />
            <div className="ucf-col-system">
              <div className="ucf-sub-content" style={{ paddingLeft: `${depth * 16}px` }}>
                <div className="ucf-sub-line">
                  <span className="ucf-step-num">{stepNum}.</span>
                  <span className="ucf-cond-kw">SI</span>
                  <FlowRichLineInput
                    ariaLabel={`Condición SI ${stepNum}`}
                    className="ucf-sub-input"
                    detectKeyword={false}
                    getSuggestions={(val, pos) =>
                      buildFlowLineSuggestions('system', val, pos, { content, flowId, symbolIndex, useCaseNames })
                    }
                    inputRef={(el) => registerFieldRef(`sub:${condNode.id}`, el)}
                    placeholder="[condición]"
                    value={condNode.condition}
                    vocabulary={vocabulary}
                    onChange={(val) =>
                      patchNode((cur) => cur.kind === 'conditional' ? { ...cur, condition: val } : cur)
                    }
                    onFocusField={(el) => {
                      setActiveMainStepId(mainStep.id);
                      makeInsertHandler(condNode.condition, (val) =>
                        patchNode((cur) => cur.kind === 'conditional' ? { ...cur, condition: val } : cur),
                      )(el);
                    }}
                    onKeyDown={(event) => handleSubKeyDown(event, condNode.condition)}
                  />
                  <div className="ucf-sub-hover-actions">
                    <button aria-label="Mover SI arriba" tabIndex={-1} type="button" onClick={() => moveNode(-1)}>↑</button>
                    <button aria-label="Mover SI abajo" tabIndex={-1} type="button" onClick={() => moveNode(1)}>↓</button>
                    <button aria-label="Eliminar SI" className="is-danger" tabIndex={-1} type="button" onClick={deleteNode}>
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="ucf-col-ref">
              <FlowRefCell
                content={content}
                currentFlowId={flowId}
                refs={condNode.refs}
                onChangeRefs={(refs) => patchNode((cur) => ({ ...cur, refs }))}
                onCreateAlternativeAndLink={() => onCreateAlternativeFromStep(flowId, condNode.id, false)}
                onJumpToAlternative={onJumpToAlternative}
              />
            </div>
            <div className="ucf-col-actions" />
          </div>

          {renderSubNodes(mainStep, mainIndex, condNode.thenChildren, depth + 1, loopDepth)}

          <div className="ucf-grid-row is-sub is-cond-bar">
            <div className="ucf-col-actor" />
            <div className="ucf-col-system">
              <div className="ucf-cond-controls" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
                <button tabIndex={-1} type="button" onClick={() => addCondChild('then')}>
                  <Plus size={11} aria-hidden="true" /> Paso en SI
                </button>
                {condNode.elseChildren === undefined ? (
                  <button
                    tabIndex={-1}
                    type="button"
                    onClick={() => {
                      const child = createFlowActionNode('custom', '');
                      patchNode((cur) => cur.kind === 'conditional' ? { ...cur, elseChildren: [child] } : cur);
                      onRequestFocusKey(`sub:${child.id}`);
                    }}
                  >
                    <GitBranch size={11} aria-hidden="true" /> Agregar SINO
                  </button>
                ) : null}
              </div>
            </div>
            <div className="ucf-col-ref" />
            <div className="ucf-col-actions" />
          </div>

          {condNode.elseChildren !== undefined ? (
            <>
              <div className="ucf-grid-row is-sub is-cond-divider">
                <div className="ucf-col-actor" />
                <div className="ucf-col-system">
                  <div className="ucf-sub-line" style={{ paddingLeft: `${depth * 16}px` }}>
                    <span className="ucf-cond-kw">SINO</span>
                    <button
                      className="ucf-tiny-btn"
                      tabIndex={-1}
                      title="Quitar rama SINO"
                      type="button"
                      onClick={() =>
                        patchNode((cur) => {
                          if (cur.kind !== 'conditional') return cur;
                          const rest = { ...cur };
                          delete rest.elseChildren;
                          return rest;
                        })
                      }
                    >
                      Quitar SINO
                    </button>
                  </div>
                </div>
                <div className="ucf-col-ref" />
                <div className="ucf-col-actions" />
              </div>

              {renderSubNodes(mainStep, mainIndex, condNode.elseChildren, depth + 1, loopDepth)}

              <div className="ucf-grid-row is-sub is-cond-bar">
                <div className="ucf-col-actor" />
                <div className="ucf-col-system">
                  <div className="ucf-cond-controls" style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
                    <button tabIndex={-1} type="button" onClick={() => addCondChild('else')}>
                      <Plus size={11} aria-hidden="true" /> Paso en SINO
                    </button>
                  </div>
                </div>
                <div className="ucf-col-ref" />
                <div className="ucf-col-actions" />
              </div>
            </>
          ) : null}

          <div className="ucf-grid-row is-sub is-cond-end">
            <div className="ucf-col-actor" />
            <div className="ucf-col-system">
              <div style={{ paddingLeft: `${depth * 16}px` }}>
                <span className="ucf-cond-kw">FINSI</span>
              </div>
            </div>
            <div className="ucf-col-ref" />
            <div className="ucf-col-actions" />
          </div>
        </div>
      );
    });

  return (
    <div className="ucf-flow-grid-wrap">
      <div className="ucf-flow-grid-header" role="row">
        <div className="ucf-col-actor">Actor</div>
        <div className="ucf-col-system">Sistema</div>
        <div className="ucf-col-ref" title="Referencias a Caminos Alternativos (CA N°X) y pantallas (GUI-N)">Ref.</div>
        <div className="ucf-col-actions" aria-hidden="true" />
      </div>

      {steps.length === 0 ? (
        <div className="ucf-flow-empty-rows">
          {flowId === 'basic' ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                const startStep = createFlowMainStep('actor', 'Iniciar CU', { primitive: 'iniciar-cu' });
                const sysStep = createFlowMainStep('system', '', {
                  children: [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “”')],
                });
                onChangeSteps([startStep, sysStep]);
                onRequestFocusKey(`main:${sysStep.id}`);
              }}
            >
              <Plus size={14} aria-hidden="true" /> Comenzar con «1. Iniciar CU»
            </button>
          ) : (
            <button
              className="secondary-action"
              type="button"
              onClick={() => insertMainStepAfter(undefined, 'system')}
            >
              <Plus size={14} aria-hidden="true" /> Agregar primer paso del sistema
            </button>
          )}
        </div>
      ) : (
        <div className="ucf-flow-grid-body">
          {steps.map((step, index) => {
            const num = numbering.stepNumberById.get(step.id) ?? String(index + 1);
            const isCollapsed = collapsedStepIds.has(step.id);
            const isActive = activeMainStepId === step.id;
            const isHighlighted = highlightedStepId === step.id;
            const isActor = step.speaker === 'actor';
            const subCount = step.children.length;
            const isAtomicSystem = !isActor && (step.primitive === 'guardar-cambios' || step.primitive === 'fin-cu' || step.primitive === 'ir-a-paso');

            const handleMainKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
              const cmd = event.metaKey || event.ctrlKey;
              if (cmd && event.key === 'Enter') {
                event.preventDefault();
                insertMainStepAfter(index, isActor ? 'system' : 'actor');
                return;
              }
              if (cmd && event.shiftKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                onCreateAlternativeFromStep(flowId, step.id, true);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!isActor && !isAtomicSystem) {
                  const firstChild = createFlowActionNode('custom', '');
                  updateMainStep(step.id, (s) => ({ ...s, children: [firstChild, ...s.children] }));
                  onRequestFocusKey(`sub:${firstChild.id}`);
                } else {
                  insertMainStepAfter(index, isActor ? 'system' : 'actor');
                }
              }
            };

            const mainCellContent = isCollapsed ? (
              <button
                className="ucf-fold-summary"
                type="button"
                onClick={() => onToggleCollapseStep(step.id)}
              >
                <ChevronRight size={13} aria-hidden="true" />
                <strong>{num}. {step.title || '(sin título)'}</strong>
                {subCount > 0 ? <span className="ucf-fold-pill">{subCount} {subCount === 1 ? 'subpaso' : 'subpasos'}</span> : null}
              </button>
            ) : (
              <div className="ucf-main-line">
                <span className="ucf-step-num is-bold">{num}.</span>
                {!isActor && step.primitive === 'ir-a-paso' ? (
                  <div className="ucf-jump-inline is-bold">
                    <StepAnchorPicker
                      anchor={step.jumpTarget}
                      content={content}
                      currentFlowId={flowId}
                      labelPrefix="Elegir paso destino..."
                      mode="jump"
                      numbering={numbering}
                      onChange={(jumpTarget) => {
                        const nextTitle = formatJumpTargetText(jumpTarget, content, numbering, step.title);
                        updateMainStep(step.id, (s) => ({ ...s, jumpTarget, title: nextTitle }));
                      }}
                      onJump={onJumpToStep}
                    />
                  </div>
                ) : (
                  <FlowRichLineInput
                    ariaLabel={`${isActor ? 'Actor' : 'Sistema'}, paso ${num}`}
                    bold
                    className="ucf-main-input"
                    getSuggestions={(val, pos) =>
                      buildFlowLineSuggestions(step.speaker, val, pos, {
                        content,
                        flowId,
                        symbolIndex,
                        useCaseNames,
                      })
                    }
                    inputRef={(el) => registerFieldRef(`main:${step.id}`, el)}
                    placeholder={isActor ? 'ej. Iniciar CU / Ingresar dato (pDato)' : 'Resumen del paso (ej. Verificar existencia de socio)'}
                    value={step.title}
                    vocabulary={vocabulary}
                    onChange={(val) => {
                      const primitive = isActor ? detectActorPrimitive(val) : detectSystemPrimitive(val);
                      const semantic = isActor ? undefined : inferActionSemantic(primitive, val);
                      updateMainStep(step.id, (s) => ({ ...s, title: val, primitive, semantic }));
                    }}
                    onFocusField={(el) => {
                      setActiveMainStepId(step.id);
                      makeInsertHandler(step.title, (val) => {
                        const primitive = isActor ? detectActorPrimitive(val) : detectSystemPrimitive(val);
                        const semantic = isActor ? undefined : inferActionSemantic(primitive, val);
                        updateMainStep(step.id, (s) => ({ ...s, title: val, primitive, semantic }));
                      })(el);
                    }}
                    onKeyDown={handleMainKeyDown}
                  />
                )}
              </div>
            );

            return (
              <div
                className={`ucf-step-group${isActor ? ' is-actor-turn' : ' is-system-turn'}${isActive ? ' is-active' : ''}`}
                key={step.id}
              >
                <div className={`ucf-grid-row is-main${isHighlighted ? ' is-highlighted' : ''}`}>
                  <div className="ucf-col-actor">{isActor ? mainCellContent : null}</div>
                  <div className="ucf-col-system">{!isActor ? mainCellContent : null}</div>
                  <div className="ucf-col-ref">
                    <FlowRefCell
                      content={content}
                      currentFlowId={flowId}
                      refs={step.refs}
                      onChangeRefs={(refs) => updateMainStep(step.id, (s) => ({ ...s, refs }))}
                      onCreateAlternativeAndLink={() => onCreateAlternativeFromStep(flowId, step.id, true)}
                      onJumpToAlternative={onJumpToAlternative}
                    />
                  </div>
                  <div className="ucf-col-actions">
                    <div className="ucf-row-actions">
                      <button
                        aria-label={isActor ? 'Cambiar a turno Sistema' : 'Cambiar a turno Actor'}
                        tabIndex={-1}
                        title={isActor ? 'Cambiar a turno del Sistema' : 'Cambiar a turno del Actor'}
                        type="button"
                        onClick={() => updateMainStep(step.id, (s) => ({ ...s, speaker: isActor ? 'system' : 'actor' }))}
                      >
                        {isActor ? <Cpu size={12} /> : <User size={12} />}
                      </button>
                      {subCount > 0 ? (
                        <button
                          aria-label={isCollapsed ? 'Desplegar paso' : 'Plegar paso'}
                          tabIndex={-1}
                          title={isCollapsed ? 'Desplegar paso' : 'Plegar paso'}
                          type="button"
                          onClick={() => onToggleCollapseStep(step.id)}
                        >
                          {isCollapsed ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
                        </button>
                      ) : null}
                      <button aria-label="Mover paso arriba" disabled={index === 0} tabIndex={-1} type="button" onClick={() => moveMainStep(index, -1)}>
                        <ArrowUp size={12} />
                      </button>
                      <button aria-label="Mover paso abajo" disabled={index === steps.length - 1} tabIndex={-1} type="button" onClick={() => moveMainStep(index, 1)}>
                        <ArrowDown size={12} />
                      </button>
                      <button aria-label="Eliminar paso" className="is-danger" tabIndex={-1} type="button" onClick={() => removeMainStep(step.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                {!isCollapsed && !isActor ? (
                  <Fragment>
                    {renderSubNodes(step, index, step.children, 1, 0)}

                    {!isAtomicSystem && (isActive || step.children.length === 0) ? (
                      <div className="ucf-grid-row is-primitive-bar">
                        <div className="ucf-col-actor" />
                        <div className="ucf-col-system">
                          <div className="ucf-primitive-palette">
                            <span className="ucf-palette-label">
                              <CornerDownRight size={11} aria-hidden="true" />
                              Subpaso:
                            </span>
                            {QUICK_PRIMITIVES.map((item) => (
                              <button
                                key={item.id}
                                tabIndex={-1}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => addQuickSubNode(step.id, item.id)}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="ucf-col-ref" />
                        <div className="ucf-col-actions" />
                      </div>
                    ) : null}
                  </Fragment>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="ucf-table-footer">
        <button
          className="secondary-action"
          type="button"
          onClick={() => insertMainStepAfter(undefined, 'actor')}
        >
          <User size={13} aria-hidden="true" /> + Turno Actor
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => insertMainStepAfter(undefined, 'system')}
        >
          <Cpu size={13} aria-hidden="true" /> + Turno Sistema
        </button>
        {flowId === 'basic' ? (
          <>
            <button
              className="ucf-footer-quick"
              type="button"
              onClick={() => insertMainStepAfter(undefined, 'system', 'Guardar Cambios', 'guardar-cambios')}
            >
              + Guardar Cambios
            </button>
            <button
              className="ucf-footer-quick"
              type="button"
              onClick={() => insertMainStepAfter(undefined, 'system', 'Fin CU', 'fin-cu')}
            >
              + Fin CU
            </button>
          </>
        ) : (
          <>
            <button
              className="ucf-footer-quick"
              type="button"
              onClick={() => {
                const defaultTarget = content.basicFlow[1] ?? content.basicFlow[0];
                const jumpTarget = defaultTarget ? { flowId: 'basic', stepId: defaultTarget.id } : undefined;
                const title = formatJumpTargetText(jumpTarget, content, numbering, 'Ir a paso 2 de camino principal');
                const nextStep = createFlowMainStep('system', title, {
                  primitive: 'ir-a-paso',
                  ...(jumpTarget ? { jumpTarget } : {}),
                });
                onChangeSteps([...steps, nextStep]);
              }}
            >
              + Ir a paso…
            </button>
            <button
              className="ucf-footer-quick"
              type="button"
              onClick={() => insertMainStepAfter(undefined, 'system', 'Fin CU', 'fin-cu')}
            >
              + Fin CU
            </button>
          </>
        )}
        <span className="ucf-table-hint">
          <kbd>{shortcutLabel('⌘↵')}</kbd> cambiar turno · <kbd>{shortcutLabel('⇧⌘A')}</kbd> crear CA · <kbd>/</kbd> primitivas
        </span>
      </div>
    </div>
  );
}
