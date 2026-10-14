import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from 'react';
import type { ReactFlowInstance, XYPosition } from 'reactflow';
import { ASSOCIATION_RELATION_LABELS } from '../constants/associationLabels';
import type { ClassKeyboardSuggestion } from '../components/ClassKeyboardOverlay';
import type {
  AssociationLineStyle,
  AssociationRelationType,
  ClassDiagramEdge,
  ClassDiagramNode,
  DiagramContent,
} from '../types/diagram';
import { ASSOCIATION_RELATION_TYPES, getAssociationMarker, normalizeAssociationData } from '../utils/association';
import type { ClassSize } from '../utils/classDiagramOperations';
import {
  applyTypeSuggestion,
  createInactiveClassKeyboardState,
  directionFromKey,
  emptyClassKeyboardDetails,
  findClassInDirection,
  getTypeSuggestions,
  initialRelationTarget,
  nextPendingImportIndex,
  parseAttributeInput,
  parseMethodInput,
  positionBeside,
  searchClasses,
  stepMultiplicity,
  type ClassKeyboardImportItem,
  type ClassKeyboardState,
  type ClassRect,
} from '../utils/classKeyboardMode';
import { DEFAULT_CLASS_SIZE, estimateClassSize, findFreeClassPosition } from '../utils/classPlacement';
import { hasCommandModifier, shouldIgnoreEditorShortcut } from '../utils/editorShortcutGuards';
import { createId } from '../utils/id';
import { isNotebookEvent } from '../utils/notebookKeyboard';

/** What the Clases de secuencias editor offers T: the items to walk and how to bring one class's novelties. */
export type ClassKeyboardImport = {
  items: ClassKeyboardImportItem[];
  onImportClass: (noveltyKeys: string[]) => void;
};

type Options = {
  nodes: ClassDiagramNode[];
  edges: ClassDiagramEdge[];
  nodeSizes: Record<string, ClassSize>;
  reactFlowInstance: ReactFlowInstance | null;
  canvasRef: RefObject<HTMLDivElement | null>;
  editorRootRef: RefObject<HTMLElement | null>;
  selectedNodeId: string | null;
  relationType: AssociationRelationType;
  lineStyle: AssociationLineStyle;
  keyboardImport?: ClassKeyboardImport;
  onChangeContent: (content: DiagramContent, options?: { separateHistoryEntry?: boolean }) => void;
  selectClass: (nodeId: string | null) => void;
  chooseRelationType: (relationType: AssociationRelationType) => void;
  showFeedback: (message: string) => void;
  defaultClassPosition: () => XYPosition;
};

const sameName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
const isTextField = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]') !== null;

/**
 * The class diagram's keyboard mode: state, keys and the edits they make.
 * The overlay draws it; DiagramEditor only wires the props and the target outline.
 */
