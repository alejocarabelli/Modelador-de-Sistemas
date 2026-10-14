import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssociationRelationType, ClassDiagramEdge, ClassDiagramNode, DiagramContent } from '../types/diagram';
import type { ClassKeyboardImportItem } from '../utils/classKeyboardMode';
import { runtime } from './testHookHarness';
import { useClassKeyboardMode, type ClassKeyboardImport } from './useClassKeyboardMode';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('./testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});

class TestElement extends EventTarget {
  constructor(private readonly selectors: string[] = []) { super(); }
  closest(selector: string) { return this.selectors.some((candidate) => selector.includes(candidate)) ? this : null; }
}
const composerField = new TestElement(['input', '.class-keyboard-popover']);
const inspectorField = new TestElement(['input']);

const classNode = (id: string, name: string, x: number, y: number): ClassDiagramNode => ({
  id, type: 'classNode', position: { x, y }, data: { name, attributes: [], methods: [] },
});

let nodes: ClassDiagramNode[];
let edges: ClassDiagramEdge[];
let selectedNodeId: string | null;
let relationType: AssociationRelationType;
let keyboardImport: ClassKeyboardImport | undefined;
let listeners: Set<(event: KeyboardEvent) => void>;
const showFeedback = vi.fn();
const hookUnderTest = useClassKeyboardMode;

const render = () => {
  runtime.begin();
  return hookUnderTest({
    nodes,
    edges,
    nodeSizes: Object.fromEntries(nodes.map((node) => [node.id, { width: 240, height: 150 }])),
    reactFlowInstance: null,
    canvasRef: { current: { focus: vi.fn(), contains: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800 }) } as unknown as HTMLDivElement },
    editorRootRef: { current: { contains: () => true } as unknown as HTMLElement },
    selectedNodeId,
    relationType,
    lineStyle: 'straight',
    keyboardImport,
    onChangeContent: (content: DiagramContent) => {
      nodes = content.nodes as ClassDiagramNode[];
      edges = content.edges as ClassDiagramEdge[];
    },
    selectClass: (id) => { selectedNodeId = id; },
    chooseRelationType: (type) => { relationType = type; },
    showFeedback,
    defaultClassPosition: () => ({ x: 0, y: 0 }),
  });
};

const press = (key: string, extra: Partial<KeyboardEvent> & { target?: unknown } = {}) => {
  const event = {
    key, target: new TestElement(), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; },
    stopPropagation: vi.fn(),
    ...extra,
  };
  for (const listener of [...listeners]) listener(event as unknown as KeyboardEvent);
  return render();
};
const type = (mode: ReturnType<typeof render>, text: string) => {
  mode.overlayProps.onTextChange(text);
  return render();
};
const typeKey = (key: string, extra: Partial<KeyboardEvent> = {}) => press(key, { target: composerField, ...extra });

beforeEach(() => {
  runtime.reset();
  vi.clearAllMocks();
  nodes = [classNode('tramite', 'Tramite', 0, 0), classNode('estado', 'Estado', 500, 0), classNode('consultor', 'Consultor', 0, 400)];
  edges = [];
  selectedNodeId = null;
  relationType = 'association';
  keyboardImport = undefined;
  listeners = new Set();
  const body = new TestElement();
  vi.stubGlobal('Element', TestElement);
  vi.stubGlobal('HTMLElement', TestElement);
  vi.stubGlobal('document', {
    body,
    activeElement: body,
    querySelector: () => null,
    addEventListener: (_: string, listener: (event: KeyboardEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: KeyboardEvent) => void) => listeners.delete(listener),
  });
  vi.stubGlobal('window', { requestAnimationFrame: (callback: () => void) => callback() });
});

afterEach(() => {
  runtime.reset();
  vi.unstubAllGlobals();
});

