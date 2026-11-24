import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { StateBlock, UseCaseFlowContent } from '../../types/diagram';
import type { CompletionSuggestion } from '../../types/useCaseFlowEditor';
import type { FlowVocabulary } from '../../utils/flowDocument';
import type { ProjectSymbolIndex } from '../../utils/projectSymbolIndex';
import { buildFlowLineSuggestions } from '../../utils/useCaseFlowCompletion';
import {
  changeStateBulletLevel,
  getLineInfo,
  insertStateBulletLine,
  normalizeStateBulletShortcut,
  removeOrPromoteStateBullet,
} from '../../utils/useCaseFlowText';
import { parseStateTextToBlocks } from '../../utils/useCaseFlowModel';
import { stateBlocksToEditorText } from '../../utils/stateText';
import { FlowRichLineInput } from './FlowRichLineInput';

type StateTextEditorProps = {
  ariaLabel: string;
  blocks: StateBlock[];
  content: UseCaseFlowContent;
  mode: 'initial' | 'final';
  placeholder: string;
  symbolIndex: ProjectSymbolIndex;
  vocabulary: FlowVocabulary;
  onChange: (blocks: StateBlock[]) => void;
};

/**
 * Estado Inicial / Final written as text. The text is the source while the
 * field is focused; it is parsed into instance blocks on every change so the
 * review and the exports always see the current state.
 */
export const StateTextEditor = memo(function StateTextEditor({
  ariaLabel,
  blocks,
  content,
  mode,
  placeholder,
  symbolIndex,
  vocabulary,
  onChange,
}: StateTextEditorProps) {
  const [text, setText] = useState(() => stateBlocksToEditorText(blocks));
  const emitted = useRef(JSON.stringify(blocks));
  const focused = useRef(false);
  const el = useRef<HTMLTextAreaElement | null>(null);
  const caret = useRef<number | null>(null);

  // Undo, a paste from Claude or another window: show the new state.
  const incoming = JSON.stringify(blocks);
  if (incoming !== emitted.current && !focused.current) {
    emitted.current = incoming;
    const next = stateBlocksToEditorText(blocks);
    if (next !== text) setText(next);
  }

  useLayoutEffect(() => {
    if (caret.current === null || !el.current) return;
    el.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const update = (value: string, caretPosition?: number): void => {
    setText(value);
    if (caretPosition !== undefined) caret.current = caretPosition;
    const parsed = parseStateTextToBlocks(value, mode);
    emitted.current = JSON.stringify(parsed);
    onChange(parsed);
  };

  const caretAt = (value: string, lineIndex: number, markerLength: number): number =>
    value.split('\n').slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0) + markerLength;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const target = event.currentTarget;
    const position = target.selectionStart;
    if (target.selectionStart !== target.selectionEnd) return;

    if (event.key === 'Backspace') {
      const result = removeOrPromoteStateBullet(target.value, position);
      if (result) {
        event.preventDefault();
        update(result.value, caretAt(result.value, result.lineIndex, result.markerLength));
      }
      return;
    }
    if (event.key === 'Tab') {
      const result = changeStateBulletLevel(target.value, position, event.shiftKey ? -1 : 1);
      if (result) {
        event.preventDefault();
        update(result.value, caretAt(result.value, result.lineIndex, result.markerLength));
      }
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const result = insertStateBulletLine(target.value, position);
      update(result.value, caretAt(result.value, result.lineIndex, result.markerLength));
    }
  };

  // Completion works on the line under the caret: classes after «Instancia de», attributes in bullets.
  const getSuggestions = (value: string, position: number): CompletionSuggestion[] => {
    const { lineIndex, lineStart, lineColumn, lines } = getLineInfo(value, position);
    const line = lines[lineIndex] ?? '';
    let owner: string | undefined;
    for (let cursor = lineIndex; cursor >= 0; cursor -= 1) {
      owner = /^\s*instancias?(?:\/s)?\s+(?:de\s+)?([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/i.exec(lines[cursor] ?? '')?.[1];
      if (owner) break;
    }
    const marker = /^\s*(?:[•◦▪]\s?)?/.exec(line)?.[0] ?? '';
    const body = line.slice(marker.length);
    if (lineColumn < marker.length) return [];
    return buildFlowLineSuggestions('system', body, lineColumn - marker.length, {
      content,
      flowId: 'basic',
      symbolIndex,
      ownerClassName: owner,
    })
      .filter((suggestion) => !suggestion.id.startsWith('slash'))
      .map((suggestion) => ({
        ...suggestion,
        apply: (full: string) => {
          const inner = suggestion.apply(body, lineColumn - marker.length);
          const start = lineStart + marker.length;
          return {
            value: `${full.slice(0, start)}${inner.value}${full.slice(start + body.length)}`,
            caretPosition: start + inner.caretPosition,
          };
        },
      }));
  };

  return (
    <div
      className="ucf-state-text"
      onBlur={() => { focused.current = false; }}
      onFocus={() => { focused.current = true; }}
    >
      <FlowRichLineInput
        ariaLabel={ariaLabel}
        className="ucf-state-input"
        detectKeyword={false}
        getSuggestions={getSuggestions}
        inputRef={(node) => { el.current = node; }}
        placeholder={placeholder}
        value={text}
        vocabulary={vocabulary}
        onChange={(value) => {
          const position = el.current?.selectionStart ?? value.length;
          const normalized = normalizeStateBulletShortcut(value, position);
          if (normalized) update(normalized.value, normalized.caretPosition);
          else update(value);
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
});
