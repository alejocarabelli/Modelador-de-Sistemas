import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ComponentProps } from 'react';
import { runtime, createMemoryStorage } from '../hooks/testHookHarness';
import { SequenceDiagramEditor } from './SequenceDiagramEditor';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceMessageDialog } from './SequenceMessageDialog';
import type { QuickMessageDraft } from '../utils/sequenceMessageDialogCompatibility';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from '../utils/sequenceDiagram';
import { buildSequenceLayout } from '../utils/sequenceDiagramLayout';
import { themes } from '../theme/themes';
import type { DesignProject, SequenceDiagramArtifact } from '../types/diagram';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});
const dialogs = vi.hoisted(() => ({ confirm: vi.fn(async () => false), notify: vi.fn() }));
vi.mock('../hooks/useDialogs', () => ({ useDialogs: () => dialogs }));

type TestElement = ReactElement<Record<string, unknown>>;
const elements = (node: unknown): TestElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(elements)];
};
const find = (tree: unknown, predicate: (node: TestElement) => boolean): TestElement => {
  const node = elements(tree).find(predicate);
  if (!node) throw new Error('Element not found');
  return node;
};
const text = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<{ children?: unknown }>(node)) return text(node.props.children);
  return '';
};

class TestElementTarget {
  closest() { return null; }
}
let modal: object | null;
let listeners: Map<string, Set<(event: KeyboardEvent) => void>>;
let artifact: SequenceDiagramArtifact;
let project: DesignProject;
let sequenceId = 0;
const onChangeContent = vi.fn();
const renderEditor = () => {
  runtime.begin();
  return SequenceDiagramEditor({
    artifact, project, theme: themes[0], canUndo: false, canRedo: false,
    onChangeContent, onUndo: vi.fn(), onRedo: vi.fn(),
  });
};
const composerState = (tree: unknown) => find(tree, (node) => node.type === SequenceKeyboardComposer).props.state;
const select = (tree: unknown, selection: { kind: string; id: string }) =>
  (find(tree, (node) => node.type === SequenceDiagramCanvas).props.onSelect as (value: typeof selection) => void)(selection);
const keyEvent = (key: string, extra: Record<string, unknown> = {}) => {
  const event = {
  key, target: new TestElementTarget(), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  defaultPrevented: false,
  preventDefault: () => { event.defaultPrevented = true; },
  stopPropagation: vi.fn(),
  ...extra,
  };
  return event as unknown as KeyboardEvent;
};
const press = (key: string, extra: Record<string, unknown> = {}) => {
  const event = keyEvent(key, extra);
  for (const listener of [...(listeners.get('keydown') ?? [])]) listener(event);
  return event;
};

