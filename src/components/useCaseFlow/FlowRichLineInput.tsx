import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  tokenizeFlowInline,
  type FlowInlineToken,
  type FlowVocabulary,
} from '../../utils/flowDocument';
import type { CompletionSuggestion } from '../../types/useCaseFlowEditor';
import { AutoGrowTextarea } from '../AutoGrowTextarea';

const tokenClass: Record<FlowInlineToken['kind'], string | undefined> = {
  plain: undefined,
  class: 'rt-class',
  attribute: 'rt-attribute',
  keyword: 'rt-keyword',
  stepRef: 'rt-step-ref',
  pathRef: 'rt-path-ref',
  literal: 'rt-literal',
};

const renderTokens = (tokens: FlowInlineToken[]): ReactNode[] =>
  tokens.map((token, index) => {
    const className = tokenClass[token.kind];
    return className === undefined
      ? token.text
      : <span className={className} key={index}>{token.text}</span>;
  });

export type FlowRichLineInputProps = {
  ariaLabel: string;
  bold?: boolean;
  className?: string;
  detectKeyword?: boolean;
  getSuggestions?: (value: string, position: number) => CompletionSuggestion[];
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  placeholder?: string;
  value: string;
  vocabulary: FlowVocabulary;
  onChange: (value: string) => void;
  onFocusField?: (el: HTMLTextAreaElement) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSlashBlockCommand?: (commandId: 'loop-por-cada' | 'loop-mientras' | 'conditional') => void;
};

/**
 * Single- or multi-line inline input with live cátedra typography (underlined DC classes,
 * italic attributes, bold keywords) and a keyboard-navigable completion / `/` command menu.
 */
export const FlowRichLineInput = memo(function FlowRichLineInput({
  ariaLabel,
  bold = false,
  className = '',
  detectKeyword = true,
  getSuggestions,
  inputRef,
  placeholder,
  value,
  vocabulary,
  onChange,
  onFocusField,
  onKeyDown,
  onPaste,
  onSlashBlockCommand,
}: FlowRichLineInputProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [suggestions, setSuggestions] = useState<CompletionSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [picked, setPicked] = useState(false);

  const mirror = useMemo(
    () => renderTokens(tokenizeFlowInline(value, vocabulary, detectKeyword)),
    [detectKeyword, value, vocabulary],
  );

  const refreshSuggestions = (nextValue: string, caret: number): void => {
    if (!getSuggestions) {
      setSuggestions([]);
      return;
    }
    const next = getSuggestions(nextValue, caret);
    setSuggestions(next);
    setActiveIndex(0);
    setPicked(false);
  };

  const applySuggestion = (index: number): boolean => {
    const suggestion = suggestions[index];
    const el = localRef.current;
    if (!suggestion || !el) return false;

    if (
      onSlashBlockCommand
      && (suggestion.id === 'slash-sys:loop-por-cada'
        || suggestion.id === 'slash-sys:loop-mientras'
        || suggestion.id === 'slash-sys:conditional')
    ) {
      const cmd = suggestion.id.replace('slash-sys:', '') as 'loop-por-cada' | 'loop-mientras' | 'conditional';
      setSuggestions([]);
      onSlashBlockCommand(cmd);
      return true;
    }

    const insertion = suggestion.apply(el.value, el.selectionStart ?? el.value.length);
    onChange(insertion.value);
    setSuggestions([]);
    window.requestAnimationFrame(() => {
      if (localRef.current) {
        localRef.current.focus();
        localRef.current.setSelectionRange(insertion.caretPosition, insertion.caretPosition);
        refreshSuggestions(insertion.value, insertion.caretPosition);
      }
    });
    return true;
  };

  useEffect(() => {
    if (activeIndex >= suggestions.length && suggestions.length > 0) {
      setActiveIndex(0);
    }
  }, [activeIndex, suggestions.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const cmd = event.metaKey || event.ctrlKey;
    if (suggestions.length > 0 && !cmd) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % suggestions.length);
        setPicked(true);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
        setPicked(true);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggestions([]);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        const suggestion = suggestions[activeIndex];
        const el = event.currentTarget;
        const isCommand = suggestion?.id.startsWith('slash') ?? false;
        const isBlockCommand = suggestion?.id.startsWith('slash-sys:loop') || suggestion?.id === 'slash-sys:conditional';
        // Typing comes first: Enter breaks the line unless the person opened
        // the «/» menu or chose an option with the arrows. Tab completes.
        const accepts = event.key === 'Tab' || isCommand || picked;
        // A suggestion that would leave the text as it is (the word is already
        // typed in full) must not swallow the key either.
        const unchanged = suggestion && !isBlockCommand && suggestion.apply(el.value, el.selectionStart ?? el.value.length).value === el.value;
        if (!suggestion || !accepts || unchanged) {
          setSuggestions([]);
        } else {
          event.preventDefault();
          applySuggestion(activeIndex);
          return;
        }
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className={`ucf-rich-wrap${bold ? ' is-bold' : ''}`}>
      <div aria-hidden="true" className={`ucf-rich-mirror ${className}`}>
        {mirror}
        {value.length === 0 || value.endsWith('\n') ? '\u200b' : null}
      </div>
      <AutoGrowTextarea
        aria-label={ariaLabel}
        className={`ucf-rich-input ${className}`}
        inputRef={(el) => {
          localRef.current = el;
          inputRef?.(el);
        }}
        minRows={1}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
        onBlur={() => {
          window.setTimeout(() => setSuggestions([]), 130);
        }}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          refreshSuggestions(next, event.target.selectionStart ?? next.length);
        }}
        onFocus={(event) => {
          onFocusField?.(event.currentTarget);
          if (event.currentTarget.value.trimStart().startsWith('/')) {
            refreshSuggestions(event.currentTarget.value, event.currentTarget.selectionStart ?? 0);
          }
        }}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
      />
      {suggestions.length > 0 ? (
        <div className="ucf-completion-menu" role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : undefined}
              key={suggestion.id}
              role="option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySuggestion(index)}
            >
              <span className="ucf-completion-main">
                <strong>{suggestion.label}</strong>
                {suggestion.detail ? <small>{suggestion.detail}</small> : null}
              </span>
              {suggestion.badge ? <span className="ucf-completion-badge">{suggestion.badge}</span> : null}
            </button>
          ))}
          {suggestions[0]?.id.startsWith('slash') ? null : <div className="ucf-completion-hint">⇥ completar · ↵ nueva línea</div>}
        </div>
      ) : null}
    </div>
  );
});