export function useClassKeyboardMode({
  nodes,
  edges,
  nodeSizes,
  reactFlowInstance,
  canvasRef,
  editorRootRef,
  selectedNodeId,
  relationType,
  lineStyle,
  keyboardImport,
  onChangeContent,
  selectClass,
  chooseRelationType,
  showFeedback,
  defaultClassPosition,
}: Options) {
  const [rawState, setRawState] = useState<ClassKeyboardState>(createInactiveClassKeyboardState);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [detailsField, setDetailsField] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = rawState.stage !== 'off';
  const importItems = useMemo(() => keyboardImport?.items ?? [], [keyboardImport]);
  const canImport = importItems.length > 0;

  const rects = useMemo<ClassRect[]>(() => nodes.map((node) => {
    const estimate = estimateClassSize(node.data);
    return {
      id: node.id,
      name: node.data.name.trim(),
      x: node.position.x,
      y: node.position.y,
      width: nodeSizes[node.id]?.width ?? estimate.width,
      height: nodeSizes[node.id]?.height ?? estimate.height,
    };
  }), [nodeSizes, nodes]);
  const rectById = useCallback((id: string | null): ClassRect | null => (id === null ? null : rects.find((rect) => rect.id === id) ?? null), [rects]);
  const nodeByName = useCallback((name: string) => nodes.find((node) => sameName(node.data.name, name)), [nodes]);

  // What the mode works on is derived, not copied: a click that selects one
  // class while walking moves the cursor there, and an undo or a deletion that
  // takes the cursor's or the target's class away simply leaves it empty.
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const liveCursorId = rawState.stage === 'navigate' && selectedNodeId !== null ? selectedNodeId : rawState.cursorId;
  const cursorId = liveCursorId !== null && nodeIds.has(liveCursorId) ? liveCursorId : null;
  const targetId = rawState.targetId !== null && nodeIds.has(rawState.targetId) ? rawState.targetId : null;
  const lostTarget = (rawState.stage === 'relation' || rawState.stage === 'details') && targetId === null;
  const state: ClassKeyboardState = { ...rawState, stage: lostTarget ? 'navigate' : rawState.stage, cursorId, targetId };
  // Updates start from the cursor on screen unless an earlier update in the same event already moved it.
  const setState = (update: (current: ClassKeyboardState) => ClassKeyboardState): void => {
    setRawState((current) => update({ ...current, cursorId: current.cursorId === rawState.cursorId ? cursorId : current.cursorId }));
  };

  const cursor = rectById(cursorId);
  const target = rectById(targetId);

  const focusCanvas = useCallback((): void => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body && canvasRef.current?.contains(activeElement) && !isTextField(activeElement)) return;
    canvasRef.current?.focus({ preventScroll: true });
  }, [canvasRef]);

  // The class the cursor is on is the selection, so the inspector shows it.
  const moveCursor = (nodeId: string | null): void => {
    setRawState((current) => ({ ...current, cursorId: nodeId }));
    selectClass(nodeId);
  };

  // Keep what the step works on in view, without moving the canvas when it already shows.
  const focusedId = state.stage === 'relation' || state.stage === 'details' ? state.targetId : state.cursorId;
  useEffect(() => {
    if (!active || focusedId === null || reactFlowInstance === null) return;
    const rect = rects.find((candidate) => candidate.id === focusedId);
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!rect || !bounds) return;
    const topLeft = reactFlowInstance.flowToScreenPosition({ x: rect.x, y: rect.y });
    const bottomRight = reactFlowInstance.flowToScreenPosition({ x: rect.x + rect.width, y: rect.y + rect.height });
    const margin = 60;
    const visible = topLeft.x >= bounds.left + margin && topLeft.y >= bounds.top + margin + 40
      && bottomRight.x <= bounds.right - margin && bottomRight.y <= bounds.bottom - margin;
    if (visible) return;
    void reactFlowInstance.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, { zoom: reactFlowInstance.getZoom(), duration: 220 });
    // Only a new focus moves the view; resizing the class while typing does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focusedId, reactFlowInstance]);

  // Text steps own the keyboard through their field.
  useEffect(() => {
    if (state.stage === 'attribute' || state.stage === 'method' || state.stage === 'newClass' || state.stage === 'search' || state.stage === 'details') {
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    } else if (active) {
      focusCanvas();
    }
  }, [active, detailsField, focusCanvas, state.stage]);

  const activate = useCallback((): void => {
    let initial = selectedNodeId;
    if (initial === null && rects.length > 0) {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const center = reactFlowInstance && bounds
        ? reactFlowInstance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
        : { x: 0, y: 0 };
      initial = [...rects].sort((a, b) =>
        Math.hypot(a.x + a.width / 2 - center.x, a.y + a.height / 2 - center.y)
        - Math.hypot(b.x + b.width / 2 - center.x, b.y + b.height / 2 - center.y))[0].id;
    }
    setRawState((current) => ({ ...createInactiveClassKeyboardState(), lastTargets: current.lastTargets, stage: 'navigate', cursorId: initial }));
    selectClass(initial);
    showFeedback(rects.length === 0 ? 'Modo teclado: N crea la primera clase.' : 'Modo teclado activado.');
  }, [canvasRef, reactFlowInstance, rects, selectClass, selectedNodeId, showFeedback]);

  const deactivate = useCallback((): void => {
    setRawState((current) => ({ ...createInactiveClassKeyboardState(), lastTargets: current.lastTargets }));
    showFeedback('Modo teclado desactivado.');
  }, [showFeedback]);

  const toNavigate = (patch: Partial<ClassKeyboardState> = {}): void => {
    setState((current) => ({ ...current, stage: 'navigate', targetId: null, text: '', details: emptyClassKeyboardDetails(), ...patch }));
  };

  const typeNames = useMemo(() => nodes.map((node) => node.data.name), [nodes]);
  const typeSuggestions = state.stage === 'attribute' || state.stage === 'method' ? getTypeSuggestions(state.text, typeNames) : [];
  const searchResults = state.stage === 'search'
    ? searchClasses(rects, state.text, state.searchFor === 'target' ? state.cursorId ?? undefined : undefined)
    : [];
  const canCreateFromSearch = state.stage === 'search' && state.searchFor === 'target' && state.text.trim().length > 0
    && !rects.some((rect) => sameName(rect.name, state.text));
  const suggestions: ClassKeyboardSuggestion[] = state.stage === 'search'
    ? [
        ...searchResults.map((rect) => ({ id: rect.id, title: rect.name, detail: 'Clase' })),
        ...(canCreateFromSearch ? [{ id: '__create', title: `Crear «${state.text.trim()}» y relacionar`, detail: 'Clase nueva', create: true }] : []),
      ]
    : typeSuggestions.map((name) => ({ id: name, title: name, detail: typeNames.includes(name) ? 'Clase' : 'Tipo' }));
  const activeSuggestion = Math.min(suggestionIndex, Math.max(0, suggestions.length - 1));

  // ——— Edits ———
  const addClass = (name: string, position: XYPosition): string => {
    const node: ClassDiagramNode = {
      id: createId(),
      type: 'classNode',
      position,
      data: {
        name,
        attributes: [],
        methods: [],
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    };
    onChangeContent({ nodes: [...nodes, node], edges }, { separateHistoryEntry: true });
    return node.id;
  };

  const buildEdge = (source: string, targetId: string, type: AssociationRelationType, details = emptyClassKeyboardDetails()): ClassDiagramEdge => {
    const navigability = 'source-to-target';
    return {
      id: createId(),
      source,
      target: targetId,
      type: 'association',
      data: normalizeAssociationData({
        navigability,
        relationType: type,
        lineStyle,
        sourceSide: 'automatic',
        targetSide: 'automatic',
        name: details.name.trim(),
        sourceMultiplicity: details.sourceMultiplicity.trim(),
        targetMultiplicity: details.targetMultiplicity.trim(),
      }),
      markerStart: getAssociationMarker(navigability, 'source', type),
      markerEnd: getAssociationMarker(navigability, 'target', type),
    };
  };

  const commitRelation = (stay: boolean): void => {
    if (state.cursorId === null || state.targetId === null) return;
    const source = state.cursorId;
    const targetId = state.targetId;
    onChangeContent({ nodes, edges: [...edges, buildEdge(source, targetId, relationType, state.details)] }, { separateHistoryEntry: true });
    const sourceName = rectById(source)?.name || 'la clase';
    const targetName = rectById(targetId)?.name || 'la clase';
    showFeedback(`${ASSOCIATION_RELATION_LABELS[relationType].split(' / ')[0]} creada: ${sourceName} → ${targetName}.`);
    setState((current) => ({
      ...current,
      stage: 'navigate',
      targetId: null,
      details: emptyClassKeyboardDetails(),
      lastTargets: { ...current.lastTargets, [source]: targetId },
    }));
    if (!stay) moveCursor(targetId);
  };

  const saveMember = (): void => {
    const node = nodes.find((candidate) => candidate.id === state.cursorId);
    if (!node) return;
    if (state.text.trim().length === 0) {
      toNavigate();
      return;
    }
    if (state.stage === 'attribute') {
      const attribute = parseAttributeInput(state.text);
      if (attribute === null) return;
      onChangeContent({
        nodes: nodes.map((candidate) => candidate.id === node.id
          ? { ...candidate, data: { ...candidate.data, attributes: [...candidate.data.attributes, { id: createId(), ...attribute }] } }
          : candidate),
        edges,
      }, { separateHistoryEntry: true });
    } else {
      const method = parseMethodInput(state.text);
      if (method === null) return;
      onChangeContent({
        nodes: nodes.map((candidate) => candidate.id === node.id
          ? { ...candidate, data: { ...candidate.data, methods: [...candidate.data.methods, { id: createId(), ...method }] } }
          : candidate),
        edges,
      }, { separateHistoryEntry: true });
    }
    setState((current) => ({ ...current, text: '' }));
    setSuggestionIndex(0);
  };

  const newClassPosition = (side: ClassKeyboardState['side']): XYPosition => {
    const from = rectById(state.cursorId);
    if (from === null) return defaultClassPosition();
    return findFreeClassPosition(nodes.map((node) => ({ ...node, width: nodeSizes[node.id]?.width, height: nodeSizes[node.id]?.height })), positionBeside(from, side, DEFAULT_CLASS_SIZE));
  };

  const ghost: ClassRect | null = state.stage === 'newClass'
    ? { id: '__ghost', name: state.text.trim(), ...newClassPosition(state.side), width: DEFAULT_CLASS_SIZE.width, height: 90 }
    : null;

  const createClassHere = (): void => {
    const name = state.text.trim();
    if (name.length === 0) return;
    if (nodeByName(name)) {
      showFeedback(`Ya hay una clase ${name}.`);
      return;
    }
    const id = addClass(name, newClassPosition(state.side));
    setState((current) => ({ ...current, stage: 'attribute', text: '' }));
    moveCursor(id);
    showFeedback(`Clase ${name} creada. Seguí con sus atributos o Enter vacío para terminar.`);
  };

  const chooseSearchResult = (index: number): void => {
    const suggestion = suggestions[index];
    if (suggestion === undefined) return;
    if (suggestion.create) {
      const name = state.text.trim();
      const id = addClass(name, newClassPosition('right'));
      setState((current) => ({ ...current, stage: 'relation', targetId: id, text: '' }));
      showFeedback(`Clase ${name} creada como destino. Elegí el tipo y Enter.`);
      return;
    }
    if (state.searchFor === 'target') {
      setState((current) => ({ ...current, stage: 'relation', targetId: suggestion.id, text: '' }));
    } else {
      toNavigate();
      moveCursor(suggestion.id);
    }
  };

  // ——— Import (T) ———
  const advanceImportRef = useRef(false);
  const showImportItem = (index: number): void => {
    const item = importItems[index];
    if (!item) return;
    if (item.kind === 'relation') {
      const source = nodeByName(item.sourceClassName);
      const targetNode = nodeByName(item.targetClassName);
      setState((current) => ({ ...current, importIndex: index, targetId: targetNode?.id ?? null, importRelationType: 'dependency' }));
      if (source) moveCursor(source.id);
    } else {
      setState((current) => ({ ...current, importIndex: index, targetId: null }));
      const node = nodeByName(item.className);
      if (node) moveCursor(node.id);
    }
  };

  // Imported items leave the list; land on the next one still pending.
  useEffect(() => {
    if (state.stage !== 'import') return;
    const index = Math.min(state.importIndex, importItems.length - 1);
    const pendingHere = index >= 0 && state.importHandled[importItems[index].key] === undefined;
    const next = pendingHere ? index : index >= 0 ? nextPendingImportIndex(importItems, state.importHandled, index) : null;
    if (next === null) {
      if (advanceImportRef.current || importItems.length === 0) {
        advanceImportRef.current = false;
        toNavigate();
        showFeedback('No queda nada para traer de las secuencias.');
      }
      return;
    }
    if (advanceImportRef.current || next !== state.importIndex) {
      advanceImportRef.current = false;
      showImportItem(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importItems, state.stage]);

  const importCurrent = (): void => {
    const item = importItems[state.importIndex];
    if (!item || !keyboardImport) return;
    if (item.kind === 'relation') {
      const source = nodeByName(item.sourceClassName);
      const targetNode = nodeByName(item.targetClassName);
      if (!source || !targetNode) {
        showFeedback('Para esta relación primero tienen que estar las dos clases.');
        return;
      }
      advanceImportRef.current = true;
      onChangeContent({ nodes, edges: [...edges, buildEdge(source.id, targetNode.id, state.importRelationType)] }, { separateHistoryEntry: true });
      showFeedback(`${ASSOCIATION_RELATION_LABELS[state.importRelationType].split(' / ')[0]} creada: ${source.data.name} → ${targetNode.data.name}.`);
      return;
    }
    advanceImportRef.current = true;
    keyboardImport.onImportClass(item.noveltyKeys);
  };

  const skipCurrent = (): void => {
    const item = importItems[state.importIndex];
    if (!item) return;
    const handled = { ...state.importHandled, [item.key]: 'skipped' as const };
    setState((current) => ({ ...current, importHandled: handled }));
    const next = nextPendingImportIndex(importItems, handled, state.importIndex);
    if (next === null) {
      toNavigate();
      showFeedback('Recorriste todo lo que se puede traer.');
    } else {
      showImportItem(next);
    }
  };

  // ——— Keys ———
  const handleKey = (event: Pick<KeyboardEvent, 'key' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'> & { target: EventTarget | null }): boolean => {
    const { key } = event;
    const lower = key.length === 1 ? key.toLocaleLowerCase() : key;
    const fromField = isTextField(event.target);

    if (state.stage === 'attribute' || state.stage === 'method') {
      if (key === 'Escape') { toNavigate(); return true; }
      if ((key === 'ArrowDown' || key === 'ArrowUp') && suggestions.length > 0) {
        setSuggestionIndex((activeSuggestion + (key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return true;
      }
      if (key === 'Tab') {
        if (suggestions.length > 0) {
          setState((current) => ({ ...current, text: applyTypeSuggestion(current.text, suggestions[activeSuggestion].title) }));
          setSuggestionIndex(0);
        }
        return true;
      }
      if (key === 'Enter') { saveMember(); return true; }
      return false;
    }

    if (state.stage === 'newClass') {
      const direction = directionFromKey(key);
      if (direction && state.text.length === 0) { setState((current) => ({ ...current, side: direction })); return true; }
      if (key === 'Escape') { toNavigate(); return true; }
      if (key === 'Enter') { createClassHere(); return true; }
      return false;
    }

    if (state.stage === 'search') {
      if (key === 'Escape') {
        setState((current) => ({ ...current, stage: current.searchFor === 'target' ? 'relation' : 'navigate', text: '' }));
        return true;
      }
      if ((key === 'ArrowDown' || key === 'ArrowUp') && suggestions.length > 0) {
        setSuggestionIndex((activeSuggestion + (key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return true;
      }
      if (key === 'Enter') { chooseSearchResult(activeSuggestion); return true; }
      return false;
    }

    if (state.stage === 'details') {
      const fields = ['sourceMultiplicity', 'name', 'targetMultiplicity'] as const;
      if (key === 'Escape') { setState((current) => ({ ...current, stage: 'relation' })); return true; }
      if (key === 'Tab') { setDetailsField((detailsField + (event.shiftKey ? 2 : 1)) % 3); return true; }
      if (key === 'Enter') { commitRelation(event.altKey); return true; }
      if ((key === 'ArrowDown' || key === 'ArrowUp') && detailsField !== 1) {
        const field = fields[detailsField];
        setState((current) => ({ ...current, details: { ...current.details, [field]: stepMultiplicity(current.details[field], key === 'ArrowDown' ? 1 : -1) } }));
        return true;
      }
      return false;
    }

    // The steps below have no text field: a key typed into one elsewhere is not theirs.
    if (fromField) return false;
    if (lower === 'm' && !event.altKey) { deactivate(); return true; }

    if (state.stage === 'navigate') {
      const direction = directionFromKey(key);
      if (direction) {
        if (state.cursorId === null) {
          if (rects.length > 0) moveCursor(rects[0].id);
        } else {
          const next = findClassInDirection(rects, state.cursorId, direction);
          if (next !== null) moveCursor(next);
        }
        return true;
      }
      if (key === 'Escape') { deactivate(); return true; }
      if (key === '/') { setState((current) => ({ ...current, stage: 'search', searchFor: 'cursor', text: '' })); setSuggestionIndex(0); return true; }
      if (lower === 'n') { setState((current) => ({ ...current, stage: 'newClass', text: '', side: 'right' })); return true; }
      if (lower === 't') {
        if (!canImport) { showFeedback(keyboardImport ? 'No hay nada para traer de las secuencias.' : 'T trae de las secuencias en Clases de secuencias.'); return true; }
        setState((current) => ({ ...current, stage: 'import', importHandled: {}, importIndex: 0 }));
        showImportItem(0);
        return true;
      }
      if (state.cursorId === null) {
        if (lower === 'a' || lower === 'o' || lower === 'r' || key === 'Enter') { showFeedback('Primero elegí una clase con las flechas o creá una con N.'); return true; }
        return false;
      }
      if (lower === 'a') { setState((current) => ({ ...current, stage: 'attribute', text: '' })); setSuggestionIndex(0); return true; }
      if (lower === 'o') { setState((current) => ({ ...current, stage: 'method', text: '' })); setSuggestionIndex(0); return true; }
      if (lower === 'r' || key === 'Enter') {
        const targetId = initialRelationTarget(rects, state.cursorId, state.lastTargets);
        if (targetId === null) { showFeedback('No hay otra clase para relacionar. Creá una con N.'); return true; }
        setState((current) => ({ ...current, stage: 'relation', targetId, details: emptyClassKeyboardDetails() }));
        return true;
      }
      return false;
    }

    if (state.stage === 'relation') {
      const direction = directionFromKey(key);
      if (direction) {
        if (state.targetId !== null && state.cursorId !== null) {
          const next = findClassInDirection(rects, state.targetId, direction, [state.cursorId]);
          if (next !== null) setState((current) => ({ ...current, targetId: next }));
        }
        return true;
      }
      if (key === 'Escape') { toNavigate(); return true; }
      if (key === '/') { setState((current) => ({ ...current, stage: 'search', searchFor: 'target', text: '' })); setSuggestionIndex(0); return true; }
      if (key === 'Tab') { setState((current) => ({ ...current, stage: 'details' })); setDetailsField(0); return true; }
      if (key === 'Enter') { commitRelation(event.altKey); return true; }
      return false;
    }

    if (state.stage === 'import') {
      const item = importItems[state.importIndex];
      if (key === 'Escape') { toNavigate(); return true; }
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        if (importItems.length > 0) showImportItem((state.importIndex + (key === 'ArrowRight' ? 1 : importItems.length - 1)) % importItems.length);
        return true;
      }
      if (key === 'Enter') { importCurrent(); return true; }
      if (lower === 'x') { skipCurrent(); return true; }
      const digit = ASSOCIATION_RELATION_TYPES[Number(key) - 1];
      if (digit !== undefined && item?.kind === 'relation' && !hasCommandModifier(event)) {
        setState((current) => ({ ...current, importRelationType: digit }));
        return true;
      }
      return false;
    }
    return false;
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (shouldIgnoreEditorShortcut(event, document) || isNotebookEvent(event)) return;
    if (!active) {
      const key = event.key.toLocaleLowerCase();
      if (key !== 'm' || hasCommandModifier(event) || isTextField(event.target)) return;
      const activeElement = document.activeElement;
      const editorHasFocus = activeElement === document.body || (activeElement !== null && editorRootRef.current?.contains(activeElement));
      if (!editorHasFocus) return;
      event.preventDefault();
      activate();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.length === 1) return;
    // A field outside the composer (the inspector, a class being renamed) keeps its keys.
    if (isTextField(event.target) && !(event.target instanceof Element && event.target.closest('.class-keyboard-popover'))) return;
    if (handleKey(event)) {
      event.preventDefault();
      // Arrows would also move the focused class, and digits in T would change the toolbar's relation.
      event.stopPropagation();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onKeyDown(event);
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, []);

  /** A click on a class while aiming makes it the target; returns true when the click was the mode's. */
  const handleClassClick = (nodeId: string): boolean => {
    if (state.stage !== 'relation' && state.stage !== 'details') return false;
    if (nodeId === state.cursorId) return false;
    setState((current) => ({ ...current, targetId: nodeId }));
    selectClass(state.cursorId);
    return true;
  };

  const existingEdge = state.cursorId !== null && state.targetId !== null
    ? edges.find((edge) => (edge.source === state.cursorId && edge.target === state.targetId) || (edge.source === state.targetId && edge.target === state.cursorId))
    : undefined;
  const existingRelationType: AssociationRelationType | null = existingEdge ? existingEdge.data?.relationType ?? 'association' : null;

  return {
    active,
    stage: state.stage,
    targetId: active ? state.targetId : null,
    handleClassClick,
    overlayProps: {
      state,
      canImport,
      relationType,
      cursor,
      target,
      ghost,
      suggestions,
      suggestionIndex: activeSuggestion,
      importItems,
      existingRelation: state.stage === 'relation' ? existingRelationType : null,
      detailsField,
      inputRef: (element: HTMLInputElement | null) => { inputRef.current = element; },
      onTextChange: (text: string) => { setState((current) => ({ ...current, text })); setSuggestionIndex(0); },
      onDetailsChange: (field: 'sourceMultiplicity' | 'name' | 'targetMultiplicity', value: string) =>
        setState((current) => ({ ...current, details: { ...current.details, [field]: value } })),
      onDetailsFocus: setDetailsField,
      onChooseSuggestion: (index: number) => {
        if (state.stage === 'search') chooseSearchResult(index);
        else if (suggestions[index]) {
          setState((current) => ({ ...current, text: applyTypeSuggestion(current.text, suggestions[index].title) }));
          setSuggestionIndex(0);
          inputRef.current?.focus();
        }
      },
      onChooseRelationType: (type: AssociationRelationType) => {
        if (state.stage === 'import') setState((current) => ({ ...current, importRelationType: type }));
        else chooseRelationType(type);
      },
      onKey: (key: string) => { handleKey({ key, altKey: false, shiftKey: false, metaKey: false, ctrlKey: false, target: null }); },
      onExit: deactivate,
    },
  };
}
