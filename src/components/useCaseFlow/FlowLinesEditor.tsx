import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { FlowMainStep, FlowRef, UseCaseFlowContent } from '../../types/diagram';
import type { FlowVocabulary } from '../../utils/flowDocument';
import type { ProjectSymbolIndex } from '../../utils/projectSymbolIndex';
import { buildFlowLineSuggestions } from '../../utils/useCaseFlowCompletion';
import { formatFlowRef, type FlowNumberingIndex } from '../../utils/useCaseFlowModel';
import {
  blockEnd,
  canNestStep,
  isBlockHeader,
  isLoopHeader,
  linesToTree,
  newLine,
  treeToLines,
  type FlowEditLine,
  type FlowLineContext,
} from '../../utils/flowLines';
import { createId } from '../../utils/id';
import { shortcutLabel } from '../../utils/shortcutLabel';
import { FlowRichLineInput } from './FlowRichLineInput';

type FlowLinesEditorProps = {
  content: UseCaseFlowContent;
  flowId: 'basic' | string;
  steps: FlowMainStep[];
  numbering: FlowNumberingIndex;
  symbolIndex: ProjectSymbolIndex;
  vocabulary: FlowVocabulary;
  useCaseNames: string[];
  highlightedStepId?: string | null;
  /** First line a new path starts with. */
  firstSide?: 'actor' | 'system';
  onChangeSteps: (steps: FlowMainStep[]) => void;
  onCreateAlternative: (flowId: 'basic' | string, stepId: string, isMainStep: boolean) => void;
  onJumpToAlternative: (flowId: string) => void;
  onFocusEditable: (el: HTMLTextAreaElement, applyInsert: (token: string) => void) => void;
  registerLine?: (stepId: string, el: HTMLTextAreaElement | null) => void;
};

type PendingFocus = { id: string; index: number; caret: number | 'end' };

const BULLETS = ['•', '◦', '▪'];
const INDENT = 22;

const placeholderFor = (line: FlowEditLine): string => {
  if (line.kind === 'bullet') return 'Con atributo igual a valor';
  if (line.depth > 0) return 'Escribí una primitiva o / para ver la lista';
  return line.side === 'actor' ? 'Acción del actor · ej. Ingresar número de socio (nsocio)' : 'Título del paso · ej. Verificar existencia de socio';
};

const ownerClassOf = (lines: FlowEditLine[], index: number): string | undefined => {
  const depth = lines[index].depth;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = lines[cursor];
    if (candidate.kind === 'step' && candidate.depth < depth) {
      return /instancias?\/?s?\s+(?:de\s+)?([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/.exec(candidate.text)?.[1];
    }
  }
  return undefined;
};

/** Parses what was typed in the Ref. column: `CA 2, GUI-1`. */
const parseRefs = (raw: string, previous: FlowRef[], content: UseCaseFlowContent): FlowRef[] =>
  raw
    .split(/[,;]+|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): FlowRef => {
      const ca = /^C\.?\s*A\.?\s*(?:N\s*°|N°|Nº|N)?\s*(\d+)$/i.exec(part);
      if (ca) {
        const flow = content.alternativeFlows.find((candidate) => candidate.number === Number(ca[1]));
        const existing = previous.find((ref) => (flow && ref.kind === 'ca' && ref.flowId === flow.id));
        if (existing) return existing;
        return flow ? { id: createId(), kind: 'ca', flowId: flow.id } : { id: createId(), kind: 'ca-missing', code: `CA ${ca[1]}` };
      }
      if (/^GUI\b/i.test(part)) return { id: createId(), kind: 'gui', label: part.toUpperCase().replace(/\s+/g, '-') };
      return { id: createId(), kind: 'custom', label: part };
    });

/**
 * Whether the caret sits on the first (or last) wrapped row of a textarea.
 * Measures the text before (or after) the caret in an off-screen copy.
 */
