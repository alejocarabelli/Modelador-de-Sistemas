import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'reactflow';
import { ASSOCIATION_RELATION_LABELS } from '../constants/associationLabels';
import type { AssociationRelationType } from '../types/diagram';
import { ASSOCIATION_RELATION_TYPES } from '../utils/association';
import {
  getClassKeyboardInstruction,
  sideLabels,
  type ClassKeyboardImportItem,
  type ClassKeyboardState,
  type ClassRect,
} from '../utils/classKeyboardMode';

const relationWords: Record<AssociationRelationType, string> = {
  association: 'asociación',
  generalization: 'herencia',
  aggregation: 'agregación',
  composition: 'composición',
  dependency: 'dependencia',
  realization: 'realización',
};

/** The UML end of each relation, in the same 44 × 14 box as the sequence arrows. */
function RelationGlyph({ type }: { type: AssociationRelationType }) {
  const dashed = type === 'dependency' || type === 'realization';
  const triangle = type === 'generalization' || type === 'realization';
  const diamond = type === 'aggregation' || type === 'composition';
  return (
    <svg aria-hidden="true" className="sequence-keyboard-arrow" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 44 14" width="44">
      <path d={`M${diamond ? 17 : 3} 7H${triangle ? 32 : 40}`} strokeDasharray={dashed ? '3 2.5' : undefined} />
      {triangle ? <path d="M32 2.5L41 7l-9 4.5z" fill="var(--panel-background)" /> : null}
      {diamond ? <path d="M3 7l7-4.5 7 4.5-7 4.5z" fill={type === 'composition' ? 'currentColor' : 'var(--panel-background)'} /> : null}
      {!triangle && !diamond ? <path d="M33 2.5L41 7l-8 4.5" /> : null}
    </svg>
  );
}

export type ClassKeyboardSuggestion = { id: string; title: string; detail: string; create?: boolean };

type Props = {
  state: ClassKeyboardState;
  canImport: boolean;
  relationType: AssociationRelationType;
  cursor: ClassRect | null;
  target: ClassRect | null;
  ghost: ClassRect | null;
  suggestions: ClassKeyboardSuggestion[];
  suggestionIndex: number;
  importItems: readonly ClassKeyboardImportItem[];
  existingRelation: AssociationRelationType | null;
  detailsField: number;
  inputRef: (element: HTMLInputElement | null) => void;
  onTextChange: (text: string) => void;
  onDetailsChange: (field: 'sourceMultiplicity' | 'name' | 'targetMultiplicity', value: string) => void;
  onDetailsFocus: (field: number) => void;
  onChooseSuggestion: (index: number) => void;
  onChooseRelationType: (type: AssociationRelationType) => void;
  onKey: (key: string) => void;
  onExit: () => void;
};

/**
 * What the class keyboard mode draws over the canvas: the guide with the keys
 * of the current step, the composer next to the class it works on, the dashed
 * preview of the relation being aimed and the outline of a class about to be
 * created. It lives inside React Flow so it follows the pan and the zoom.
 */