beforeEach(() => {
  runtime.reset();
  vi.useFakeTimers();
  vi.clearAllMocks();
  dialogs.confirm.mockResolvedValue(false);
  modal = null;
  listeners = new Map();
  const body = new TestElementTarget();
  vi.stubGlobal('Element', TestElementTarget);
  vi.stubGlobal('HTMLElement', TestElementTarget);
  vi.stubGlobal('document', { body, activeElement: body, querySelector: () => modal, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', {
    localStorage: createMemoryStorage(),
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    setTimeout, clearTimeout, requestAnimationFrame: vi.fn(),
    addEventListener: (name: string, listener: (event: KeyboardEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: (event: KeyboardEvent) => void) => listeners.get(name)?.delete(listener),
  });
  const content = {
    ...createEmptySequenceDiagramContent(),
    participants: [
      { id: 'a', kind: 'object' as const, name: 'A', classifierName: '', x: 180 },
      { id: 'b', kind: 'object' as const, name: 'B', classifierName: '', x: 460 },
    ],
    items: [{ ...createSequenceMessage('synchronous', 'a', 'b'), id: 'call', name: 'buscar' }],
  };
  artifact = { id: `sequence-${++sequenceId}`, type: 'sequence-diagram', name: 'Secuencia', createdAt: 'now', updatedAt: 'now', content };
  project = { id: 'project', name: 'Proyecto', createdAt: 'now', updatedAt: 'now', activeArtifactId: artifact.id, artifacts: [artifact] };
});
afterEach(() => {
  runtime.reset();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sequence editor keyboard isolation', () => {
  it.each(['ctrlKey', 'metaKey', 'altKey'])('keeps single-letter commands inert with %s in navigation and aiming', (modifier) => {
    renderEditor();
    press('m');
    let tree = renderEditor();
    for (const stage of ['navigate', 'aim']) {
      for (const key of ['m', 's', 'r', 'c', 'd', 'f', 'p', 'e', 'g', 'k']) {
        const state = composerState(tree);
        press(key, { [modifier]: true });
        tree = renderEditor();
        expect(composerState(tree)).toEqual(state);
      }
      expect(composerState(tree)).toMatchObject({ stage });
      if (stage === 'navigate') { press('Enter'); tree = renderEditor(); }
    }
  });

  it.each(['modal', 'prevented'])('blocks creation, duplication, copying, movement and deletion for %s events', (reason) => {
    let tree = renderEditor();
    select(tree, { kind: 'message', id: 'call' });
    renderEditor();
    const extra = reason === 'prevented' ? { defaultPrevented: true } : {};
    if (reason === 'modal') modal = {};
    for (const [key, modifiers] of [
      ['m', {}], ['n', {}], ['d', { ctrlKey: true }], ['c', { metaKey: true }],
      ['v', { metaKey: true }], ['ArrowDown', { altKey: true }], ['Delete', {}], ['Backspace', {}],
    ] as const) press(key, { ...modifiers, ...extra });
    tree = renderEditor();
    expect(elements(tree).some((node) => node.type === SequenceKeyboardComposer)).toBe(false);
    expect(onChangeContent).not.toHaveBeenCalled();
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it.each(['modal', 'prevented'])('keeps an active keyboard draft unchanged for %s Enter and Escape', (reason) => {
    renderEditor(); press('m'); renderEditor(); press('Enter');
    const before = composerState(renderEditor());
    if (reason === 'modal') modal = {};
    const extra = reason === 'prevented' ? { defaultPrevented: true } : {};
    press('Enter', extra); press('Escape', extra);
    expect(composerState(renderEditor())).toEqual(before);
    expect(onChangeContent).not.toHaveBeenCalled();
  });

  it('keeps ordinary editor shortcuts working and shows consistent exit guidance', () => {
    let tree = renderEditor(); select(tree, { kind: 'message', id: 'call' }); renderEditor();
    press('d', { ctrlKey: true });
    expect(onChangeContent).toHaveBeenCalledOnce();
    press('m'); tree = renderEditor();
    expect(text(tree)).toContain('MODO TECLADO');
    expect(find(tree, (node) => node.props.className === 'sequence-keyboard-exit-pill').props.title).toBe('Salir del modo teclado (M)');
    press('Enter'); expect(composerState(renderEditor())).toMatchObject({ stage: 'aim' });
    press('Escape'); expect(composerState(renderEditor())).toMatchObject({ stage: 'navigate' });
    press('m'); tree = renderEditor();
    expect(text(tree)).toContain('Modo teclado desactivado.');
    expect(elements(tree).some((node) => node.type === SequenceKeyboardComposer)).toBe(false);
  });
});

describe('fragment inspector message counts', () => {
  it.each([0, 1, 2])('counts %i nested messages and excludes subfragments', (count) => {
    const nested = createSequenceFragment('opt');
    nested.operands[0].items = Array.from({ length: count }, (_, index) => ({ ...createSequenceMessage('synchronous', 'a', 'b'), id: `nested-${index}`, name: 'buscar' }));
    const outer = createSequenceFragment('alt'); outer.operands[0].items = [nested];
    artifact = { ...artifact, content: { ...artifact.content, items: [outer] } };
    let tree = renderEditor(); select(tree, { kind: 'fragment', id: outer.id }); tree = renderEditor();
    expect(text(tree)).toContain('Ramas y mensajes');
    expect(text(find(tree, (node) => node.props.className === 'sequence-counter-badge'))).toBe(`${count} ${count === 1 ? 'mensaje' : 'mensajes'}`);
    expect(text(find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('sequence-tab-counter')))).toBe(String(count));
  });
});

describe('focused sequence notes', () => {
  const renderNote = (interactive = true) => {
    const content = { ...artifact.content, notes: [{ id: 'note', text: 'Trabajo', x: 200, y: 220, width: 200, height: 80, anchorKind: 'free' as const }] };
    const onSelect = vi.fn(); const onEditNote = vi.fn();
    runtime.begin();
    const canvas = (SequenceDiagramCanvas as unknown as { type: (props: ComponentProps<typeof SequenceDiagramCanvas>) => ReactElement }).type;
    const tree = canvas({ content, layout: buildSequenceLayout(content), theme: themes[0], selected: null, interactive, onSelect, onEditNote, onParticipantPointerDown: vi.fn(), onNotePointerDown: vi.fn(), onNoteResizePointerDown: vi.fn() });
    const note = find(tree, (node) => typeof node.props.className === 'string' && node.props.className.startsWith('sequence-note '));
    return { handler: note.props.onKeyDown as (event: KeyboardEvent) => void, onSelect, onEditNote };
  };
  it('selects and edits a note with Enter, and only selects with Space', () => {
    const { handler, onSelect, onEditNote } = renderNote();
    handler(keyEvent(' ')); expect(onSelect).toHaveBeenCalledWith({ kind: 'note', id: 'note' }); expect(onEditNote).not.toHaveBeenCalled();
    handler(keyEvent('Enter')); expect(onEditNote).toHaveBeenCalledWith('note');
  });
  it.each(['modal', 'prevented', 'readonly'])('does not edit a focused note for %s input', (reason) => {
    const { handler, onSelect, onEditNote } = renderNote(reason !== 'readonly');
    if (reason === 'modal') modal = {};
    handler(keyEvent('Enter', { defaultPrevented: reason === 'prevented' }));
    expect(onSelect).not.toHaveBeenCalled(); expect(onEditNote).not.toHaveBeenCalled();
  });
});


describe('sequence creation feedback', () => {
  it('guides a failed creation edit to the visible message controls', () => {
    artifact = { ...artifact, content: { ...artifact.content, items: [
      ...artifact.content.items,
      { ...createSequenceMessage('synchronous', 'a', 'b'), id: 'second', name: 'continuar' },
    ] } };
    let tree = renderEditor();
    const canvas = find(tree, (node) => node.type === SequenceDiagramCanvas);
    (canvas.props.onEditMessage as (id: string) => void)('second');
    tree = renderEditor();
    const dialog = find(tree, (node) => node.type === SequenceMessageDialog);
    const draft = dialog.props.draft as QuickMessageDraft;
    (dialog.props.onSubmit as (event: { preventDefault: () => void }, draft: QuickMessageDraft) => void)(
      { preventDefault: vi.fn() }, { ...draft, type: 'create' },
    );
    expect(text(renderEditor())).toContain('Agregá un mensaje de tipo «Crear» con «Objeto nuevo».');
    expect(text(renderEditor())).not.toContain('botón create()');
    expect(onChangeContent).not.toHaveBeenCalled();
  });
});

describe('keyboard first message', () => {
  const emptyDiagram = () => {
    const content = {
      ...createEmptySequenceDiagramContent(),
      participants: [
        { id: 'sys', kind: 'object' as const, name: 'Sistema', classifierName: '', x: 180 },
        { id: 'user', kind: 'actor' as const, name: 'Usuario', classifierName: '', x: 460 },
      ],
      items: [],
    };
    artifact = { ...artifact, content };
  };

  it('proposes the actor as the origin of the first message even when another participant is selected', () => {
    emptyDiagram();
    let tree = renderEditor(); select(tree, { kind: 'participant', id: 'sys' }); renderEditor();
    press('m'); renderEditor();
    press('Enter'); tree = renderEditor();
    expect(composerState(tree)).toMatchObject({ stage: 'aim', sourceId: 'user', targetId: 'sys' });
  });

  it('keeps the selected participant once the diagram has messages', () => {
    let tree = renderEditor(); select(tree, { kind: 'participant', id: 'b' }); renderEditor();
    press('m'); renderEditor();
    press('Enter'); tree = renderEditor();
    expect(composerState(tree)).toMatchObject({ stage: 'aim', sourceId: 'b' });
  });
});

describe('keyboard fragment creation', () => {
  const threeLifelines = () => {
    const content = {
      ...createEmptySequenceDiagramContent(),
      participants: [
        { id: 'a', kind: 'object' as const, name: 'A', classifierName: '', x: 180 },
        { id: 'b', kind: 'object' as const, name: 'B', classifierName: '', x: 460 },
        { id: 'c', kind: 'object' as const, name: 'C', classifierName: '', x: 740 },
      ],
      items: [{ ...createSequenceMessage('synchronous', 'a', 'b'), id: 'call', name: 'buscar' }],
    };
    artifact = { ...artifact, content };
  };
  const lastContent = () => onChangeContent.mock.calls.at(-1)![0] as typeof artifact.content;
  const inlineInput = (tree: unknown) => find(tree, (node) => node.props.className === 'sequence-inline-input');
  const createFragment = (participantId: string) => {
    const tree = renderEditor(); select(tree, { kind: 'participant', id: participantId }); renderEditor();
    press('m'); renderEditor();
    press('f'); renderEditor();
    press('Enter');
    return renderEditor();
  };

  it('starts a new empty fragment at the selected lifeline with a left margin', () => {
    threeLifelines();
    createFragment('b');
    const content = lastContent();
    const fragment = content.items.find((item) => item.kind === 'fragment')!;
    const layout = buildSequenceLayout(content);
    const box = layout.fragmentLayouts.get(fragment.id)!;
    const lifelineX = layout.participantX.get('b')!;
    expect(box.x).toBeLessThan(lifelineX);
    expect(lifelineX - box.x).toBeLessThanOrEqual(100);
    expect(box.x).toBeGreaterThan(layout.participantX.get('a')!);
  });

  it('starts a fragment wrapping selected messages at the leftmost involved lifeline', () => {
    threeLifelines();
    artifact = { ...artifact, content: { ...artifact.content, items: [
      { ...createSequenceMessage('synchronous', 'b', 'c'), id: 'm1', name: 'uno' },
      { ...createSequenceMessage('synchronous', 'c', 'b'), id: 'm2', name: 'dos' },
    ] } };
    const tree = renderEditor();
    (find(tree, (node) => node.type === SequenceDiagramCanvas).props.onMarqueeSelect as (ids: string[], notes: string[]) => void)(['m1', 'm2'], []);
    renderEditor(); press('m'); renderEditor(); press('f'); renderEditor(); press('Enter'); renderEditor();
    const content = lastContent();
    const fragment = content.items.find((item) => item.kind === 'fragment')!;
    const layout = buildSequenceLayout(content);
    const box = layout.fragmentLayouts.get(fragment.id)!;
    expect(box.x).toBeGreaterThan(layout.participantX.get('a')!);
    expect(layout.participantX.get('b')! - box.x).toBeLessThanOrEqual(100);
    expect(box.x + box.width).toBeGreaterThan(layout.participantX.get('c')!);
  });

  it('opens the guard of the first branch for an alt and Enter keeps the typed text', () => {
    threeLifelines();
    createFragment('a');
    artifact = { ...artifact, content: lastContent() };
    let tree = renderEditor();
    const input = inlineInput(tree);
    expect(input.props.value).toBe('condición');
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hay stock' } });
    tree = renderEditor();
    onChangeContent.mockClear();
    (inlineInput(tree).props.onKeyDown as (event: KeyboardEvent) => void)(keyEvent('Enter'));
    const fragment = lastContent().items.find((item) => item.kind === 'fragment')!;
    expect(fragment.kind === 'fragment' && fragment.operands[0].guard).toBe('hay stock');
    expect(elements(renderEditor()).some((node) => node.props.className === 'sequence-inline-input')).toBe(false);
  });

  it('opens the tab name of a loop and Enter saves it as the fragment name', () => {
    threeLifelines();
    let tree = renderEditor(); select(tree, { kind: 'participant', id: 'a' }); renderEditor();
    press('m'); renderEditor(); press('f'); tree = renderEditor();
    const picker = composerState(tree);
    expect(picker).toMatchObject({ stage: 'fragment' });
    for (let guard = 0; guard < 6 && (composerState(tree) as { fragmentOperator: string }).fragmentOperator !== 'loop'; guard += 1) { press('ArrowDown'); tree = renderEditor(); }
    press('Enter'); renderEditor();
    artifact = { ...artifact, content: lastContent() };
    tree = renderEditor();
    const input = inlineInput(tree);
    expect(input.props.value).toBe('');
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'cada pedido' } });
    tree = renderEditor();
    onChangeContent.mockClear();
    (inlineInput(tree).props.onKeyDown as (event: KeyboardEvent) => void)(keyEvent('Enter'));
    expect(lastContent().items.find((item) => item.kind === 'fragment')).toMatchObject({ operator: 'loop', name: 'cada pedido' });
  });

  const wrapExistingFragment = (operator: 'loop' | 'alt') => {
    threeLifelines();
    const inner = { ...createSequenceMessage('synchronous', 'a', 'b'), id: 'inner', name: 'buscar' };
    const loop = { ...createSequenceFragment('loop'), id: 'existing', operands: [{ ...createSequenceFragment('loop').operands[0], items: [inner] }] };
    artifact = { ...artifact, content: { ...artifact.content, items: [loop] } };
    const first = renderEditor(); select(first, { kind: 'fragment', id: 'existing' }); renderEditor();
    press('m'); renderEditor(); press('f'); let tree = renderEditor();
    for (let guard = 0; guard < 6 && (composerState(tree) as { fragmentOperator: string }).fragmentOperator !== operator; guard += 1) { press('ArrowDown'); tree = renderEditor(); }
    press('Enter');
    return renderEditor();
  };

  it('opens the tab name when a new loop wraps an existing fragment', () => {
    const tree = wrapExistingFragment('loop');
    const outer = lastContent().items[0];
    expect(outer).toMatchObject({ kind: 'fragment', operator: 'loop' });
    expect(outer.id).not.toBe('existing');
    expect(inlineInput(tree)?.props.value).toBe('');
  });

  it('opens the guard of the first branch when a new alt wraps an existing fragment', () => {
    const tree = wrapExistingFragment('alt');
    expect(lastContent().items[0]).toMatchObject({ kind: 'fragment', operator: 'alt' });
    expect(inlineInput(tree)?.props.value).toBe('condición');
  });

  it('Esc leaves the fragment with its default name and closes the editor', () => {
    threeLifelines();
    createFragment('a');
    artifact = { ...artifact, content: lastContent() };
    let tree = renderEditor();
    onChangeContent.mockClear();
    (inlineInput(tree).props.onKeyDown as (event: KeyboardEvent) => void)(keyEvent('Escape'));
    tree = renderEditor();
    expect(elements(tree).some((node) => node.props.className === 'sequence-inline-input')).toBe(false);
    expect(onChangeContent).not.toHaveBeenCalled();
    expect(artifact.content.items.find((item) => item.kind === 'fragment')).toMatchObject({ name: '' });
  });

  it('does not treat typed letters as shortcuts while the name is edited', () => {
    threeLifelines();
    createFragment('a');
    artifact = { ...artifact, content: lastContent() };
    onChangeContent.mockClear();
    for (const key of ['m', 'f', 'p', 'r', 's', 'n', 'Enter']) press(key);
    const tree = renderEditor();
    expect(onChangeContent).not.toHaveBeenCalled();
    expect(elements(tree).some((node) => node.props.className === 'sequence-inline-input')).toBe(true);
  });

  it('hides the keyboard composer so it does not cover the name editor', () => {
    threeLifelines();
    const tree = createFragment('a');
    expect(elements(tree).some((node) => node.props.className === 'sequence-inline-input')).toBe(true);
    expect(elements(tree).some((node) => node.type === SequenceKeyboardComposer)).toBe(false);
  });

  const pickLoopAndCreate = () => {
    press('f'); let tree = renderEditor();
    for (let guard = 0; guard < 6 && (composerState(tree) as { fragmentOperator: string }).fragmentOperator !== 'loop'; guard += 1) { press('ArrowDown'); tree = renderEditor(); }
    press('Enter');
    return renderEditor();
  };

  it('does not pull the message just typed into a new loop', () => {
    threeLifelines();
    select(renderEditor(), { kind: 'participant', id: 'a' }); renderEditor();
    press('m'); renderEditor(); press('Enter'); renderEditor(); press('Enter');
    const composer = () => find(renderEditor(), (node) => node.type === SequenceKeyboardComposer).props;
    expect(composerState(renderEditor())).toMatchObject({ stage: 'typing' });
    (composer().onTextChange as (text: string) => void)('pagar');
    (composer().onSubmit as (addReturn: boolean) => void)(false);
    artifact = { ...artifact, content: lastContent() };
    renderEditor();
    const typed = lastContent().items.at(-1)!;
    expect(typed).toMatchObject({ kind: 'message' });
    pickLoopAndCreate();
    const items = lastContent().items;
    expect(items.map((item) => item.kind)).toEqual(['message', 'message', 'fragment']);
    expect(items[1].id).toBe(typed.id);
    expect(items[2]).toMatchObject({ operator: 'loop', operands: [{ items: [] }] });
  });

  it('does not pull the message under the cursor into a new loop', () => {
    threeLifelines();
    renderEditor(); press('m'); renderEditor();
    press('ArrowUp'); renderEditor(); press('ArrowDown'); renderEditor();
    pickLoopAndCreate();
    const items = lastContent().items;
    expect(items[0].id).toBe('call');
    expect(items[1]).toMatchObject({ kind: 'fragment', operator: 'loop', operands: [{ items: [] }] });
  });

  it('wraps exactly the messages crossed with Shift', () => {
    threeLifelines();
    artifact = { ...artifact, content: { ...artifact.content, items: [
      { ...createSequenceMessage('synchronous', 'a', 'b'), id: 'm1', name: 'uno' },
      { ...createSequenceMessage('synchronous', 'b', 'c'), id: 'm2', name: 'dos' },
      { ...createSequenceMessage('synchronous', 'c', 'a'), id: 'm3', name: 'tres' },
    ] } };
    renderEditor(); press('m'); renderEditor();
    press('ArrowUp'); renderEditor(); press('ArrowDown'); renderEditor();
    press('ArrowUp', { shiftKey: true }); renderEditor();
    press('ArrowUp', { shiftKey: true }); renderEditor();
    pickLoopAndCreate();
    const items = lastContent().items;
    expect(items[0].id).toBe('m1');
    expect(items[1]).toMatchObject({ kind: 'fragment', operator: 'loop' });
    expect(items[1].kind === 'fragment' && items[1].operands[0].items.map((item) => item.id)).toEqual(['m2', 'm3']);
  });
});