let measurer: HTMLTextAreaElement | null = null;
const caretOnEdgeRow = (el: HTMLTextAreaElement, edge: 'first' | 'last'): boolean => {
  if (el.selectionStart !== el.selectionEnd) return false;
  const caret = el.selectionStart;
  if (edge === 'first' && caret === 0) return true;
  if (edge === 'last' && caret === el.value.length) return true;
  if (typeof document === 'undefined') return true;
  measurer ??= document.body.appendChild(document.createElement('textarea'));
  const style = window.getComputedStyle(el);
  Object.assign(measurer.style, {
    position: 'absolute', visibility: 'hidden', top: '-9999px', left: '-9999px', height: '0', overflow: 'hidden',
    width: `${el.clientWidth}px`, font: style.font, letterSpacing: style.letterSpacing, padding: style.padding,
    border: '0', boxSizing: style.boxSizing, whiteSpace: style.whiteSpace, wordBreak: style.wordBreak,
  });
  measurer.rows = 1;
  measurer.value = 'x';
  const oneRow = measurer.scrollHeight;
  measurer.value = edge === 'first' ? el.value.slice(0, caret) || 'x' : el.value.slice(caret) || 'x';
  return measurer.scrollHeight <= oneRow + 2;
};

type LoopBox = { depth: number; start: boolean; end: boolean };

/** For every line, the POR CADA / MIENTRAS boxes it sits in, so each row draws its slice of the frame. */
const loopBoxes = (lines: FlowEditLine[]): LoopBox[][] => {
  const result: LoopBox[][] = lines.map(() => []);
  lines.forEach((line, index) => {
    if (line.kind !== 'step' || !isLoopHeader(line.text)) return;
    const end = blockEnd(lines, index);
    for (let cursor = index; cursor < end; cursor += 1) {
      result[cursor].push({ depth: line.depth, start: cursor === index, end: cursor === end - 1 });
    }
  });
  return result;
};