export function ClassKeyboardOverlay({
  state,
  canImport,
  relationType,
  cursor,
  target,
  ghost,
  suggestions,
  suggestionIndex,
  importItems,
  existingRelation,
  detailsField,
  inputRef,
  onTextChange,
  onDetailsChange,
  onDetailsFocus,
  onChooseSuggestion,
  onChooseRelationType,
  onKey,
  onExit,
}: Props) {
  const [tx, ty, zoom] = useStore((store) => store.transform);
  const width = useStore((store) => store.width);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(160);
  // The composer opens above its class unless that would run under the guide; its height depends on the step.
  useLayoutEffect(() => {
    if (popoverRef.current) setPopoverHeight(popoverRef.current.offsetHeight);
  }, [state.stage, state.importIndex, suggestions.length]);

  const toScreen = (rect: ClassRect) => ({
    x: rect.x * zoom + tx,
    y: rect.y * zoom + ty,
    width: rect.width * zoom,
    height: rect.height * zoom,
  });

  const importItem = state.stage === 'import' ? importItems[state.importIndex] : undefined;
  const anchor = state.stage === 'relation' || state.stage === 'details' || (state.stage === 'import' && importItem?.kind === 'relation')
    ? target ?? cursor
    : state.stage === 'newClass' ? ghost ?? cursor : cursor;
  const screenAnchor = anchor ? toScreen(anchor) : null;
  const guideHeight = 44;
  const placement = screenAnchor && screenAnchor.y - popoverHeight - 24 < guideHeight ? 'below' : 'above';
  const popoverLeft = screenAnchor ? Math.min(Math.max(screenAnchor.x + screenAnchor.width / 2, 200), Math.max(200, width - 200)) : width / 2;
  const popoverTop = screenAnchor ? (placement === 'above' ? screenAnchor.y : screenAnchor.y + screenAnchor.height) : 120;

  const linkSource = cursor;
  const showPreview = (state.stage === 'relation' || state.stage === 'details' || (state.stage === 'import' && importItem?.kind === 'relation'))
    && linkSource !== null && target !== null;
  let preview: ReactNode = null;
  if (showPreview && linkSource && target) {
    const a = toScreen(linkSource);
    const b = toScreen(target);
    const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const clip = (center: { x: number; y: number }, box: { width: number; height: number }, toward: { x: number; y: number }) => {
      const dx = toward.x - center.x;
      const dy = toward.y - center.y;
      if (dx === 0 && dy === 0) return center;
      const t = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity);
      return { x: center.x + dx * t, y: center.y + dy * t };
    };
    const start = clip(ca, a, cb);
    const end = clip(cb, b, ca);
    preview = (
      <svg aria-hidden="true" className="class-keyboard-preview">
        <defs>
          <marker id="class-keyboard-preview-head" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="5" viewBox="0 0 10 10">
            <path d="M1 1L9 5L1 9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </marker>
        </defs>
        <line markerEnd="url(#class-keyboard-preview-head)" x1={start.x} x2={end.x} y1={start.y} y2={end.y} />
      </svg>
    );
  }

  const ghostBox = ghost ? toScreen(ghost) : null;
  const instruction = getClassKeyboardInstruction(state, canImport);
  const guideContext = state.stage === 'relation' || state.stage === 'details'
    ? `${cursor?.name || 'Clase sin nombre'} → ${target?.name || '…'}`
    : state.stage === 'import' ? 'Traer de las secuencias' : cursor?.name || '';
  const activeRelation = state.stage === 'import' ? state.importRelationType : relationType;

  const relationTypes = (
    <div aria-label="Tipos de relación" className="sequence-keyboard-types class-keyboard-types" role="listbox">
      {ASSOCIATION_RELATION_TYPES.map((type, index) => (
        <button
          aria-selected={activeRelation === type}
          className={activeRelation === type ? 'active' : ''}
          key={type}
          role="option"
          tabIndex={-1}
          title={ASSOCIATION_RELATION_LABELS[type]}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChooseRelationType(type)}
        >
          <RelationGlyph type={type} />
          <span className="sequence-keyboard-type-word"><kbd className="sequence-keyboard-key">{index + 1}</kbd>{relationWords[type]}</span>
        </button>
      ))}
    </div>
  );

  const suggestionList = suggestions.length > 0 ? (
    <div className="sequence-keyboard-suggestions" role="listbox">
      {suggestions.map((suggestion, index) => (
        <button
          aria-selected={index === suggestionIndex}
          className={`${index === suggestionIndex ? 'active' : ''} ${suggestion.create ? 'class-keyboard-create' : ''}`}
          key={suggestion.id}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChooseSuggestion(index)}
        >
          <strong>{suggestion.title}</strong>
          <small>{suggestion.detail}</small>
        </button>
      ))}
    </div>
  ) : null;

  let body: ReactNode = null;
  if (state.stage === 'navigate') {
    body = (
      <div className="sequence-keyboard-navigate-pill">
        <span className="sequence-keyboard-pill-source" title={cursor?.name}>{cursor?.name || 'Clase sin nombre'}</span>
        <div aria-label="Atajos" className="sequence-keyboard-shortcuts">
          <button type="button" className="sequence-keyboard-shortcut" onClick={() => onKey('Enter')}><kbd>Enter</kbd> relación</button>
          <button type="button" className="sequence-keyboard-shortcut" onClick={() => onKey('a')}><kbd>A</kbd> atributo</button>
          <button type="button" className="sequence-keyboard-shortcut" onClick={() => onKey('o')}><kbd>O</kbd> operación</button>
          <button type="button" className="sequence-keyboard-shortcut" onClick={() => onKey('n')}><kbd>N</kbd> clase</button>
          {canImport ? <button type="button" className="sequence-keyboard-shortcut" onClick={() => onKey('t')}><kbd>T</kbd> traer</button> : null}
        </div>
      </div>
    );
  } else if (state.stage === 'attribute' || state.stage === 'method' || state.stage === 'newClass' || state.stage === 'search') {
    const title = state.stage === 'attribute' ? 'Atributo nuevo'
      : state.stage === 'method' ? 'Operación nueva'
        : state.stage === 'newClass' ? 'Clase nueva'
          : state.searchFor === 'target' ? 'Buscar destino' : 'Ir a la clase';
    const where = state.stage === 'newClass'
      ? `${sideLabels[state.side]} ${cursor?.name || 'la clase'}`
      : state.stage === 'search' && state.searchFor === 'cursor' ? '' : cursor?.name ?? '';
    body = (
      <>
        <div className="sequence-keyboard-panel-title">
          <strong>{title}</strong>
          <span>{where}</span>
        </div>
        <label>
          <span className="class-keyboard-sr">{title}</span>
          <input
            ref={inputRef}
            autoComplete="off"
            spellCheck={false}
            placeholder={state.stage === 'attribute' ? 'nombre: Tipo'
              : state.stage === 'method' ? 'nombre(parámetros): Retorno'
                : state.stage === 'newClass' ? 'NombreDeLaClase' : 'Parte del nombre'}
            value={state.text}
            onChange={(event) => onTextChange(event.target.value)}
          />
        </label>
        {suggestionList}
        {state.stage === 'search' && suggestions.length === 0 ? <small className="sequence-keyboard-hint">No hay clases con ese nombre.</small> : null}
      </>
    );
  } else if (state.stage === 'relation') {
    body = (
      <>
        <div className="sequence-keyboard-dest">
          <span className="sequence-keyboard-dest-top">
            <span className="sequence-keyboard-dest-label">Destino</span>
            <span className="sequence-keyboard-dest-type">{ASSOCIATION_RELATION_LABELS[relationType]}</span>
          </span>
          <strong className="sequence-keyboard-dest-name" title={target?.name}>{target?.name || 'Clase sin nombre'}</strong>
          {existingRelation ? (
            <small className="class-keyboard-warning">{`Ya hay una ${relationWords[existingRelation]} entre estas clases. Enter agrega otra.`}</small>
          ) : null}
        </div>
        {relationTypes}
      </>
    );
  } else if (state.stage === 'details') {
    const fields: Array<{ key: 'sourceMultiplicity' | 'name' | 'targetMultiplicity'; label: string; placeholder: string }> = [
      { key: 'sourceMultiplicity', label: `Origen · ${cursor?.name ?? ''}`, placeholder: '1, *, 0..1…' },
      { key: 'name', label: 'Nombre', placeholder: 'opcional' },
      { key: 'targetMultiplicity', label: `Destino · ${target?.name ?? ''}`, placeholder: '1, *, 0..1…' },
    ];
    body = (
      <>
        <div className="sequence-keyboard-panel-title">
          <strong>{ASSOCIATION_RELATION_LABELS[relationType]}</strong>
          <span>{`${cursor?.name ?? ''} → ${target?.name ?? ''}`}</span>
        </div>
        <div className="class-keyboard-details">
          {fields.map((field, index) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                ref={index === detailsField ? inputRef : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder={field.placeholder}
                value={state.details[field.key]}
                onChange={(event) => onDetailsChange(field.key, event.target.value)}
                onFocus={() => onDetailsFocus(index)}
              />
            </label>
          ))}
        </div>
      </>
    );
  } else if (state.stage === 'import' && importItem) {
    const position = `${state.importIndex + 1} de ${importItems.length}`;
    const handled = state.importHandled[importItem.key];
    body = (
      <>
        <div className="sequence-keyboard-panel-title">
          <strong>{importItem.kind === 'relation' ? 'Relación sugerida' : importItem.kind === 'class' ? 'Clase nueva' : 'Para completar'}</strong>
          <span>{position}</span>
        </div>
        {importItem.kind === 'relation' ? (
          <>
            <div className="class-keyboard-import">
              <strong>{`${importItem.sourceClassName} → ${importItem.targetClassName}`}</strong>
              <small>{`Por el mensaje ${importItem.message}. No hay relación entre estas clases.`}</small>
              {cursor === null || target === null ? <small className="class-keyboard-warning">Primero traé las dos clases.</small> : null}
            </div>
            {relationTypes}
          </>
        ) : (
          <div className="class-keyboard-import">
            <strong>{importItem.className}</strong>
            <ul>{importItem.members.map((member) => <li key={member}>{member}</li>)}</ul>
          </div>
        )}
        {handled ? <small className="sequence-keyboard-hint">{handled === 'done' ? 'Ya traído.' : 'Salteado. Enter lo trae igual.'}</small> : null}
      </>
    );
  }

  return (
    <>
      <div className="sequence-canvas-guide is-keyboard-active class-keyboard-guide" data-export-control="true">
        <div className="sequence-keyboard-guide-body">
          <span className="sequence-keyboard-status-badge">MODO TECLADO</span>
          {guideContext ? <strong className="sequence-keyboard-guide-context" title={guideContext}>{guideContext}</strong> : null}
          <span className="sequence-keyboard-guide-instruction">{instruction}</span>
        </div>
        <button type="button" className="sequence-keyboard-exit-pill" title="Salir del modo teclado (M)" onClick={onExit}>
          Salir <kbd>M</kbd>
        </button>
      </div>
      {preview}
      {ghostBox ? (
        <div
          aria-hidden="true"
          className="class-keyboard-ghost"
          style={{ left: ghostBox.x, top: ghostBox.y, width: ghostBox.width, height: ghostBox.height }}
        >
          <span>{state.text.trim() || 'Clase nueva'}</span>
        </div>
      ) : null}
      {body ? (
        <div
          aria-label="Compositor rápido de clases"
          className={`sequence-keyboard-popover class-keyboard-popover stage-${state.stage === 'relation' ? 'aim' : state.stage} placement-${placement}`}
          data-export-control="true"
          ref={popoverRef}
          role="group"
          style={{ left: popoverLeft, top: popoverTop }}
        >
          {body}
          {state.stage !== 'navigate' && state.stage !== 'relation' ? <small className="sequence-keyboard-hint">{instruction}</small> : null}
        </div>
      ) : null}
    </>
  );
}