describe('message type choice by letter', () => {
  const aimFrom = (participantId: string) => {
    artifact = { ...artifact, content: { ...createEmptySequenceDiagramContent(), participants: [
      { id: 'a', kind: 'object' as const, name: 'A', classifierName: '', x: 180 },
      { id: 'b', kind: 'object' as const, name: 'B', classifierName: '', x: 460 },
    ], items: [{ ...createSequenceMessage('synchronous', 'a', 'b'), id: 'call', name: 'buscar' }] } };
    let tree = renderEditor(); select(tree, { kind: 'participant', id: participantId }); renderEditor();
    press('m'); renderEditor(); press('Enter'); tree = renderEditor();
    return tree;
  };
  const typeOf = () => (composerState(renderEditor()) as { messageType: string }).messageType;

  it('does not change the type with the vertical arrows', () => {
    aimFrom('b');
    expect(typeOf()).toBe('synchronous');
    press('ArrowDown'); expect(typeOf()).toBe('synchronous');
    press('ArrowUp'); expect(typeOf()).toBe('synchronous');
  });

  it('changes the type with S R C D', () => {
    aimFrom('b');
    press('c'); expect(typeOf()).toBe('create');
    press('r'); expect(typeOf()).toBe('return');
    press('d'); expect(typeOf()).toBe('destroy');
    press('s'); expect(typeOf()).toBe('synchronous');
  });

  it('keeps the type when R has no call to answer', () => {
    aimFrom('a');
    press('r'); expect(typeOf()).toBe('synchronous');
  });
});