export const FlowLinesEditor = memo(function FlowLinesEditor({
  content,
  flowId,
  steps,
  numbering,
  symbolIndex,
  vocabulary,
  useCaseNames,
  highlightedStepId,
  firstSide = 'actor',
  onChangeSteps,
  onCreateAlternative,
  onJumpToAlternative,
  onFocusEditable,
  registerLine,
}: FlowLinesEditorProps) {
  const ctx: FlowLineContext = useMemo(() => ({ content, flowId, numbering }), [content, flowId, numbering]);
  const storedLines = useMemo(() => treeToLines(steps, ctx), [ctx, steps]);
  const placeholderLine = useMemo(() => newLine({ side: firstSide, depth: 0 }), [firstSide]);
  const lines = useMemo(() => (storedLines.length > 0 ? storedLines : [placeholderLine]), [placeholderLine, storedLines]);
  const boxes = useMemo(() => loopBoxes(lines), [lines]);
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const pending = useRef<PendingFocus | null>(null);
  const refInputs = useRef(new Map<string, HTMLInputElement>());
  const [refDraft, setRefDraft] = useState<{ id: string; text: string } | null>(null);

  const commit = useCallback(
    (next: FlowEditLine[], focus?: PendingFocus): void => {
      if (focus) pending.current = focus;
      onChangeSteps(linesToTree(next, ctx));
    },
    [ctx, onChangeSteps],
  );

  // Focus follows the line that was just created or moved. Lines whose id is
  // derived (SINO) can change id, so the index is the fallback.
  useLayoutEffect(() => {
    const target = pending.current;
    if (!target) return;
    const editable = lines.filter((line) => line.kind !== 'end');
    const el = inputs.current.get(target.id)
      ?? inputs.current.get(editable[Math.min(target.index, editable.length - 1)]?.id ?? '');
    if (!el) return;
    pending.current = null;
    if (el === document.activeElement && target.caret !== 'end' && el.selectionStart === target.caret) return;
    el.focus();
    const caret = target.caret === 'end' ? el.value.length : Math.min(target.caret, el.value.length);
    el.setSelectionRange(caret, caret);
  });

  const editableIndex = (index: number): number => lines.slice(0, index).filter((line) => line.kind !== 'end').length;

  const focusLine = (index: number, caret: number | 'end'): void => {
    const line = lines[index];
    if (!line) return;
    const el = inputs.current.get(line.id);
    if (!el) return;
    el.focus();
    const position = caret === 'end' ? el.value.length : Math.min(caret, el.value.length);
    el.setSelectionRange(position, position);
  };

  const neighbour = (index: number, direction: -1 | 1): number => {
    let cursor = index + direction;
    while (cursor >= 0 && cursor < lines.length && lines[cursor].kind === 'end') cursor += direction;
    return cursor >= 0 && cursor < lines.length ? cursor : -1;
  };

  const shiftBlock = (list: FlowEditLine[], index: number, delta: number): FlowEditLine[] => {
    const end = blockEnd(list, index);
    return list.map((line, cursor) => (cursor >= index && cursor < end ? { ...line, depth: Math.max(0, line.depth + delta) } : line));
  };

  const mainStepIndex = (index: number): number => {
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (lines[cursor].kind === 'step' && lines[cursor].depth === 0) return cursor;
    }
    return 0;
  };

  const setLine = (index: number, patch: Partial<FlowEditLine>, focus?: PendingFocus): void => {
    const next = lines.map((line, cursor) => (cursor === index ? { ...line, ...patch } : line));
    commit(next, focus);
  };

  const insertAt = (position: number, line: FlowEditLine, base: FlowEditLine[] = lines): void => {
    const next = [...base.slice(0, position), line, ...base.slice(position)];
    commit(next, { id: line.id, index: editableIndex(position), caret: 0 });
  };

  const outdent = (index: number, caret: number | 'end'): void => {
    const line = lines[index];
    const focus = { id: line.id, index: editableIndex(index), caret };
    if (line.kind === 'bullet') {
      const previous = lines[index - 1];
      if (previous?.kind === 'bullet' && previous.depth < line.depth && line.depth > 1 && lines.slice(0, index).some((candidate) => candidate.kind === 'step' && candidate.depth < line.depth - 1)) {
        setLine(index, { depth: line.depth - 1 }, focus);
      } else {
        setLine(index, { kind: 'step', depth: Math.max(0, line.depth - 1) }, focus);
      }
      return;
    }
    if (line.depth === 0) return;
    commit(shiftBlock(lines, index, -1), focus);
  };

  const indent = (index: number, caret: number): void => {
    const line = lines[index];
    if (index === 0) return;
    const focus = { id: line.id, index: editableIndex(index), caret };
    const previous = lines[index - 1];
    if (line.kind === 'bullet') {
      if (previous.kind === 'bullet' && previous.depth >= line.depth) setLine(index, { depth: line.depth + 1 }, focus);
      return;
    }
    if (canNestStep(lines, index, line.depth + 1)) {
      commit(shiftBlock(lines, index, 1), focus);
      return;
    }
    // Nothing to nest into: the line becomes a bullet of the step above.
    if (previous.kind !== 'end' && blockEnd(lines, index) === index + 1) {
      setLine(index, { kind: 'bullet', depth: previous.kind === 'bullet' ? previous.depth : previous.depth + 1, refs: [] }, focus);
    }
  };

  /** The depth of the SI a typed FINSI closes, so the next line continues after the block. */
  const finsiDepth = (index: number): number => {
    const depth = lines[index].depth;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = lines[cursor];
      if (candidate.kind !== 'step' || candidate.depth > depth) continue;
      if (/^(?:SI(?![\wÁÉÍÓÚÜÑáéíóúüñ])|[Ss]i\s|SINO\s*$)/.test(candidate.text)) return candidate.depth;
      if (candidate.depth < depth) return depth;
    }
    return depth;
  };

  const handleEnter = (index: number, el: HTMLTextAreaElement): void => {
    const line = lines[index];
    const caret = el.selectionStart;
    const before = line.text.slice(0, caret);
    const after = line.text.slice(el.selectionEnd);

    if (/^FIN\s?SI$/i.test(line.text.trim())) {
      // FINSI is drawn by itself: typing it just closes the SI block.
      setLine(index, { text: '', depth: finsiDepth(index) }, { id: line.id, index: editableIndex(index), caret: 0 });
      return;
    }

    if (line.text.trim().length === 0) {
      if (line.kind === 'bullet' || line.depth > 0) {
        outdent(index, 0);
        return;
      }
      if (storedLines.length > 0) {
        setLine(index, { side: line.side === 'actor' ? 'system' : 'actor' }, { id: line.id, index: editableIndex(index), caret: 0 });
      }
      return;
    }

    const base = lines.map((candidate, cursor) => (cursor === index ? { ...candidate, text: before } : candidate));
    const trimmed = before.trimEnd();

    if (line.kind === 'bullet') {
      insertAt(index + 1, newLine({ kind: 'bullet', side: line.side, depth: line.depth, text: after }), base);
      return;
    }

    if (line.depth === 0 && line.side === 'actor') {
      // After the actor speaks, the system answers: a new turn on the other side.
      insertAt(blockEnd(lines, index), newLine({ side: 'system', depth: 0, text: after }), base);
      return;
    }

    if (isBlockHeader(trimmed) && !/^SINO$/i.test(trimmed)) {
      const firstInside = lines.slice(index + 1, blockEnd(lines, index)).findIndex((candidate) => candidate.kind === 'step');
      const position = firstInside === -1 ? index + 1 : index + 1 + firstInside;
      insertAt(position, newLine({ side: 'system', depth: line.depth + 1, text: after }), base);
      return;
    }

    if (/^SINO$/i.test(trimmed)) {
      insertAt(index + 1, newLine({ side: 'system', depth: line.depth + 1, text: after }), base);
      return;
    }

    if (trimmed.endsWith(':') && after.length === 0) {
      insertAt(index + 1, newLine({ kind: 'bullet', side: line.side, depth: line.depth + 1 }), base);
      return;
    }

    if (line.depth === 0) {
      // A system step title is followed by its sub-steps.
      insertAt(index + 1, newLine({ side: line.side, depth: 1, text: after }), base);
      return;
    }

    insertAt(after.length > 0 ? index + 1 : blockEnd(lines, index), newLine({ side: line.side, depth: line.depth, text: after }), base);
  };

  const newTurn = (index: number): void => {
    const main = mainStepIndex(index);
    const side = lines[main].side === 'actor' ? 'system' : 'actor';
    insertAt(blockEnd(lines, main), newLine({ side, depth: 0 }));
  };

  const moveBlock = (index: number, direction: -1 | 1): void => {
    const line = lines[index];
    const end = blockEnd(lines, index);
    const block = lines.slice(index, end);
    if (direction === -1) {
      let target = index - 1;
      while (target >= 0 && lines[target].depth > line.depth) target -= 1;
      if (target < 0 || lines[target].depth !== line.depth || lines[target].kind === 'end') return;
      const next = [...lines.slice(0, target), ...block, ...lines.slice(target, index), ...lines.slice(end)];
      commit(next, { id: line.id, index: editableIndex(target), caret: 'end' });
      return;
    }
    if (end >= lines.length || lines[end].depth !== line.depth || lines[end].kind === 'end') return;
    const nextEnd = blockEnd(lines, end);
    const next = [...lines.slice(0, index), ...lines.slice(end, nextEnd), ...block, ...lines.slice(nextEnd)];
    commit(next, { id: line.id, index: editableIndex(index + nextEnd - end), caret: 'end' });
  };

  const removeLine = (index: number): void => {
    const previous = neighbour(index, -1);
    const next = lines.filter((_, cursor) => cursor !== index);
    const target = previous === -1 ? neighbour(index, 1) : previous;
    commit(next, target === -1 ? undefined : { id: lines[target].id, index: editableIndex(Math.max(0, previous === -1 ? index : target)), caret: 'end' });
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const el = event.currentTarget;
    const line = lines[index];
    const cmd = event.metaKey || event.ctrlKey;

    if (event.key === 'Enter' && cmd && !event.shiftKey) {
      event.preventDefault();
      newTurn(index);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      handleEnter(index, el);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Tab' && event.altKey) {
      event.preventDefault();
      refInputs.current.get(line.id)?.focus();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) outdent(index, el.selectionStart);
      else indent(index, el.selectionStart);
      return;
    }
    if (event.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (line.text.length === 0) {
        event.preventDefault();
        if (lines.length > 1) removeLine(index);
        return;
      }
      if (line.kind === 'bullet' || line.depth > 0) {
        event.preventDefault();
        outdent(index, 0);
        return;
      }
      const previous = neighbour(index, -1);
      if (previous !== -1 && blockEnd(lines, index) === index + 1) {
        event.preventDefault();
        const joined = lines[previous].text;
        const next = lines
          .map((candidate, cursor) => (cursor === previous ? { ...candidate, text: `${joined}${line.text}`, refs: [...candidate.refs, ...line.refs] } : candidate))
          .filter((_, cursor) => cursor !== index);
        commit(next, { id: lines[previous].id, index: editableIndex(previous), caret: joined.length });
      }
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveBlock(index, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (cmd && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (line.kind === 'step' && storedLines.length > 0) onCreateAlternative(flowId, line.id.split('#')[0], line.depth === 0);
      return;
    }
    if (event.key === 'ArrowUp' && !event.shiftKey && caretOnEdgeRow(el, 'first')) {
      const target = neighbour(index, -1);
      if (target !== -1) {
        event.preventDefault();
        focusLine(target, el.selectionStart === 0 ? 'end' : el.selectionStart);
      }
      return;
    }
    if (event.key === 'ArrowDown' && !event.shiftKey && caretOnEdgeRow(el, 'last')) {
      const target = neighbour(index, 1);
      if (target !== -1) {
        event.preventDefault();
        focusLine(target, el.selectionStart === el.value.length ? 'end' : el.selectionStart);
      }
    }
  };

  /** A pasted block becomes lines: `4.1.` sets the depth, `•` or `-` makes a bullet. */
  const handlePaste = (index: number, event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\n')) return;
    event.preventDefault();
    const line = lines[index];
    const pasted = text
      .split(/\r?\n/)
      .filter((row) => row.trim().length > 0)
      .map((row) => {
        const bullet = /^(\s*)[•◦▪\-*]\s*(.*)$/.exec(row);
        if (bullet) return newLine({ kind: 'bullet', side: line.side, depth: line.depth + 1 + Math.floor(bullet[1].replace(/\t/g, '  ').length / 4), text: bullet[2] });
        const numbered = /^\s*(\d+(?:\.\d+)*)\.?\s+(.*)$/.exec(row);
        if (numbered) return newLine({ side: line.side, depth: numbered[1].split('.').length - 1, text: numbered[2] });
        return newLine({ side: line.side, depth: line.depth, text: row.trim() });
      });
    if (line.text.trim().length === 0) {
      pasted[0] = { ...pasted[0], id: line.id };
      const next = [...lines.slice(0, index), ...pasted, ...lines.slice(index + 1)];
      commit(next, { id: pasted.at(-1)!.id, index: editableIndex(index + pasted.length - 1), caret: 'end' });
      return;
    }
    const position = blockEnd(lines, index);
    const next = [...lines.slice(0, position), ...pasted, ...lines.slice(position)];
    commit(next, { id: pasted.at(-1)!.id, index: editableIndex(position + pasted.length - 1), caret: 'end' });
  };

  const changeText = (index: number, text: string): void => {
    const line = lines[index];
    if (storedLines.length === 0) {
      commit([{ ...line, text }], { id: line.id, index: 0, caret: text.length });
      return;
    }
    // Typing `- ` at the start of a step turns it into a bullet, like in a doc.
    if (line.kind === 'step' && line.depth > 0 && /^[-•*]\s/.test(text) && blockEnd(lines, index) === index + 1) {
      setLine(index, { kind: 'bullet', text: text.slice(2), refs: [], depth: line.depth + 1 }, { id: line.id, index: editableIndex(index), caret: 0 });
      return;
    }
    const caret = inputs.current.get(line.id)?.selectionStart ?? text.length;
    setLine(index, { text }, { id: line.id, index: editableIndex(index), caret });
  };

  const commitRefs = (index: number, raw: string): void => {
    setRefDraft(null);
    const line = lines[index];
    const refs = parseRefs(raw, line.refs, content);
    if (refs.map((ref) => formatFlowRef(ref, content)).join(', ') === line.refs.map((ref) => formatFlowRef(ref, content)).join(', ')) return;
    setLine(index, { refs });
  };

  return (
    <div className="fl-table" role="table" aria-label={flowId === 'basic' ? 'Camino básico' : 'Camino alternativo'}>
      <div className="fl-head" role="row">
        <span role="columnheader">Actor</span>
        <span role="columnheader">Sistema</span>
        <span role="columnheader">Ref.</span>
      </div>
      {lines.map((line, index) => {
        const isTurnStart = line.kind === 'step' && line.depth === 0;
        const number = line.kind === 'step' ? numbering.stepNumberById.get(line.id) : undefined;
        const isTitle = line.kind === 'step' && (line.depth === 0 || line.side === 'actor');
        const isKeyword = line.kind === 'end' || (line.kind === 'step' && /^(?:SINO\s*$|SI(?![\wÁÉÍÓÚÜÑáéíóúüñ])|[Ss]i\s)/.test(line.text));
        const marker = line.kind === 'bullet'
          ? BULLETS[Math.max(0, line.depth - 1 - (lines.slice(0, index).reverse().find((c) => c.kind === 'step' && c.depth < line.depth)?.depth ?? 0)) % BULLETS.length]
          : number !== undefined ? `${number}.` : '';
        const refText = refDraft?.id === line.id ? refDraft.text : line.refs.map((ref) => formatFlowRef(ref, content)).join(', ');
        const caRefs = line.refs.filter((ref): ref is Extract<FlowRef, { kind: 'ca' }> => ref.kind === 'ca');
        const cell = (
          <div className={`fl-line${isTitle ? ' is-title' : ''}${line.kind === 'bullet' ? ' is-bullet' : ''}`} style={{ paddingLeft: `${line.depth * INDENT}px` }}>
            {boxes[index].map((box) => (
              <span
                aria-hidden="true"
                className={`fl-loop-box${box.start ? ' is-start' : ''}${box.end ? ' is-end' : ''}`}
                key={box.depth}
                style={{ left: `${box.depth * INDENT - 6}px` }}
              />
            ))}
            <span className={`fl-marker${line.kind === 'bullet' ? ' is-bullet' : ''}`}>{marker}</span>
            {line.kind === 'end' ? (
              <span className="fl-end">FINSI</span>
            ) : (
              <FlowRichLineInput
                ariaLabel={`${line.side === 'actor' ? 'Actor' : 'Sistema'}${marker ? ` ${marker}` : ''}`}
                bold={isTitle || isKeyword}
                className="fl-input"
                getSuggestions={(value, position) => buildFlowLineSuggestions(line.side, value, position, {
                  content,
                  flowId,
                  symbolIndex,
                  ownerClassName: line.kind === 'bullet' ? ownerClassOf(lines, index) : undefined,
                  useCaseNames,
                })}
                inputRef={(el) => {
                  if (el) inputs.current.set(line.id, el);
                  else inputs.current.delete(line.id);
                  if (line.kind === 'step') registerLine?.(line.id, el);
                }}
                placeholder={placeholderFor(line)}
                value={line.text}
                vocabulary={vocabulary}
                onChange={(text) => changeText(index, text)}
                onFocusField={(el) => onFocusEditable(el, (token) => {
                  const start = el.selectionStart;
                  const text = `${el.value.slice(0, start)}${token}${el.value.slice(el.selectionEnd)}`;
                  pending.current = { id: line.id, index: editableIndex(index), caret: start + token.length };
                  changeText(index, text);
                })}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
              />
            )}
          </div>
        );
        const anchorId = line.id.split('#')[0];
        return (
          <div
            className={`fl-row${isTurnStart && index > 0 ? ' is-turn' : ''}${highlightedStepId === anchorId ? ' is-highlighted' : ''}`}
            data-step-id={anchorId}
            key={line.id}
            role="row"
          >
            <div className="fl-cell fl-actor" role="cell">{line.side === 'actor' ? cell : null}</div>
            <div className="fl-cell fl-system" role="cell">{line.side === 'system' ? cell : null}</div>
            <div className="fl-cell fl-ref" role="cell">
              {line.kind === 'step' && storedLines.length > 0 ? (
                <>
                  <input
                    aria-label={`Referencia de la línea ${marker}`}
                    className="fl-ref-input"
                    placeholder=""
                    ref={(el) => {
                      if (el) refInputs.current.set(line.id, el);
                      else refInputs.current.delete(line.id);
                    }}
                    spellCheck={false}
                    value={refText}
                    onBlur={(event) => commitRefs(index, event.target.value)}
                    onChange={(event) => setRefDraft({ id: line.id, text: event.target.value })}
                    onFocus={() => setRefDraft({ id: line.id, text: refText })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        event.preventDefault();
                        if (event.key === 'Escape') setRefDraft(null);
                        focusLine(index, 'end');
                      }
                    }}
                  />
                  {caRefs.map((ref) => (
                    <button
                      aria-label={`Ir a ${formatFlowRef(ref, content)}`}
                      className="fl-ref-jump"
                      key={ref.id}
                      tabIndex={-1}
                      title={`Ir a ${formatFlowRef(ref, content)}`}
                      type="button"
                      onClick={() => onJumpToAlternative(ref.flowId)}
                    >
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        );
      })}
      {flowId === 'basic' ? <p className="fl-hints">
        <span><kbd>↵</kbd> línea</span>
        <span><kbd>⇥</kbd> <kbd>⇧⇥</kbd> nivel</span>
        <span><kbd>⌥⇥</kbd> Ref.</span>
        <span><kbd>{shortcutLabel('⌘↵')}</kbd> cambia de turno</span>
        <span><kbd>/</kbd> primitivas</span>
        <span><kbd>{shortcutLabel('⇧⌘A')}</kbd> camino alternativo</span>
        <span><kbd>{shortcutLabel('⌥↑')}</kbd> <kbd>{shortcutLabel('⌥↓')}</kbd> mover</span>
      </p> : null}
    </div>
  );
});
