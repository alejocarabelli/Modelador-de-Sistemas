import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { SequenceFragmentOperator, SequenceMessageType } from '../types/diagram';
import type { SequenceMethodOption } from '../utils/sequenceMessageEditing';
import type { SequenceKeyboardModeState } from '../utils/sequenceKeyboardMode';
import {
  applySignatureCompletion,
  getSignatureCompletion,
  normalizeSignatureQuotes,
  type SignatureCompletionData,
} from '../utils/sequenceSignatureCompletion';
import { getSequenceKeyboardInstruction, noPendingCallFeedback, sequenceKeyboardMessageTypes } from '../utils/sequenceKeyboardMode';

const typeWords: Record<SequenceMessageType, string> = {
  synchronous: 'mensaje',
  asynchronous: 'mensaje',
  return: 'retorno',
  create: 'crear',
  destroy: 'destruir',
};

const typeLetters: Record<SequenceMessageType, string> = {
  synchronous: 'S',
  asynchronous: 'S',
  return: 'R',
  create: 'C',
  destroy: 'D',
};

/** The UML arrow of each type, drawn in the same 44 x 14 box so they line up. */
function TypeArrow({ type }: { type: SequenceMessageType }) {
  return (
    <svg aria-hidden="true" className="sequence-keyboard-arrow" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 44 14" width="44">
      {type === 'return' ? (
        <>
          <path d="M41 7H8" strokeDasharray="3 2.5" />
          <path d="M11 2.5L3.5 7l7.5 4.5" />
        </>
      ) : type === 'create' ? (
        <>
          <path d="M3 7H22" strokeDasharray="3 2.5" />
          <path d="M18 2.5L25 7l-7 4.5" />
          <rect height="10" rx="1.5" strokeWidth="1.3" width="12" x="29" y="2" />
        </>
      ) : type === 'destroy' ? (
        <>
          <path d="M3 7H31" />
          <path d="M33.5 2.5l8 9M41.5 2.5l-8 9" />
        </>
      ) : (
        <>
          <path d="M3 7H32" />
          <path d="M41 7l-9-4.5v9z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

const typeLabels: Record<SequenceMessageType, string> = {
  synchronous: 'Mensaje',
  asynchronous: 'Mensaje',
  return: 'Retorno',
  create: 'Crear',
  destroy: 'Destruir',
};

const operatorLabels: Record<SequenceFragmentOperator, string> = {
  alt: 'alt · alternativas',
  loop: 'loop · repetición',
  opt: 'opt · opcional',
  par: 'par · paralelo',
  break: 'break · interrupción',
  critical: 'critical · sección crítica',
  ref: 'ref · otra interacción',
};

const methodText = (method: SequenceMethodOption): string =>
  `${method.name}(${method.parameters})${method.returnType ? `: ${method.returnType}` : ''}`;

export function SequenceKeyboardComposer({
  state,
  context,
  sourceName,
  targetName,
  position,
  placement = 'above',
  methodOptions,
  completionData,
  selectedCount,
  onTextChange,
  onGuardChange,
  onSubmit,
  onBack,
  onMethodSelect,
  onAddParticipant,
  onOpenFragment,
  onSelectType,
  onMoveTarget,
  returnAvailable = true,
}: {
  state: SequenceKeyboardModeState;
  context: string;
  sourceName: string;
  targetName: string;
  position: Pick<CSSProperties, 'left' | 'top'>;
  placement?: 'above' | 'below';
  methodOptions: SequenceMethodOption[];
  completionData: SignatureCompletionData;
  selectedCount: number;
  onTextChange: (text: string) => void;
  onGuardChange: (text: string) => void;
  /** Shift+Enter adds the return; Option+Enter keeps the cursor on the origin. */
  onSubmit: (addAutomaticReturn?: boolean, stayAtSource?: boolean) => void;
  onBack: () => void;
  onMethodSelect: (method: SequenceMethodOption) => void;
  onAddParticipant: () => void;
  onOpenFragment?: () => void;
  onSelectType?: (type: SequenceMessageType) => void;
  /** The ‹ › keys of the destination: the same as ← and → on the keyboard. */
  onMoveTarget?: (direction: -1 | 1) => void;
  /** False when no call is waiting for a return from here. */
  returnAvailable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // The popover is centred on the participant; near the edge of the visible
  // canvas that cut it in half. Nudge it back inside the scrolling viewport
  // (8px margin) and move the arrow the other way so it still points at the
  // participant.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return undefined;
    let viewport: HTMLElement | null = popover.parentElement;
    while (viewport && !/(auto|scroll|hidden)/.test(getComputedStyle(viewport).overflowX)) viewport = viewport.parentElement;
    const fit = (): void => {
      // Measure the resting position: without this the 0.15s transform
      // transition returns a half-animated box and the nudge stays wrong.
      popover.style.transition = 'none';
      popover.style.setProperty('--keyboard-nudge', '0px');
      const box = popover.getBoundingClientRect();
      popover.style.transition = '';
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const nudge = box.left < bounds.left + 8
        ? bounds.left + 8 - box.left
        : box.right > bounds.right - 8 ? bounds.right - 8 - box.right : 0;
      popover.style.setProperty('--keyboard-nudge', `${Math.round(nudge)}px`);
    };
    fit();
    viewport?.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      viewport?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, [position.left, position.top, state.stage, placement, sourceName, targetName]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  // Arrow keys mean "I am choosing a suggestion": Enter then takes it.
  const [browsedSuggestions, setBrowsedSuggestions] = useState(false);
  const [caret, setCaret] = useState(0);
  const caretToRestore = useRef<number | null>(null);
  // Inside the signature's parentheses the field is quote-aware: classes,
  // attributes, operators and participants depending on where the caret is.
  const completion = useMemo(
    () => state.stage === 'typing' && state.messageType !== 'create'
      ? getSignatureCompletion(state.text, Math.min(caret, state.text.length), completionData)
      : null,
    [caret, completionData, state.messageType, state.stage, state.text],
  );
  const editingSignature = completion !== null || (state.stage === 'typing' && state.text.includes('('));
  const methodSuggestions = useMemo(() => {
    if (editingSignature) return [];
    const query = state.text.trim().toLocaleLowerCase().split(/[(:]/)[0];
    if (!query) return methodOptions.slice(0, 5);
    return methodOptions.filter((method) => `${method.name} ${method.label}`.toLocaleLowerCase().includes(query)).slice(0, 5);
  }, [editingSignature, methodOptions, state.text]);
  const suggestions: Array<{ id: string; title: string; detail: string; apply: () => void }> = completion
    ? completion.options.map((option) => ({
        id: option.id,
        title: option.text,
        detail: option.label,
        apply: () => {
          const applied = applySignatureCompletion(state.text, completion, option);
          caretToRestore.current = applied.caret;
          setSuggestionIndex(0);
          setBrowsedSuggestions(false);
          onTextChange(applied.text);
        },
      }))
    : methodSuggestions.map((method) => ({
        id: method.id,
        title: methodText(method),
        detail: method.label,
        apply: () => onMethodSelect(method),
      }));

  useLayoutEffect(() => {
    const target = caretToRestore.current;
    if (target === null) return;
    caretToRestore.current = null;
    inputRef.current?.setSelectionRange(target, target);
    setCaret(target);
  }, [state.text]);

  useEffect(() => {
    if ((state.stage === 'typing' && state.messageType !== 'return') || state.stage === 'guard' || state.stage === 'participant') {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
      });
    }
  }, [state.stage, state.editId, state.guardOperandId, state.messageType]);

  const handleTextKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onBack();
      return;
    }
    if (state.stage === 'guard') {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit(false);
      }
      return;
    }
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setBrowsedSuggestions(true);
      setSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setBrowsedSuggestions(true);
      setSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Tab' && suggestions.length > 0) {
      event.preventDefault();
      (suggestions[Math.min(suggestionIndex, suggestions.length - 1)] ?? suggestions[0]).apply();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const isCall = state.stage === 'typing' && state.messageType !== 'create';
      // An empty field never saves a nameless message: Enter takes the
      // highlighted suggestion instead, as it does after browsing them.
      if (isCall && suggestions.length > 0 && (browsedSuggestions || (!editingSignature && state.text.trim().length === 0))) {
        setBrowsedSuggestions(false);
        (suggestions[Math.min(suggestionIndex, suggestions.length - 1)] ?? suggestions[0]).apply();
        return;
      }
      onSubmit(event.shiftKey, event.altKey);
    }
  };

  const instruction = getSequenceKeyboardInstruction(state);
  const visibleMessageType: SequenceMessageType = state.messageType === 'asynchronous'
    ? 'synchronous'
    : state.messageType;
  const visibleMessageTypeLabel = typeLabels[visibleMessageType];
  const destinationLabel = state.messageType === 'create' ? 'Ubicación' : state.messageType === 'return' ? 'Responde a' : 'Destino';

  return (
    <>
      <div
        aria-label="Compositor rápido de secuencia"
        className={`sequence-keyboard-popover stage-${state.stage} placement-${placement}`}
        data-export-control="true"
        ref={popoverRef}
        role="group"
        style={{ left: position.left, top: position.top }}
      >
        {state.stage === 'navigate' ? (
          <div className="sequence-keyboard-navigate-pill">
            <span className="sequence-keyboard-pill-source" title={sourceName}>{sourceName}</span>
            <div aria-label="Atajos" className="sequence-keyboard-shortcuts">
              <span className="sequence-keyboard-shortcut"><kbd>Enter</kbd> conectar</span>
              <button type="button" className="sequence-keyboard-shortcut" onClick={onAddParticipant}><kbd>P</kbd> participante</button>
              <button type="button" className="sequence-keyboard-shortcut" onClick={onOpenFragment}><kbd>F</kbd> fragmento</button>
            </div>
          </div>
        ) : (
          <>
            {state.stage === 'participant' || state.stage === 'fragment' || state.stage === 'guard' ? (
              <div className="sequence-keyboard-panel-title">
                <strong>{state.stage === 'participant' ? 'Agregar participante' : state.stage === 'fragment' ? 'Fragmento combinado' : 'Editar guarda'}</strong>
                <span>{context}</span>
              </div>
            ) : (
              <div className="sequence-keyboard-dest" data-message-type={visibleMessageType}>
                <span className="sequence-keyboard-dest-top">
                  <span className="sequence-keyboard-dest-label">{destinationLabel}</span>
                  {state.stage === 'aim' ? (
                    <span className="sequence-keyboard-dest-keys">
                      <button aria-label="Destino anterior" className="sequence-keyboard-key" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onMoveTarget?.(-1)}>←</button>
                      <button aria-label="Destino siguiente" className="sequence-keyboard-key" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onMoveTarget?.(1)}>→</button>
                    </span>
                  ) : (
                    <span className="sequence-keyboard-dest-type">{visibleMessageTypeLabel}</span>
                  )}
                </span>
                <strong className="sequence-keyboard-dest-name" title={targetName}>{targetName}</strong>
              </div>
            )}

            {state.stage === 'aim' ? (
              <div aria-label="Tipos de mensaje" className="sequence-keyboard-types" role="listbox">
                {sequenceKeyboardMessageTypes.map((type) => {
                  const unavailable = type === 'return' && !returnAvailable;
                  return (
                    <button
                      aria-disabled={unavailable}
                      aria-selected={visibleMessageType === type}
                      className={visibleMessageType === type ? 'active' : ''}
                      data-message-type={type}
                      disabled={unavailable}
                      key={type}
                      role="option"
                      tabIndex={-1}
                      title={unavailable ? noPendingCallFeedback : undefined}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelectType?.(type)}
                    >
                      <TypeArrow type={type} />
                      <span className="sequence-keyboard-type-word"><kbd className="sequence-keyboard-key">{typeLetters[type]}</kbd>{typeWords[type]}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {(state.stage === 'typing' && state.messageType !== 'return') || state.stage === 'participant' ? (
              <label>
                <span>
                  {state.stage === 'participant'
                    ? 'Nuevo participante'
                    : state.messageType === 'create'
                    ? 'Participante nuevo'
                    : state.editId
                        ? 'Editar mensaje'
                        : 'Mensaje'}
                </span>
                <input
                  ref={inputRef}
                  aria-autocomplete={suggestions.length > 0 ? 'list' : undefined}
                  aria-controls={suggestions.length > 0 ? 'sequence-keyboard-suggestions' : undefined}
                  value={state.text}
                  placeholder={
                    state.stage === 'participant'
                      ? 'instancia:Clase o :Clase'
                      : state.messageType === 'create'
                      ? 'nombre:Clase'
                      : 'operación(parámetros): Retorno'
                  }
                  onChange={(event) => {
                    const input = event.target;
                    const clean = normalizeSignatureQuotes(input.value);
                    setSuggestionIndex(0);
                    setBrowsedSuggestions(false);
                    setCaret(input.selectionStart ?? clean.length);
                    onTextChange(clean);
                  }}
                  onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                  onKeyDown={handleTextKeyDown}
                />
              </label>
            ) : null}

            {state.stage === 'typing' && state.messageType !== 'return' && suggestions.length > 0 ? (
              <div className="sequence-keyboard-suggestions" id="sequence-keyboard-suggestions" role="listbox">
                {suggestions.map((suggestion, index) => (
                  <button
                    aria-selected={index === suggestionIndex}
                    className={index === suggestionIndex ? 'active' : ''}
                    key={suggestion.id}
                    role="option"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={suggestion.apply}
                  >
                    <strong>{suggestion.title}</strong>
                    <small>{suggestion.detail}</small>
                  </button>
                ))}
              </div>
            ) : null}

            {state.stage === 'fragment' ? (
              <div className="sequence-keyboard-fragment-picker">
                <small>{selectedCount > 0 ? `${selectedCount} elemento${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}` : 'Fragmento vacío en este punto'}</small>
                {Object.entries(operatorLabels).map(([operator, label]) => (
                  <div className={state.fragmentOperator === operator ? 'active' : ''} key={operator}>{label}</div>
                ))}
              </div>
            ) : null}

            {state.stage === 'guard' ? (
              <label>
                <span>Guarda de la rama</span>
                <input
                  ref={inputRef}
                  value={state.guardText}
                  placeholder="condición / else"
                  onChange={(event) => onGuardChange(event.target.value)}
                  onKeyDown={handleTextKeyDown}
                />
              </label>
            ) : null}

            {state.stage === 'aim' ? null : <small className="sequence-keyboard-hint">{instruction}</small>}
          </>
        )}
      </div>
      <div aria-live="polite" className="sequence-keyboard-live-region">
        {`${context}. ${state.stage === 'participant' ? 'Nuevo participante.' : `Origen ${sourceName}. ${state.stage === 'aim' || state.stage === 'typing' ? `Destino ${targetName}. Tipo ${visibleMessageTypeLabel}.` : ''}`}`}
      </div>
    </>
  );
}