describe('class keyboard mode', () => {
  it('turns on with M on the class nearest the view and walks with the arrows', () => {
    render();
    let mode = press('m');
    expect(mode.stage).toBe('navigate');
    expect(selectedNodeId).toBe('tramite');
    mode = press('ArrowRight');
    expect(selectedNodeId).toBe('estado');
    expect(mode.overlayProps.cursor?.name).toBe('Estado');
    press('ArrowDown');
    expect(selectedNodeId).toBe('consultor');
    expect(press('m').stage).toBe('off');
  });

  it('adds attributes and operations one after the other until Enter on an empty field', () => {
    render();
    press('m');
    let mode = press('a');
    expect(mode.stage).toBe('attribute');
    mode = type(mode, 'fecha: Da');
    expect(mode.overlayProps.suggestions.map((suggestion) => suggestion.title)).toEqual(['Date', 'DateTime']);
    typeKey('Tab');
    type(typeKey('Enter'), 'nro: int');
    mode = typeKey('Enter');
    expect(nodes[0].data.attributes).toMatchObject([{ name: 'fecha', type: 'Date' }, { name: 'nro', type: 'int' }]);
    expect(mode.stage).toBe('attribute');
    expect(typeKey('Enter').stage).toBe('navigate');

    type(press('o'), 'cerrar(fecha: Date): void');
    typeKey('Enter');
    expect(nodes[0].data.methods).toMatchObject([{ visibility: '+', name: 'cerrar', parameters: 'fecha: Date', returnType: 'void' }]);
  });

  it('creates the relation chosen in the toolbar and moves to its target, or stays with ⌥ Enter', () => {
    relationType = 'dependency';
    render();
    press('m');
    let mode = press('r');
    expect(mode.stage).toBe('relation');
    expect(mode.overlayProps.target?.name).toBe('Estado');
    mode = press('ArrowDown');
    expect(mode.overlayProps.target?.name).toBe('Consultor');
    mode = press('Enter');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'tramite', target: 'consultor', data: { relationType: 'dependency' } });
    expect(mode.stage).toBe('navigate');
    expect(selectedNodeId).toBe('consultor');

    press('ArrowUp');
    mode = press('Enter');
    expect(mode.overlayProps.target?.name).toBe('Consultor');
    press('ArrowRight');
    press('Enter', { altKey: true });
    expect(edges[1]).toMatchObject({ source: 'tramite', target: 'estado' });
    expect(selectedNodeId).toBe('tramite');
  });

  it('leaves 1 to 6 to the toolbar, so the mode and the Relación menu share one relation', () => {
    render();
    press('m');
    for (const stage of ['navigate', 'relation']) {
      const event = { key: '5', target: new TestElement(), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      for (const listener of [...listeners]) listener(event as unknown as KeyboardEvent);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(render().stage).toBe(stage);
      press('r');
    }
  });

  it('names multiplicities and the relation in the details step', () => {
    render();
    press('m');
    press('r');
    let mode = press('Tab');
    expect(mode.stage).toBe('details');
    typeKey('ArrowDown');
    typeKey('Tab');
    mode = render();
    mode.overlayProps.onDetailsChange('name', 'historial');
    render();
    typeKey('Tab');
    typeKey('ArrowDown');
    typeKey('ArrowDown');
    typeKey('ArrowDown');
    typeKey('Enter');
    expect(edges[0].data).toMatchObject({ name: 'historial', sourceMultiplicity: '1', targetMultiplicity: '*' });
  });

  it('creates a class beside the cursor and goes on with its attributes', () => {
    render();
    press('m');
    press('n');
    let mode = press('ArrowDown', { target: composerField });
    expect(mode.overlayProps.state.side).toBe('down');
    mode = type(mode, 'Historial');
    expect(mode.overlayProps.ghost?.y).toBeGreaterThan(150);
    mode = typeKey('Enter');
    const created = nodes.find((node) => node.data.name === 'Historial');
    expect(created?.position.y).toBeGreaterThan(150);
    expect(mode.stage).toBe('attribute');
    expect(selectedNodeId).toBe(created?.id);
  });

  it('finds the target by name, or creates it when it does not exist', () => {
    render();
    press('m');
    press('r');
    let mode = press('/');
    mode = type(mode, 'Pago');
    expect(mode.overlayProps.suggestions).toMatchObject([{ title: 'Crear «Pago» y relacionar', create: true }]);
    mode = typeKey('Enter');
    expect(mode.stage).toBe('relation');
    expect(mode.overlayProps.target?.name).toBe('Pago');
    press('Enter');
    expect(edges[0]).toMatchObject({ source: 'tramite', target: nodes[3].id });
  });

  it('walks what the sequences ask for with T: classes first, then the relations their messages need', () => {
    const items: ClassKeyboardImportItem[] = [
      { key: 'class:gestor', kind: 'class', className: 'Gestor', noveltyKeys: ['class:gestor', 'method:gestor:buscar'], members: ['buscar()'] },
      { key: 'relation:estado:consultor', kind: 'relation', sourceClassName: 'Estado', targetClassName: 'Consultor', message: 'avisar()' },
    ];
    const onImportClass = vi.fn();
    keyboardImport = { items, onImportClass };
    render();
    press('m');
    let mode = press('t');
    expect(mode.stage).toBe('import');
    press('Enter');
    expect(onImportClass).toHaveBeenCalledWith(['class:gestor', 'method:gestor:buscar']);
    // The imported class leaves the list: the next item is the relation.
    keyboardImport = { items: [items[1]], onImportClass };
    render();
    // Effects run inside the render here, so the next one shows what they set.
    mode = render();
    expect(mode.overlayProps.state.importIndex).toBe(0);
    expect(selectedNodeId).toBe('estado');
    expect(mode.overlayProps.target?.name).toBe('Consultor');

    const digit = { key: '1', target: new TestElement(), ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    for (const listener of [...listeners]) listener(digit as unknown as KeyboardEvent);
    expect(digit.stopPropagation).toHaveBeenCalled();
    expect(render().overlayProps.state.importRelationType).toBe('association');
    expect(relationType).toBe('association');
    press('Enter');
    expect(edges[0]).toMatchObject({ source: 'estado', target: 'consultor', data: { relationType: 'association' } });
    keyboardImport = { items: [], onImportClass };
    render();
    expect(render().stage).toBe('navigate');
  });

  it('ignores commands with ⌘ or Ctrl and keys typed into a field outside the composer', () => {
    render();
    press('m');
    expect(press('a', { metaKey: true }).stage).toBe('navigate');
    expect(press('a', { target: inspectorField }).stage).toBe('navigate');
    expect(press('m', { target: inspectorField }).stage).toBe('navigate');
  });
});
