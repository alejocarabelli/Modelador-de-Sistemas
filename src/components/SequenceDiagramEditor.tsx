import { findSequenceMessagesMissingInModel, planSequenceClassImport, resolveMessageOperation, resolveParticipantClassNode } from '../utils/sequenceClassImport';
import {
  Download,
  Eye,
  GitBranch,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  BoxSelect,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageDown,
  Keyboard,
  Link2,
  Unlink,
  MessageSquarePlus,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Ungroup,
  UserRoundPlus,
  PersonStanding,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction, type SyntheticEvent } from 'react';
import { CanvasZoom } from './ui/CanvasZoom';
import { EditorToolbar, MenuField, MenuItem, MenuLabel, MenuSeparator, NotebookButton, ReviewButton, ToolbarDivider, ToolButton, ToolMenu } from './ui/Toolbar';
import { isNotebookEvent } from '../utils/notebookKeyboard';
import { hasCommandModifier, shouldIgnoreEditorShortcut } from '../utils/editorShortcutGuards';
import { formatSequenceMessageChange } from '../utils/sequenceEditorFeedback';
import { InspectorDeleteButton, InspectorPanel, type InspectorTone } from './ui/Panel';
import { getExportTheme, type DiagramTheme } from '../theme/themes';
import { resolveSequenceNoteScheme } from '../utils/sequenceParticipantColors';
import { CanvasStartCard } from './CanvasStartCard';
import { SequenceParticipantClassField } from './SequenceParticipantClassField';
import { useDialogs } from '../hooks/useDialogs';
import type {
  ClassMethod,
  ClassSequenceDiagramArtifact,
  DesignProject,
  SequenceActivation,
  SequenceDiagramArtifact,
  SequenceDiagramContent,
  SequenceDiagramProblem,
  SequenceFragment,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceNote,
  SequenceParticipant,
  SequenceParticipantKind,
  SequenceTimelineItem,
  UseCaseFlowArtifact,
} from '../types/diagram';
import { SEQUENCE_NOTE_COLORS } from '../types/diagram';
import { createId } from '../utils/id';
import {
  createSequenceFragment,
  createSequenceMessage,
  adjustOperandsForOperator,
  analyzeSequenceDiagramSemantics,
  applySequenceDiagramMutation,
  collectSequenceReviewProblems,
  clampParticipantX,
  cloneSequenceBlock,
  duplicateSequenceItem,
  findSequenceItem,
  flattenSequenceItems,
  formatSequenceMessageLabel,
  formatSequenceParticipantName,
  getTopLevelBlockIds,
  insertSequenceItem,
  insertSequenceItemAtY,
  insertSequenceItemBefore,
  moveSequenceItem,
  moveSequenceItemsBlock,
  removeSequenceItem,
  removeSequenceItemsBlock,
  reparentSequenceItem,
  reconcileRemovedSequenceReferences,
  updateSequenceItem,
} from '../utils/sequenceDiagram';
import {
  getSequenceNoteMinimumHeight,
  reorderSequenceParticipants,
  resolveSequenceParticipantDragReorder,
  resolveSequenceNoteRect,
  SEQUENCE_NOTE_FONT_FAMILY,
  SEQUENCE_NOTE_FONT_SIZE,
  SEQUENCE_NOTE_LINE_HEIGHT,
  SEQUENCE_NOTE_MIN_HEIGHT,
  SEQUENCE_NOTE_MIN_WIDTH,
  SEQUENCE_NOTE_PADDING_TOP,
  SEQUENCE_NOTE_PADDING_X,
} from '../utils/sequenceDiagramGeometry';
import { hasMeaningfulSequenceNoteDrag, resolveNewSequenceNotePosition, resolveSequenceNoteDragPosition } from '../utils/sequenceNoteInteraction';
import { sequencePointerToCanvas } from '../utils/sequencePointer';
import { buildSequenceLayout, getFragmentTabLabel, isSingleOperandFragment, SEQUENCE_HEADER_HEIGHT } from '../utils/sequenceDiagramLayout';
import { defaultSequenceExportOptions, exportSequencePdf, exportSequencePng, type SequenceExportOptions } from '../utils/sequenceDiagramExport';
import {
  createSequenceMessageEditModel,
  buildSequenceMessageFromEditModel,
  createSequenceSignatureDraft,
  getSequenceSignatureInputValue,
  getSequenceFlowOptions,
  getSequenceMessageReferenceStatus,
  getSequenceMethodOptions,
  parseMessageSignature,
  reconcileMessageLifecycleMarkers,
  sequenceMessageEditModelFromMessage,
  sequenceMessageEditModelToPatch,
  swapSequenceMessageEditModel,
  updateSequenceMessageEditModel,
  type SequenceSignatureDraft,
  type SequenceMessageEditModel,
  type SequenceMethodOption,
} from '../utils/sequenceMessageEditing';
import { areItemsContiguous, areItemsInSameContainer, findSequenceItemLocation, getOrderedSelectionInContainer, pruneSequenceSelection, replaceSequenceSelection, selectSequenceElement, toggleSequenceElement, type SequenceSelectionState, type SequenceSelectionTarget } from '../utils/sequenceDiagramSelection';
import {
  unwrapSequenceFragment,
  wrapSequenceItems,
  calculateFragmentBoundaryChanges,
  applyFragmentBoundaryChanges,
  validateFragmentBoundaryChanges,
  type FragmentBoundaryChanges,
  calculateFragmentMoveChanges,
  applyFragmentMoveChanges,
  validateFragmentMoveChanges,
  type FragmentMoveChanges,
} from '../utils/sequenceDiagramWrapping';
import {
  findBlockDropTarget,
  getBlockDropGuideY,
  getBlockContainerName,
  insertTimelineItemsAt,
  validateBlockCandidate,
} from '../utils/sequenceDiagramReordering';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import { centerSequenceViewportOnTarget, expandSequenceViewportAtEdge, fitSequenceZoomToView, type SequenceViewportTarget } from '../utils/sequenceViewport';
import {
  buildSequenceKeyboardInsertionSlots,
  createInactiveSequenceKeyboardState,
  findCompatibleSequenceReturnCalls,
  findFragmentOperand,
  findSequenceKeyboardLastTarget,
  findSequenceKeyboardParticipantByDigit,
  findSequenceKeyboardParticipantNearX,
  findSequenceKeyboardSlotAfterItem,
  findSequenceKeyboardSlotNearPoint,
  getSequenceKeyboardInstruction,
  getSequenceKeyboardParticipantNumbers,
  getSequenceParticipantIdsAliveAtSlot,
  parseSequenceCreatedParticipant,
  parseSequenceKeyboardSignature,
  insertSequenceItemAtSlot,
  resolveKeyboardTargetMove,
  noPendingCallFeedback,
  sequenceKeyboardCreateKinds,
  sequenceKeyboardFragmentOperators,
  sequenceKeyboardModeReducer,
  stepSequenceKeyboardSourceHistory,
} from '../utils/sequenceKeyboardMode';
import {
  createSequenceParticipantFromLabel,
  formatSequenceParticipantLabel,
  parseSequenceParticipantLabel,
  participantLabelIsValid,
  resolveSequenceParticipantInsertionX,
} from '../utils/sequenceParticipantEditing';
import { useArtifactScrollMemory } from '../hooks/useArtifactViewMemory';
import { artifactViewKey, readArtifactScrollView } from '../utils/artifactViewMemory';
import { ToolbarHistory } from './ToolbarHistory';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { SequenceExportDialog } from './SequenceExportDialog';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import { methodInsertText } from '../utils/sequenceSignatureText';
import { SequenceMessageDialog } from './SequenceMessageDialog';
import { firstMessageRoute, type QuickMessageDraft } from '../utils/sequenceMessageDialogCompatibility';
import { DiagramReviewPanel } from './DiagramReviewPanel';
import { shortcutLabel } from '../utils/shortcutLabel';

type SequenceSelection = SequenceSelectionTarget | null;

type SequenceDiagramEditorProps = {
  artifact: SequenceDiagramArtifact;
  canRedo: boolean;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  saveStatus?: DiagramSaveStatus;
  onNavigateToArtifact?: (artifactId: string) => void;
  onImportSequenceIntoClassModel?: (modelArtifactId: string, sequenceContent: SequenceDiagramContent) => void;
  onCreateClassMethod?: (artifactId: string, nodeId: string, method: ClassMethod) => void;
  onCompleteClassMethodParameters?: (artifactId: string, nodeId: string, methodId: string, parameters: string) => void;
  onCreateSequenceModel?: () => void;
  onChangeContent: (content: SequenceDiagramContent, options?: { separateHistoryEntry?: boolean; alreadyNormalized?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
};


const participantKindLabels: Record<SequenceParticipantKind, string> = {
  actor: 'Actor',
  boundary: 'Interfaz / boundary',
  control: 'Controlador',
  entity: 'Entidad',
  object: 'Objeto',
};

const messageTypeLabels: Record<SequenceMessageType, string> = {
  synchronous: 'Mensaje síncrono',
  asynchronous: 'Mensaje asíncrono',
  return: 'Retorno',
  create: 'create() · Crear objeto / DTO',
  destroy: 'Destruir línea de vida',
};

/** Short tag for a message in lists inside the inspector. */
const messageTypeShortLabels: Record<SequenceMessageType, string> = {
  synchronous: 'llamada',
  asynchronous: 'asínc.',
  return: 'retorno',
  create: 'crear',
  destroy: 'destruir',
};

/** How the inspector header names each kind of message. */
const messageKindLabels: Record<SequenceMessageType, string> = {
  synchronous: 'Mensaje síncrono',
  asynchronous: 'Mensaje asíncrono',
  return: 'Retorno',
  create: 'Creación',
  destroy: 'Destrucción',
};

const messageKindTones: Record<SequenceMessageType, InspectorTone> = {
  synchronous: 'accent',
  asynchronous: 'info',
  return: 'neutral',
  create: 'success',
  destroy: 'danger',
};

const fragmentLabels: Record<SequenceFragmentOperator, string> = {
  alt: 'alt · caminos alternativos',
  loop: 'loop · repetición',
  opt: 'opt · camino opcional',
  par: 'par · ejecución paralela',
  break: 'break · interrupción',
  critical: 'critical · sección crítica',
  ref: 'ref · otra interacción',
};

// El editor se desmonta al cambiar de pestaña: guardamos el modo rápido para no perder el mensaje a medio escribir.
const keyboardModeMemory = new Map<string, ReturnType<typeof createInactiveSequenceKeyboardState>>();
// Where the keyboard cursor was when the mode was last used, so M picks up
// there instead of at the end of a long diagram.
const keyboardExitMemory = new Map<string, { slotId: string; sourceId: string; lastTargets: Record<string, string>; lastTarget?: string }>();

let inspectorCollapsedMemory = true;

const sequenceOutlineVisibilityKey = 'modelador.sequence-outline-visible';

const readStoredSequenceOutlineVisibility = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(sequenceOutlineVisibilityKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // The editor remains usable when storage is unavailable.
  }
  return null;
};

const getInitialSequenceOutlineVisibility = (): boolean => {
  const stored = readStoredSequenceOutlineVisibility();
  if (stored !== null) return stored;
  return typeof window === 'undefined' || !window.matchMedia('(max-width: 920px)').matches;
};

const updateNestedItemLocation = (
  items: SequenceTimelineItem[],
  itemId: string,
  destinationValue: string,
): SequenceTimelineItem[] => {
  if (destinationValue === 'root') return reparentSequenceItem(items, itemId);
  const [fragmentId, operandId] = destinationValue.split(':');
  return reparentSequenceItem(items, itemId, { fragmentId, operandId });
};

const findParentLocation = (content: SequenceDiagramContent, itemId: string): string => {
  const entry = flattenSequenceItems(content.items).find((candidate) => candidate.item.id === itemId);
  return entry?.parentFragmentId && entry.operandId ? `${entry.parentFragmentId}:${entry.operandId}` : 'root';
};

const countSequenceMessages = (items: SequenceTimelineItem[]): number =>
  flattenSequenceItems(items).filter((entry) => entry.item.kind === 'message').length;

const getSequenceStructuredItemLabel = (
  item: SequenceTimelineItem,
  participantNames: Map<string, string>,
): string => {
  if (item.kind === 'message') {
    const source = participantNames.get(item.sourceId) ?? 'participante no disponible';
    const target = participantNames.get(item.targetId) ?? 'participante no disponible';
    const label = item.type === 'return' ? 'retorno' : formatSequenceMessageLabel(item);
    return `${label}: ${source} a ${target}${item.flowReference ? `, referencia ${item.flowReference}` : ''}`;
  }
  const name = item.name ? `, ${item.name}` : '';
  const branches = item.operands.map((operand) => operand.guard || 'sin condición').join('; ');
  return `${item.operator}${name}, ramas: ${branches}`;
};

const sequenceItemMatchesSearch = (item: SequenceTimelineItem, query: string): boolean => {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  if (item.kind === 'message') {
    return `${item.name} ${item.arguments} ${item.flowReference}`.toLocaleLowerCase().includes(q);
  }
  const selfMatch = `${item.operator} ${item.name} ${item.operands.map((operand) => operand.guard).join(' ')}`.toLocaleLowerCase().includes(q);
  return selfMatch || item.operands.some((operand) => operand.items.some((child) => sequenceItemMatchesSearch(child, query)));
};

const isKeyboardTextTarget = (target: EventTarget | null): boolean =>
  target instanceof Element
  && target.closest('input, textarea, select, [contenteditable="true"], dialog, .sequence-keyboard-popover') !== null;

const moveCircular = <T,>(items: T[], current: T, direction: -1 | 1): T | undefined => {
  if (items.length === 0) return undefined;
  const currentIndex = Math.max(0, items.indexOf(current));
  return items[(currentIndex + direction + items.length) % items.length];
};

export function SequenceDiagramEditor({
  artifact,
  canRedo,
  canUndo,
  project,
  theme,
  saveStatus = 'saved',
  onNavigateToArtifact,
  onCreateClassMethod,
  onCompleteClassMethodParameters,
  onImportSequenceIntoClassModel,
  onCreateSequenceModel,
  onChangeContent,
  onRedo,
  onUndo,
}: SequenceDiagramEditorProps) {
  const { confirm, notify } = useDialogs();
  const content = artifact.content;
  const [storedSelectionState, setStoredSelectionState] = useState<SequenceSelectionState>(() => selectSequenceElement(null));
  const selectionState = useMemo(
    () => pruneSequenceSelection(storedSelectionState, content),
    [content, storedSelectionState],
  );
  const setSelectionState = useCallback((next: SetStateAction<SequenceSelectionState>): void => {
    setStoredSelectionState((current) => {
      const validCurrent = pruneSequenceSelection(current, content);
      return typeof next === 'function' ? next(validCurrent) : next;
    });
  }, [content]);
  const selection = selectionState.primary;
  const selectedTimelineIds = useMemo(() => selectionState.elements
    .filter((element) => element.kind !== 'participant')
    .map((element) => element.id), [selectionState.elements]);
  const setSelection = useCallback((next: SequenceSelection): void => {
    setSelectionState(selectSequenceElement(next));
  }, [setSelectionState]);
  // The item the keyboard cursor highlights on its own (the one just typed or
  // stepped over) is a focus, not a choice: a new fragment does not wrap it and
  // a Shift selection does not start from it.
  const [keyboardFocusState, setKeyboardFocusState] = useState<SequenceSelectionState | null>(null);
  const setKeyboardFocus = useCallback((next: SequenceSelection): void => {
    const state = selectSequenceElement(next);
    setKeyboardFocusState(state);
    setSelectionState(state);
  }, [setSelectionState]);
  const isKeyboardFocusOnly = storedSelectionState === keyboardFocusState;
  const setSelectedTimelineIds = useCallback((next: SetStateAction<string[]>): void => {
    setSelectionState((current) => {
      const currentIds = current.elements.filter((element) => element.kind !== 'participant').map((element) => element.id);
      const ids = typeof next === 'function' ? next(currentIds) : next;
      const elements = ids.flatMap((id): SequenceSelectionTarget[] => {
        const item = findSequenceItem(content.items, id);
        if (item) return [{ kind: item.kind, id }];
        if (content.notes.some((note) => note.id === id)) return [{ kind: 'note', id }];
        return [];
      });
      return replaceSequenceSelection(elements, current.primary);
    });
  }, [content.items, content.notes, setSelectionState]);
  const [insertionGuide, setInsertionGuide] = useState<{
    y: number;
    isValid: boolean;
    reason?: string;
    containerName?: string;
    bounds?: { x: number; width: number };
    containerBounds?: { x: number; width: number; top: number; bottom: number };
  } | null>(null);
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [quickMessage, setQuickMessage] = useState<QuickMessageDraft | null>(null);
  const [quickMessageRouteEditable, setQuickMessageRouteEditable] = useState(false);
  const [participantDraft, setParticipantDraft] = useState<{ text: string; kind: 'object' | 'actor' } | null>(null);
  const [participantEditDraft, setParticipantEditDraft] = useState<{ id: string; text: string } | null>(null);
  // Participante con el nombre que tenía al empezar a editarlo: fija su color
  // mientras se tipea; se suelta al confirmar (perder foco) o si cambia la selección.
  const [participantColorReference, setParticipantColorReference] = useState<SequenceParticipant | null>(null);
  const [messageSignatureDraft, setMessageSignatureDraft] = useState<SequenceSignatureDraft | null>(null);
  const outlinePreferenceRef = useRef(readStoredSequenceOutlineVisibility() !== null);
  const [outlineVisible, setOutlineVisible] = useState(getInitialSequenceOutlineVisibility);
  // The inspector opens or closes only when the user toggles it; selecting
  // something never unfolds it.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(inspectorCollapsedMemory);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFragments, setCollapsedFragments] = useState<Set<string>>(() => new Set());
  const viewKey = artifactViewKey(project.id, artifact.id);
  const [initialView] = useState(() => readArtifactScrollView(viewKey));
  const [zoom, setZoom] = useState(initialView?.zoom ?? 1);
  const [scrollPosition, setScrollPosition] = useState({ left: initialView?.scrollLeft ?? 0, top: initialView?.scrollTop ?? 0 });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeFragmentResize, setActiveFragmentResize] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isMove?: boolean;
    previewItems?: SequenceTimelineItem[];
  } | null>(null);
  const [boundaryResizePreview, setBoundaryResizePreview] = useState<{
    fragmentId: string;
    absorbedIds: string[];
    ejectedIds: string[];
    isValid: boolean;
    reason?: string;
    edge?: 'top' | 'bottom' | 'move';
    isReallocated?: boolean;
  } | null>(null);
  const [messageDragPreview, setMessageDragPreview] = useState<{ blockIds: string[]; items: SequenceTimelineItem[] } | null>(null);
  const [includingMessageOperandId, setIncludingMessageOperandId] = useState<string | null>(null);
  const [activeOperandId, setActiveOperandId] = useState<string | null>(null);
  const [includeSearchFilter, setIncludeSearchFilter] = useState('');
  const [inlineFragmentEditor, setInlineFragmentEditor] = useState<{
    kind: 'guard' | 'name';
    fragmentId: string;
    operandId?: string;
    value: string;
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [inlineNoteEditor, setInlineNoteEditor] = useState<{
    noteId: string;
    draft?: SequenceNote;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isParticipantDragging, setIsParticipantDragging] = useState(false);
  const [participantPreview, setParticipantPreview] = useState<Record<string, number>>({});
  const [notePreview, setNotePreview] = useState<Record<string, Partial<SequenceNote>>>({});
  const [draggedOutlineItemId, setDraggedOutlineItemId] = useState<string | null>(null);
  const [outlineDropTargetId, setOutlineDropTargetId] = useState<string | null>(null);
  const [highlightedSelection, setHighlightedSelection] = useState<SequenceSelection>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<SequenceExportOptions>(defaultSequenceExportOptions);
  const [viewportCanvasSize, setViewportCanvasSize] = useState({
    width: Math.max(content.canvas.width, initialView?.canvasSize?.width ?? 0),
    height: Math.max(content.canvas.height, initialView?.canvasSize?.height ?? 0),
  });
  const [keyboardMode, dispatchKeyboardMode] = useReducer(
    sequenceKeyboardModeReducer,
    viewKey,
    (key) => keyboardModeMemory.get(key) ?? createInactiveSequenceKeyboardState(),
  );
  useEffect(() => {
    if (keyboardMode.stage === 'off') keyboardModeMemory.delete(viewKey);
    else keyboardModeMemory.set(viewKey, keyboardMode);
  }, [keyboardMode, viewKey]);
  // The last pointer position over the canvas, in screen coordinates.
  const canvasPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const exportSvgRef = useRef<SVGSVGElement | null>(null);
  const getExportSvg = useCallback(() => exportSvgRef.current, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useArtifactScrollMemory(viewKey, scrollRef, initialView, zoom, viewportCanvasSize);
  const editorRootRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const canvasExpansionRef = useRef(0);
  const highlightTimeoutRef = useRef<number | null>(null);
  const blockClipboard = useRef<{ items: SequenceTimelineItem[]; notes: SequenceNote[] } | null>(null);
  const marqueeTipShownRef = useRef(false);

  useEffect(() => {
    const compactWindow = window.matchMedia('(max-width: 700px)');
    const syncInspectorForViewport = (): void => {
      if (compactWindow.matches) setInspectorCollapsed(true);
    };

    syncInspectorForViewport();
    compactWindow.addEventListener('change', syncInspectorForViewport);
    return () => compactWindow.removeEventListener('change', syncInspectorForViewport);
  }, []);

  const updateOutlineVisibility = useCallback((visible: boolean): void => {
    outlinePreferenceRef.current = true;
    setOutlineVisible(visible);
    try {
      window.localStorage.setItem(sequenceOutlineVisibilityKey, String(visible));
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const compactWindow = window.matchMedia('(max-width: 920px)');
    const syncUnconfiguredOutline = (): void => {
      if (!outlinePreferenceRef.current) setOutlineVisible(!compactWindow.matches);
    };
    syncUnconfiguredOutline();
    compactWindow.addEventListener('change', syncUnconfiguredOutline);
    return () => compactWindow.removeEventListener('change', syncUnconfiguredOutline);
  }, []);

  const displayContent = useMemo<SequenceDiagramContent>(() => ({
    ...content,
    // The viewport may grow while the user pans. Keep this local state out of
    // the persisted content so reaching an edge never creates history.
    canvas: {
      width: Math.max(content.canvas.width, viewportCanvasSize.width),
      height: Math.max(content.canvas.height, viewportCanvasSize.height),
    },
    participants: content.participants.map((participant) => ({
      ...participant,
      x: participantPreview[participant.id] ?? participant.x,
    })),
    notes: content.notes.map((note) => ({ ...note, ...(notePreview[note.id] ?? {}) })),
  }), [content, viewportCanvasSize, participantPreview, notePreview]);
  const existingArtifactIds = useMemo(() => new Set(project.artifacts.map((candidate) => candidate.id)), [project.artifacts]);
  const semantics = useMemo(() => analyzeSequenceDiagramSemantics(content, {
    existingArtifactIds,
  }), [content, existingArtifactIds]);
  const reviewProblems = useMemo(() => collectSequenceReviewProblems(content, semantics.problems), [content, semantics.problems]);
  const flatEntries = useMemo(() => flattenSequenceItems(content.items), [content.items]);
  const baseLayout = useMemo(() => buildSequenceLayout(displayContent, semantics), [displayContent, semantics]);
  const interactionContent = useMemo(() => {
    const previewItems = messageDragPreview?.items ?? activeFragmentResize?.previewItems;
    return previewItems === undefined ? displayContent : { ...displayContent, items: previewItems };
  }, [activeFragmentResize?.previewItems, displayContent, messageDragPreview]);
  const layout = useMemo(() => {
    if (messageDragPreview) {
      return buildSequenceLayout(interactionContent);
    }
    if (activeFragmentResize?.previewItems) {
      return buildSequenceLayout(interactionContent);
    }
    if (!activeFragmentResize) return baseLayout;
    const nextFragmentLayouts = new Map(baseLayout.fragmentLayouts);
    const origBox = baseLayout.fragmentLayouts.get(activeFragmentResize.id);
    let maxBottom = baseLayout.height;
    if (origBox) {
      const operands = activeFragmentResize.isMove
        ? (() => {
            const dy = activeFragmentResize.y - origBox.y;
            return origBox.operands.map((op) => ({
              ...op,
              top: op.top + dy,
              bottom: op.bottom + dy,
              contentTop: op.contentTop + dy,
            }));
          })()
        : (() => {
            const isTopMoved = activeFragmentResize.y !== origBox.y;
            const isBottomMoved = (activeFragmentResize.y + activeFragmentResize.height) !== (origBox.y + origBox.height);
            return origBox.operands.map((op, idx) => {
              let top = op.top;
              let bottom = op.bottom;
              if (idx === 0 && isTopMoved) {
                top = activeFragmentResize.y + origBox.headerHeight;
              }
              if (idx === origBox.operands.length - 1 && (isBottomMoved || isTopMoved)) {
                bottom = activeFragmentResize.y + activeFragmentResize.height;
              }
              const clampedTop = Math.min(top, bottom);
              const clampedBottom = Math.max(top, bottom);
              return {
                ...op,
                top: clampedTop,
                bottom: clampedBottom,
                contentTop: clampedTop + op.guardHeight,
              };
            });
          })();
      nextFragmentLayouts.set(activeFragmentResize.id, {
        ...origBox,
        x: activeFragmentResize.x,
        y: activeFragmentResize.y,
        width: activeFragmentResize.width,
        height: activeFragmentResize.height,
        operands,
      });
      maxBottom = Math.max(baseLayout.height, activeFragmentResize.y + activeFragmentResize.height + 80);

      // If the resizing fragment is nested, expand ancestor fragments so the parent smoothly encloses the growing child
      let currentChildId = activeFragmentResize.id;
      let currentBottom = activeFragmentResize.y + activeFragmentResize.height;
      while (currentChildId) {
        const loc = findSequenceItemLocation(content.items, currentChildId);
        if (!loc || loc.containerId === 'root') break;
        const parentEntry = flatEntries.find((e) =>
          e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
        );
        if (!parentEntry || parentEntry.item.kind !== 'fragment') break;
        const parentFrag = parentEntry.item;
        const parentBox = nextFragmentLayouts.get(parentFrag.id);
        if (parentBox) {
          const neededBottom = currentBottom + 24;
          if (neededBottom > parentBox.y + parentBox.height) {
            const newHeight = neededBottom - parentBox.y;
            const updatedParentOperands = parentBox.operands.map((op) => {
              if (op.id === loc.containerId) {
                return { ...op, bottom: Math.max(op.bottom, neededBottom) };
              }
              return op;
            });
            nextFragmentLayouts.set(parentFrag.id, {
              ...parentBox,
              height: newHeight,
              operands: updatedParentOperands,
            });
            currentBottom = neededBottom;
          }
        }
        currentChildId = parentFrag.id;
      }
    }
    return {
      ...baseLayout,
      height: maxBottom,
      fragmentLayouts: nextFragmentLayouts,
    };
  }, [baseLayout, activeFragmentResize, messageDragPreview, content, interactionContent, flatEntries]);
  const keyboardSlots = useMemo(() => buildSequenceKeyboardInsertionSlots(content, layout), [content, layout]);
  const keyboardSlot = keyboardSlots[Math.min(keyboardMode.slotIndex, Math.max(0, keyboardSlots.length - 1))];
  const keyboardAliveParticipantIds = useMemo(() => keyboardSlot
    ? getSequenceParticipantIdsAliveAtSlot(content, layout, keyboardSlot)
    : [], [content, keyboardSlot, layout]);
  const keyboardParticipantIds = useMemo(() => content.participants
    .filter((participant) => keyboardAliveParticipantIds.includes(participant.id))
    .sort((left, right) => left.x - right.x)
    .map((participant) => participant.id), [content.participants, keyboardAliveParticipantIds]);
  const keyboardParticipantNumbers = useMemo(() => getSequenceKeyboardParticipantNumbers(content.participants), [content.participants]);
  useEffect(() => {
    if (keyboardMode.stage === 'off' || !keyboardSlot) return;
    keyboardExitMemory.set(viewKey, {
      slotId: keyboardSlot.id,
      sourceId: keyboardMode.sourceId,
      lastTargets: keyboardMode.lastTargets,
      lastTarget: keyboardMode.lastTarget,
    });
  }, [keyboardMode.lastTarget, keyboardMode.lastTargets, keyboardMode.sourceId, keyboardMode.stage, keyboardSlot, viewKey]);
  // A sequence draws on a "Clases de secuencias" model only; a plain class
  // diagram (the domain model) stays out of it.
  const classDiagrams = project.artifacts.filter((candidate): candidate is ClassSequenceDiagramArtifact =>
    candidate.type === 'class-sequence-diagram',
  );
  const flows = project.artifacts.filter((candidate): candidate is UseCaseFlowArtifact => candidate.type === 'use-case-flow');
  const otherSequenceDiagrams = useMemo(() =>
    project.artifacts.filter((candidate): candidate is SequenceDiagramArtifact =>
      candidate.type === 'sequence-diagram' && candidate.id !== artifact.id
    ),
  [project.artifacts, artifact.id]);
  const associatedClassDiagram = classDiagrams.find((candidate) => candidate.id === content.classDiagramArtifactId);
  const missingInModel = associatedClassDiagram ? findSequenceMessagesMissingInModel(content, { nodes: associatedClassDiagram.content.nodes ?? [], edges: associatedClassDiagram.content.edges ?? [] }) : undefined;
  // Counted as the class model counts its novelties, so both editors agree.
  const missingCount = associatedClassDiagram
    ? planSequenceClassImport({ nodes: associatedClassDiagram.content.nodes ?? [], edges: associatedClassDiagram.content.edges ?? [] }, [content]).length
    : 0;
  // A small lookup; the React compiler memoizes it with the diagram it reads.
  const classNodesById = new Map<string, { name: string }>(
    (Array.isArray(associatedClassDiagram?.content?.nodes) ? associatedClassDiagram.content.nodes : [])
      .map((node) => [node.id, { name: node.data.name }]),
  );
  const selectedItem = selection?.kind === 'message' || selection?.kind === 'fragment'
    ? findSequenceItem(content.items, selection.id)
    : null;
  const selectedParticipant = selection?.kind === 'participant'
    ? content.participants.find((participant) => participant.id === selection.id)
    : undefined;
  if (participantColorReference && participantColorReference.id !== selectedParticipant?.id) {
    // Cambió o desapareció el participante seleccionado: se suelta la referencia
    // de color aunque el input no haya llegado a disparar blur.
    setParticipantColorReference(null);
  }
  const participantEditText = selectedParticipant
    ? participantEditDraft?.id === selectedParticipant.id
      ? participantEditDraft.text
      : formatSequenceParticipantLabel(selectedParticipant)
    : '';
  const selectedNote = selection?.kind === 'note' ? content.notes.find((note) => note.id === selection.id) : undefined;
  const methodOptions: SequenceMethodOption[] = selectedItem?.kind === 'message'
    ? getSequenceMethodOptions({ model: selectedItem, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const quickMessageMethodOptions: SequenceMethodOption[] = quickMessage
    ? getSequenceMethodOptions({ model: quickMessage, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const keyboardMessageModel = keyboardMode.stage === 'aim' || keyboardMode.stage === 'typing'
    ? createSequenceMessageEditModel({
        type: keyboardMode.messageType,
        sourceId: keyboardMode.sourceId,
        targetId: keyboardMode.targetId,
      })
    : undefined;
  const keyboardMethodOptions: SequenceMethodOption[] = keyboardMessageModel
    ? getSequenceMethodOptions({ model: keyboardMessageModel, participants: content.participants, classDiagram: associatedClassDiagram })
    : [];
  const flowOptions = getSequenceFlowOptions(flows, content.flowArtifactId);
  const selectedMessageReferenceStatus = selectedItem?.kind === 'message'
    ? getSequenceMessageReferenceStatus(selectedItem, methodOptions, flowOptions, content.flowArtifactId)
    : undefined;
  const quickMessageReferenceStatus = quickMessage
    ? getSequenceMessageReferenceStatus(quickMessage, quickMessageMethodOptions, flowOptions, content.flowArtifactId)
    : undefined;
  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback((current) => current === message ? null : current), 2400);
  }, []);

  const commit = useCallback((next: SequenceDiagramContent, separateHistoryEntry = true): boolean => {
    const reconciled = reconcileRemovedSequenceReferences(content, next);
    const result = applySequenceDiagramMutation(content, reconciled);
    if (!result.accepted) {
      showFeedback(result.newProblems[0]?.message ?? 'La modificación generaría un problema temporal.');
      return false;
    }
    onChangeContent(result.content, { separateHistoryEntry, alreadyNormalized: true });
    if (result.newWarnings.length > 0) showFeedback(`Guardado con un aviso: ${result.newWarnings[0].message} Lo ves en Revisar.`);
    return true;
  }, [content, onChangeContent, showFeedback]);

  const keepAnchoredNotesWithTimeline = useCallback((next: SequenceDiagramContent): SequenceDiagramContent => {
    const beforeLayout = buildSequenceLayout(content);
    const afterLayout = buildSequenceLayout(next);
    const anchorY = (diagramLayout: ReturnType<typeof buildSequenceLayout>, note: SequenceNote): number | undefined => {
      if (note.anchorKind === 'message' && note.anchorId) return diagramLayout.messageLayouts.get(note.anchorId)?.y;
      if (note.anchorKind === 'fragment' && note.anchorId) return diagramLayout.fragmentLayouts.get(note.anchorId)?.y;
      return undefined;
    };
    return {
      ...next,
      notes: next.notes.map((note) => {
        const beforeY = anchorY(beforeLayout, note);
        const afterY = anchorY(afterLayout, note);
        return beforeY === undefined || afterY === undefined ? note : { ...note, y: note.y + afterY - beforeY };
      }),
    };
  }, [content]);

  const activateKeyboardMode = useCallback((): void => {
    if (content.participants.length === 0) {
      showFeedback('Primero agregá participantes.');
      setParticipantDraft({ text: '', kind: 'actor' });
      return;
    }
    // What the keyboard cursor merely highlighted is not a choice of the
    // person: the mode picks up where it was left instead.
    const chosen = isKeyboardFocusOnly ? null : selection;
    const selectedTimelineItem = chosen?.kind === 'message' || chosen?.kind === 'fragment'
      ? findSequenceItem(content.items, chosen.id)
      : undefined;
    const sortedParticipants = [...content.participants].sort((left, right) => left.x - right.x);
    const remembered = keyboardExitMemory.get(viewKey);
    const allIds = sortedParticipants.map((participant) => participant.id);
    // Without a selection the cursor starts where the person is looking: by
    // the pointer, else where the mode was left if it is still on screen,
    // else in the middle of what is visible. Never at the end on its own.
    let slotIndex = Math.max(0, keyboardSlots.length - 1);
    let lookedAtX: number | undefined;
    const svgBox = svgRef.current?.getBoundingClientRect();
    const scrollEl = scrollRef.current;
    const toDiagram = (clientX: number, clientY: number) => svgBox && svgBox.width > 0 && svgBox.height > 0
      ? { x: (clientX - svgBox.left) * (layout.width / svgBox.width), y: (clientY - svgBox.top) * (layout.height / svgBox.height) }
      : undefined;
    const viewBox = scrollEl?.getBoundingClientRect();
    const pointer = canvasPointerRef.current ? toDiagram(canvasPointerRef.current.clientX, canvasPointerRef.current.clientY) : undefined;
    const rememberedIndex = remembered ? keyboardSlots.findIndex((slot) => slot.id === remembered.slotId) : -1;
    const isOnScreen = (y: number): boolean => {
      if (!viewBox || !svgBox) return false;
      const screenY = svgBox.top + y * (svgBox.height / layout.height);
      return screenY >= viewBox.top + 24 && screenY <= viewBox.bottom - 24;
    };
    if (selectedTimelineItem) {
      slotIndex = findSequenceKeyboardSlotAfterItem(keyboardSlots, selectedTimelineItem.id);
    } else if (pointer && keyboardSlots.length > 0) {
      slotIndex = findSequenceKeyboardSlotNearPoint(keyboardSlots, pointer);
      lookedAtX = pointer.x;
    } else if (rememberedIndex >= 0 && isOnScreen(keyboardSlots[rememberedIndex].y)) {
      slotIndex = rememberedIndex;
    } else if (viewBox && keyboardSlots.length > 0) {
      const center = toDiagram(viewBox.left + viewBox.width / 2, viewBox.top + viewBox.height / 2);
      if (center) {
        slotIndex = findSequenceKeyboardSlotNearPoint(keyboardSlots, center);
        lookedAtX = center.x;
      }
    }
    const slot = keyboardSlots[slotIndex];
    const aliveIds = slot ? getSequenceParticipantIdsAliveAtSlot(content, layout, slot) : allIds;
    const candidates = allIds.filter((id) => aliveIds.includes(id));
    const sourceId = chosen?.kind === 'participant'
      ? chosen.id
      : selectedTimelineItem?.kind === 'message'
        ? selectedTimelineItem.targetId
        : lookedAtX !== undefined
          ? findSequenceKeyboardParticipantNearX(candidates.length > 0 ? candidates : allIds, layout.participantX, lookedAtX) ?? allIds[0] ?? ''
          : remembered && rememberedIndex === slotIndex && allIds.includes(remembered.sourceId)
            ? remembered.sourceId
            : sortedParticipants[0]?.id ?? '';
    setQuickMessage(null);
    setParticipantDraft(null);
    dispatchKeyboardMode({ type: 'activate', slotIndex, sourceId, lastTargets: remembered?.lastTargets, lastTarget: remembered?.lastTarget });
    window.requestAnimationFrame(() => svgRef.current?.focus());
  }, [content, isKeyboardFocusOnly, keyboardSlots, layout, selection, showFeedback, viewKey]);

  const commitKeyboardParticipant = useCallback((): void => {
    const participant = createSequenceParticipantFromLabel({
      text: keyboardMode.text,
      participants: content.participants,
    });
    if (!participant) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    const saved = commit({ ...content, participants: [...content.participants, participant] });
    if (!saved) return;
    setSelection({ kind: 'participant', id: participant.id });
    dispatchKeyboardMode({
      type: 'committed',
      slotIndex: keyboardMode.slotIndex,
      sourceId: participant.id,
    });
    showFeedback(`Participante ${formatSequenceParticipantLabel(participant)} creado.`);
  }, [commit, content, keyboardMode.slotIndex, keyboardMode.text, setSelection, showFeedback]);

  const diagramHasActor = content.participants.some((participant) => participant.kind === 'actor');
  const beginKeyboardMessage = useCallback((type: SequenceMessageType): void => {
    if (!keyboardSlot) return;
    if (type === 'return') {
      const calls = findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId);
      // A return answers a pending call; without one there is nothing to aim at.
      if (calls.length === 0 && !keyboardMode.editId) {
        showFeedback(noPendingCallFeedback);
        return;
      }
      dispatchKeyboardMode({
        type: 'begin',
        messageType: 'return',
        targetId: calls[0]?.sourceId ?? keyboardMode.sourceId,
        returnCandidateIds: calls.map((call) => call.id),
        preserveEdit: Boolean(keyboardMode.editId),
      });
      return;
    }
    const defaultTarget = type === 'create'
      ? ''
      : keyboardParticipantIds.includes(keyboardMode.sourceId)
        ? keyboardMode.sourceId
        : keyboardParticipantIds[0] ?? keyboardMode.sourceId;
    // Like the «Mensaje» button, the first message of a diagram leaves the
    // actor, whichever participant the cursor happens to be on.
    const diagramHasMessages = flatEntries.some((entry) => entry.item.kind === 'message');
    const firstRoute = !diagramHasMessages && !keyboardMode.editId && diagramHasActor
      ? firstMessageRoute(content.participants)
      : undefined;
    if (firstRoute) {
      dispatchKeyboardMode({ type: 'set-route', sourceId: firstRoute.sourceId });
      dispatchKeyboardMode({ type: 'begin', messageType: type, targetId: type === 'create' ? '' : firstRoute.targetId });
      return;
    }
    dispatchKeyboardMode({ type: 'begin', messageType: type, targetId: defaultTarget });
  }, [content, diagramHasActor, flatEntries, keyboardMode.editId, keyboardMode.sourceId, keyboardParticipantIds, keyboardSlot, layout, showFeedback]);

  const setKeyboardMessageType = useCallback((type: SequenceMessageType): void => {
    if (type === 'return') {
      const calls = findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId);
      if (calls.length === 0) {
        showFeedback(noPendingCallFeedback);
        return;
      }
      dispatchKeyboardMode({
        type: 'set-route',
        messageType: 'return',
        targetId: calls[0].sourceId,
        returnCandidateIds: calls.filter((call) => call.sourceId === calls[0].sourceId).map((call) => call.id),
        returnCandidateIndex: 0,
      });
      return;
    }
    dispatchKeyboardMode({
      type: 'set-route',
      messageType: type,
      targetId: type === 'create'
        ? ''
        : keyboardMode.targetId || keyboardParticipantIds[0] || keyboardMode.sourceId,
      returnCandidateIds: [],
      returnCandidateIndex: 0,
    });
  }, [content, keyboardMode.sourceId, keyboardMode.targetId, keyboardParticipantIds, keyboardSlot, layout, showFeedback]);

  const moveKeyboardSlot = useCallback((direction: -1 | 1, extendSelection = false, toEnd = false): void => {
    if (!keyboardSlot || keyboardSlots.length === 0) return;
    const nextIndex = toEnd
      ? (direction < 0 ? 0 : keyboardSlots.length - 1)
      : Math.max(0, Math.min(keyboardSlots.length - 1, keyboardMode.slotIndex + direction));
    if (nextIndex === keyboardMode.slotIndex) return;
    const nextSlot = keyboardSlots[nextIndex];
    if (extendSelection) {
      if (nextSlot.containerId !== keyboardSlot.containerId) {
        showFeedback('La selección por teclado no puede atravesar ramas distintas.');
        return;
      }
      const crossedId = direction > 0
        ? keyboardSlot.itemIds[keyboardSlot.index]
        : keyboardSlot.itemIds[keyboardSlot.index - 1];
      if (crossedId) {
        const crossed = findSequenceItem(content.items, crossedId);
        if (crossed) {
          setSelectionState((current) => toggleSequenceElement(
            isKeyboardFocusOnly ? selectSequenceElement(null) : current,
            { kind: crossed.kind, id: crossed.id },
          ));
        }
      }
    } else {
      const focusedId = nextSlot.itemIds[nextSlot.index - 1] ?? nextSlot.itemIds[nextSlot.index];
      const focused = focusedId ? findSequenceItem(content.items, focusedId) : undefined;
      if (focused) setKeyboardFocus({ kind: focused.kind, id: focused.id });
    }
    const aliveAtNextSlot = getSequenceParticipantIdsAliveAtSlot(content, layout, nextSlot);
    const nextSource = aliveAtNextSlot.includes(keyboardMode.sourceId)
      ? keyboardMode.sourceId
      : content.participants.find((participant) => aliveAtNextSlot.includes(participant.id))?.id ?? keyboardMode.sourceId;
    dispatchKeyboardMode({ type: 'navigate', slotIndex: nextIndex, sourceId: nextSource });
  }, [content, isKeyboardFocusOnly, keyboardMode.slotIndex, keyboardMode.sourceId, keyboardSlot, keyboardSlots, layout, setKeyboardFocus, setSelectionState, showFeedback]);

  const moveKeyboardParticipant = useCallback((direction: -1 | 1, target = false): void => {
    if (keyboardParticipantIds.length === 0) return;
    if (target && keyboardMode.messageType === 'create') {
      dispatchKeyboardMode({ type: 'set-route', createSide: direction });
      return;
    }
    const currentId = target ? (keyboardMode.targetId || keyboardMode.sourceId) : keyboardMode.sourceId;
    const nextId = moveCircular(keyboardParticipantIds, currentId, direction);
    if (!nextId) return;
    if (!target) {
      dispatchKeyboardMode({ type: 'navigate', sourceId: nextId, history: 'step' });
      return;
    }

    const route = resolveKeyboardTargetMove({
      participantIds: keyboardParticipantIds,
      targetId: keyboardMode.targetId || keyboardMode.sourceId,
      messageType: keyboardMode.messageType,
      direction,
      returnCalls: keyboardMode.messageType === 'return' && keyboardSlot
        ? findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId)
        : [],
    });
    if (route.feedback) {
      showFeedback(route.feedback);
      return;
    }
    if (Object.keys(route).length > 0) dispatchKeyboardMode({ type: 'set-route', ...route });
  }, [content, keyboardMode.messageType, keyboardMode.sourceId, keyboardMode.targetId, keyboardParticipantIds, keyboardSlot, layout, showFeedback]);

  /** A click on the empty canvas while navigating puts the cursor there. */
  const moveKeyboardCursorToPoint = useCallback((point: { x: number; y: number }): void => {
    if (keyboardSlots.length === 0) return;
    const slotIndex = findSequenceKeyboardSlotNearPoint(keyboardSlots, point);
    const aliveIds = getSequenceParticipantIdsAliveAtSlot(content, layout, keyboardSlots[slotIndex]);
    const candidates = content.participants
      .filter((participant) => aliveIds.includes(participant.id))
      .map((participant) => participant.id);
    const sourceId = findSequenceKeyboardParticipantNearX(candidates, layout.participantX, point.x);
    dispatchKeyboardMode({ type: 'navigate', slotIndex, sourceId, history: 'jump' });
  }, [content, keyboardSlots, layout]);

  const openKeyboardEdit = useCallback((): void => {
    if (!keyboardSlot) return;
    const itemId = keyboardSlot.itemIds[keyboardSlot.index - 1] ?? keyboardSlot.itemIds[keyboardSlot.index];
    const message = itemId ? findSequenceItem(content.items, itemId) : undefined;
    if (message?.kind !== 'message') {
      showFeedback('Ubicá el cursor junto a un mensaje para editarlo.');
      return;
    }
    const text = message.type === 'return'
      ? ''
      : message.type === 'create'
        ? formatSequenceParticipantName(content.participants.find((participant) => participant.id === message.targetId) ?? {
            id: message.targetId,
            kind: 'object',
            name: '',
            classifierName: 'Objeto',
            x: 0,
          })
        : formatSequenceMessageLabel(message);
    dispatchKeyboardMode({ type: 'navigate', sourceId: message.sourceId });
    dispatchKeyboardMode({ type: 'begin', messageType: message.type, targetId: message.targetId, returnCandidateIds: message.replyToMessageId ? [message.replyToMessageId] : [] });
    const createdParticipant = message.type === 'create'
      ? content.participants.find((participant) => participant.id === message.targetId)
      : undefined;
    if (createdParticipant && createdParticipant.kind !== 'actor') {
      dispatchKeyboardMode({ type: 'set-create-kind', createKind: createdParticipant.kind });
    }
    dispatchKeyboardMode({ type: 'start-typing', text, editId: message.id, operationMethodId: message.operationMethodId });
    setSelection({ kind: 'message', id: message.id });
  }, [content.items, content.participants, keyboardSlot, setSelection, showFeedback]);

  const commitKeyboardGuard = useCallback((): void => {
    if (!keyboardMode.guardFragmentId || !keyboardMode.guardOperandId) return;
    const nextItems = updateSequenceItem(content.items, keyboardMode.guardFragmentId, (item) => {
      if (item.kind !== 'fragment') return item;
      return {
        ...item,
        operands: item.operands.map((operand) => operand.id === keyboardMode.guardOperandId
          ? { ...operand, guard: keyboardMode.guardText }
          : operand),
      };
    });
    if (commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }))) {
      dispatchKeyboardMode({ type: 'navigate' });
      showFeedback('Guarda actualizada.');
    }
  }, [commit, content, keepAnchoredNotesWithTimeline, keyboardMode.guardFragmentId, keyboardMode.guardOperandId, keyboardMode.guardText, showFeedback]);

  /**
   * Right after a keyboard creation the focus goes straight to the text the
   * diagram shows: the name in the tab for a single-branch fragment (loop,
   * opt...) and the first branch's guard for alt / par.
   */
  const openKeyboardFragmentNameEditor = useCallback((fragment: SequenceFragment, nextLayout: ReturnType<typeof buildSequenceLayout>): void => {
    const box = nextLayout.fragmentLayouts.get(fragment.id);
    if (!box) return;
    if (!isSingleOperandFragment(fragment)) {
      const operand = fragment.operands[0];
      const operandBox = box.operands.find((candidate) => candidate.id === operand.id);
      if (operand && operandBox) {
        setInlineFragmentEditor({
          kind: 'guard',
          fragmentId: fragment.id,
          operandId: operand.id,
          value: operand.guard,
          x: box.x + 8,
          y: operandBox.top + 2,
          width: Math.min(260, Math.max(140, box.width - 30)),
        });
        return;
      }
    }
    setInlineFragmentEditor({
      kind: 'name',
      fragmentId: fragment.id,
      value: fragment.name,
      x: box.x + 4,
      y: box.y + 2,
      width: Math.max(180, Math.min(box.width - 8, (box.tabWidth ?? 94) + 80)),
    });
  }, []);

  const commitKeyboardFragment = useCallback((): void => {
    if (!keyboardSlot) return;
    if (selectedTimelineIds.length > 0 && !isKeyboardFocusOnly) {
      const result = wrapSequenceItems(content.items, selectedTimelineIds, keyboardMode.fragmentOperator);
      if (!result) {
        showFeedback('Los elementos deben ser contiguos y pertenecer a la misma rama.');
        return;
      }
      const nextContent = keepAnchoredNotesWithTimeline({ ...content, items: result.items });
      if (commit(nextContent)) {
        const nextSlots = buildSequenceKeyboardInsertionSlots(nextContent, buildSequenceLayout(nextContent));
        setSelectedTimelineIds([]);
        setSelection({ kind: 'fragment', id: result.createdFragment.id });
        openKeyboardFragmentNameEditor(result.createdFragment, buildSequenceLayout(nextContent));
        dispatchKeyboardMode({
          type: 'committed',
          slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, result.createdFragment.id),
          sourceId: keyboardMode.sourceId,
        });
        showFeedback(`Fragmento ${keyboardMode.fragmentOperator} creado.`);
      }
      return;
    }
    // A new empty fragment starts on the lifeline the cursor is on (with the
    // usual left margin) instead of spanning the whole diagram.
    const anchorId = content.participants.some((participant) => participant.id === keyboardMode.sourceId) ? keyboardMode.sourceId : undefined;
    const fragment: SequenceFragment = {
      ...createSequenceFragment(keyboardMode.fragmentOperator),
      startParticipantId: anchorId,
      endParticipantId: anchorId,
    };
    const items = insertSequenceItemAtSlot(content.items, fragment, keyboardSlot);
    const nextContent = keepAnchoredNotesWithTimeline({ ...content, items });
    if (commit(nextContent)) {
      const nextLayout = buildSequenceLayout(nextContent);
      const nextSlots = buildSequenceKeyboardInsertionSlots(nextContent, nextLayout);
      setSelection({ kind: 'fragment', id: fragment.id });
      openKeyboardFragmentNameEditor(fragment, nextLayout);
      dispatchKeyboardMode({
        type: 'committed',
        slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, fragment.id),
        sourceId: keyboardMode.sourceId,
      });
      showFeedback(`Fragmento ${keyboardMode.fragmentOperator} creado.`);
    }
  }, [commit, content, isKeyboardFocusOnly, keepAnchoredNotesWithTimeline, keyboardMode.fragmentOperator, keyboardMode.sourceId, keyboardSlot, openKeyboardFragmentNameEditor, selectedTimelineIds, setSelectedTimelineIds, setSelection, showFeedback]);

  const commitKeyboardMessage = useCallback((addAutomaticReturn = false, stayAtSource = false): void => {
    if (!keyboardSlot || (keyboardMode.stage !== 'aim' && keyboardMode.stage !== 'typing')) return;
    if (keyboardMode.stage === 'aim' && keyboardMode.messageType !== 'destroy' && keyboardMode.messageType !== 'return') {
      dispatchKeyboardMode({ type: 'start-typing' });
      return;
    }

    let participants = [...content.participants];
    let targetId = keyboardMode.targetId;
    let createdParticipant: SequenceParticipant | undefined;
    const sourceId = keyboardMode.sourceId;

    if (keyboardMode.messageType === 'create' && !keyboardMode.editId) {
      createdParticipant = createSequenceParticipantFromLabel({
        text: keyboardMode.text,
        participants: content.participants,
        side: keyboardMode.createSide,
        kind: keyboardMode.createKind,
        terminateLifeline: true,
      }) ?? undefined;
      if (!createdParticipant) {
        showFeedback('Escribí una identificación válida, por ejemplo pedido:Pedido.');
        return;
      }
      targetId = createdParticipant.id;
      participants.push(createdParticipant);
    } else if (keyboardMode.messageType === 'create' && keyboardMode.editId && targetId) {
      const parsed = parseSequenceParticipantLabel(keyboardMode.text);
      if (!participantLabelIsValid(parsed)) {
        showFeedback('Escribí una identificación válida, por ejemplo pedido:Pedido.');
        return;
      }
      participants = participants.map((participant) => participant.id === targetId
        ? {
            ...participant,
            kind: keyboardMode.createKind,
            name: parsed.instanceName,
            classifierName: parsed.classifierName,
          }
        : participant);
    }

    if (!sourceId || !targetId) {
      showFeedback('Elegí un origen y un destino válidos.');
      return;
    }

    const signature = parseSequenceKeyboardSignature(keyboardMode.text);
    const isCall = keyboardMode.messageType === 'synchronous' || keyboardMode.messageType === 'asynchronous';
    if (isCall && signature.name.trim().length === 0) {
      showFeedback('Escribí el nombre del mensaje o elegí una sugerencia.');
      return;
    }
    const replyToMessageId = keyboardMode.messageType === 'return'
      ? keyboardMode.returnCandidateIds[keyboardMode.returnCandidateIndex]
      : undefined;
    const message = buildSequenceMessageFromEditModel(createSequenceMessageEditModel({
      type: keyboardMode.messageType,
      sourceId,
      targetId,
      name: keyboardMode.messageType === 'create' ? 'create' : signature.name,
      arguments: keyboardMode.messageType === 'create' ? '' : signature.arguments,
      returnType: keyboardMode.messageType === 'create' ? '' : signature.returnType,
      operationMethodId: keyboardMode.operationMethodId,
      replyToMessageId,
    }), keyboardMode.editId);

    let items: SequenceTimelineItem[];
    if (keyboardMode.editId) {
      // Only what the composer edits changes; the flow reference and the other
      // argument field stay. The text showed the concrete values when there
      // were any, so the typed arguments go back to that same field.
      items = updateSequenceItem(content.items, keyboardMode.editId, (item) => {
        if (item.kind !== 'message') return item;
        const original = sequenceMessageEditModelFromMessage(item);
        const editsValues = item.parameterValues.trim().length > 0;
        return {
          ...item,
          ...sequenceMessageEditModelToPatch({
            ...original,
            type: message.type,
            sourceId: message.sourceId,
            targetId: message.targetId,
            name: message.name,
            arguments: editsValues ? original.arguments : message.arguments,
            parameterValues: editsValues ? message.arguments : original.parameterValues,
            returnType: message.returnType,
            operationMethodId: message.name.trim() === item.name.trim() ? original.operationMethodId ?? message.operationMethodId : message.operationMethodId,
            replyToMessageId: message.replyToMessageId,
            editId: item.id,
          }),
        } as SequenceMessage;
      });
    } else {
      items = insertSequenceItemAtSlot(content.items, message, keyboardSlot);
    }

    if (createdParticipant) createdParticipant.createdByMessageId = message.id;
    const previousMessage = keyboardMode.editId ? findSequenceItem(content.items, keyboardMode.editId) : undefined;
    participants = reconcileMessageLifecycleMarkers(
      participants,
      message,
      previousMessage?.kind === 'message' ? previousMessage : undefined,
    );

    let selectionId = keyboardMode.editId ?? message.id;
    let automaticReturnId: string | undefined;
    if (addAutomaticReturn && keyboardMode.messageType === 'synchronous' && !keyboardMode.editId) {
      const reply = createSequenceMessage('return', targetId, sourceId);
      reply.replyToMessageId = message.id;
      items = insertSequenceItem(items, reply, { afterItemId: message.id });
      selectionId = reply.id;
      automaticReturnId = reply.id;
    }

    const candidate = keepAnchoredNotesWithTimeline({ ...content, participants, items });
    const savedMessageId = keyboardMode.editId ?? message.id;
    if (keyboardMode.messageType === 'return' && analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.severity === 'error' && problem.messageId === savedMessageId
    ))) {
      showFeedback('Ese retorno genera un error de ciclo de vida.');
      return;
    }
    if (automaticReturnId && analyzeSequenceDiagramSemantics(candidate).problems.some((problem) => (
      problem.code === 'unmatched-return' && problem.messageId === automaticReturnId
    ))) {
      showFeedback('No se puede crear el retorno automático en este punto: el receptor no tiene una llamada compatible abierta.');
      return;
    }

    const saved = commit(candidate);
    if (!saved) return;

    const nextSource = stayAtSource || (addAutomaticReturn && keyboardMode.messageType === 'synchronous')
      ? sourceId
      : keyboardMode.messageType === 'asynchronous' || keyboardMode.messageType === 'destroy'
        ? sourceId
        : targetId;
    const nextSlots = buildSequenceKeyboardInsertionSlots(candidate, buildSequenceLayout(candidate));
    setKeyboardFocus({ kind: 'message', id: selectionId });
    dispatchKeyboardMode({
      type: 'committed',
      slotIndex: findSequenceKeyboardSlotAfterItem(nextSlots, selectionId),
      sourceId: nextSource,
      usedTarget: keyboardMode.messageType === 'synchronous' || keyboardMode.messageType === 'asynchronous' || keyboardMode.messageType === 'destroy'
        ? { sourceId, targetId }
        : undefined,
    });
    showFeedback(addAutomaticReturn && keyboardMode.messageType === 'synchronous'
      ? 'Llamada y retorno creados.'
      : keyboardMode.editId ? 'Mensaje actualizado.' : 'Mensaje creado.');
  }, [commit, content, keepAnchoredNotesWithTimeline, keyboardMode, keyboardSlot, setKeyboardFocus, showFeedback]);

  useEffect(() => {
    if (keyboardMode.stage === 'off') return;
    if (keyboardMode.slotIndex < keyboardSlots.length) return;
    dispatchKeyboardMode({ type: 'navigate', slotIndex: Math.max(0, keyboardSlots.length - 1) });
  }, [keyboardMode.slotIndex, keyboardMode.stage, keyboardSlots.length]);

  const handleKeyboardMode = useEffectEvent((event: KeyboardEvent): void => {
      if (shouldIgnoreEditorShortcut(event, document) || isNotebookEvent(event)) return;
      // The fragment name field owns the keyboard while it is open.
      if (inlineFragmentEditor) return;
      const editableTarget = isKeyboardTextTarget(event.target);
      const key = event.key.toLocaleLowerCase();
      if (key.length === 1 && hasCommandModifier(event)) return;

      if (keyboardMode.stage === 'off') {
        const activeElement = document.activeElement;
        const editorHasFocus = activeElement === document.body || (activeElement !== null && editorRootRef.current?.contains(activeElement));
        if (key === 'm' && !editableTarget && editorHasFocus && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          activateKeyboardMode();
        }
        return;
      }

      if (editableTarget) return;

      if (key === 'm' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        dispatchKeyboardMode({ type: 'deactivate' });
        showFeedback('Modo teclado desactivado.');
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        dispatchKeyboardMode({ type: 'back' });
        return;
      }

      if (keyboardMode.stage === 'navigate') {
        if (((event.key === 'ArrowUp' || event.key === 'ArrowDown') && (event.metaKey || event.ctrlKey)) || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          moveKeyboardSlot(event.key === 'ArrowUp' || event.key === 'Home' ? -1 : 1, false, true);
          return;
        }
        if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey) {
          event.preventDefault();
          moveKeyboardSlot(event.key === 'ArrowUp' ? -1 : 1, event.shiftKey);
          return;
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          const step = stepSequenceKeyboardSourceHistory(keyboardMode, direction, keyboardParticipantIds);
          if (step) dispatchKeyboardMode({ type: 'source-history', ...step });
          else showFeedback(direction < 0 ? 'No hay una línea anterior a la que volver.' : 'No hay nada para rehacer.');
          return;
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey) {
          event.preventDefault();
          moveKeyboardParticipant(event.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
        if (/^[0-9]$/.test(event.key)) {
          event.preventDefault();
          const participantId = findSequenceKeyboardParticipantByDigit(content.participants, event.key);
          if (!participantId) return;
          if (!keyboardParticipantIds.includes(participantId)) {
            showFeedback('Esa línea de vida no existe en este punto del diagrama.');
            return;
          }
          dispatchKeyboardMode({ type: 'navigate', sourceId: participantId, history: 'jump' });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          beginKeyboardMessage('synchronous');
          return;
        }
        if (key === 's' || key === 'r' || key === 'c' || key === 'd') {
          event.preventDefault();
          const typeByKey: Record<string, SequenceMessageType> = {
            s: 'synchronous',
            r: 'return',
            c: 'create',
            d: 'destroy',
          };
          beginKeyboardMessage(typeByKey[key]);
          return;
        }
        if (key === 'f') {
          event.preventDefault();
          dispatchKeyboardMode({ type: 'open-fragment' });
          return;
        }
        if (key === 'p') {
          event.preventDefault();
          dispatchKeyboardMode({ type: 'begin-participant' });
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          openKeyboardEdit();
          return;
        }
        if (key === 'g' && keyboardSlot?.operandId) {
          const operandInfo = findFragmentOperand(content.items, keyboardSlot.operandId);
          const operand = operandInfo?.fragment.operands[operandInfo.operandIndex];
          if (operandInfo && operand) {
            event.preventDefault();
            dispatchKeyboardMode({ type: 'open-guard', fragmentId: operandInfo.fragment.id, operandId: operand.id, text: operand.guard });
          }
          return;
        }
        if (event.key === 'Tab' && keyboardSlot?.operandId) {
          const operandInfo = findFragmentOperand(content.items, keyboardSlot.operandId);
          if (!operandInfo) return;
          event.preventDefault();
          const operands = operandInfo.fragment.operands;
          const nextOperandIndex = (operandInfo.operandIndex + (event.shiftKey ? -1 : 1) + operands.length) % operands.length;
          const nextOperandId = operands[nextOperandIndex].id;
          const candidateIndices = keyboardSlots
            .map((slot, index) => ({ slot, index }))
            .filter((entry) => entry.slot.containerId === nextOperandId);
          const target = candidateIndices.length > 0
            ? candidateIndices.reduce((closest, candidate) => (
                Math.abs(candidate.slot.index - keyboardSlot.index) < Math.abs(closest.slot.index - keyboardSlot.index)
                  ? candidate
                  : closest
              ))
            : undefined;
          if (target) dispatchKeyboardMode({ type: 'navigate', slotIndex: target.index });
          return;
        }
      }

      if (keyboardMode.stage === 'aim') {
        const choosesAmongLifelines = keyboardMode.messageType === 'synchronous' || keyboardMode.messageType === 'asynchronous' || keyboardMode.messageType === 'destroy';
        if (event.key === 'ArrowRight' && event.shiftKey && choosesAmongLifelines) {
          event.preventDefault();
          const lastTarget = findSequenceKeyboardLastTarget(keyboardMode, keyboardParticipantIds);
          if (lastTarget) dispatchKeyboardMode({ type: 'set-route', targetId: lastTarget });
          else showFeedback('Todavía no hay un destino usado al que volver.');
          return;
        }
        if (/^[0-9]$/.test(event.key) && keyboardMode.messageType !== 'create') {
          event.preventDefault();
          const participantId = findSequenceKeyboardParticipantByDigit(content.participants, event.key);
          if (!participantId) return;
          if (keyboardMode.messageType === 'return') {
            const calls = keyboardSlot ? findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId) : [];
            const callsToTarget = calls.filter((call) => call.sourceId === participantId);
            if (callsToTarget.length === 0) {
              showFeedback('Esa línea no tiene una llamada pendiente para retornar.');
              return;
            }
            dispatchKeyboardMode({ type: 'set-route', targetId: participantId, returnCandidateIds: callsToTarget.map((call) => call.id), returnCandidateIndex: 0 });
            return;
          }
          if (!keyboardParticipantIds.includes(participantId)) {
            showFeedback('Esa línea de vida no existe en este punto del diagrama.');
            return;
          }
          dispatchKeyboardMode({ type: 'set-route', targetId: participantId });
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          moveKeyboardParticipant(event.key === 'ArrowLeft' ? -1 : 1, true);
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          if (event.altKey && keyboardMode.messageType === 'create') {
            const kind = moveCircular(sequenceKeyboardCreateKinds, keyboardMode.createKind, direction);
            if (kind) dispatchKeyboardMode({ type: 'set-create-kind', createKind: kind });
            return;
          }
          if (event.altKey && keyboardMode.messageType === 'return' && keyboardMode.returnCandidateIds.length > 1) {
            const nextCandidateIndex = (keyboardMode.returnCandidateIndex + direction + keyboardMode.returnCandidateIds.length) % keyboardMode.returnCandidateIds.length;
            dispatchKeyboardMode({ type: 'set-route', returnCandidateIndex: nextCandidateIndex });
            return;
          }
          // The type is chosen with S, R, C and D (or by clicking it); the vertical arrows do not change it.
          return;
        }
        const key = event.key.toLocaleLowerCase();
        if (key === 's' || key === 'r' || key === 'c' || key === 'd') {
          event.preventDefault();
          const typeByKey: Record<string, SequenceMessageType> = {
            s: 'synchronous',
            r: 'return',
            c: 'create',
            d: 'destroy',
          };
          setKeyboardMessageType(typeByKey[key]);
          return;
        }
        if (key === 'k' && keyboardMode.messageType === 'create') {
          event.preventDefault();
          const kind = moveCircular(sequenceKeyboardCreateKinds, keyboardMode.createKind, 1);
          if (kind) dispatchKeyboardMode({ type: 'set-create-kind', createKind: kind });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardMessage(false, event.altKey);
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (keyboardMode.messageType === 'return') return;
          dispatchKeyboardMode({ type: 'start-typing' });
          return;
        }
        return;
      }

      if (keyboardMode.stage === 'participant') {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardParticipant();
        }
        return;
      }

      if (keyboardMode.stage === 'fragment') {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const operator = moveCircular(sequenceKeyboardFragmentOperators, keyboardMode.fragmentOperator, event.key === 'ArrowUp' ? -1 : 1);
          if (operator) dispatchKeyboardMode({ type: 'set-fragment-operator', operator });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          commitKeyboardFragment();
        }
      }
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardMode);
    return () => window.removeEventListener('keydown', handleKeyboardMode);
  }, []);

  useEffect(() => {
    if (keyboardMode.stage === 'off' || !keyboardSlot) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const sourceX = layout.participantX.get(keyboardMode.sourceId) ?? 120;
    const selectedTargetX = keyboardMode.stage === 'navigate'
      ? sourceX
      : layout.participantX.get(keyboardMode.targetId) ?? sourceX;
    const targetScreenX = selectedTargetX * zoom;
    const targetScreenY = keyboardSlot.y * zoom;
    const horizontalMargin = 110;
    const verticalMargin = 150;
    let left = scrollEl.scrollLeft;
    let top = scrollEl.scrollTop;

    if (targetScreenX < left + horizontalMargin) {
      left = Math.max(0, targetScreenX - horizontalMargin);
    } else if (targetScreenX > left + scrollEl.clientWidth - horizontalMargin) {
      left = Math.max(0, targetScreenX - scrollEl.clientWidth + horizontalMargin);
    }
    if (targetScreenY < top + verticalMargin) {
      top = Math.max(0, targetScreenY - verticalMargin);
    } else if (targetScreenY > top + scrollEl.clientHeight - 120) {
      top = Math.max(0, targetScreenY - scrollEl.clientHeight + 180);
    }

    if (Math.abs(left - scrollEl.scrollLeft) > 1 || Math.abs(top - scrollEl.scrollTop) > 1) {
      scrollEl.scrollTo({ left, top, behavior: 'smooth' });
    }
  }, [keyboardMode.sourceId, keyboardMode.stage, keyboardMode.targetId, keyboardSlot, layout.participantX, zoom]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (shouldIgnoreEditorShortcut(event, document) || event.key !== 'Escape' || isNotebookEvent(event)) return;
      setQuickMessage(null);
      setParticipantDraft(null);
      setParticipantPreview({});
      setNotePreview({});
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      toolbarRef.current?.querySelectorAll('details[open]').forEach((details) => {
        if (!details.contains(event.target as Node)) {
          details.removeAttribute('open');
        }
      });
    };
    const closeMenusOnEscape = (event: KeyboardEvent): void => {
      if (!shouldIgnoreEditorShortcut(event, document) && event.key === 'Escape' && !isNotebookEvent(event)) {
        toolbarRef.current?.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
      }
    };
    document.addEventListener('mousedown', closeMenus, true);
    document.addEventListener('keydown', closeMenusOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenus, true);
      document.removeEventListener('keydown', closeMenusOnEscape);
    };
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.005;
      setZoom((prevZoom) => {
        const nextZoom = Math.min(1.8, Math.max(0.3, prevZoom + delta));
        const rect = scrollEl.getBoundingClientRect();
        const pointerX = event.clientX - rect.left + scrollEl.scrollLeft;
        const pointerY = event.clientY - rect.top + scrollEl.scrollTop;
        const scaleRatio = nextZoom / prevZoom;
        scrollEl.scrollLeft = pointerX * scaleRatio - (event.clientX - rect.left);
        scrollEl.scrollTop = pointerY * scaleRatio - (event.clientY - rect.top);
        return nextZoom;
      });
    };
    scrollEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, []);

  const fitDiagramToView = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const viewportW = scrollEl.clientWidth - 40;
    const viewportH = scrollEl.clientHeight - 40;
    const diagramW = Math.max(400, layout.bounds.width + 80);
    const diagramH = Math.max(400, layout.bounds.height + 80);
    const optimalZoom = Math.max(0.3, Math.min(1.2, Math.min(viewportW / diagramW, viewportH / diagramH)));
    setZoom(optimalZoom);
    scrollEl.scrollTo({
      left: Math.max(0, (layout.bounds.left - 40) * optimalZoom),
      top: Math.max(0, (layout.bounds.top - 40) * optimalZoom),
      behavior: 'smooth',
    });
  }, [layout.bounds]);

  const keyboardModeOff = keyboardMode.stage === 'off';
  const keyboardGuideRef = useRef<HTMLDivElement | null>(null);
  // The help bar can wrap onto two lines; the canvas below follows its height.
  useLayoutEffect(() => {
    const guide = keyboardGuideRef.current;
    const panel = guide?.parentElement;
    if (!guide || !panel || keyboardModeOff) return;
    const sync = (): void => { panel.style.setProperty('--sequence-guide-height', `${guide.offsetHeight}px`); };
    sync();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(guide);
    return () => {
      observer?.disconnect();
      panel.style.removeProperty('--sequence-guide-height');
    };
  }, [keyboardModeOff]);

  // A sequence opened for the first time in the session starts fitted to the
  // view when it does not fit at 100%. A remembered view is always respected.
  const initialFitDone = useRef(false);
  useLayoutEffect(() => {
    if (initialFitDone.current) return;
    initialFitDone.current = true;
    const scrollEl = scrollRef.current;
    if (!scrollEl || initialView !== undefined || content.participants.length === 0) return;
    const fit = fitSequenceZoomToView({
      viewportWidth: scrollEl.clientWidth,
      viewportHeight: scrollEl.clientHeight,
      bounds: layout.bounds,
    });
    if (fit >= 1) return;
    setZoom(fit);
    scrollEl.scrollLeft = Math.max(0, (layout.bounds.left - 40) * fit);
    scrollEl.scrollTop = Math.max(0, (layout.bounds.top - 40) * fit);
  }, [content.participants.length, initialView, layout.bounds]);

  const getSelectionTarget = useCallback((targetSelection: SequenceSelection): SequenceViewportTarget | undefined => {
    if (targetSelection === null) return undefined;
    if (targetSelection.kind === 'participant') {
      const participant = layout.participantLayouts.get(targetSelection.id);
      if (!participant) return undefined;
      return {
        x: participant.x - participant.headerWidth / 2,
        y: participant.headerY,
        width: participant.headerWidth,
        height: participant.headerHeight,
      };
    }
    if (targetSelection.kind === 'message') {
      const message = layout.orderedMessages.find((candidate) => candidate.id === targetSelection.id);
      const messageBox = layout.messageLayouts.get(targetSelection.id);
      if (!message || !messageBox) return undefined;
      const sourceX = layout.participantX.get(message.sourceId) ?? 0;
      const targetX = layout.participantX.get(message.targetId) ?? sourceX;
      return {
        x: Math.min(sourceX, targetX) - 24,
        y: messageBox.y - messageBox.height / 2,
        width: Math.max(48, Math.abs(targetX - sourceX) + 48),
        height: messageBox.height,
      };
    }
    if (targetSelection.kind === 'fragment') {
      const fragment = layout.fragmentLayouts.get(targetSelection.id);
      return fragment ? { x: fragment.x, y: fragment.y, width: fragment.width, height: fragment.height } : undefined;
    }
    const note = layout.noteLayouts.get(targetSelection.id);
    return note ? { x: note.x, y: note.y, width: note.width, height: note.height } : undefined;
  }, [layout]);

  const selectCanvasElement = useCallback((nextSelection: SequenceSelection): void => {
    setSelection(nextSelection);
    setHighlightedSelection((current) => current !== null && (nextSelection === null || current.id !== nextSelection.id) ? null : current);
  }, [setSelection]);

  const handleTimelineItemSelect = useCallback((id: string, isMulti: boolean): void => {
    if (!isMulti) {
      setSelectedTimelineIds([]);
      return;
    }

    const item = findSequenceItem(content.items, id);
    if (!item) return;
    setSelectionState((current) => {
      const candidateState = toggleSequenceElement(current, { kind: item.kind, id });
      const candidate = candidateState.elements.filter((element) => element.kind !== 'note' && element.kind !== 'participant').map((element) => element.id);
      if (!areItemsInSameContainer(content.items, candidate)) {
        showFeedback('Solo se pueden seleccionar elementos dentro del mismo contenedor.');
        return selectSequenceElement({ kind: item.kind, id });
      }
      return candidateState;
    });
  }, [content.items, setSelectedTimelineIds, setSelectionState, showFeedback]);

  const handleMarqueeSelect = useCallback((timelineIds: string[], noteIds: string[]): void => {
    if (timelineIds.length === 0 && noteIds.length === 0) {
      selectCanvasElement(null);
      return;
    }
    const elements: SequenceSelectionTarget[] = [
      ...timelineIds.flatMap((id): SequenceSelectionTarget[] => {
        const item = findSequenceItem(content.items, id);
        return item ? [{ kind: item.kind, id }] : [];
      }),
      ...noteIds.map((id): SequenceSelectionTarget => ({ kind: 'note', id })),
    ];
    setSelectionState(replaceSequenceSelection(elements));
    const total = timelineIds.length + noteIds.length;
    if (total > 1) {
      if (!marqueeTipShownRef.current) {
        marqueeTipShownRef.current = true;
        showFeedback(`${total} elementos seleccionados en bloque. Consejo: Mayús+arrastrar selecciona dentro de fragmentos.`);
      } else {
        showFeedback(`${total} elementos seleccionados en bloque.`);
      }
    }
  }, [content.items, selectCanvasElement, setSelectionState, showFeedback]);

  const selectedMessageId = selection?.kind === 'message' ? selection.id : undefined;

  const canWrapSelection = useMemo(() => {
    const ids = selectedTimelineIds.length > 0
      ? selectedTimelineIds
      : selectedMessageId ? [selectedMessageId] : [];
    if (ids.length === 0) return false;
    return areItemsContiguous(content.items, ids);
  }, [content.items, selectedTimelineIds, selectedMessageId]);

  const handleWrapSelection = useCallback((operator: SequenceFragmentOperator, overrideIds?: string[]): void => {
    const idsToWrap = overrideIds ?? (selectedTimelineIds.length > 0
      ? selectedTimelineIds
      : selectedMessageId ? [selectedMessageId] : []);
    if (idsToWrap.length === 0) return;
    const result = wrapSequenceItems(content.items, idsToWrap, operator);
    if (!result) {
      showFeedback('No se pudieron envolver los elementos seleccionados (deben ser contiguos dentro del mismo contenedor).');
      return;
    }
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: result.items,
    }), true);
    if (saved) {
      setSelectedTimelineIds([]);
      setSelection({ kind: 'fragment', id: result.createdFragment.id });
      showFeedback(`Elemento${idsToWrap.length === 1 ? '' : 's'} envuelto${idsToWrap.length === 1 ? '' : 's'} en fragmento ${operator}.`);
    }
  }, [selectedTimelineIds, selectedMessageId, content, commit, keepAnchoredNotesWithTimeline, setSelectedTimelineIds, setSelection, showFeedback]);

  const handleUnwrapFragment = useCallback((fragmentId: string): void => {
    const result = unwrapSequenceFragment(content.items, fragmentId);
    if (!result) {
      showFeedback('No se pudo desempaquetar el fragmento.');
      return;
    }
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: result.items,
    }), true);
    if (saved) {
      if (result.unwrappedItems.length > 0) {
        const first = result.unwrappedItems[0];
        if (first.kind === 'message') {
          setSelection({ kind: 'message', id: first.id });
        } else if (first.kind === 'fragment') {
          setSelection({ kind: 'fragment', id: first.id });
        } else {
          setSelection(null);
        }
      } else {
        setSelection(null);
      }
      showFeedback(`Fragmento desempaquetado (${result.unwrappedItems.length} elemento${result.unwrappedItems.length === 1 ? '' : 's'} restaurado${result.unwrappedItems.length === 1 ? '' : 's'}).`);
    }
  }, [content, commit, keepAnchoredNotesWithTimeline, setSelection, showFeedback]);

  const startMessageDrag = useCallback((message: SequenceMessage, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();

    const startClientY = event.clientY;
    let didMove = false;
    let fallbackNoticeShown = false;

    // Grupo arrastrado: la selección en bloque cuando incluye al mensaje y es
    // contigua dentro del mismo contenedor; si no, solo ese mensaje.
    const rawIds = (selectedTimelineIds.includes(message.id) ? selectedTimelineIds : [message.id])
      .filter((id) => findSequenceItem(content.items, id) !== null);
    const topIds = getTopLevelBlockIds(content.items, rawIds);
    const isBlockDrag = topIds.length > 1
      && getOrderedSelectionInContainer(content.items, topIds) !== null;
    const groupIds = isBlockDrag ? topIds : [message.id];

    // Árbol y layout sin el grupo (el contenido no cambia durante el arrastre):
    // fuera de la zona de agarre, los huecos de ese árbol son estables.
    const { items: withoutItems, removed: groupItems } = removeSequenceItemsBlock(content.items, groupIds);
    const withoutLayout = buildSequenceLayout({ ...content, items: withoutItems });

    let lastKey: string | null = null;
    let lastValidation: ReturnType<typeof validateBlockCandidate> | null = null;
    let lastContainerName = 'fragmento';

    const guideBoundsFor = (
      previewLayout: ReturnType<typeof buildSequenceLayout>,
      containerId: string,
    ): { bounds?: { x: number; width: number }; containerBounds?: { x: number; width: number; top: number; bottom: number } } => {
      if (containerId === 'root') return {};
      for (const [, fragmentBox] of Array.from(previewLayout.fragmentLayouts.entries())) {
        const operand = fragmentBox.operands.find((candidate) => candidate.id === containerId);
        if (operand) {
          return {
            bounds: { x: fragmentBox.x, width: fragmentBox.width },
            containerBounds: { x: fragmentBox.x, width: fragmentBox.width, top: operand.top, bottom: operand.bottom },
          };
        }
      }
      return {};
    };

    const move = (pointerEvent: PointerEvent): void => {
      if (Math.abs(pointerEvent.clientY - startClientY) > 4) {
        didMove = true;
      }
      if (!didMove) return;

      if (!isBlockDrag && topIds.length > 1 && !fallbackNoticeShown) {
        fallbackNoticeShown = true;
        showFeedback('La selección no es un bloque contiguo: se mueve solo este mensaje.');
      }

      const svgEl = svgRef.current;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      const pointer = sequencePointerToCanvas(pointerEvent, rect, zoom);
      const canvasX = pointer.x;
      const canvasY = pointer.y;

      // El hueco se mide con el layout visible para la zona de agarre y con el
      // árbol sin el grupo fuera de ella: agarrar nunca salta y la guía
      // coincide exactamente con el aterrizaje.
      const target = findBlockDropTarget(content.items, layout, groupIds, withoutItems, withoutLayout, { x: canvasX, y: canvasY });
      const key = `${target.containerId}:${target.index}`;
      if (key === lastKey) return;
      lastKey = key;

      const candidate = insertTimelineItemsAt(withoutItems, target.containerId, target.index, groupItems);
      const semanticValidation = validateBlockCandidate(content, candidate, groupIds, target.containerId, { existingArtifactIds });
      const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidate });
      const validation = mutationGate.accepted
        ? semanticValidation
        : {
            ...semanticValidation,
            valid: false,
            reason: mutationGate.newProblems[0]?.message ?? semanticValidation.reason,
            problemCode: mutationGate.newProblems[0]?.code ?? semanticValidation.problemCode,
          };
      lastValidation = validation;
      lastContainerName = getBlockContainerName(content.items, target.containerId);

      if (validation.isNoop) {
        setMessageDragPreview(null);
        setInsertionGuide(null);
        return;
      }

      // La guía sale del mismo layout candidato que se ve en pantalla y del
      // mismo árbol que se commitea al soltar: lo que ves es donde cae.
      const previewLayout = buildSequenceLayout({ ...content, items: candidate });
      if (validation.valid) {
        setMessageDragPreview({ blockIds: groupIds, items: candidate });
      } else {
        // Un candidato rechazado no puede parecer ya aplicado: la línea roja
        // marca el intento, pero el mensaje permanece en su estado original.
        setMessageDragPreview(null);
      }
      setInsertionGuide({
        y: Math.round(getBlockDropGuideY(previewLayout, groupIds, canvasY)),
        isValid: validation.valid,
        reason: validation.reason,
        containerName: lastContainerName,
        ...guideBoundsFor(previewLayout, target.containerId),
      });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setMessageDragPreview(null);
      setInsertionGuide(null);

      if (!didMove || !lastValidation) {
        return;
      }
      if (lastValidation.isNoop) {
        return;
      }
      if (!lastValidation.valid || !lastValidation.newContent) {
        showFeedback(`Movimiento no permitido: ${lastValidation.reason || 'error de ciclo de vida'}`);
        return;
      }

      const saved = commit(keepAnchoredNotesWithTimeline(lastValidation.newContent), true);
      if (saved) {
        if (isBlockDrag) {
          showFeedback(`Bloque movido (${groupIds.length} elementos).`);
        } else {
          setSelection({ kind: 'message', id: message.id });
          showFeedback(lastContainerName === 'Secuencia principal'
            ? 'Mensaje reordenado.'
            : `Mensaje movido a ${lastContainerName}.`);
        }
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  }, [content, layout, existingArtifactIds, zoom, showFeedback, commit, keepAnchoredNotesWithTimeline, selectedTimelineIds, setSelection]);

  const selectOutlineItem = useCallback((nextSelection: Exclude<SequenceSelection, null>): void => {
    setSelection(nextSelection);
    setHighlightedSelection(nextSelection);
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedSelection((current) => current?.id === nextSelection.id ? null : current);
      highlightTimeoutRef.current = null;
    }, 2200);

    const target = getSelectionTarget(nextSelection);
    const scrollEl = scrollRef.current;
    if (!target || !scrollEl) return;
    const scroll = centerSequenceViewportOnTarget({
      target,
      viewportWidth: scrollEl.clientWidth,
      viewportHeight: scrollEl.clientHeight,
      zoom,
    });
    scrollEl.scrollTo({ ...scroll, behavior: 'smooth' });
  }, [getSelectionTarget, setSelection, zoom]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
  }, []);

  const closeReviewPanel = useCallback(() => setIsReviewPanelOpen(false), []);
  const reviewIssues = useMemo(() => reviewProblems.map((problem) => ({
    id: problem.id,
    kind: problem.severity === 'error' ? 'error' as const : 'review' as const,
    message: problem.message,
    problem,
  })), [reviewProblems]);
  const focusReviewIssue = useCallback(({ problem }: { problem: SequenceDiagramProblem }): void => {
    if (problem.messageId) selectOutlineItem({ kind: 'message', id: problem.messageId });
    else if (problem.fragmentId) selectOutlineItem({ kind: 'fragment', id: problem.fragmentId });
    else if (problem.participantId) selectOutlineItem({ kind: 'participant', id: problem.participantId });
  }, [selectOutlineItem]);

  const handleToolbarMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>): void => {
    const details = event.currentTarget;
    if (!details.open) return;
    toolbarRef.current?.querySelectorAll('details[open]').forEach((candidate) => {
      if (candidate !== details) candidate.removeAttribute('open');
    });
  };

  // The actor is almost always the first participant and there is usually
  // one: the composer starts on Actor until the diagram has one.
  const beginParticipantCreation = useCallback((kind?: 'object' | 'actor'): void => {
    setQuickMessage(null);
    setParticipantDraft({ text: '', kind: kind ?? (diagramHasActor ? 'object' : 'actor') });
  }, [diagramHasActor]);

  const submitParticipantDraft = useCallback((event: FormEvent): void => {
    event.preventDefault();
    if (!participantDraft) return;
    if (participantDraft.kind === 'actor') {
      // An actor is a name ("Consultor"), not instancia:Clase.
      const name = participantDraft.text.replace(/[\r\n]+/g, ' ').trim();
      if (!name) {
        showFeedback('Escribí el nombre del actor.');
        return;
      }
      const actor: SequenceParticipant = {
        id: createId(),
        kind: 'actor',
        name,
        classifierName: '',
        x: resolveSequenceParticipantInsertionX(content.participants, { kind: 'actor', name, classifierName: '' }),
      };
      if (commit({ ...content, participants: [...content.participants, actor] })) {
        setSelection({ kind: 'participant', id: actor.id });
        setParticipantDraft(null);
      }
      return;
    }
    const parsed = parseSequenceParticipantLabel(participantDraft.text);
    if (!participantLabelIsValid(parsed)) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    const participant = createSequenceParticipantFromLabel({
      text: participantDraft.text,
      participants: content.participants,
    });
    if (!participant) {
      showFeedback('Escribí una clase válida después de “:”.');
      return;
    }
    const saved = commit({ ...content, participants: [...content.participants, participant] });
    if (saved) {
      setSelection({ kind: 'participant', id: participant.id });
      setParticipantDraft(null);
    }
  }, [commit, content, participantDraft, setSelection, showFeedback]);

  const updateParticipantLabel = useCallback((id: string, text: string): void => {
    setParticipantEditDraft({ id, text });
    setParticipantColorReference((current) => current?.id === id
      ? current
      : content.participants.find((participant) => participant.id === id) ?? null);
    const parsed = parseSequenceParticipantLabel(text);
    if (!participantLabelIsValid(parsed)) return;
    void commit({
      ...content,
      participants: content.participants.map((participant) => participant.id === id
        ? { ...participant, name: parsed.instanceName, classifierName: parsed.classifierName }
        : participant),
    }, false);
  }, [commit, content]);

  // The toolbar opens the same dialog as dragging between lifelines, with the
  // route to choose. It continues the chain: from the receiver of the selected
  // (or last) message towards its neighbour, right after that message.
  const beginMessage = (type: SequenceMessageType = 'synchronous'): void => {
    if (content.participants.length === 0) {
      showFeedback('Agregá participantes antes del primer mensaje.');
      return;
    }
    const sorted = [...content.participants].sort((left, right) => left.x - right.x);
    const lastMessage = [...flatEntries].reverse().find((entry) => entry.item.kind === 'message')?.item;
    const chainFrom = selectedItem?.kind === 'message'
      ? selectedItem
      : selectedItem === null && lastMessage?.kind === 'message' ? lastMessage : undefined;
    // The first message of a diagram starts at the actor, whatever is selected.
    const hasMessages = lastMessage !== undefined;
    const firstRoute = hasMessages ? undefined : firstMessageRoute(content.participants);
    const sourceId = firstRoute?.sourceId ?? selectedParticipant?.id ?? chainFrom?.targetId ?? sorted[0].id;
    const sourceIndex = sorted.findIndex((participant) => participant.id === sourceId);
    const targetId = firstRoute?.targetId ?? sorted[sourceIndex + 1]?.id ?? sorted[sourceIndex - 1]?.id ?? sourceId;
    setQuickMessage(createSequenceMessageEditModel({
      type,
      sourceId,
      targetId,
      name: '',
      newParticipantKind: 'object',
      newParticipantName: '',
      anchorItemId: selectedItem?.id,
      placement: selectedItem ? 'after' : 'end',
    }));
    setQuickMessageRouteEditable(true);
  };

  const connectLifelines = (sourceId: string, targetId: string, y: number): void => {
    const sourceX = layout.participantX.get(sourceId) ?? 0;
    const targetX = layout.participantX.get(targetId) ?? 0;
    const isRightToLeft = sourceX > targetX;
    setQuickMessage(createSequenceMessageEditModel({
      sourceId,
      targetId,
      y,
      name: '',
      type: isRightToLeft ? 'return' : 'synchronous',
    }));
    setQuickMessageRouteEditable(false);
  };

  const editMessageOnCanvas = (id: string): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    setSelection({ kind: 'message', id });
    setQuickMessage(sequenceMessageEditModelFromMessage(message, layout.messageLayouts.get(id)?.y ?? 150));
    setQuickMessageRouteEditable(false);
  };

  const insertQuickMessage = (items: SequenceTimelineItem[], message: SequenceMessage, draft: QuickMessageDraft): SequenceTimelineItem[] => {
    if (draft.anchorItemId && findSequenceItem(items, draft.anchorItemId)) return insertSequenceItem(items, message, { afterItemId: draft.anchorItemId });
    if (draft.placement === 'end') return insertSequenceItem(items, message);
    return insertSequenceItemAtY(items, message, layout, draft.y);
  };

  /** create() towards an object typed in the dialog: the object is born with the message. */
  const saveQuickCreatedObject = (draft: QuickMessageDraft): void => {
    const createdParticipant = createSequenceParticipantFromLabel({
      text: draft.newParticipantName ?? '',
      participants: content.participants,
      terminateLifeline: true,
    });
    if (!createdParticipant) {
      showFeedback('Escribí una identificación válida, por ejemplo pedido:Pedido.');
      return;
    }
    const message = buildSequenceMessageFromEditModel({ ...draft, targetId: createdParticipant.id });
    createdParticipant.createdByMessageId = message.id;
    const participants = reconcileMessageLifecycleMarkers([...content.participants, createdParticipant], message);
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants,
      items: insertQuickMessage(content.items, message, draft),
    }));
    if (!saved) return;
    setSelection({ kind: 'message', id: message.id });
    setQuickMessage(null);
  };

  const saveQuickMessage = (event: FormEvent, committedDraft?: QuickMessageDraft): void => {
    event.preventDefault();
    const activeDraft = committedDraft ?? quickMessage;
    if (!activeDraft) return;
    const createsNewObject = !activeDraft.editId && activeDraft.type === 'create' && (activeDraft.newParticipantName ?? '').trim().length > 0;
    if (createsNewObject) {
      saveQuickCreatedObject(activeDraft);
      return;
    }
    if (![activeDraft.sourceId, activeDraft.targetId].every((id) => content.participants.some((p) => p.id === id))) { setQuickMessage(null); return; }
    if (activeDraft.type === 'create') {
      if (activeDraft.sourceId === activeDraft.targetId) { showFeedback('Un objeto no puede crearse a sí mismo.'); return; }
      const probe = createSequenceMessage('create', activeDraft.sourceId, activeDraft.targetId);
      const candidateItems = activeDraft.editId ? content.items : insertSequenceItemAtY(content.items, probe, layout, activeDraft.y);
      const ordered = flattenSequenceItems(candidateItems).map((entry) => entry.item).filter((item) => item.kind === 'message');
      const index = ordered.findIndex((item) => item.id === (activeDraft.editId ?? probe.id));
      const usedBefore = ordered.slice(0, index).some((item) => item.sourceId === activeDraft.targetId || item.targetId === activeDraft.targetId);
      const createdElsewhere = ordered.some((item) => item.id !== (activeDraft.editId ?? probe.id) && item.type === 'create' && item.targetId === activeDraft.targetId);
      if (usedBefore || createdElsewhere) { showFeedback('La creación debe ser la primera interacción del objeto. Agregá un mensaje de tipo «Crear» con «Objeto nuevo».'); return; }
    }
    let saved: boolean;
    if (activeDraft.editId) {
      const previous = findSequenceItem(content.items, activeDraft.editId);
      const message = buildSequenceMessageFromEditModel(activeDraft, activeDraft.editId);
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: reconcileMessageLifecycleMarkers(content.participants, message, previous?.kind === 'message' ? previous : undefined),
        items: updateSequenceItem(content.items, activeDraft.editId, (item) => ({ ...item, ...message } as SequenceMessage)),
      }));
    } else {
      const message = buildSequenceMessageFromEditModel(activeDraft);
      const items = insertQuickMessage(content.items, message, activeDraft);
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: reconcileMessageLifecycleMarkers(content.participants, message),
        items,
      }));
      if (saved) setSelection({ kind: 'message', id: message.id });
    }
    if (!saved) return;
    setQuickMessage(null);
  };

  const swapQuickMessage = (): void => {
    if (!quickMessage) return;
    const candidate = { ...quickMessage, sourceId: quickMessage.targetId, targetId: quickMessage.sourceId };
    const methodsForNewTarget = getSequenceMethodOptions({
      model: candidate,
      participants: content.participants,
      classDiagram: associatedClassDiagram,
    });
    setQuickMessage(swapSequenceMessageEditModel(quickMessage, methodsForNewTarget));
  };

  const addReturn = (): void => {
    if (selectedItem?.kind !== 'message') return;
    const reply = createSequenceMessage('return', selectedItem.targetId, selectedItem.sourceId);
    reply.replyToMessageId = selectedItem.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, reply, { afterItemId: selectedItem.id }) }));
    setSelection({ kind: 'message', id: reply.id });
  };

  const addFragment = (operator: SequenceFragmentOperator): void => {
    const idsToWrap = isKeyboardFocusOnly
      ? []
      : selectedTimelineIds.length > 0
        ? selectedTimelineIds
        : selectedItem?.kind === 'message' ? [selectedItem.id] : [];
    if (idsToWrap.length > 0) {
      handleWrapSelection(operator, idsToWrap);
      return;
    }
    const fragment = createSequenceFragment(operator);
    const afterItemId = selectedItem?.id;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItem(content.items, fragment, afterItemId ? { afterItemId } : undefined) }));
    setSelection({ kind: 'fragment', id: fragment.id });
  };

  const addNote = useCallback((): void => {
    const note: SequenceNote = {
      id: createId(),
      text: '',
      color: 'yellow',
      x: 0,
      y: 0,
      width: 230,
      height: 110,
      anchorKind: selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'participant'
        ? selection.kind
        : 'free',
      anchorId: selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'participant'
        ? selection.id
        : undefined,
    };
    Object.assign(note, resolveNewSequenceNotePosition(layout, note, {
      left: scrollPosition.left,
      top: scrollPosition.top,
      width: scrollRef.current?.clientWidth ?? viewportCanvasSize.width * zoom,
      height: scrollRef.current?.clientHeight ?? viewportCanvasSize.height * zoom,
      zoom,
    }));
    setInlineNoteEditor({ noteId: note.id, draft: note, value: '', x: note.x, y: note.y, width: note.width, height: note.height });
    // Beside an anchor near the edge, the draft can open out of view.
    window.requestAnimationFrame(() => {
      scrollRef.current?.querySelector('.sequence-inline-note-container')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }, [layout, scrollPosition, selection, viewportCanvasSize, zoom]);

  const deleteFragmentOperand = async (fragmentId: string, operandId: string): Promise<void> => {
    const fragment = findSequenceItem(content.items, fragmentId);
    if (fragment?.kind !== 'fragment') return;
    const operand = fragment.operands.find((candidate) => candidate.id === operandId);
    if (!operand) return;
    const messageCount = countSequenceMessages(operand.items);
    const isMinimumBranchCount = (fragment.operator === 'alt' || fragment.operator === 'par') && fragment.operands.length <= 2;
    if (isMinimumBranchCount) {
      showFeedback(`${fragment.operator} debe conservar al menos dos ramas. No se eliminó la rama; eliminá el fragmento completo si ya no lo necesitás.`);
      return;
    }
    const shouldDelete = await confirm({
      title: '¿Eliminar esta rama?',
      description: messageCount > 0
        ? `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que también se eliminarán.`
        : 'La rama queda fuera del fragmento.',
    });
    if (!shouldDelete) return;
    const removedMessageIds = new Set(flattenSequenceItems(operand.items)
      .filter((entry) => entry.item.kind === 'message')
      .map((entry) => entry.item.id));
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: updateSequenceItem(content.items, fragmentId, (item) => item.kind === 'fragment'
        ? { ...item, operands: item.operands.filter((candidate) => candidate.id !== operandId) }
        : item),
      activations: content.activations.filter((activation) =>
        !removedMessageIds.has(activation.startMessageId) && !removedMessageIds.has(activation.endMessageId ?? '')),
      notes: content.notes.map((note) => removedMessageIds.has(note.anchorId ?? '')
        ? { ...note, anchorKind: 'free', anchorId: undefined }
        : note),
    }));
    if (saved) setSelection({ kind: 'fragment', id: fragmentId });
  };

  const deleteBlockSelection = async (): Promise<void> => {
    const focusedId = selection !== null && selection.kind !== 'participant' ? selection.id : null;
    const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])];
    const noteIdSet = new Set(content.notes.map((note) => note.id));
    const noteIds = ids.filter((id) => noteIdSet.has(id));
    const timelineIds = ids.filter((id) => !noteIdSet.has(id));
    const { items: nextItems, removed } = removeSequenceItemsBlock(content.items, timelineIds);
    const notesToDelete = content.notes.filter((note) => noteIds.includes(note.id));
    if (removed.length === 0 && notesToDelete.length === 0) return;
    const messageCount = removed.reduce((count, item) => count + countSequenceMessages([item]), 0);
    const parts: string[] = [];
    if (removed.length > 0) {
      parts.push(`${removed.length} elemento${removed.length === 1 ? '' : 's'} de la línea de tiempo${messageCount > 0 ? ` (${messageCount} mensaje${messageCount === 1 ? '' : 's'})` : ''}`);
    }
    if (notesToDelete.length > 0) {
      parts.push(`${notesToDelete.length} nota${notesToDelete.length === 1 ? '' : 's'}`);
    }
    const shouldDelete = await confirm({
      title: '¿Eliminar la selección?',
      description: `Se eliminarán ${parts.join(' y ')}.`,
    });
    if (!shouldDelete) return;
    const removedIds = new Set(removed.flatMap((item) => flattenSequenceItems([item]).map((entry) => entry.item.id)));
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: content.participants.map((p) => ({
        ...p,
        createdByMessageId: removedIds.has(p.createdByMessageId ?? '') ? undefined : p.createdByMessageId,
        destroyedByMessageId: removedIds.has(p.destroyedByMessageId ?? '') ? undefined : p.destroyedByMessageId,
      })),
      items: nextItems,
      activations: content.activations.filter((activation) => !removedIds.has(activation.startMessageId) && !removedIds.has(activation.endMessageId ?? '')),
      notes: content.notes.filter((note) => !noteIds.includes(note.id)).map((note) => removedIds.has(note.anchorId ?? '')
        ? { ...note, anchorKind: 'free', anchorId: undefined }
        : note),
    }));
    if (saved) {
      setSelection(null);
      setSelectedTimelineIds([]);
      const total = removed.length + notesToDelete.length;
      showFeedback(`Se eliminaron ${total} elemento${total === 1 ? '' : 's'}.`);
    }
  };

  const deleteSelection = async (): Promise<void> => {
    if (selectedTimelineIds.length > 0 && (selection === null || selection.kind !== 'participant')) {
      await deleteBlockSelection();
      return;
    }
    if (selection === null) return;
    let saved: boolean;
    if (selection.kind === 'participant') {
      const messageIds = new Set(flatEntries.filter((entry) => entry.item.kind === 'message' && (entry.item.sourceId === selection.id || entry.item.targetId === selection.id)).map((entry) => entry.item.id));
      const removeMessages = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.flatMap((item): SequenceTimelineItem[] => {
        if (item.kind === 'message') return messageIds.has(item.id) ? [] : [item];
        return [{ ...item, operands: item.operands.map((operand) => ({ ...operand, items: removeMessages(operand.items) })) }];
      });
      const shouldDelete = await confirm({
        title: '¿Eliminar este participante?',
        description: messageIds.size > 0
          ? `Tiene ${messageIds.size} mensaje${messageIds.size === 1 ? '' : 's'} asociado${messageIds.size === 1 ? '' : 's'}: también se eliminan, y las notas vinculadas quedan libres.`
          : undefined,
      });
      if (!shouldDelete) return;
      saved = commit({
        ...content,
        participants: content.participants.filter((participant) => participant.id !== selection.id),
        items: removeMessages(content.items),
        activations: content.activations.filter((activation) => activation.participantId !== selection.id
          && !messageIds.has(activation.startMessageId)
          && !messageIds.has(activation.endMessageId ?? '')),
        notes: content.notes.map((note) => messageIds.has(note.anchorId ?? '')
            ? { ...note, anchorKind: 'free', anchorId: undefined }
            : note),
      });
    } else if (selection.kind === 'note') {
      saved = commit({ ...content, notes: content.notes.filter((note) => note.id !== selection.id) });
    } else {
      const result = removeSequenceItem(content.items, selection.id);
      const messageCount = result.removed?.kind === 'fragment'
        ? countSequenceMessages([result.removed])
        : result.removed?.kind === 'message' ? 1 : 0;
      if (messageCount > 0) {
        const isFragment = result.removed?.kind === 'fragment';
        const shouldDelete = await confirm({
          title: isFragment ? '¿Eliminar el fragmento y su contenido?' : '¿Eliminar este elemento?',
          description: isFragment
            ? `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que se eliminan junto con el contenedor. Para conservarlos en su lugar, usá «Desempaquetar» (${shortcutLabel('⇧⌘U')}).`
            : `Contiene ${messageCount} mensaje${messageCount === 1 ? '' : 's'} que también se eliminarán.`,
        });
        if (!shouldDelete) return;
      }
      const removedIds = result.removed === null
        ? new Set<string>()
        : new Set(flattenSequenceItems([result.removed]).map((entry) => entry.item.id));
      saved = commit(keepAnchoredNotesWithTimeline({
        ...content,
        participants: content.participants.map((p) => ({
          ...p,
          createdByMessageId: removedIds.has(p.createdByMessageId ?? '') ? undefined : p.createdByMessageId,
          destroyedByMessageId: removedIds.has(p.destroyedByMessageId ?? '') ? undefined : p.destroyedByMessageId,
        })),
        items: result.items,
        activations: content.activations.filter((activation) => !removedIds.has(activation.startMessageId) && !removedIds.has(activation.endMessageId ?? '')),
        notes: content.notes.map((note) => removedIds.has(note.anchorId ?? '')
          ? { ...note, anchorKind: 'free', anchorId: undefined }
          : note),
      }));
    }
    if (saved) setSelection(null);
  };

  const deleteSelectionRef = useRef(deleteSelection);
  useEffect(() => {
    deleteSelectionRef.current = deleteSelection;
  });

  useEffect(() => {
    const handleDeleteSelection = (event: KeyboardEvent): void => {
      if (shouldIgnoreEditorShortcut(event, document)) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (quickMessage !== null || isNotebookEvent(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog') !== null) return;
      event.preventDefault();
      void deleteSelectionRef.current();
    };
    window.addEventListener('keydown', handleDeleteSelection);
    return () => window.removeEventListener('keydown', handleDeleteSelection);
  }, [quickMessage]);

  const moveSelectedItem = useCallback((direction: -1 | 1): void => {
    if (selectedTimelineIds.length > 0) {
      const focusedId = selection?.kind === 'message' || selection?.kind === 'fragment' ? selection.id : null;
      const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])]
        .filter((id) => findSequenceItem(content.items, id) !== null);
      if (ids.length === 0) return;
      if (ids.length === 1) {
        commit(keepAnchoredNotesWithTimeline({ ...content, items: moveSequenceItem(content.items, ids[0], direction) }));
        return;
      }
      const next = moveSequenceItemsBlock(content.items, ids, direction);
      if (next === content.items) {
        showFeedback('El bloque no se puede mover (debe ser contiguo dentro del mismo contenedor).');
        return;
      }
      commit(keepAnchoredNotesWithTimeline({ ...content, items: next }));
      return;
    }
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    commit(keepAnchoredNotesWithTimeline({ ...content, items: moveSequenceItem(content.items, selection.id, direction) }));
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, selectedTimelineIds, showFeedback]);

  const dropOutlineItem = (targetId: string): void => {
    if (draggedOutlineItemId === null || draggedOutlineItemId === targetId) return;
    const result = removeSequenceItem(content.items, draggedOutlineItemId);
    if (result.removed === null) return;
    if (result.removed.kind === 'fragment') {
      const descendants = new Set(flattenSequenceItems(result.removed.operands.flatMap((operand) => operand.items)).map((entry) => entry.item.id));
      if (descendants.has(targetId)) return;
    }
    commit(keepAnchoredNotesWithTimeline({ ...content, items: insertSequenceItemBefore(result.items, result.removed, targetId) }));
    setDraggedOutlineItemId(null);
    setOutlineDropTargetId(null);
  };

  const handleCanvasScroll = (element: HTMLDivElement): void => {
    setScrollPosition({ left: element.scrollLeft, top: element.scrollTop });
    const now = performance.now();
    if (now - canvasExpansionRef.current < 500) return;
    const expansion = expandSequenceViewportAtEdge({
      currentWidth: Math.max(content.canvas.width, viewportCanvasSize.width),
      currentHeight: Math.max(content.canvas.height, viewportCanvasSize.height),
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
    });
    if (!expansion.expanded) return;
    canvasExpansionRef.current = now;
    setViewportCanvasSize((current) => ({
      width: Math.max(current.width, expansion.width),
      height: Math.max(current.height, expansion.height),
    }));
  };

  const duplicateSelectedItem = useCallback((): void => {
    if (selection?.kind !== 'message' && selection?.kind !== 'fragment') return;
    const result = duplicateSequenceItem(content.items, selection.id);
    if (!commit(keepAnchoredNotesWithTimeline({ ...content, items: result.items }))) return;
    if (result.duplicateId) setSelection({ kind: selection.kind, id: result.duplicateId });
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, setSelection]);

  const copyBlockSelection = useCallback((): boolean => {
    const focusedId = selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'note'
      ? selection.id
      : null;
    const ids = [...new Set([...(focusedId ? [focusedId] : []), ...selectedTimelineIds])];
    if (ids.length === 0) return false;
    const noteIdSet = new Set(content.notes.map((note) => note.id));
    const notes = ids
      .map((id) => content.notes.find((note) => note.id === id))
      .filter((note): note is SequenceNote => note !== undefined);
    const items = getTopLevelBlockIds(content.items, ids.filter((id) => !noteIdSet.has(id)))
      .map((id) => findSequenceItem(content.items, id))
      .filter((item): item is SequenceTimelineItem => item !== null);
    if (items.length === 0 && notes.length === 0) return false;
    blockClipboard.current = {
      items: JSON.parse(JSON.stringify(items)) as SequenceTimelineItem[],
      notes: JSON.parse(JSON.stringify(notes)) as SequenceNote[],
    };
    const total = items.length + notes.length;
    showFeedback(`Bloque copiado (${total} elemento${total === 1 ? '' : 's'}).`);
    return true;
  }, [content.items, content.notes, selection, selectedTimelineIds, showFeedback]);

  const pasteBlockSelection = useCallback((): void => {
    const clipboard = blockClipboard.current;
    if (!clipboard || (clipboard.items.length === 0 && clipboard.notes.length === 0)) return;
    const { items: itemClones, notes: noteClones } = cloneSequenceBlock(clipboard.items, clipboard.notes);
    let nextItems = content.items;
    const anchorCandidates = [...selectedTimelineIds];
    if (selection?.kind === 'message' || selection?.kind === 'fragment') anchorCandidates.push(selection.id);
    let afterId: string | undefined;
    for (let i = anchorCandidates.length - 1; i >= 0; i -= 1) {
      if (findSequenceItem(nextItems, anchorCandidates[i]) !== null) {
        afterId = anchorCandidates[i];
        break;
      }
    }
    for (const clone of itemClones) {
      nextItems = insertSequenceItem(nextItems, clone, afterId ? { afterItemId: afterId } : undefined);
      afterId = clone.id;
    }
    const saved = commit(keepAnchoredNotesWithTimeline({
      ...content,
      items: nextItems,
      notes: [...content.notes, ...noteClones],
    }), true);
    if (saved) {
      // The clones exist only in the content just committed, so the selection
      // is built from them directly instead of looking them up in the old one.
      setSelectionState(replaceSequenceSelection([
        ...itemClones.map((item): SequenceSelectionTarget => ({ kind: item.kind, id: item.id })),
        ...noteClones.map((note): SequenceSelectionTarget => ({ kind: 'note', id: note.id })),
      ]));
      const total = itemClones.length + noteClones.length;
      showFeedback(`Bloque pegado (${total} elemento${total === 1 ? '' : 's'}).`);
    }
  }, [commit, content, keepAnchoredNotesWithTimeline, selection, selectedTimelineIds, setSelectionState, showFeedback]);

  const moveParticipantHorizontal = useCallback((participantId: string, direction: -1 | 1): void => {
    const updated = reorderSequenceParticipants(content.participants, participantId, direction);
    if (!updated || updated.every((participant) => {
      const before = content.participants.find((candidate) => candidate.id === participant.id);
      return before?.x === participant.x;
    })) return;
    commit({ ...content, participants: updated });
  }, [commit, content]);

  const startParticipantDrag = (participant: SequenceParticipant, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey) return;
    event.preventDefault();
    const start = event.clientX;
    const startScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const original = participant.x;
    const originalOrder = [...content.participants].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id)).map((item) => item.id);
    let finalX = original;
    let didMove = false;
    let freePosition = event.altKey;
    let reordered = resolveSequenceParticipantDragReorder(content.participants, participant.id, original);
    const move = (pointerEvent: PointerEvent): void => {
      const scrollDelta = (scrollRef.current?.scrollLeft ?? startScrollLeft) - startScrollLeft;
      const delta = pointerEvent.clientX - start + scrollDelta;
      if (!didMove && Math.abs(delta) < 3) return;
      didMove = true;
      setIsParticipantDragging(true);
      freePosition = pointerEvent.altKey;
      const requestedX = original + delta / zoom;
      if (freePosition) {
        finalX = clampParticipantX(content.participants, participant.id, requestedX);
        setParticipantPreview({ [participant.id]: finalX });
      } else {
        reordered = resolveSequenceParticipantDragReorder(content.participants, participant.id, requestedX);
        setParticipantPreview({ ...reordered.positions, [participant.id]: Math.max(90, requestedX) });
      }
    };
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      setParticipantPreview({});
      setIsParticipantDragging(false);
    };
    const finish = (pointerEvent: PointerEvent): void => {
      if (didMove) move(pointerEvent);
      cleanup();
      if (!didMove) return;
      if (freePosition) {
        if (Math.abs(finalX - original) <= 1) return;
        const updated = content.participants.map((candidate) => candidate.id === participant.id ? { ...candidate, x: finalX } : candidate);
        updated.sort((a, b) => a.x - b.x);
        commit({ ...content, participants: updated });
      } else if (reordered.order.some((id, index) => id !== originalOrder[index])) {
        const byId = new Map(content.participants.map((candidate) => [candidate.id, candidate]));
        commit({ ...content, participants: reordered.order.map((id) => ({ ...byId.get(id)!, x: reordered.positions[id] })) });
      }
    };
    const cancel = (): void => cleanup();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  const startNoteDrag = (note: SequenceNote, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    };
    let position = { x: note.x, y: note.y };
    let didMove = false;
    const move = (pointerEvent: PointerEvent): void => {
      const current = {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        scrollLeft: scrollRef.current?.scrollLeft ?? start.scrollLeft,
        scrollTop: scrollRef.current?.scrollTop ?? start.scrollTop,
      };
      didMove = didMove || hasMeaningfulSequenceNoteDrag(start, current);
      position = resolveSequenceNoteDragPosition(note, start, current, zoom);
      setNotePreview({ [note.id]: position });
    };
    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      if (!didMove || (Math.abs(position.x - note.x) <= 1 && Math.abs(position.y - note.y) <= 1)) return;
      commit({ ...content, notes: content.notes.map((candidate) => candidate.id === note.id ? { ...candidate, ...position } : candidate) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startNoteResize = (
    note: SequenceNote,
    handle: 'corner' | 'right' | 'bottom',
    event: ReactPointerEvent<SVGElement>,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    const currentBox = layout.noteLayouts.get(note.id) ?? resolveSequenceNoteRect(note);
    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const startScrollTop = scrollRef.current?.scrollTop ?? 0;
    const startWidth = currentBox.width;
    // Dragging height starts from what is on screen; a width-only drag keeps the
    // user's own height so the text-driven growth follows the width both ways.
    const startHeight = currentBox.height;
    const storedHeight = note.height;

    let size = { width: note.width, height: storedHeight };
    let didMove = false;

    const move = (pointerEvent: PointerEvent): void => {
      const currentScrollLeft = scrollRef.current?.scrollLeft ?? startScrollLeft;
      const currentScrollTop = scrollRef.current?.scrollTop ?? startScrollTop;
      const dx = (pointerEvent.clientX - startX + currentScrollLeft - startScrollLeft) / zoom;
      const dy = (pointerEvent.clientY - startY + currentScrollTop - startScrollTop) / zoom;
      didMove = didMove || Math.abs(dx) >= 1 || Math.abs(dy) >= 1;

      const nextWidth = (handle === 'corner' || handle === 'right')
        ? Math.max(120, Math.round(startWidth + dx))
        : startWidth;

      const minH = getSequenceNoteMinimumHeight({ text: note.text, width: nextWidth });

      const nextHeight = (handle === 'corner' || handle === 'bottom')
        ? Math.max(minH, Math.round(startHeight + dy))
        : storedHeight;

      size = { width: nextWidth, height: nextHeight };
      setNotePreview({ [note.id]: size });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      setNotePreview({});
      if (didMove) {
        // The box can shrink out from under the pointer; the click that follows
        // would then land on the canvas and drop the selection.
        const swallowClick = (clickEvent: MouseEvent): void => clickEvent.stopPropagation();
        window.addEventListener('click', swallowClick, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0);
      }
      if (!didMove || (size.width === note.width && size.height === storedHeight)) return;
      commit({
        ...content,
        notes: content.notes.map((candidate) =>
          candidate.id === note.id ? { ...candidate, ...size } : candidate
        ),
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const handleEditNote = useCallback((noteId: string) => {
    const note = content.notes.find((n) => n.id === noteId);
    const noteBox = layout.noteLayouts.get(noteId);
    if (!note || !noteBox) return;
    setInlineNoteEditor({
      noteId,
      value: note.text,
      x: noteBox.x,
      y: noteBox.y,
      width: noteBox.width,
      height: noteBox.height,
    });
  }, [content.notes, layout.noteLayouts]);

  useEffect(() => {
    const handleTimelineShortcuts = (event: KeyboardEvent): void => {
      if (shouldIgnoreEditorShortcut(event, document) || isNotebookEvent(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], dialog') !== null) return;
      if (quickMessage !== null || inlineFragmentEditor !== null) return;

      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        && keyboardMode.stage === 'off' && !inlineNoteEditor) {
        if (event.key.toLowerCase() === 'n') {
          event.preventDefault();
          addNote();
          return;
        }
        if (event.key === 'Enter' && selection?.kind === 'note') {
          event.preventDefault();
          handleEditNote(selection.id);
          return;
        }
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        && selection?.kind === 'participant' && keyboardMode.stage === 'off' && !inlineNoteEditor) {
        event.preventDefault();
        moveParticipantHorizontal(selection.id, event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }

      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (selection?.kind === 'message' || selection?.kind === 'fragment' || selectedTimelineIds.length > 0) {
          event.preventDefault();
          moveSelectedItem(event.key === 'ArrowUp' ? -1 : 1);
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'c') {
        if (selectedTimelineIds.length > 0 || selection?.kind === 'message' || selection?.kind === 'fragment' || selection?.kind === 'note') {
          event.preventDefault();
          copyBlockSelection();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'v') {
        const clipboard = blockClipboard.current;
        if (clipboard && (clipboard.items.length > 0 || clipboard.notes.length > 0)) {
          event.preventDefault();
          pasteBlockSelection();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        if (selection?.kind === 'message' || selection?.kind === 'fragment') {
          event.preventDefault();
          duplicateSelectedItem();
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'u') {
        if (selection?.kind === 'fragment') {
          event.preventDefault();
          handleUnwrapFragment(selection.id);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleTimelineShortcuts);
    return () => window.removeEventListener('keydown', handleTimelineShortcuts);
  }, [moveParticipantHorizontal, addNote, handleEditNote, inlineNoteEditor, keyboardMode.stage, quickMessage, selection, selectedTimelineIds, moveSelectedItem, duplicateSelectedItem, copyBlockSelection, pasteBlockSelection, handleUnwrapFragment, inlineFragmentEditor]);

  const commitInlineNoteEdit = useCallback((): void => {
    if (!inlineNoteEditor) return;
    const { noteId, value, draft } = inlineNoteEditor;
    if (draft) {
      if (value.trim()) {
        const note = { ...draft, text: value.trim(), height: Math.max(110, getSequenceNoteMinimumHeight({ text: value.trim(), width: draft.width })) };
        if (commit({ ...content, notes: [...content.notes, note] })) {
          setSelection({ kind: 'note', id: note.id });
        }
      }
      setInlineNoteEditor(null);
      setNotePreview({});
      return;
    }
    const targetNote = content.notes.find((n) => n.id === noteId);
    if (!targetNote) {
      setInlineNoteEditor(null);
      setNotePreview({});
      return;
    }
    // Only the text is saved: the box grows to fit it on render and shrinks
    // back to the user's height when the text gets shorter.
    const nextNotes = content.notes.map((n) => (n.id === noteId ? { ...n, text: value } : n));
    commit({ ...content, notes: nextNotes }, true);
    setNotePreview({});
    setInlineNoteEditor(null);
  }, [commit, content, inlineNoteEditor, setSelection]);

  const commitInlineFragmentEdit = useCallback((): void => {
    if (!inlineFragmentEditor) return;
    const { kind, fragmentId, operandId, value } = inlineFragmentEditor;
    const trimmed = value.trim();
    if (kind === 'name') {
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => ({
        ...item,
        name: trimmed,
      }));
      commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    } else if (kind === 'guard' && operandId) {
      const cleanGuard = trimmed.replace(/^\[/, '').replace(/\]$/, '');
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          operands: item.operands.map((op) => (op.id === operandId ? { ...op, guard: cleanGuard } : op)),
        };
      });
      commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    }
    setInlineFragmentEditor(null);
  }, [commit, content, inlineFragmentEditor, keepAnchoredNotesWithTimeline]);

  const handleEditFragmentGuard = useCallback(
    (fragmentId: string, operandId: string, currentGuard: string, rect: { x: number; y: number; width: number }) => {
      setInlineFragmentEditor({
        kind: 'guard',
        fragmentId,
        operandId,
        value: currentGuard,
        x: rect.x,
        y: rect.y,
        width: rect.width,
      });
    },
    [],
  );

  const handleEditFragmentName = useCallback(
    (fragmentId: string, currentName: string, rect: { x: number; y: number; width: number }) => {
      // A single-branch fragment may keep its text in the branch guard (older
      // data): edit that field so nothing is duplicated or lost.
      const target = findSequenceItem(content.items, fragmentId);
      if (target?.kind === 'fragment' && getFragmentTabLabel(target).field === 'guard') {
        setInlineFragmentEditor({ kind: 'guard', fragmentId, operandId: target.operands[0].id, value: currentName, x: rect.x, y: rect.y, width: rect.width });
        return;
      }
      setInlineFragmentEditor({
        kind: 'name',
        fragmentId,
        value: target?.kind === 'fragment' ? target.name : currentName,
        x: rect.x,
        y: rect.y,
        width: rect.width,
      });
    },
    [content.items],
  );

  const handleAddFragmentOperand = useCallback(
    (fragmentId: string) => {
      const frag = findSequenceItem(content.items, fragmentId);
      if (!frag || frag.kind !== 'fragment') return;
      const newOperandId = createId();
      const defaultGuard = frag.operator === 'alt' ? 'else' : '';
      const nextItems = updateSequenceItem(content.items, fragmentId, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          operands: [...item.operands, { id: newOperandId, guard: defaultGuard, items: [] }],
        };
      });
      const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
      if (saved) {
        showFeedback(frag.operator === 'alt' ? 'Rama else agregada.' : 'Rama agregada al fragmento.');
        setTimeout(() => {
          const updatedLayout = buildSequenceLayout({ ...content, items: nextItems });
          const fragLayout = updatedLayout.fragmentLayouts.get(fragmentId);
          const opLayout = fragLayout?.operands.find((o) => o.id === newOperandId);
          if (fragLayout && opLayout) {
            setInlineFragmentEditor({
              kind: 'guard',
              fragmentId,
              operandId: newOperandId,
              value: defaultGuard,
              x: fragLayout.x + 8,
              y: opLayout.top + 2,
              width: Math.min(260, Math.max(140, fragLayout.width - 30)),
            });
          }
        }, 30);
      }
    },
    [commit, content, keepAnchoredNotesWithTimeline, showFeedback],
  );

  const startFragmentDrag = (fragment: SequenceFragment, event: ReactPointerEvent<SVGGElement>): void => {
    if (event.button !== 0 || event.shiftKey || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
    event.preventDefault();
    setSelection({ kind: 'fragment', id: fragment.id });
    const box = layout.fragmentLayouts.get(fragment.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const svgAtDown = svgRef.current;
    const startRect = svgAtDown?.getBoundingClientRect();
    const startCanvas = startRect
      ? sequencePointerToCanvas(event, startRect, zoom)
      : sequencePointerToCanvas(event, { left: 0, top: 0 }, zoom);
    const origX = box?.x ?? fragment.x ?? 80;
    const origY = box?.y ?? fragment.y ?? 180;
    const origW = box?.width ?? fragment.width ?? 320;
    const origH = box?.height ?? fragment.height ?? 140;
    let finalPos = { x: origX, y: origY };
    let didMove = false;
    let lastCalculatedChanges: FragmentMoveChanges | null = null;
    let lastValidMoveChanges: FragmentMoveChanges | null = null;
    let currentMoveInvalid = false;
    let currentMoveReason: string | undefined = undefined;

    setBoundaryResizePreview(null);

    const loc = findSequenceItemLocation(content.items, fragment.id);
    let minAllowedY = 60;
    if (loc && loc.containerId !== 'root') {
      const parentEntry = flatEntries.find((e) =>
        e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
      );
      if (parentEntry && parentEntry.item.kind === 'fragment') {
        const parentBox = layout.fragmentLayouts.get(parentEntry.item.id);
        const parentOp = parentBox?.operands.find((op) => op.id === loc.containerId);
        if (parentOp) {
          minAllowedY = parentOp.contentTop + 4;
        }
      }
    }

    // The SVG cannot move under the pointer mid-drag, so its box is measured
    // once here instead of forcing a layout on every pointermove. Work is then
    // coalesced to one frame: pointer events fire well above 60Hz on a
    // trackpad, and each pass re-runs absorption, validation and a setState.
    let pendingEvent: PointerEvent | null = null;
    let frame = 0;

    const applyMove = (pointerEvent: PointerEvent): void => {
      const currentCanvas = startRect
        ? sequencePointerToCanvas(pointerEvent, startRect, zoom)
        : sequencePointerToCanvas(pointerEvent, { left: 0, top: 0 }, zoom);
      const dx = currentCanvas.x - startCanvas.x;
      const dy = currentCanvas.y - startCanvas.y;
      const nextX = Math.max(20, Math.round(origX + dx));
      const nextY = Math.max(minAllowedY, Math.round(origY + dy));
      finalPos = { x: nextX, y: nextY };

      // Calculate sliding window real-time absorption and release
      const moveChanges = calculateFragmentMoveChanges(
        content.items,
        baseLayout,
        fragment.id,
        nextY,
        origH,
        lastCalculatedChanges,
      );
      lastCalculatedChanges = moveChanges;

      let previewItems = content.items;

      if (moveChanges && (moveChanges.itemsToAbsorb.length > 0 || moveChanges.itemsToEject.length > 0 || moveChanges.hasHierarchyChanged)) {
        const candidateItems = applyFragmentMoveChanges(content.items, moveChanges);
        const semanticValidation = validateFragmentMoveChanges(content, moveChanges, { existingArtifactIds });
        const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidateItems });
        const validation = semanticValidation.valid && mutationGate.accepted
          ? semanticValidation
          : {
              ...semanticValidation,
              valid: false,
              reason: semanticValidation.reason ?? mutationGate.newProblems[0]?.message,
            };
        currentMoveInvalid = !validation.valid;
        currentMoveReason = validation.reason;
        const isReallocated = moveChanges.itemsToAbsorb.length === 0 && moveChanges.itemsToEject.length === 0 && moveChanges.hasHierarchyChanged;
        setBoundaryResizePreview({
          fragmentId: fragment.id,
          absorbedIds: moveChanges.itemsToAbsorb.map((it) => it.id),
          ejectedIds: moveChanges.itemsToEject.map((it) => it.id),
          isValid: validation.valid,
          reason: validation.reason,
          edge: 'move',
          isReallocated,
        });
        lastValidMoveChanges = validation.valid ? moveChanges : null;
        if (validation.valid) {
          previewItems = candidateItems;
        }
      } else {
        currentMoveInvalid = false;
        currentMoveReason = undefined;
        setBoundaryResizePreview(null);
        lastValidMoveChanges = null;
      }

      // El preview usa el mismo árbol que se aplicará al soltar, con la
      // geometría transitoria del fragmento ya incorporada.
      const previewItemsWithGeometry = updateSequenceItem(previewItems, fragment.id, (item) => {
        if (item.kind !== 'fragment') return item;
        return { ...item, x: nextX, y: nextY, width: origW, height: origH };
      });
      setActiveFragmentResize({
        id: fragment.id,
        x: nextX,
        y: nextY,
        width: origW,
        height: origH,
        isMove: true,
        previewItems: previewItemsWithGeometry,
      });
    };

    const move = (pointerEvent: PointerEvent): void => {
      const rawDeltaX = Math.abs(pointerEvent.clientX - startX);
      const rawDeltaY = Math.abs(pointerEvent.clientY - startY);
      if (rawDeltaX > 3 || rawDeltaY > 3) {
        didMove = true;
      }
      if (!didMove) return;

      pendingEvent = pointerEvent;
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const queued = pendingEvent;
        pendingEvent = null;
        if (queued !== null) applyMove(queued);
      });
    };

    const finish = (): void => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      // The last pointer position may still be waiting for its frame; apply it
      // so the fragment lands where it was released.
      const queued = pendingEvent;
      pendingEvent = null;
      if (queued !== null) applyMove(queued);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setActiveFragmentResize(null);
      setBoundaryResizePreview(null);

      if (!didMove) return;

      if (currentMoveInvalid) {
        showFeedback(`Movimiento no permitido: ${currentMoveReason || 'infracción de ciclo de vida'}`);
        return;
      }

      if (lastValidMoveChanges && lastValidMoveChanges.hasHierarchyChanged) {
        const newItems = applyFragmentMoveChanges(content.items, lastValidMoveChanges);
        const updatedItems = updateSequenceItem(newItems, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalPos.x,
            y: finalPos.y,
            width: origW,
            height: origH,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: updatedItems }), true);
        if (saved) {
          setSelection({ kind: 'fragment', id: fragment.id });
          const numAbsorbed = lastValidMoveChanges.itemsToAbsorb.length;
          const numEjected = lastValidMoveChanges.itemsToEject.length;
          if (numAbsorbed > 0 && numEjected > 0) {
            showFeedback(`Fragmento actualizado: ${formatSequenceMessageChange(numAbsorbed, 'incorporado')}, ${formatSequenceMessageChange(numEjected, 'liberado')}.`);
          } else if (numAbsorbed > 0) {
            showFeedback(`Fragmento movido: ${formatSequenceMessageChange(numAbsorbed, 'incorporado')}.`);
          } else if (numEjected > 0) {
            showFeedback(`Fragmento movido: ${formatSequenceMessageChange(numEjected, 'liberado')}.`);
          } else {
            showFeedback('Fragmento reubicado.');
          }
        }
        return;
      }

      if (Math.abs(finalPos.x - origX) > 4 || Math.abs(finalPos.y - origY) > 4) {
        const nextItems = updateSequenceItem(content.items, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalPos.x,
            y: finalPos.y,
            width: origW,
            height: origH,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({
          ...content,
          items: nextItems,
        }), true);
        if (saved) {
          showFeedback('Posición del fragmento actualizada.');
        }
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };

  const startFragmentResize = (
    fragment: SequenceFragment,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'w' | 'n',
    event: ReactPointerEvent<SVGElement>,
  ): void => {
    event.stopPropagation();
    event.preventDefault();
    setSelection({ kind: 'fragment', id: fragment.id });
    setBoundaryResizePreview(null);
    const box = layout.fragmentLayouts.get(fragment.id);
    const origX = box?.x ?? fragment.x ?? 80;
    const origY = box?.y ?? fragment.y ?? 100;
    const origW = box?.width ?? fragment.width ?? 320;
    const origH = box?.height ?? fragment.height ?? 140;
    const minimumWidth = box?.minWidth ?? 140;
    const svgAtDown = svgRef.current;
    const startRect = svgAtDown?.getBoundingClientRect();
    const startCanvas = startRect
      ? sequencePointerToCanvas(event, startRect, zoom)
      : sequencePointerToCanvas(event, { left: 0, top: 0 }, zoom);
    const isTopHandle = handle === 'n' || handle === 'nw' || handle === 'ne';
    const isBottomHandle = handle === 's' || handle === 'se' || handle === 'sw';
    // Permitir achicar hasta la cabecera + margen para expulsar mensajes cómodamente
    const minimumHeight = Math.max(48, (box?.headerHeight ?? 24) + 16);

    const loc = findSequenceItemLocation(content.items, fragment.id);
    let minAllowedY = 60;
    if (loc && loc.containerId !== 'root') {
      const parentEntry = flatEntries.find((e) =>
        e.item.kind === 'fragment' && e.item.operands.some((op) => op.id === loc.containerId),
      );
      if (parentEntry && parentEntry.item.kind === 'fragment') {
        const parentBox = layout.fragmentLayouts.get(parentEntry.item.id);
        const parentOp = parentBox?.operands.find((op) => op.id === loc.containerId);
        if (parentOp) {
          minAllowedY = parentOp.contentTop + 4;
        }
      }
    }

    let finalGeom = { x: origX, y: origY, width: origW, height: origH };
    let didChange = false;
    let lastValidBoundaryChanges: FragmentBoundaryChanges | null = null;
    let currentBoundaryInvalid = false;
    let currentBoundaryReason: string | undefined = undefined;

    const move = (pointerEvent: PointerEvent): void => {
      const currentRect = svgRef.current?.getBoundingClientRect();
      const currentCanvas = currentRect
        ? sequencePointerToCanvas(pointerEvent, currentRect, zoom)
        : sequencePointerToCanvas(pointerEvent, { left: 0, top: 0 }, zoom);
      const dx = currentCanvas.x - startCanvas.x;
      const dy = currentCanvas.y - startCanvas.y;
      let nextX = origX;
      let nextY = origY;
      let nextW = origW;
      let nextH = origH;

      if (handle === 'se' || handle === 'e' || handle === 'ne') {
        nextW = Math.max(minimumWidth, Math.round(origW + dx));
      } else if (handle === 'sw' || handle === 'w' || handle === 'nw') {
        const candidateW = origW - dx;
        if (candidateW >= minimumWidth) {
          nextX = Math.max(20, Math.round(origX + dx));
          nextW = Math.round(candidateW);
        } else {
          nextX = origX + origW - minimumWidth;
          nextW = minimumWidth;
        }
      }

      if (handle === 'se' || handle === 's' || handle === 'sw') {
        nextH = Math.max(minimumHeight, Math.round(origH + dy));
      } else if (handle === 'ne' || handle === 'n' || handle === 'nw') {
        const candidateH = origH - dy;
        if (candidateH >= minimumHeight) {
          nextY = Math.max(minAllowedY, Math.round(origY + dy));
          nextH = Math.round(candidateH);
        } else {
          nextY = origY + origH - minimumHeight;
          nextH = minimumHeight;
        }
      }

      finalGeom = { x: nextX, y: nextY, width: nextW, height: nextH };
      didChange = nextX !== origX || nextY !== origY || nextW !== origW || nextH !== origH;

      // Calcular absorción o expulsión de mensajes en tiempo real
      const boundaryChanges = calculateFragmentBoundaryChanges(
        content.items,
        baseLayout,
        fragment.id,
        nextY,
        nextH,
        handle,
      );

      let previewItems = content.items;

      if (boundaryChanges && (boundaryChanges.itemsToAbsorb.length > 0 || boundaryChanges.itemsToEject.length > 0)) {
        const candidateItems = applyFragmentBoundaryChanges(content.items, boundaryChanges);
        const semanticValidation = validateFragmentBoundaryChanges(content, boundaryChanges, { existingArtifactIds });
        const mutationGate = applySequenceDiagramMutation(content, { ...content, items: candidateItems });
        const validation = semanticValidation.valid && mutationGate.accepted
          ? semanticValidation
          : {
              ...semanticValidation,
              valid: false,
              reason: semanticValidation.reason ?? mutationGate.newProblems[0]?.message,
            };
        currentBoundaryInvalid = !validation.valid;
        currentBoundaryReason = validation.reason;
        setBoundaryResizePreview({
          fragmentId: fragment.id,
          absorbedIds: boundaryChanges.itemsToAbsorb.map((it) => it.id),
          ejectedIds: boundaryChanges.itemsToEject.map((it) => it.id),
          isValid: validation.valid,
          reason: validation.reason,
          edge: boundaryChanges.edge,
        });
        lastValidBoundaryChanges = validation.valid ? boundaryChanges : null;
        if (validation.valid) {
          previewItems = candidateItems;
        }
      } else {
        currentBoundaryInvalid = false;
        currentBoundaryReason = undefined;
        setBoundaryResizePreview(null);
        lastValidBoundaryChanges = null;
      }

      // El árbol mostrado durante el resize es el mismo que se aplicará al
      // soltar; sólo la geometría permanece transitoria hasta el commit.
      const previewItemsWithGeometry = updateSequenceItem(previewItems, fragment.id, (item) => {
        if (item.kind !== 'fragment') return item;
        return {
          ...item,
          x: finalGeom.x,
          width: finalGeom.width,
          height: isBottomHandle || isTopHandle ? finalGeom.height : item.height,
          y: isTopHandle ? finalGeom.y : item.y,
        };
      });
      setActiveFragmentResize({
        id: fragment.id,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
        previewItems: previewItemsWithGeometry,
      });
    };

    const finish = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      setActiveFragmentResize(null);
      setBoundaryResizePreview(null);

      const isTop = handle === 'n' || handle === 'nw' || handle === 'ne';
      const isBottom = handle === 's' || handle === 'se' || handle === 'sw';

      if (currentBoundaryInvalid) {
        showFeedback(currentBoundaryReason ?? 'No se pudo redimensionar: operación no válida para la estructura del diagrama.');
        return;
      }

      if (lastValidBoundaryChanges) {
        const newItems = applyFragmentBoundaryChanges(content.items, lastValidBoundaryChanges);
        const updatedItems = updateSequenceItem(newItems, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalGeom.x,
            width: finalGeom.width,
            height: isBottom || isTop ? finalGeom.height : item.height,
            y: isTop ? finalGeom.y : item.y,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: updatedItems }), true);
        if (saved) {
          const numAbsorbed = lastValidBoundaryChanges.itemsToAbsorb.length;
          const numEjected = lastValidBoundaryChanges.itemsToEject.length;
          if (numAbsorbed > 0 && numEjected > 0) {
            showFeedback(`Fragmento actualizado: ${formatSequenceMessageChange(numAbsorbed, 'incorporado')}, ${formatSequenceMessageChange(numEjected, 'liberado')}.`);
          } else if (numAbsorbed > 0) {
            showFeedback(`Fragmento expandido: ${formatSequenceMessageChange(numAbsorbed, 'incorporado')}.`);
          } else if (numEjected > 0) {
            showFeedback(`Fragmento reducido: ${formatSequenceMessageChange(numEjected, 'liberado')}.`);
          }
        }
      } else if (didChange) {
        const nextItems = updateSequenceItem(content.items, fragment.id, (item) => {
          if (item.kind !== 'fragment') return item;
          return {
            ...item,
            x: finalGeom.x,
            width: finalGeom.width,
            height: isBottom || isTop ? finalGeom.height : item.height,
            y: isTop ? finalGeom.y : item.y,
          };
        });
        const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
        if (saved) showFeedback('Tamaño del fragmento actualizado.');
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
  };


  // A click (a kind, a color, a checkbox) is its own undo step; typing passes
  // `typing` so the keystrokes of one edit undo together.
  const updateParticipant = (id: string, values: Partial<SequenceParticipant>, typing = false): void => {
    setParticipantEditDraft((current) => current?.id === id ? null : current);
    void commit({
      ...content,
      participants: content.participants.map((participant) => participant.id === id ? { ...participant, ...values } : participant),
    }, !typing);
  };
  const updateNote = (id: string, values: Partial<SequenceNote>, typing = false): void => { void commit({
    ...content,
    notes: content.notes.map((note) => {
      if (note.id !== id) return note;
      // The stored height is the user's; the layout grows the box for the text.
      return { ...note, ...values };
    }),
  }, !typing); };
  const updateItem = (id: string, values: Partial<SequenceMessage> | Partial<SequenceFragment>, typing = false): void => { void commit(keepAnchoredNotesWithTimeline({
    ...content,
    items: updateSequenceItem(content.items, id, (item) => ({ ...item, ...values } as SequenceTimelineItem)),
  }), !typing); };
  const updateMessageEditModel = (id: string, changes: Partial<SequenceMessageEditModel>): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    const model = updateSequenceMessageEditModel(sequenceMessageEditModelFromMessage(message), changes);
    const patched = sequenceMessageEditModelToPatch(model);
    const wasCreate = message.type === 'create';
    const isCreate = patched.type === 'create';
    const wasDestroy = message.type === 'destroy';
    const isDestroy = patched.type === 'destroy';
    const oldTarget = message.targetId;
    const newTarget = patched.targetId ?? message.targetId;

    let nextParticipants = content.participants;
    if (wasCreate || isCreate || wasDestroy || isDestroy) {
      nextParticipants = content.participants.map((p) => {
        let nextP = p;
        if (wasCreate && nextP.id === oldTarget && (!isCreate || oldTarget !== newTarget)) {
          if (nextP.createdByMessageId === id) {
            nextP = { ...nextP, createdByMessageId: undefined };
          }
        }
        if (isCreate && nextP.id === newTarget) {
          nextP = { ...nextP, createdByMessageId: id };
        }
        if (wasDestroy && nextP.id === oldTarget && (!isDestroy || oldTarget !== newTarget)) {
          if (nextP.destroyedByMessageId === id) {
            nextP = { ...nextP, destroyedByMessageId: undefined };
          }
        }
        if (isDestroy && nextP.id === newTarget) {
          nextP = { ...nextP, destroyedByMessageId: id };
        }
        return nextP;
      });
    }
    void commit(keepAnchoredNotesWithTimeline({
      ...content,
      participants: nextParticipants,
      items: updateSequenceItem(content.items, id, (item) => ({ ...item, ...patched } as SequenceTimelineItem)),
    }), false);
  };

  const importIntoModel = (): void => {
    if (!associatedClassDiagram || !onImportSequenceIntoClassModel) return;
    onImportSequenceIntoClassModel(associatedClassDiagram.id, content);
    showFeedback('Novedades agregadas al modelo.');
  };
  const createClassMethodFromSelectedMessage = (): void => {
    if (selectedItem?.kind !== 'message' || associatedClassDiagram === undefined) {
      return;
    }

    if (missingInModel?.participantIds.has(selectedItem.targetId)) {
      importIntoModel();
      return;
    }
    if (onCreateClassMethod === undefined || (selectedItem.type !== 'synchronous' && selectedItem.type !== 'asynchronous')) return;

    const participant = content.participants.find((candidate) => candidate.id === selectedItem.targetId);
    const classNode = participant ? resolveParticipantClassNode(participant, associatedClassDiagram.content) : undefined;
    // The call's declared parameters travel with it, exactly as in "Traer"
    // from Clases de secuencias; the shared importer decides what they are.
    const resolved = resolveMessageOperation(classNode?.data.methods ?? [], selectedItem);

    if (classNode === undefined && onImportSequenceIntoClassModel) {
      importIntoModel();
      return;
    }

    if (classNode === undefined || resolved === null) {
      showFeedback('Seleccioná una clase y escribí una operación antes de sincronizar.');
      return;
    }

    if (resolved.existing !== undefined) {
      if (resolved.parametersToAdd !== undefined && resolved.parametersToAdd !== '') {
        onCompleteClassMethodParameters?.(associatedClassDiagram.id, classNode.id, resolved.existing.id, resolved.parametersToAdd);
      }
      updateMessageEditModel(selectedItem.id, { operationMethodId: resolved.existing.id });
      showFeedback('Mensaje vinculado con el método existente.');
      return;
    }

    const method: ClassMethod = { id: createId(), visibility: '+', ...resolved.operation };
    onCreateClassMethod(associatedClassDiagram.id, classNode.id, method);
    updateMessageEditModel(selectedItem.id, { operationMethodId: method.id });
    showFeedback(`Método ${method.name} agregado a «${associatedClassDiagram.name}».`);
  };
  const invertMessage = (id: string): void => {
    const message = findSequenceItem(content.items, id);
    if (message?.kind !== 'message') return;
    const candidate = { ...sequenceMessageEditModelFromMessage(message), sourceId: message.targetId, targetId: message.sourceId };
    const methodsForNewTarget = getSequenceMethodOptions({ model: candidate, participants: content.participants, classDiagram: associatedClassDiagram });
    updateItem(id, sequenceMessageEditModelToPatch(swapSequenceMessageEditModel(sequenceMessageEditModelFromMessage(message), methodsForNewTarget)));
  };

  const hasOutlineMatches = useMemo(() => {
    if (searchQuery.trim().length === 0) return true;
    return content.items.some((item) => sequenceItemMatchesSearch(item, searchQuery));
  }, [content.items, searchQuery]);

  const renderOutline = (items: SequenceTimelineItem[], depth = 0): ReactNode => items.map((item) => {
    if (!sequenceItemMatchesSearch(item, searchQuery)) return null;
    const isCollapsed = item.kind === 'fragment' && collapsedFragments.has(item.id);
    return (
      <div key={item.id} className="sequence-outline-group">
        <button
          aria-current={selection?.id === item.id || selectedTimelineIds.includes(item.id) ? 'true' : undefined}
          aria-label={`Seleccionar ${item.kind === 'fragment' ? `fragmento ${item.operator}` : item.type === 'return' ? 'retorno' : formatSequenceMessageLabel(item)}`}
          className={`sequence-outline-item ${selection?.id === item.id || selectedTimelineIds.includes(item.id) ? 'active' : ''} ${outlineDropTargetId === item.id ? 'drop-target' : ''}`}
          draggable
          style={{ paddingLeft: 10 + depth * 16 }}
          type="button"
          onClick={(event) => {
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              handleTimelineItemSelect(item.id, true);
            } else {
              selectOutlineItem({ kind: item.kind, id: item.id });
              if (window.matchMedia('(max-width: 920px)').matches) {
                updateOutlineVisibility(false);
              }
            }
          }}
          onDragStart={() => setDraggedOutlineItemId(item.id)}
          onDragEnd={() => { setDraggedOutlineItemId(null); setOutlineDropTargetId(null); }}
          onDragOver={(event) => { event.preventDefault(); setOutlineDropTargetId(item.id); }}
          onDrop={(event) => { event.preventDefault(); dropOutlineItem(item.id); }}
        >
          {item.kind === 'fragment' ? (
            <span
              className="sequence-collapse-control"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsedFragments((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                  return next;
                });
              }}
            >{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
          ) : <span className="sequence-outline-dot" />}
          <span>
            <strong>{item.kind === 'fragment' ? item.operator : item.type === 'return' ? 'Retorno' : formatSequenceMessageLabel(item)}</strong>
            {item.kind === 'fragment' ? <small>{getFragmentTabLabel(item).text || 'Bloque combinado'}</small> : <small>{messageTypeLabels[item.type]}</small>}
          </span>
        </button>
        {item.kind === 'fragment' && !isCollapsed ? item.operands.map((operand) => (
          <div className="sequence-outline-operand" key={operand.id}>
            {item.operands.length > 1 && operand.guard.trim() ? <span style={{ paddingLeft: 24 + depth * 16 }}>[{operand.guard}]</span> : null}
            {renderOutline(operand.items, depth + 1)}
          </div>
        )) : null}
      </div>
    );
  });

  const exportPng = async (): Promise<void> => {
    if (!exportSvgRef.current) return;
    try {
      const { saved } = await exportSequencePng(exportSvgRef.current, artifact.name, layout);
      if (!saved) return;
      showFeedback('PNG exportado');
      setExportDialogOpen(false);
    } catch (error) {
      void notify({
        title: 'No se pudo exportar el PNG',
        description: error instanceof Error ? error.message : 'Volvé a intentarlo en unos segundos.',
      });
    }
  };

  const exportPdf = async (): Promise<void> => {
    if (!exportSvgRef.current) return;
    try {
      const plan = await exportSequencePdf(exportSvgRef.current, artifact.name, displayContent, layout, exportOptions);
      if (plan?.saved === false) return;
      showFeedback(`PDF exportado (${plan?.pages.length ?? 1} página${plan?.pages.length === 1 ? '' : 's'})`);
      setExportDialogOpen(false);
    } catch (error) {
      void notify({
        title: 'No se pudo exportar el PDF',
        description: error instanceof Error ? error.message : 'Volvé a intentarlo en unos segundos.',
      });
    }
  };

  const locations = flatEntries.filter((entry) => entry.item.kind === 'fragment').flatMap((entry) => {
    const fragment = entry.item as SequenceFragment;
    return fragment.operands.map((operand, index) => ({ value: `${fragment.id}:${operand.id}`, label: `${fragment.operator} · ${operand.guard || `sección ${index + 1}`}` }));
  });
  const participantNames = useMemo(() => new Map(content.participants.map((participant) => [participant.id, formatSequenceParticipantName(participant)])), [content.participants]);
  const messageCount = flatEntries.filter((entry) => entry.item.kind === 'message').length;
  const keyboardSourceParticipant = content.participants.find((participant) => participant.id === keyboardMode.sourceId);
  const keyboardTargetParticipant = content.participants.find((participant) => participant.id === keyboardMode.targetId);
  const keyboardCreatedParticipant = parseSequenceCreatedParticipant(keyboardMode.text);
  const keyboardGhostX = keyboardMode.messageType === 'create' && content.participants.length > 0
    ? keyboardMode.createSide < 0
      ? Math.max(90, Math.min(...content.participants.map((participant) => participant.x)) - 230)
      : Math.max(...content.participants.map((participant) => participant.x)) + 230
    : undefined;
  const keyboardRouteMidpoint = keyboardSlot && keyboardMode.stage === 'navigate'
    // Navigating has no destination yet (the last one is stale): the sign sits on the lifeline.
    ? layout.participantX.get(keyboardMode.sourceId) ?? 120
    : keyboardSlot
    ? ((layout.participantX.get(keyboardMode.sourceId) ?? 120)
      + (keyboardGhostX ?? layout.participantX.get(keyboardMode.targetId) ?? layout.participantX.get(keyboardMode.sourceId) ?? 120)) / 2
    : 120;
  const isKeyboardActive = keyboardMode.stage !== 'off'
    && Boolean(keyboardSlot)
    && (Boolean(keyboardSourceParticipant) || keyboardMode.stage === 'navigate' || keyboardMode.stage === 'participant');
  const rawSlotY = keyboardSlot?.y ?? layout.timelineStart;
  const keyboardGuideHeight = isKeyboardActive ? 38 : 0;
  const slotScreenY = rawSlotY * zoom - scrollPosition.top + keyboardGuideHeight;
  const isPopoverBelow = rawSlotY < 180;
  const keyboardPopoverPlacement: 'above' | 'below' = isPopoverBelow ? 'below' : 'above';
  const popoverHalfWidth = keyboardMode.stage === 'navigate' ? 140 : 188;
  const keyboardPopoverPosition = {
    left: `clamp(${popoverHalfWidth}px, ${keyboardRouteMidpoint * zoom - scrollPosition.left}px, calc(100% - ${popoverHalfWidth}px))`,
    top: isPopoverBelow
      ? `clamp(46px, ${slotScreenY}px, calc(100% - 80px))`
      : `clamp(60px, ${slotScreenY}px, calc(100% - 28px))`,
  };
  const keyboardContext = keyboardSlot?.containerName ?? 'Secuencia principal';
  const keyboardTargetName = keyboardMode.messageType === 'create'
    ? `${keyboardCreatedParticipant.name ? `${keyboardCreatedParticipant.name} : ` : ':'}${keyboardCreatedParticipant.classifierName}`
    : keyboardTargetParticipant ? formatSequenceParticipantName(keyboardTargetParticipant) : 'Elegí un destino';
  const keyboardInstruction = isKeyboardActive ? getSequenceKeyboardInstruction(keyboardMode) : '';
  const keyboardCanvasPreview = keyboardMode.stage !== 'off' && keyboardSlot && keyboardSourceParticipant
    ? {
        stage: keyboardMode.stage === 'fragment' || keyboardMode.stage === 'guard' ? keyboardMode.stage : keyboardMode.stage,
        y: keyboardSlot.y,
        sourceId: keyboardMode.sourceId,
        targetId: keyboardMode.messageType === 'create' ? undefined : keyboardMode.targetId || keyboardMode.sourceId,
        targetX: keyboardGhostX,
        type: keyboardMode.messageType,
        label: keyboardMode.stage === 'typing' ? keyboardMode.text : undefined,
        valid: true,
        ghost: keyboardMode.messageType === 'create' && (keyboardMode.stage === 'aim' || keyboardMode.stage === 'typing')
          ? { kind: keyboardMode.createKind, label: keyboardTargetName }
          : undefined,
      }
    : null;
  const visibleInsertionGuide = keyboardMode.stage !== 'off' && keyboardSlot
    ? {
        y: keyboardSlot.y,
        isValid: true,
        containerName: keyboardSlot.containerName,
        bounds: keyboardSlot.bounds ? { x: keyboardSlot.bounds.x, width: keyboardSlot.bounds.width } : undefined,
      }
    : insertionGuide;

  const participantTypeSelector = selectedParticipant ? (
      <div className="v2-segmented" role="radiogroup" aria-label="Tipo de participante">
        {(['object', 'actor'] as const).map((kind) => {
          const active = kind === 'actor' ? selectedParticipant.kind === 'actor' : selectedParticipant.kind !== 'actor';
          return (
            <button
              aria-checked={active}
              className={active ? 'is-active' : ''}
              key={kind}
              role="radio"
              type="button"
              onClick={() => {
                if (active) return;
                updateParticipant(selectedParticipant.id, kind === 'actor'
                  ? { kind: 'actor', name: selectedParticipant.name.trim() || selectedParticipant.classifierName.replace(/^:+/, '').trim() }
                  : { kind: 'object', classifierName: selectedParticipant.classifierName.trim() || selectedParticipant.name.trim(), name: selectedParticipant.classifierName.trim() ? selectedParticipant.name : '' });
              }}
            >
              {kind === 'actor' ? <PersonStanding size={14} aria-hidden="true" /> : <UserRoundPlus size={14} aria-hidden="true" />}
              {kind === 'actor' ? 'Actor' : 'Objeto'}
            </button>
          );
        })}
      </div>
  ) : null;

  const participantInspector = selectedParticipant ? (
    <>

      {participantTypeSelector}

      {selectedParticipant.kind === 'actor' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Nombre del actor</span>
          <input
            className="sequence-compact-input"
            value={selectedParticipant.name}
            onChange={(event) => updateParticipant(selectedParticipant.id, { name: event.target.value }, true)}
            placeholder="Actor principal"
          />
        </label>
      ) : (
        <label style={{ marginBottom: 10 }}>
          <span>Identificación UML</span>
          <input
            className="sequence-compact-input"
            value={participantEditText}
            onChange={(event) => updateParticipantLabel(selectedParticipant.id, event.target.value)}
            onBlur={() => setParticipantColorReference(null)}
            onKeyDown={(event) => { if (!shouldIgnoreEditorShortcut(event, document) && event.key === 'Enter') setParticipantColorReference(null); }}
            placeholder="nombre:Clase"
          />
          <small className="sequence-inspector-hint" style={{ marginTop: 4, display: 'block' }}>
            La instancia puede quedar vacía antes de “:”.
          </small>
        </label>
      )}

      {selectedParticipant.kind !== 'actor' ? (
        <SequenceParticipantClassField
          participant={selectedParticipant}
          model={associatedClassDiagram}
          onChange={(values) => updateParticipant(selectedParticipant.id, values)}
        />
      ) : null}

      {/* Terminar línea de vida con cruz */}
      <div style={{ marginTop: 8, marginBottom: 10 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.78rem',
            cursor: selectedParticipant.destroyedByMessageId !== undefined ? 'default' : 'pointer',
            userSelect: 'none',
            opacity: selectedParticipant.destroyedByMessageId !== undefined ? 0.75 : 1,
          }}
          title={
            selectedParticipant.destroyedByMessageId !== undefined
              ? 'Finaliza automáticamente por el mensaje de destrucción asociado'
              : undefined
          }
        >
          <input
            type="checkbox"
            disabled={selectedParticipant.destroyedByMessageId !== undefined}
            checked={
              selectedParticipant.destroyedByMessageId !== undefined
                ? true
                : (selectedParticipant.terminateLifeline ?? (selectedParticipant.createdByMessageId !== undefined))
            }
            onChange={(event) => updateParticipant(selectedParticipant.id, { terminateLifeline: event.target.checked })}
          />
          <span>Terminar línea de vida con cruz (X) al finalizar participación</span>
        </label>
      </div>

      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginBottom: 10 }}>
        <summary><h4>Avanzado</h4></summary>
        <span style={{ fontSize: '0.72rem', color: 'var(--panel-muted-text)' }}>Tipo interno (compatibilidad)</span>
        <div className="sequence-participant-kind-grid" style={{ marginTop: 6 }}>
          {(['object', 'actor', 'boundary', 'control', 'entity'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className={`sequence-participant-kind-pill ${selectedParticipant.kind === kind ? 'active' : ''}`}
              onClick={() => updateParticipant(selectedParticipant.id, { kind })}
            >
              {participantKindLabels[kind]}
            </button>
          ))}
        </div>
      </details>

      {/* Activaciones manuales */}
      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 8 }}>
        <summary>
          <h4>Activaciones manuales ({content.activations.filter((a) => a.manual && a.participantId === selectedParticipant.id).length})</h4>
        </summary>
        <div style={{ marginTop: 8 }}>
          <button
            className="secondary-action-sm"
            type="button"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            onClick={() => {
              const participantMessages = layout.orderedMessages.filter(
                (message) => message.sourceId === selectedParticipant.id || message.targetId === selectedParticipant.id
              );
              if (participantMessages.length === 0) return;
              const activation: SequenceActivation = {
                id: createId(),
                participantId: selectedParticipant.id,
                startMessageId: participantMessages[0].id,
                endMessageId: participantMessages.at(-1)?.id,
                level: 0,
                manual: true,
              };
              commit({ ...content, activations: [...content.activations, activation] });
            }}
          >
            <Plus size={13} /> Nueva activación manual
          </button>
          {content.activations
            .filter((activation) => activation.manual && activation.participantId === selectedParticipant.id)
            .map((activation) => (
              <div className="sequence-activation-row" key={activation.id} style={{ marginBottom: 6 }}>
                <select
                  value={activation.startMessageId}
                  onChange={(event) =>
                    commit({
                      ...content,
                      activations: content.activations.map((c) =>
                        c.id === activation.id ? { ...c, startMessageId: event.target.value } : c
                      ),
                    })
                  }
                >
                  {layout.orderedMessages.map((message, index) => (
                    <option key={message.id} value={message.id}>
                      Inicio · #{index + 1} {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
                    </option>
                  ))}
                </select>
                <select
                  value={activation.endMessageId ?? ''}
                  onChange={(event) =>
                    commit({
                      ...content,
                      activations: content.activations.map((c) =>
                        c.id === activation.id ? { ...c, endMessageId: event.target.value || undefined } : c
                      ),
                    })
                  }
                >
                  <option value="">Fin · Automático</option>
                  {layout.orderedMessages.map((message, index) => (
                    <option key={message.id} value={message.id}>
                      Fin · #{index + 1} {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Eliminar activación manual"
                  className="icon-button"
                  type="button"
                  title="Eliminar activación manual"
                  onClick={() =>
                    commit({
                      ...content,
                      activations: content.activations.filter((c) => c.id !== activation.id),
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
        </div>
      </details>
    </>
  ) : null;

  const addMessageToOperand = (fragmentId: string, operandId: string): void => {
    if (content.participants.length < 1) {
      showFeedback('Agregá al menos un participante antes de crear mensajes.');
      return;
    }
    const sourceId = content.participants[0].id;
    const targetId = content.participants[1]?.id ?? content.participants[0].id;
    const msg = createSequenceMessage('synchronous', sourceId, targetId);
    msg.name = 'operación';
    const nextItems = insertSequenceItem(content.items, msg, { fragmentId, operandId });
    const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    if (!saved) return;
    setSelection({ kind: 'message', id: msg.id });
    showFeedback('Mensaje agregado dentro del fragmento.');
  };

  const addFragmentToOperand = (
    fragmentId: string,
    operandId: string,
    operator: SequenceFragmentOperator = 'opt',
  ): void => {
    const nested = createSequenceFragment(operator);
    const nextItems = insertSequenceItem(content.items, nested, { fragmentId, operandId });
    const saved = commit(keepAnchoredNotesWithTimeline({ ...content, items: nextItems }), true);
    if (!saved) return;
    setSelection({ kind: 'fragment', id: nested.id });
    showFeedback(`${operator} creado dentro del fragmento. Podés cambiar su tipo en el inspector.`);
  };

  const startInspectorResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (inspectorCollapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startW = inspectorWidth;
    const onPointerMove = (moveEvent: PointerEvent): void => {
      const dx = startX - moveEvent.clientX;
      setInspectorWidth(Math.max(260, Math.min(480, Math.round(startW + dx))));
    };
    const onPointerUp = (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const messageInspector = selectedItem?.kind === 'message' ? (() => {
    const parentLoc = findParentLocation(content, selectedItem.id);
    const signatureValue = getSequenceSignatureInputValue(selectedItem, messageSignatureDraft);

    return (
      <div className="sequence-message-inspector-root">
        {missingInModel?.messageIds.has(selectedItem.id) ? <div className="sequence-model-notice" role="status">
          <span>No está en el modelo de clases.</span>
          <button className="sequence-sync-class-method-button" type="button" disabled={!onCreateClassMethod && !onImportSequenceIntoClassModel} onClick={createClassMethodFromSelectedMessage}>Agregar al modelo</button>
        </div> : null}

        <div className="sequence-compact-action-row" style={{ marginTop: 4 }}>
          <button className="secondary-action" type="button" onClick={() => moveSelectedItem(-1)} title="Mover arriba (Alt+↑)"><ArrowUp size={13} /> Subir</button>
          <button className="secondary-action" type="button" onClick={() => moveSelectedItem(1)} title="Mover abajo (Alt+↓)"><ArrowDown size={13} /> Bajar</button>
          <button className="secondary-action" type="button" onClick={() => invertMessage(selectedItem.id)} title="Invertir dirección (origen ↔ destino)"><ArrowLeftRight size={13} /> Invertir</button>
          <button className="secondary-action" type="button" onClick={duplicateSelectedItem} title={shortcutLabel('Duplicar (⌘D)')}><Copy size={13} /> Duplicar</button>
        </div>

        {/* 1. Direct Signature Textarea right at the top */}
        {selectedItem.type !== 'return' ? <div style={{ marginTop: 10 }}>
          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span className="v2-inspector-label">
                Firma del mensaje
              </span>
            </div>
            <textarea
              key={selectedItem.id}
              rows={3}
              className="sequence-inspector-signature-textarea"
              value={signatureValue}
              placeholder="operación(parámetros): retorno"
              onChange={(e) => {
                setMessageSignatureDraft(createSequenceSignatureDraft(selectedItem, e.target.value));
                const parsed = parseMessageSignature(e.target.value);
                updateMessageEditModel(selectedItem.id, {
                  name: parsed.name,
                  arguments: parsed.arguments,
                  returnType: parsed.returnType,
                });
              }}
              onBlur={() => setMessageSignatureDraft(null)}
            />
          </label>
        </div> : <p className="sequence-dialog-help">Los retornos se representan sin texto.</p>}

        {/* 2. Type Selector (Segmented Pills) */}
        <div style={{ marginTop: 10 }}>
          <span className="v2-inspector-label">
            Tipo
          </span>
          <div className="sequence-msg-type-pills-row">
            {(['synchronous', 'asynchronous', 'return', 'create', 'destroy'] as const).map((t) => {
              const isActive = selectedItem.type === t;
              const label = t === 'synchronous' ? 'Síncrono' : t === 'asynchronous' ? 'Asíncrono' : t === 'return' ? 'Retorno' : t === 'create' ? 'Crear' : 'Destruir';
              return (
                <button
                  key={t}
                  type="button"
                  className={`sequence-msg-type-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => updateMessageEditModel(selectedItem.id, { type: t })}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {selectedItem.type === 'create' ? (
            <p className="sequence-inspector-hint" style={{ marginTop: 8 }}>
              Este mensaje crea a su participante con create().
            </p>
          ) : selectedItem.type === 'destroy' ? (
            <p className="sequence-inspector-hint" style={{ marginTop: 8 }}>
              Este mensaje finaliza la línea de vida del destinatario.
            </p>
          ) : null}
        </div>

        {/* 3. Route Section */}
        {/* 3. Route Section */}
        <section className="sequence-inspector-section" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h4 style={{ margin: 0 }}>Ruta</h4>
            <button
              aria-label="Invertir dirección"
              className="secondary-action-sm"
              type="button"
              title="Invertir dirección (origen ↔ destino)"
              style={{ fontSize: '0.72rem', padding: '2px 8px', gap: 4 }}
              onClick={() => invertMessage(selectedItem.id)}
            >
              <ArrowLeftRight size={12} /> Invertir
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--panel-muted-text, #60717f)', fontWeight: 600 }}>Origen</span>
              <select
                className="sequence-inspector-select"
                value={selectedItem.sourceId}
                onChange={(event) => updateMessageEditModel(selectedItem.id, { sourceId: event.target.value })}
              >
                {content.participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {formatSequenceParticipantName(participant)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--panel-muted-text, #60717f)', fontWeight: 600 }}>Destino</span>
              {selectedItem.type === 'create' ? (
                <input
                  disabled
                  className="sequence-inspector-select"
                  value={
                    content.participants
                      .filter((participant) => participant.id === selectedItem.targetId)
                      .map(formatSequenceParticipantName)
                      .join('') || 'Participante no disponible'
                  }
                />
              ) : (
                <select
                  className="sequence-inspector-select"
                  value={selectedItem.targetId}
                  onChange={(event) => updateMessageEditModel(selectedItem.id, { targetId: event.target.value })}
                >
                  {content.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {formatSequenceParticipantName(participant)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          {(selectedItem.type === 'synchronous' || selectedItem.type === 'asynchronous') ? (
            <button
              className="secondary-action"
              type="button"
              style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
              onClick={addReturn}
            >
              + Agregar retorno
            </button>
          ) : null}
        </section>

        {/* 4. Location in flow */}
        <div style={{ marginTop: 10 }}>
          <label>
            <span className="v2-inspector-label">
              Ubicación en el flujo
            </span>
            <select
              className="sequence-inspector-select"
              value={parentLoc}
              onChange={(event) =>
                commit(
                  keepAnchoredNotesWithTimeline({
                    ...content,
                    items: updateNestedItemLocation(
                      content.items,
                      selectedItem.id,
                      event.target.value,
                    ),
                  }),
                  true,
                )
              }
            >
              <option value="root">Secuencia principal</option>
              {locations.map((loc) => (
                <option key={loc.value} value={loc.value}>
                  {loc.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 5. Wrap in fragment */}
        <div style={{ marginTop: 10 }}>
          <span className="v2-inspector-label">
            Envolver en fragmento
          </span>
          <div className="sequence-quick-wrap-pills">
            {(['alt', 'loop', 'opt', 'par', 'critical'] as const).map((op) => (
              <button
                key={op}
                type="button"
                className="sequence-quick-wrap-pill-btn"
                title={`Envolver mensaje en bloque ${op}`}
                onClick={() => handleWrapSelection(op, [selectedItem.id])}
              >
                + {op}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Advanced Options (Collapsible accordion) */}
        <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 10 }}>
          <summary><h4>Opciones avanzadas</h4></summary>
          {methodOptions.length > 0 || selectedMessageReferenceStatus?.method === 'missing' ? (
            <label style={{ marginTop: 6 }}>
              <span>Método vinculado de clase</span>
              <select
                value={selectedItem.operationMethodId ?? ''}
                onChange={(event) => {
                  const method = methodOptions.find((candidate) => candidate.id === event.target.value);
                  updateMessageEditModel(selectedItem.id, method ? {
                    operationMethodId: method.id,
                    name: method.name,
                    arguments: method.parameters,
                    parameterValues: '',
                    returnType: method.returnType,
                  } : { operationMethodId: undefined });
                }}
              >
                {selectedMessageReferenceStatus?.method === 'missing' ? <option value={selectedItem.operationMethodId}>Método no disponible</option> : null}
                <option value="">Texto libre</option>
                {methodOptions.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label style={{ marginTop: 6 }}>
            <span>Paso vinculado al flujo</span>
            <input
              list="sequence-message-flow-options-inspector"
              value={selectedItem.flowReference ?? ''}
              onChange={(event) => updateMessageEditModel(selectedItem.id, { flowReference: event.target.value })}
              placeholder="4.2 / CA 1"
            />
            <datalist id="sequence-message-flow-options-inspector">
              <option value="">Sin referencia</option>
              {flowOptions.map((option) => (
                <option key={`${option.flowId}:${option.stepId}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
          </label>

          <label style={{ marginTop: 6 }}>
            <span>Valores concretos de prueba</span>
            <input
              value={selectedItem.parameterValues ?? ''}
              onChange={(event) => updateMessageEditModel(selectedItem.id, { parameterValues: event.target.value })}
              placeholder="42, 'activo'"
            />
          </label>
        </details>
      </div>
    );
  })() : null;

  const fragmentInspector = selectedItem?.kind === 'fragment' ? (() => {
    const activeOp = selectedItem.operands.find((op) => op.id === activeOperandId) ?? selectedItem.operands[0];
    const totalMessages = countSequenceMessages([selectedItem]);

    const allMessagesInDiagram: {
      message: SequenceMessage;
      containerLabel: string;
      operandId?: string;
      timelineIndex: number;
    }[] = [];
    let msgCounter = 1;
    const collectMsgs = (itemsList: SequenceTimelineItem[], containerLabel: string, opId?: string) => {
      itemsList.forEach((it) => {
        if (it.kind === 'message') {
          allMessagesInDiagram.push({
            message: it,
            containerLabel,
            operandId: opId,
            timelineIndex: msgCounter++,
          });
        } else {
          it.operands.forEach((op, opIdx) => {
            const opLabel = it.name
              ? `${it.operator.toUpperCase()} "${it.name}" (${opIdx + 1})`
              : `${it.operator.toUpperCase()} (${opIdx + 1})`;
            collectMsgs(op.items, opLabel, op.id);
          });
        }
      });
    };
    collectMsgs(content.items, 'Secuencia principal');

    const activeOpMessages = activeOp ? activeOp.items.filter((it): it is SequenceMessage => it.kind === 'message') : [];
    const availableOutside = activeOp ? allMessagesInDiagram.filter((entry) => entry.operandId !== activeOp.id) : [];
    const filteredAvailable = availableOutside.filter(({ message }) => {
      if (!includeSearchFilter.trim()) return true;
      const term = includeSearchFilter.toLowerCase();
      const src = content.participants.find((p) => p.id === message.sourceId);
      const tgt = content.participants.find((p) => p.id === message.targetId);
      const srcName = src ? formatSequenceParticipantName(src).toLowerCase() : '';
      const tgtName = tgt ? formatSequenceParticipantName(tgt).toLowerCase() : '';
      const msgName = (message.name || messageTypeLabels[message.type]).toLowerCase();
      return msgName.includes(term) || srcName.includes(term) || tgtName.includes(term);
    });

    return (
      <>

        <div className="sequence-compact-action-row" style={{ marginTop: 2, marginBottom: 10 }}>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => moveSelectedItem(-1)}
            title="Mover fragmento hacia arriba"
          >
            <ArrowUp size={13} /> Subir
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => moveSelectedItem(1)}
            title="Mover fragmento hacia abajo"
          >
            <ArrowDown size={13} /> Bajar
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={duplicateSelectedItem}
            title="Duplicar fragmento"
          >
            <Copy size={13} /> Duplicar
          </button>
          <button
            className="secondary-action-sm"
            type="button"
            onClick={() => handleUnwrapFragment(selectedItem.id)}
            title="Desempaquetar fragmento (elimina el recuadro y mantiene los mensajes en su posición cronológica)"
          >
            <Ungroup size={13} /> Desemp.
          </button>
        </div>

        {/* 2. Operator Quick Pills + Selector */}
        <div className="sequence-fragment-operator-selector" style={{ marginBottom: 10 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text, #64748b)', display: 'block', marginBottom: 4 }}>
            Operador
          </label>
          <div className="sequence-fragment-op-pills">
            {(['alt', 'opt', 'loop'] as const).map((op) => (
              <button
                key={op}
                type="button"
                className={`sequence-fragment-op-pill ${selectedItem.operator === op ? 'active' : ''}`}
                onClick={() => {
                  updateItem(selectedItem.id, {
                    operator: op,
                    operands: adjustOperandsForOperator(op, selectedItem.operands),
                  });
                }}
              >
                {op}
              </button>
            ))}
            <div className={`sequence-fragment-op-pill-select-wrap ${!['alt', 'opt', 'loop'].includes(selectedItem.operator) ? 'active' : ''}`}>
              <select
                aria-label="Más operadores"
                className="sequence-fragment-op-select"
                value={['alt', 'opt', 'loop'].includes(selectedItem.operator) ? '' : selectedItem.operator}
                onChange={(e) => {
                  const op = e.target.value as SequenceFragmentOperator;
                  if (!op) return;
                  updateItem(selectedItem.id, {
                    operator: op,
                    operands: adjustOperandsForOperator(op, selectedItem.operands),
                  });
                }}
              >
                <option value="" disabled>
                  {!['alt', 'opt', 'loop'].includes(selectedItem.operator) ? selectedItem.operator : 'Más ▾'}
                </option>
                <option value="par">par · paralela</option>
                <option value="critical">critical · crítica</option>
                <option value="break">break · corte</option>
                <option value="ref">ref · interacción</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. Scope (Horizontal Participants Span) */}
        <div className="sequence-fragment-span" style={{ marginBottom: 10 }}>
          <label>
            <span>Desde</span>
            <select
              value={selectedItem.startParticipantId ?? ''}
              onChange={(e) => updateItem(selectedItem.id, { startParticipantId: e.target.value || undefined })}
            >
              <option value="">Primero (auto)</option>
              {content.participants.map((p) => (
                <option key={p.id} value={p.id}>{formatSequenceParticipantName(p)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Hasta</span>
            <select
              value={selectedItem.endParticipantId ?? ''}
              onChange={(e) => updateItem(selectedItem.id, { endParticipantId: e.target.value || undefined })}
            >
              <option value="">Último (auto)</option>
              {content.participants.map((p) => (
                <option key={p.id} value={p.id}>{formatSequenceParticipantName(p)}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedItem.operator === 'ref' ? (
          <div className="sequence-ref-inspector-field" style={{ marginBottom: 12 }}>
            <label>
              <span>Diagrama referenciado</span>
              <select
                value={selectedItem.interactionArtifactId ?? ''}
                onChange={(event) => updateItem(selectedItem.id, {
                  interactionArtifactId: event.target.value || undefined,
                })}
              >
                <option value="">Sin interacción vinculada</option>
                {otherSequenceDiagrams.map((diag) => (
                  <option key={diag.id} value={diag.id}>{diag.name}</option>
                ))}
              </select>
            </label>
            {selectedItem.interactionArtifactId && !otherSequenceDiagrams.some((d) => d.id === selectedItem.interactionArtifactId) ? (
              <small className="sequence-reference-warning" style={{ color: '#b91c1c', display: 'block', marginTop: 4 }}>
                La interacción referenciada ya no existe en el proyecto.
              </small>
            ) : null}
            {selectedItem.interactionArtifactId && onNavigateToArtifact ? (
              <button
                type="button"
                className="secondary-action"
                style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}
                onClick={() => onNavigateToArtifact(selectedItem.interactionArtifactId!)}
              >
                <ExternalLink size={14} /> Abrir interacción referenciada
              </button>
            ) : null}
          </div>
        ) : (
          <label style={{ marginBottom: 10 }}>
            <span>Nombre / descripción (opcional)</span>
            <input
              value={selectedItem.name}
              onChange={(event) => updateItem(selectedItem.id, { name: event.target.value }, true)}
              placeholder="Descripción opcional del fragmento"
            />
          </label>
        )}

        {/* 4. Branches & Contained Messages */}
        <section className="sequence-inspector-section sequence-inspector-operands-section" style={{ marginTop: 6 }}>
          <div className="sequence-fragment-branches-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600 }}>Ramas y mensajes</h4>
              <span className="sequence-counter-badge">{totalMessages} {totalMessages === 1 ? 'mensaje' : 'mensajes'}</span>
            </div>
            {(selectedItem.operator === 'alt' || selectedItem.operator === 'par') ? (
              <button
                aria-label="Agregar rama"
                className="secondary-action-sm"
                type="button"
                style={{ fontSize: '0.68rem', padding: '2px 7px' }}
                title={selectedItem.operator === 'alt' ? 'Agregar alternativa (else/condición)' : 'Agregar sección paralela'}
                onClick={() => {
                  const newOp = { id: createId(), guard: '', items: [] };
                  updateItem(selectedItem.id, { operands: [...selectedItem.operands, newOp] });
                  setActiveOperandId(newOp.id);
                }}
              >
                <Plus size={12} /> Rama
              </button>
            ) : null}
          </div>

          {/* Segmented Tab Bar if more than 1 operand */}
          {selectedItem.operands.length > 1 ? (
            <div className="sequence-fragment-tab-bar">
              {selectedItem.operands.map((op, idx) => {
                const isTabActive = op.id === activeOp.id;
                const tabLabel = selectedItem.operator === 'alt'
                  ? (idx === 0 ? 'Rama 1 (si)' : idx === 1 ? 'Rama 2 (else)' : `Rama ${idx + 1}`)
                  : `Sección ${idx + 1}`;
                return (
                  <button
                    key={op.id}
                    type="button"
                    className={`sequence-fragment-tab-btn ${isTabActive ? 'active' : ''}`}
                    onClick={() => setActiveOperandId(op.id)}
                  >
                    <span>{tabLabel}</span>
                    <span className={`sequence-tab-counter ${isTabActive ? 'active' : ''}`}>{countSequenceMessages(op.items)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Active Operand Card */}
          {activeOp ? (
            <div className="sequence-active-operand-card">
              <div className="sequence-active-operand-header">
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--panel-text)' }}>
                  {selectedItem.operands.length > 1
                    ? (selectedItem.operator === 'alt'
                        ? (selectedItem.operands.findIndex((o) => o.id === activeOp.id) === 0
                            ? 'Rama 1 (si)'
                            : selectedItem.operands.findIndex((o) => o.id === activeOp.id) === 1
                              ? 'Rama 2 (else)'
                              : `Rama ${selectedItem.operands.findIndex((o) => o.id === activeOp.id) + 1}`)
                        : `Sección ${selectedItem.operands.findIndex((o) => o.id === activeOp.id) + 1}`)
                    : 'Condición / Guarda'}
                </span>
                {selectedItem.operands.length > 1 ? (
                  <button
                    aria-label="Eliminar esta rama"
                    className="icon-button"
                    type="button"
                    title="Eliminar esta rama del fragmento"
                    onClick={() => {
                      void deleteFragmentOperand(selectedItem.id, activeOp.id);
                      const remaining = selectedItem.operands.filter((o) => o.id !== activeOp.id);
                      if (remaining.length > 0) {
                        setActiveOperandId(remaining[0].id);
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>

              <label style={{ margin: '4px 0 8px' }}>
                <div className="sequence-fragment-guard-wrap">
                  <span className="sequence-fragment-guard-bracket">[</span>
                  <input
                    className="sequence-fragment-guard-input"
                    value={activeOp.guard}
                    onChange={(event) => updateItem(selectedItem.id, {
                      operands: selectedItem.operands.map((c) => (c.id === activeOp.id ? { ...c, guard: event.target.value } : c)),
                    }, true)}
                    placeholder={selectedItem.operands.indexOf(activeOp) === 0 ? 'condición' : 'else'}
                  />
                  <span className="sequence-fragment-guard-bracket">]</span>
                </div>
              </label>

              {/* Messages inside active branch */}
              <div className="sequence-operand-messages-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--panel-muted-text)' }}>
                    Mensajes en esta rama ({activeOpMessages.length}):
                  </span>
                </div>
                {activeOpMessages.length > 0 ? (
                  <div className="sequence-operand-messages-list">
                    {activeOpMessages.map((msg, msgIdx) => {
                      const src = content.participants.find((p) => p.id === msg.sourceId);
                      const tgt = content.participants.find((p) => p.id === msg.targetId);
                      const srcName = src ? formatSequenceParticipantName(src) : 'Origen';
                      const tgtName = tgt ? formatSequenceParticipantName(tgt) : 'Destino';
                      const typeCode = messageTypeShortLabels[msg.type];
                      return (
                        <div className="sequence-operand-message-row" key={msg.id}>
                          <span className="sequence-msg-row-idx">#{msgIdx + 1}</span>
                          <span className={`sequence-msg-type-pill ${msg.type}`}>
                            {typeCode}
                          </span>
                          <div className="sequence-msg-row-main">
                            <span className="sequence-msg-row-name">
                              {msg.name || messageTypeLabels[msg.type]}
                            </span>
                            <span className="sequence-msg-row-endpoints">
                              {srcName} → {tgtName}
                            </span>
                          </div>
                          <div className="sequence-msg-row-actions">
                            {selectedItem.operands.length > 1 ? (
                              <select
                                aria-label="Mover a otra rama"
                                className="sequence-msg-row-branch-select"
                                value=""
                                title="Mover mensaje a otra rama de este fragmento"
                                onChange={(e) => {
                                  const targetOpId = e.target.value;
                                  if (!targetOpId) return;
                                  commit(keepAnchoredNotesWithTimeline({
                                    ...content,
                                    items: updateNestedItemLocation(content.items, msg.id, `${selectedItem.id}:${targetOpId}`),
                                  }), true);
                                  showFeedback('Mensaje movido a otra rama.');
                                }}
                              >
                                <option value="">Rama...</option>
                                {selectedItem.operands.map((otherOp, otherIdx) => (
                                  otherOp.id === activeOp.id ? null : (
                                    <option key={otherOp.id} value={otherOp.id}>
                                      {selectedItem.operator === 'alt'
                                        ? (otherIdx === 0 ? 'Rama 1 (si)' : otherIdx === 1 ? 'Rama 2 (else)' : `Rama ${otherIdx + 1}`)
                                        : `Sección ${otherIdx + 1}`}
                                    </option>
                                  )
                                ))}
                              </select>
                            ) : null}
                            <button
                              type="button"
                              className="sequence-msg-row-eject"
                              title="Sacar mensaje de este fragmento hacia el flujo principal"
                              onClick={() => {
                                commit(keepAnchoredNotesWithTimeline({
                                  ...content,
                                  items: updateNestedItemLocation(content.items, msg.id, 'root'),
                                }));
                                showFeedback('Mensaje movido a secuencia principal.');
                              }}
                            >
                              <Ungroup size={12} /> Sacar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sequence-operand-empty-card">
                    <div className="sequence-empty-icon-wrap">
                      <SlidersHorizontal size={13} />
                    </div>
                    <div className="sequence-empty-text-wrap">
                      <strong>Rama sin mensajes</strong>
                      <span>Estirá los bordes en el lienzo o agregá uno abajo.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="sequence-operand-actions-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="secondary-action-sm sequence-action-pill"
                  onClick={() => addMessageToOperand(selectedItem.id, activeOp.id)}
                >
                  <Plus size={12} /> Mensaje
                </button>
                <button
                  type="button"
                  className="secondary-action-sm sequence-action-pill"
                  title="Anidar un subfragmento condicional dentro de esta rama"
                  onClick={() => addFragmentToOperand(selectedItem.id, activeOp.id, 'opt')}
                >
                  <Plus size={12} /> Subfragmento opt
                </button>
                <button
                  type="button"
                  className={`secondary-action-sm sequence-action-pill ${includingMessageOperandId === activeOp.id ? 'active' : ''}`}
                  title="Incorporar un mensaje ya existente en el diagrama a esta rama"
                  onClick={() => {
                    setIncludingMessageOperandId(includingMessageOperandId === activeOp.id ? null : activeOp.id);
                    setIncludeSearchFilter('');
                  }}
                >
                  <Plus size={12} /> Existente...
                </button>
              </div>

              {includingMessageOperandId === activeOp.id ? (
                <div className="sequence-operand-picker" style={{ marginTop: 8 }}>
                  <div className="sequence-operand-picker-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <SlidersHorizontal size={12} />
                      <strong>Mover mensaje existente a esta rama</strong>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Cerrar selector"
                      onClick={() => setIncludingMessageOperandId(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {availableOutside.length > 3 ? (
                    <div className="sequence-operand-picker-search-wrap">
                      <Search size={12} className="search-icon" />
                      <input
                        autoFocus
                        className="sequence-operand-picker-search"
                        placeholder="Buscar por nombre o participante…"
                        value={includeSearchFilter}
                        onChange={(e) => setIncludeSearchFilter(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="sequence-operand-picker-list">
                    {availableOutside.length === 0 ? (
                      <div className="sequence-operand-picker-empty">
                        Todos los mensajes del diagrama ya se encuentran en esta rama.
                      </div>
                    ) : filteredAvailable.length === 0 ? (
                      <div className="sequence-operand-picker-empty">
                        No se encontraron mensajes que coincidan con &quot;{includeSearchFilter}&quot;.
                      </div>
                    ) : (
                      filteredAvailable.map((entry) => {
                        const src = content.participants.find((p) => p.id === entry.message.sourceId);
                        const tgt = content.participants.find((p) => p.id === entry.message.targetId);
                        const srcName = src ? formatSequenceParticipantName(src) : 'Origen';
                        const tgtName = tgt ? formatSequenceParticipantName(tgt) : 'Destino';
                        const typeCode = messageTypeShortLabels[entry.message.type];
                        return (
                          <button
                            type="button"
                            key={entry.message.id}
                            className="sequence-operand-picker-item"
                            title={`Mover "${entry.message.name || entry.message.type}" a esta rama`}
                            onClick={() => {
                              commit(keepAnchoredNotesWithTimeline({
                                ...content,
                                items: updateNestedItemLocation(content.items, entry.message.id, `${selectedItem.id}:${activeOp.id}`),
                              }), true);
                              showFeedback(`Mensaje "${entry.message.name || messageTypeLabels[entry.message.type]}" movido a esta rama.`);
                              setIncludingMessageOperandId(null);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span className="sequence-msg-row-idx">#{entry.timelineIndex}</span>
                              <span className={`sequence-msg-type-pill ${entry.message.type}`}>{typeCode}</span>
                              <span className="sequence-picker-item-name">{entry.message.name || messageTypeLabels[entry.message.type]}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span className="sequence-picker-item-endpoints">{srcName} → {tgtName}</span>
                              <span className="sequence-picker-item-loc">[{entry.containerLabel}]</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 5. Collapsed by default: Geometry */}
        <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 10 }}>
          <summary><h4>Avanzado: Posición y tamaño en lienzo</h4></summary>
          <p className="sequence-inspector-hint">
            El fragmento adapta su posición y tamaño automáticamente al contenido. También podés arrastrarlo o estirar sus bordes directamente en el lienzo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginTop: 6 }}>
            <label>
              <span>Posición X</span>
              <input
                type="number"
                value={selectedItem.x ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.x ?? 0)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { x: Math.max(20, Math.round(val)) }, true);
                }}
              />
            </label>
            <label>
              <span>Posición Y</span>
              <input
                type="number"
                value={selectedItem.y ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.y ?? 0)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { y: Math.max(80, Math.round(val)) }, true);
                }}
              />
            </label>
            <label>
              <span>Ancho</span>
              <input
                type="number"
                value={selectedItem.width ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.width ?? 300)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  const minimumWidth = layout.fragmentLayouts.get(selectedItem.id)?.minWidth ?? 140;
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { width: Math.max(minimumWidth, Math.round(val)) }, true);
                }}
              />
            </label>
            <label>
              <span>Alto</span>
              <input
                type="number"
                value={selectedItem.height ?? Math.round(layout.fragmentLayouts.get(selectedItem.id)?.height ?? 140)}
                onChange={(event) => {
                  const val = parseFloat(event.target.value);
                  const minimumHeight = layout.fragmentLayouts.get(selectedItem.id)?.minHeight ?? 60;
                  if (Number.isFinite(val)) updateItem(selectedItem.id, { height: Math.max(minimumHeight, Math.round(val)) }, true);
                }}
              />
            </label>
          </div>
          {(selectedItem.x !== undefined || selectedItem.y !== undefined || selectedItem.width !== undefined || selectedItem.height !== undefined) ? (
            <button
              className="secondary-action"
              type="button"
              style={{ marginTop: '8px', width: '100%' }}
              onClick={() => updateItem(selectedItem.id, { x: undefined, y: undefined, width: undefined, height: undefined })}
            >
              Restablecer tamaño automático
            </button>
          ) : null}
        </details>
      </>
    );
  })() : null;

  const noteInspector = selectedNote ? (
    <>

      <label style={{ marginBottom: 10 }}>
        <span>Texto de la nota</span>
        <textarea
          className="sequence-compact-textarea"
          rows={5}
          value={selectedNote.text}
          onChange={(event) => {
            updateNote(selectedNote.id, { text: event.target.value }, true);
          }}
          placeholder="Escribí aquí una nota de apoyo o aclaración…"
        />
        <small className="sequence-inspector-hint" style={{ marginTop: 4, display: 'block' }}>
          Doble clic o Enter en el lienzo para escribir · Tiradores para redimensionar en ancho y alto.
        </small>
      </label>

      <details className="sequence-inspector-section sequence-collapsible-section sequence-note-options" style={{ marginTop: 8 }}>
        <summary><h4>Apariencia y vínculo</h4></summary>
        <div style={{ marginBottom: 12, marginTop: 6 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text)', display: 'block', marginBottom: 4 }}>
            Color
          </label>
          <div className="sequence-note-color-grid">
            {/* The swatches come from the same schemes the canvas draws with. */}
            {([
              { id: 'yellow', desc: 'General / Nota estándar' },
              { id: 'red', desc: 'Alerta / Condición SINO' },
              { id: 'green', desc: 'Precondición / Éxito' },
              { id: 'blue', desc: 'Técnico / Requisito' },
            ] as const).map(({ id, desc }) => ({
              id,
              desc,
              label: SEQUENCE_NOTE_COLORS[id].label,
              dot: resolveSequenceNoteScheme(theme, id).dot,
              bg: resolveSequenceNoteScheme(theme, id).background,
              border: resolveSequenceNoteScheme(theme, id).border,
            })).map((colorOpt) => {
              const isSelected = (selectedNote.color ?? 'yellow') === colorOpt.id;
              return (
                <button
                  key={colorOpt.id}
                  type="button"
                  title={colorOpt.desc}
                  className={`sequence-note-color-pill ${isSelected ? 'active' : ''}`}
                  style={{
                    '--note-pill-bg': colorOpt.bg,
                    '--note-pill-dot': colorOpt.dot,
                    '--note-pill-border': colorOpt.border,
                  } as CSSProperties}
                  onClick={() => updateNote(selectedNote.id, { color: colorOpt.id })}
                >
                  <span className="sequence-note-color-dot" />
                  <span>{colorOpt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tipo de anclaje (Pills) */}
        <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--panel-muted-text)', display: 'block', marginBottom: 2 }}>
          Tipo de anclaje
        </label>
        <div className="sequence-note-anchor-grid">
          {(['free', 'message', 'participant', 'fragment'] as const).map((kind) => {
            const labels = {
              free: 'Libre',
              message: 'Mensaje',
              participant: 'Partic.',
              fragment: 'Fragm.',
            };
            const isActive = selectedNote.anchorKind === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`sequence-note-anchor-pill ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (kind === 'free') {
                    updateNote(selectedNote.id, { anchorKind: 'free', anchorId: undefined });
                  } else if (kind === 'message') {
                    const defaultMsgId = layout.orderedMessages[0]?.id;
                    updateNote(selectedNote.id, { anchorKind: 'message', anchorId: selectedNote.anchorKind === 'message' && selectedNote.anchorId ? selectedNote.anchorId : defaultMsgId });
                  } else if (kind === 'participant') {
                    const defaultPartId = content.participants[0]?.id;
                    updateNote(selectedNote.id, { anchorKind: 'participant', anchorId: selectedNote.anchorKind === 'participant' && selectedNote.anchorId ? selectedNote.anchorId : defaultPartId });
                  } else if (kind === 'fragment') {
                    const firstFrag = flatEntries.find((e) => e.item.kind === 'fragment')?.item;
                    updateNote(selectedNote.id, { anchorKind: 'fragment', anchorId: selectedNote.anchorKind === 'fragment' && selectedNote.anchorId ? selectedNote.anchorId : firstFrag?.id });
                  }
                }}
              >
                {labels[kind]}
              </button>
            );
          })}
        </div>
        </div>

        {/* Target Element Selector (when not 'free') */}
        {selectedNote.anchorKind === 'message' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Mensaje vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {layout.orderedMessages.map((message, index) => (
              <option key={message.id} value={message.id}>
                #{index + 1} · {message.type === 'return' ? 'Retorno' : (message.name || messageTypeLabels[message.type])}
              </option>
            ))}
          </select>
        </label>
      ) : selectedNote.anchorKind === 'participant' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Participante vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {content.participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {formatSequenceParticipantName(participant)}
              </option>
            ))}
          </select>
        </label>
      ) : selectedNote.anchorKind === 'fragment' ? (
        <label style={{ marginBottom: 10 }}>
          <span>Fragmento vinculado</span>
          <select
            value={selectedNote.anchorId ?? ''}
            onChange={(event) => updateNote(selectedNote.id, { anchorId: event.target.value })}
          >
            {flatEntries
              .filter((entry) => entry.item.kind === 'fragment')
              .map((entry) => {
                const frag = entry.item as SequenceFragment;
                return (
                  <option key={frag.id} value={frag.id}>
                    {frag.operator.toUpperCase()} {frag.name ? `· "${frag.name}"` : ''}
                  </option>
                );
              })}
          </select>
        </label>
        ) : null}
      </details>

      {/* Geometría plegable */}
      <details className="sequence-inspector-section sequence-collapsible-section" style={{ marginTop: 8 }}>
        <summary><h4>Avanzado: Posición y tamaño</h4></summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginTop: 6 }}>
          <label>
            <span>Posición X</span>
            <input
              type="number"
              value={selectedNote.x}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { x: Math.round(val) }, true);
              }}
            />
          </label>
          <label>
            <span>Posición Y</span>
            <input
              type="number"
              value={selectedNote.y}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { y: Math.round(val) }, true);
              }}
            />
          </label>
          <label>
            <span>Ancho</span>
            <input
              type="number"
              value={Math.round(layout.noteLayouts.get(selectedNote.id)?.width ?? selectedNote.width)}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { width: Math.max(SEQUENCE_NOTE_MIN_WIDTH, Math.round(val)) }, true);
              }}
            />
          </label>
          <label>
            <span>Alto</span>
            <input
              type="number"
              value={Math.round(layout.noteLayouts.get(selectedNote.id)?.height ?? selectedNote.height)}
              onChange={(event) => {
                const val = parseFloat(event.target.value);
                if (Number.isFinite(val)) updateNote(selectedNote.id, { height: Math.max(SEQUENCE_NOTE_MIN_HEIGHT, Math.round(val)) }, true);
              }}
            />
          </label>
        </div>
      </details>
    </>
  ) : null;

  // Like the class editor, the inspector exists only while something is
  // selected: an empty "Seleccioná un elemento" column cost the diagram ~300px.
  const selectedInspector = participantInspector ?? messageInspector ?? fragmentInspector ?? noteInspector;
  const inspectorHeader: { kind: string; title: string; tone: InspectorTone; deleteLabel: string } | null = selectedParticipant
    ? { kind: selectedParticipant.kind === 'actor' ? 'Actor' : 'Participante', title: formatSequenceParticipantName(selectedParticipant), tone: 'accent', deleteLabel: selectedParticipant.kind === 'actor' ? 'Eliminar actor' : 'Eliminar participante' }
    : selectedItem?.kind === 'message'
      ? {
          kind: messageKindLabels[selectedItem.type],
          title: selectedItem.type === 'return' ? selectedItem.name || 'Retorno' : selectedItem.name || 'Mensaje sin nombre',
          tone: messageKindTones[selectedItem.type],
          deleteLabel: 'Eliminar mensaje',
        }
      : selectedItem?.kind === 'fragment'
        ? { kind: `Fragmento ${selectedItem.operator}`, title: fragmentLabels[selectedItem.operator], tone: 'violet', deleteLabel: 'Eliminar fragmento' }
        : selectedNote
          ? { kind: 'Nota', title: selectedNote.text.trim().split('\n')[0] || 'Nota sin texto', tone: 'warning', deleteLabel: 'Eliminar nota' }
          : null;
  const inspectorIdle = selectedInspector === null || selectedInspector === undefined;

  return (
    <main className="editor-shell sequence-editor-shell" ref={editorRootRef}>
      <EditorToolbar
        toolbarRef={toolbarRef}
        start={(
          <>
            <ToolbarHistory canRedo={canRedo} canUndo={canUndo} saveStatus={saveStatus} onRedo={onRedo} onUndo={onUndo} />
            {associatedClassDiagram ? <ToolMenu icon={GitBranch} label={missingCount > 0 ? `${missingCount} ${missingCount === 1 ? 'falta' : 'faltan'}` : '✓ Al día'} title={missingCount > 0 ? `${missingCount} ${missingCount === 1 ? 'elemento falta' : 'elementos faltan'} en «${associatedClassDiagram.name}»` : `Al día con «${associatedClassDiagram.name}»`} align="start" className={`sequence-model-status ${missingCount > 0 ? 'has-novelties' : ''}`}>
              {missingCount > 0 ? <MenuItem disabled={!onImportSequenceIntoClassModel} onSelect={importIntoModel}>Agregar todo a «{associatedClassDiagram.name}»</MenuItem> : null}
              <MenuItem icon={Link2} disabled={!onNavigateToArtifact} onSelect={() => onNavigateToArtifact?.(associatedClassDiagram.id)}>Abrir «{associatedClassDiagram.name}»</MenuItem>
              <MenuItem icon={Unlink} onSelect={() => commit({ ...content, classDiagramArtifactId: null })}>Desvincular</MenuItem>
            </ToolMenu> : (
              <ToolMenu icon={GitBranch} label="Sin vincular" title="Vinculá esta secuencia con unas Clases de secuencias para elegir clases y operaciones ya hechas y mantener los nombres al día." align="start" className="sequence-model-status">
                {classDiagrams.length > 0 ? <MenuLabel>Vincular con</MenuLabel> : null}
                {classDiagrams.map((model) => (
                  <MenuItem key={model.id} icon={Link2} onSelect={() => commit({ ...content, classDiagramArtifactId: model.id })}>{model.name}</MenuItem>
                ))}
                {onCreateSequenceModel ? <MenuItem icon={Plus} onSelect={onCreateSequenceModel}>Crear Clases de secuencias y vincular</MenuItem> : null}
              </ToolMenu>
            )}
          </>
        )}
        create={(
          <>
            <ToolButton
              icon={MessageSquarePlus}
              label="Mensaje"
              showLabel
              variant={content.participants.length === 0 ? 'default' : 'primary'}
              disabled={content.participants.length === 0}
              title={content.participants.length === 0 ? 'Primero agregá participantes' : 'Insertar mensaje (o doble clic en el lienzo)'}
              onClick={() => beginMessage()}
            />
            <ToolButton
              icon={UserRoundPlus}
              label="Participante"
              showLabel
              variant={content.participants.length === 0 ? 'primary' : 'default'}
              title="Agregar participante (objeto o actor)"
              onClick={() => beginParticipantCreation()}
            />
            <ToolMenu icon={BoxSelect} label="Fragmento" align="start" title="Agregar fragmento combinado (alt, loop, opt…)">
              {Object.entries(fragmentLabels).map(([value, label]) => {
                const [operator, description] = label.split(' · ');
                return (
                  <MenuItem key={value} onSelect={() => addFragment(value as SequenceFragmentOperator)}>
                    <span className="v2-menu-code">{operator}</span> {description}
                  </MenuItem>
                );
              })}
            </ToolMenu>
            <ToolButton icon={StickyNote} label="Nota" title="Agregar nota" onClick={addNote} />
            <ToolbarDivider />
            <ToolButton
              icon={Keyboard}
              label="Modo teclado"
              pressed={keyboardMode.stage !== 'off'}
              shortcut="M"
              onClick={() => keyboardMode.stage === 'off' ? activateKeyboardMode() : dispatchKeyboardMode({ type: 'deactivate' })}
            />
          </>
        )}
        end={(
          <>
            <NotebookButton />
            <ReviewButton
              count={reviewProblems.length}
              hasErrors={reviewProblems.some((problem) => problem.severity === 'error')}
              open={isReviewPanelOpen}
              onToggle={() => setIsReviewPanelOpen((open) => !open)}
            />
            <ToolMenu icon={Eye} label="Vista">
              <MenuLabel>Paneles</MenuLabel>
              <MenuItem checked={outlineVisible} onSelect={() => updateOutlineVisibility(!outlineVisible)}>Estructura</MenuItem>
              <MenuSeparator />
              <MenuLabel>Diagrama</MenuLabel>
              <MenuItem checked={content.showActivations} onSelect={() => commit({ ...content, showActivations: !content.showActivations })}>Activaciones</MenuItem>
              <MenuItem
                checked={(content.participantColors ?? 'automatic') !== 'disabled'}
                onSelect={() => commit({ ...content, participantColors: (content.participantColors ?? 'automatic') === 'disabled' ? 'automatic' : 'disabled' })}
              >
                Colores de participantes
              </MenuItem>
              <MenuItem
                checked={content.spacing === 'compact'}
                onSelect={() => commit(keepAnchoredNotesWithTimeline({ ...content, spacing: content.spacing === 'compact' ? undefined : 'compact' }))}
              >
                Espaciado compacto
              </MenuItem>
              <MenuField label="Numeración">
                <select value={content.numbering} onChange={(event) => commit({ ...content, numbering: event.target.value as SequenceDiagramContent['numbering'] })}>
                  <option value="sequential">Correlativa (1, 2, 3)</option>
                  <option value="hierarchical">Jerárquica (1, 1.1, 1.2)</option>
                  <option value="none">Sin números</option>
                </select>
              </MenuField>
              <MenuSeparator />
              <MenuLabel>Referencias</MenuLabel>
              <MenuField label="Clases de secuencias" hint="Vinculá esta secuencia con unas Clases de secuencias para elegir clases y operaciones ya hechas y mantener los nombres al día.">
                <select
                  title="Vinculá esta secuencia con unas Clases de secuencias para elegir clases y operaciones ya hechas y mantener los nombres al día."
                  value={associatedClassDiagram?.id ?? ''}
                  onChange={(event) => commit({ ...content, classDiagramArtifactId: event.target.value || null })}
                >
                  <option value="">Sin vincular</option>
                  {classDiagrams.map((diagram) => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}
                </select>
              </MenuField>
              <MenuField
                label="Flujo de sucesos"
                hint={content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? 'El flujo asociado ya no existe.' : undefined}
              >
                <select value={content.flowArtifactId ?? ''} onChange={(event) => commit({ ...content, flowArtifactId: event.target.value || undefined })}>
                  {content.flowArtifactId && !flows.some((flow) => flow.id === content.flowArtifactId) ? <option value={content.flowArtifactId}>Referencia no disponible</option> : null}
                  <option value="">Sin referencia</option>
                  {flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
                </select>
              </MenuField>
            </ToolMenu>
            <ToolMenu icon={Download} label="Exportar">
              <MenuItem icon={ImageDown} onSelect={() => setExportDialogOpen(true)}>PNG o PDF…</MenuItem>
            </ToolMenu>
          </>
        )}
        below={(
          <>
          {selectedTimelineIds.length > 1 ? (
            <div className="sequence-multi-selection-bar v2-selection-bar" data-testid="sequence-multi-selection-bar">
              <span><strong>{selectedTimelineIds.length}</strong> {selectedTimelineIds.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
              <details className="toolbar-menu v2-menu" onToggle={handleToolbarMenuToggle}>
                <summary style={{ cursor: canWrapSelection ? 'pointer' : 'not-allowed', opacity: canWrapSelection ? 1 : 0.6 }}>
                  <BoxSelect size={14} /> Envolver en...
                </summary>
                {canWrapSelection ? (
                  <div className="toolbar-menu-content">
                    <button type="button" onClick={() => handleWrapSelection('alt')}>alt (Alternativa)</button>
                    <button type="button" onClick={() => handleWrapSelection('loop')}>loop (Bucle)</button>
                    <button type="button" onClick={() => handleWrapSelection('opt')}>opt (Opcional)</button>
                    <button type="button" onClick={() => handleWrapSelection('par')}>par (Paralelo)</button>
                    <button type="button" onClick={() => handleWrapSelection('critical')}>critical (Región crítica)</button>
                  </div>
                ) : null}
              </details>
              {locations.length > 0 && selectedTimelineIds.every((id) => flatEntries.some((e) => e.item.id === id && e.item.kind === 'message')) ? (
                <select
                  className="sequence-operand-add-select"
                  style={{ maxWidth: 190, fontSize: '0.78rem' }}
                  value=""
                  onChange={(event) => {
                    const loc = event.target.value;
                    if (!loc) return;
                    let newItems = content.items;
                    for (const id of selectedTimelineIds) {
                      newItems = updateNestedItemLocation(newItems, id, loc);
                    }
                    // A move the timeline rejects keeps the selection; commit already explained why.
                    if (!commit(keepAnchoredNotesWithTimeline({ ...content, items: newItems }))) return;
                    showFeedback(`${selectedTimelineIds.length} mensaje${selectedTimelineIds.length > 1 ? 's' : ''} movido${selectedTimelineIds.length > 1 ? 's' : ''}.`);
                    setSelectedTimelineIds([]);
                  }}
                >
                  <option value="">Mover selección a...</option>
                  <option value="root">Secuencia principal</option>
                  {locations.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="secondary-action" onClick={() => setSelectedTimelineIds([])}>
                Deseleccionar
              </button>
            </div>
          ) : null}
          </>
        )}
      />
      {feedback ? <div className="editor-feedback">{feedback}</div> : null}
      {participantDraft ? (
        <form
          aria-describedby="sequence-participant-composer-help"
          aria-labelledby="sequence-participant-composer-title"
          className="sequence-participant-composer"
          onSubmit={submitParticipantDraft}
        >
          <div>
            <h2 id="sequence-participant-composer-title">{participantDraft.kind === 'actor' ? 'Nuevo actor' : 'Nuevo participante'}</h2>
            <span id="sequence-participant-composer-help">{participantDraft.kind === 'actor' ? 'El nombre del actor, como en el caso de uso.' : 'Usá la notación instancia:Clase o :Clase.'}</span>
          </div>
          <div className="v2-segmented" role="radiogroup" aria-label="Tipo de participante">
              {(['actor', 'object'] as const).map((kind) => (
                <button
                  aria-checked={participantDraft.kind === kind}
                  className={participantDraft.kind === kind ? 'is-active' : ''}
                  key={kind}
                  role="radio"
                  type="button"
                  onClick={() => setParticipantDraft((current) => current ? { ...current, kind } : current)}
                >
                  {kind === 'actor' ? <PersonStanding size={14} aria-hidden="true" /> : <UserRoundPlus size={14} aria-hidden="true" />}
                  {kind === 'actor' ? 'Actor' : 'Objeto'}
                </button>
              ))}
          </div>
          <input
            autoFocus
            key={participantDraft.kind}
            aria-label={participantDraft.kind === 'actor' ? 'Nombre del actor' : 'Identificación del participante'}
            value={participantDraft.text}
            placeholder={participantDraft.kind === 'actor' ? 'Actor principal' : 'nombre:Clase'}
            onChange={(event) => setParticipantDraft((current) => current ? { ...current, text: event.target.value } : current)}
            onKeyDown={(event) => {
              if (shouldIgnoreEditorShortcut(event, document)) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                setParticipantDraft(null);
              }
            }}
          />
          <button className="primary-action" type="submit"><Plus size={15} /> Crear</button>
          <button aria-label="Cancelar participante" className="icon-button" type="button" title="Cancelar" onClick={() => setParticipantDraft(null)}><X size={16} /></button>
        </form>
      ) : null}
      <section
        className={`sequence-workspace ${outlineVisible ? '' : 'sequence-workspace-focused'} ${inspectorIdle ? 'sequence-inspector-idle' : inspectorCollapsed ? 'sequence-inspector-collapsed' : ''}`}
        style={{ '--sequence-inspector-width': `${inspectorIdle ? 0 : inspectorCollapsed ? 44 : inspectorWidth}px` } as CSSProperties}
      >
        <aside className="sequence-outline-panel" hidden={!outlineVisible}>
          <div className="sequence-panel-title">
            <div><h2>Estructura</h2><strong>{(() => {
              const count = flatEntries.filter((entry) => entry.item.kind === 'message').length;
              return `${count} ${count === 1 ? 'mensaje' : 'mensajes'}`;
            })()}</strong></div>
            <div className="sequence-panel-title-actions">
              <button aria-label="Ocultar estructura" className="v2-tool" type="button" title="Ocultar estructura (también en Vista)" onClick={() => updateOutlineVisibility(false)}><PanelLeftClose size={15} /></button>
            </div>
          </div>
          <label className="sequence-search"><Search aria-hidden="true" size={14} /><input aria-label="Buscar mensaje o bloque" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar mensaje o bloque" /></label>
          <div className="sequence-outline-list">
            {content.items.length === 0 ? (
              <div className="sequence-empty-state"><p>Agregá participantes y luego el primer mensaje.</p></div>
            ) : !hasOutlineMatches ? (
              <div className="sequence-empty-state"><p>No se encontraron resultados para &ldquo;{searchQuery}&rdquo;</p></div>
            ) : (
              renderOutline(content.items)
            )}
          </div>
          <div className="sequence-outline-actions">
            <button aria-label="Subir elemento" className="icon-button" type="button" title="Subir" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment') && selectedTimelineIds.length === 0} onClick={() => moveSelectedItem(-1)}><ArrowUp size={14} /></button>
            <button aria-label="Bajar elemento" className="icon-button" type="button" title="Bajar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment') && selectedTimelineIds.length === 0} onClick={() => moveSelectedItem(1)}><ArrowDown size={14} /></button>
            <button aria-label="Duplicar elemento" className="icon-button" type="button" title="Duplicar" disabled={!(selection?.kind === 'message' || selection?.kind === 'fragment')} onClick={duplicateSelectedItem}><Copy size={14} /></button>
            <button aria-label="Eliminar elemento seleccionado" className="icon-button danger" type="button" title="Eliminar" disabled={!selection && selectedTimelineIds.length === 0} onClick={deleteSelection}><Trash2 size={14} /></button>
          </div>
        </aside>
        <section className={`sequence-canvas-panel ${isKeyboardActive ? 'keyboard-mode-active' : ''}`}>
          {isKeyboardActive ? (
            <div className="sequence-canvas-guide is-keyboard-active" data-export-control="true" ref={keyboardGuideRef}>
              <div className="sequence-keyboard-guide-body">
                <span className="sequence-keyboard-status-badge">MODO TECLADO</span>
                {keyboardContext ? (
                  <strong className="sequence-keyboard-guide-context" title={keyboardContext}>
                    {keyboardContext}
                  </strong>
                ) : null}
                <span className="sequence-keyboard-guide-instruction">{keyboardInstruction}</span>
              </div>
              <button
                type="button"
                className="sequence-keyboard-exit-pill"
                title="Salir del modo teclado (M)"
                onClick={() => dispatchKeyboardMode({ type: 'deactivate' })}
              >
                Salir <kbd>M</kbd>
              </button>
            </div>
          ) : null}
          {/* While a fragment's name or guard is being typed on the canvas the
              composer steps aside, so it does not cover the inline editor. */}
          {keyboardMode.stage !== 'off' && keyboardSlot && !inlineFragmentEditor && (keyboardSourceParticipant || keyboardMode.stage === 'navigate' || keyboardMode.stage === 'participant') ? (
            <SequenceKeyboardComposer
              state={keyboardMode}
              context={keyboardContext}
              sourceName={keyboardSourceParticipant ? formatSequenceParticipantName(keyboardSourceParticipant) : 'Sin participantes'}
              targetName={keyboardTargetName}
              position={keyboardPopoverPosition}
              placement={keyboardPopoverPlacement}
              methodOptions={keyboardMethodOptions}
              selectedCount={selectedTimelineIds.length}
              onTextChange={(text) => dispatchKeyboardMode({ type: 'set-text', text })}
              onGuardChange={(text) => dispatchKeyboardMode({ type: 'set-guard', text })}
              onSubmit={(addAutomaticReturn, stayAtSource) => {
                if (keyboardMode.stage === 'participant') commitKeyboardParticipant();
                else if (keyboardMode.stage === 'guard') commitKeyboardGuard();
                else if (keyboardMode.stage === 'fragment') commitKeyboardFragment();
                else commitKeyboardMessage(addAutomaticReturn, stayAtSource);
              }}
              onBack={() => dispatchKeyboardMode({ type: 'back' })}
              onMethodSelect={(method) => dispatchKeyboardMode({
                type: 'set-method',
                operationMethodId: method.id,
                text: methodInsertText(method),
              })}
              onAddParticipant={() => dispatchKeyboardMode({ type: 'begin-participant' })}
              onOpenFragment={() => dispatchKeyboardMode({ type: 'open-fragment' })}
              onSelectType={setKeyboardMessageType}
              onMoveTarget={(direction) => moveKeyboardParticipant(direction, true)}
              returnAvailable={keyboardMode.stage !== 'aim' || findCompatibleSequenceReturnCalls(content, layout, keyboardSlot, keyboardMode.sourceId).length > 0}
            />
          ) : null}
          {content.participants.length === 0 && !participantDraft ? (
            <CanvasStartCard
              title="Empezá por el actor"
              action={(
                <>
                  <button className="primary-action" type="button" onClick={() => beginParticipantCreation('actor')}>
                    <PersonStanding size={14} />Agregar actor
                  </button>
                  <button className="secondary-action" type="button" onClick={() => beginParticipantCreation('object')}>
                    <Plus size={14} />Agregar participante
                  </button>
                </>
              )}
            >
              El actor del caso de uso inicia la secuencia; después, agregá objetos con la forma <code>nombre:Clase</code>.
            </CanvasStartCard>
          ) : null}
          {quickMessage ? <SequenceMessageDialog routeEditable={quickMessageRouteEditable} draft={quickMessage} participants={content.participants} methodOptions={quickMessageMethodOptions} flowOptions={flowOptions} referenceStatus={quickMessageReferenceStatus} onChange={setQuickMessage} onSwap={swapQuickMessage} onSubmit={saveQuickMessage} onCancel={() => setQuickMessage(null)} /> : null}
          <CanvasZoom
            label="Zoom del diagrama de secuencia"
            zoomPercent={Math.round(zoom * 100)}
            onZoomOut={() => setZoom((value) => Math.max(0.3, value - 0.1))}
            onZoomIn={() => setZoom((value) => Math.min(1.8, value + 0.1))}
            onResetZoom={() => setZoom(1)}
            onFit={fitDiagramToView}
          />
          {scrollPosition.top > 100 ? (
            <div className="sequence-sticky-participants" style={{ height: layout.maxParticipantHeaderHeight * zoom + 14 }}>
              {content.participants.filter((participant) => {
                // A lifeline gets a pill while its header is scrolled out of view
                // and the line still runs below the top edge: objects made with
                // create() appear once born, destroyed ones leave.
                const header = layout.participantLayouts.get(participant.id);
                const end = layout.participantEndY.get(participant.id);
                const viewportTop = scrollPosition.top / zoom;
                return header !== undefined && header.headerY + header.headerHeight < viewportTop + 8
                  && (end === undefined || end > viewportTop + layout.maxParticipantHeaderHeight);
              }).map((participant) => {
                const participantBox = layout.participantLayouts.get(participant.id);
                return (
                  <button
                    key={participant.id}
                    type="button"
                    className={`sequence-sticky-participant-pill ${selection?.id === participant.id ? 'active' : ''}`}
                    title={`Seleccionar ${formatSequenceParticipantName(participant)}`}
                    style={{
                      left: participant.x * zoom - scrollPosition.left,
                      width: Math.max(72, Math.round((participantBox?.headerWidth ?? 118) * zoom)),
                      minHeight: Math.max(28, Math.round((participantBox?.headerHeight ?? SEQUENCE_HEADER_HEIGHT) * zoom)),
                      fontSize: `${Math.max(9, Math.min(12, Math.round(11 * zoom)))}px`,
                    }}
                    aria-label={`Seleccionar ${formatSequenceParticipantName(participant)}`}
                    onClick={() => selectCanvasElement({ kind: 'participant', id: participant.id })}
                  >
                    {formatSequenceParticipantName(participant)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            className="sequence-canvas-scroll"
            data-editor-canvas=""
            ref={scrollRef}
            tabIndex={-1}
            onScroll={(event) => handleCanvasScroll(event.currentTarget)}
            onPointerMove={(event) => { canvasPointerRef.current = { clientX: event.clientX, clientY: event.clientY }; }}
            onPointerLeave={() => { canvasPointerRef.current = null; }}
          >
            <div className="sequence-canvas-scale" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: layout.width, height: layout.height, position: 'relative' }}
                onContextMenu={(event) => {
                  const element = event.target instanceof Element ? event.target.closest('[data-participant-id]') : null;
                  const id = element?.getAttribute('data-participant-id');
                  if (!id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  selectCanvasElement({ kind: 'participant', id });
                }}
                onPointerDownCapture={(event) => {
                  if (!inlineNoteEditor?.draft || (event.target instanceof Element && event.target.closest('.sequence-inline-note-container'))) return;
                  // Keep focus until the click saves the draft, so the canvas
                  // cannot start a drag or clear the newly selected note.
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClickCapture={(event) => {
                  if (!inlineNoteEditor?.draft || (event.target instanceof Element && event.target.closest('.sequence-inline-note-container'))) return;
                  event.preventDefault();
                  event.stopPropagation();
                  commitInlineNoteEdit();
                }}
              >
                <SequenceDiagramCanvas
                  content={interactionContent}
                  layout={layout}
                  selected={selection}
                  selectedTimelineIds={selectedTimelineIds}
                  highlighted={highlightedSelection}
                  theme={theme}
                  classNodesById={classNodesById}
                  missingInModel={missingInModel}
                  participantColorsEnabled={content.participantColors !== 'disabled'}
                  colorReferenceParticipant={participantColorReference}
                  ariaDescriptionId="sequence-structured-description"
                  onSelect={selectCanvasElement}
                  onTimelineItemSelect={handleTimelineItemSelect}
                  onReorderMessagePointerDown={startMessageDrag}
                  onMarqueeSelect={handleMarqueeSelect}
                  insertionGuide={visibleInsertionGuide}
                  keyboardPreview={keyboardCanvasPreview}
                  keyboardParticipantNumbers={keyboardMode.stage === 'navigate' || keyboardMode.stage === 'aim' ? keyboardParticipantNumbers : undefined}
                  onBackgroundPoint={keyboardMode.stage === 'navigate' ? moveKeyboardCursorToPoint : undefined}
                  onNavigateToArtifact={onNavigateToArtifact}
                  onConnect={connectLifelines}
                  onEditMessage={editMessageOnCanvas}
                  onParticipantPointerDown={startParticipantDrag}
                  onNotePointerDown={startNoteDrag}
                  onNoteResizePointerDown={startNoteResize}
                  onEditNote={handleEditNote}
                  editingNoteId={inlineNoteEditor?.noteId ?? null}
                  onFragmentPointerDown={startFragmentDrag}
                  onFragmentResizePointerDown={startFragmentResize}
                  onEditFragmentGuard={handleEditFragmentGuard}
                  onEditFragmentName={handleEditFragmentName}
                  onAddFragmentOperand={handleAddFragmentOperand}
                  onAddMessageToOperand={addMessageToOperand}
                  onAddFragmentToOperand={(fragmentId, operandId) => addFragmentToOperand(fragmentId, operandId, 'opt')}
                  boundaryResizePreview={boundaryResizePreview}
                  svgRef={(element) => { svgRef.current = element; }}
                />
                {inlineFragmentEditor ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: inlineFragmentEditor.x,
                      top: inlineFragmentEditor.y,
                      zIndex: 100,
                    }}
                  >
                    <input
                      autoFocus
                      className="sequence-inline-input"
                      style={{
                        width: inlineFragmentEditor.width,
                        fontSize: '11px',
                        padding: '2px 6px',
                        background: theme.classNode.background,
                        color: theme.classNode.text,
                        border: `1.5px solid ${theme.association.strokeSelected}`,
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                        outline: 'none',
                      }}
                      value={inlineFragmentEditor.value}
                      placeholder={inlineFragmentEditor.kind === 'guard' ? 'condición' : 'nombre del fragmento'}
                      // The text it opens with is selected, so typing replaces a default like «condición».
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setInlineFragmentEditor({ ...inlineFragmentEditor, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (shouldIgnoreEditorShortcut(e, document)) return;
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineFragmentEdit();
                          window.requestAnimationFrame(() => svgRef.current?.focus());
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setInlineFragmentEditor(null);
                          window.requestAnimationFrame(() => svgRef.current?.focus());
                        }
                      }}
                      onBlur={() => commitInlineFragmentEdit()}
                    />
                  </div>
                ) : null}
                {selectedParticipant && !isParticipantDragging && selectionState.elements.length === 1 ? (() => {
                  const box = layout.participantLayouts.get(selectedParticipant.id);
                  if (!box) return null;
                  const ordered = [...content.participants].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
                  const index = ordered.findIndex((participant) => participant.id === selectedParticipant.id);
                  return (
                    <div
                      className="sequence-note-toolbar sequence-participant-toolbar"
                      role="group"
                      aria-label="Acciones del participante"
                      data-export-control="true"
                      style={{ left: Math.max(0, (layout.participantX.get(selectedParticipant.id) ?? selectedParticipant.x) - box.headerWidth / 2), top: Math.max(0, box.headerY - 36) }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button type="button" title="Mover a la izquierda (Alt+←)" aria-label="Mover participante a la izquierda" disabled={index === 0} onClick={() => moveParticipantHorizontal(selectedParticipant.id, -1)}>
                        <ArrowLeft size={14} />
                      </button>
                      <button type="button" title="Mover a la derecha (Alt+→)" aria-label="Mover participante a la derecha" disabled={index === ordered.length - 1} onClick={() => moveParticipantHorizontal(selectedParticipant.id, 1)}>
                        <ArrowRight size={14} />
                      </button>
                      {participantTypeSelector}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={selectedParticipant.destroyedByMessageId !== undefined || (selectedParticipant.terminateLifeline ?? (selectedParticipant.createdByMessageId !== undefined))}
                        aria-pressed={selectedParticipant.destroyedByMessageId !== undefined || (selectedParticipant.terminateLifeline ?? (selectedParticipant.createdByMessageId !== undefined))}
                        disabled={selectedParticipant.destroyedByMessageId !== undefined}
                        title={selectedParticipant.destroyedByMessageId !== undefined ? 'Finaliza automáticamente por el mensaje de destrucción asociado' : 'Terminar línea de vida con X'}
                        onClick={() => updateParticipant(selectedParticipant.id, { terminateLifeline: !(selectedParticipant.terminateLifeline ?? (selectedParticipant.createdByMessageId !== undefined)) })}
                      >Terminar con X</button>
                      <button type="button" title="Eliminar participante" aria-label="Eliminar participante" onClick={deleteSelection}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })() : null}
                {selectedNote && !inlineNoteEditor && selectionState.elements.length === 1 ? (() => {
                  const box = layout.noteLayouts.get(selectedNote.id);
                  if (!box) return null;
                  return (
                    <div
                      className="sequence-note-toolbar"
                      role="group"
                      aria-label="Acciones de la nota"
                      data-export-control="true"
                      style={{ left: box.x, top: Math.max(0, box.y - 40) }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {(Object.keys(SEQUENCE_NOTE_COLORS) as Array<NonNullable<SequenceNote['color']>>).map((color) => (
                        <button
                          key={color}
                          type="button"
                          title={SEQUENCE_NOTE_COLORS[color].label}
                          aria-label={SEQUENCE_NOTE_COLORS[color].label}
                          aria-pressed={(selectedNote.color ?? 'yellow') === color}
                          onClick={() => updateNote(selectedNote.id, { color })}
                        >
                          <span className="sequence-note-toolbar-dot" style={{ background: resolveSequenceNoteScheme(theme, color).dot }} />
                        </button>
                      ))}
                      {selectedNote.anchorKind !== 'free' ? (
                        <button type="button" title="Desanclar" aria-label="Desanclar" onClick={() => updateNote(selectedNote.id, { anchorKind: 'free', anchorId: undefined })}>
                          <Unlink size={14} /><span>Desanclar</span>
                        </button>
                      ) : null}
                      <button type="button" title="Eliminar nota" aria-label="Eliminar nota" onClick={deleteSelection}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })() : null}
                {inlineNoteEditor ? (() => {
                  const targetNote = inlineNoteEditor.draft ?? content.notes.find((n) => n.id === inlineNoteEditor.noteId);
                  const scheme = resolveSequenceNoteScheme(theme, targetNote?.color);
                  return (
                    <div
                      className="sequence-inline-note-container"
                      data-export-control="true"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        position: 'absolute',
                        left: inlineNoteEditor.x,
                        top: inlineNoteEditor.y,
                        width: inlineNoteEditor.width,
                        height: inlineNoteEditor.height,
                        zIndex: 100,
                      }}
                    >
                      <textarea
                        autoFocus
                        className="sequence-inline-note-textarea"
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: 0,
                          background: scheme.background,
                          color: scheme.text,
                          border: `1px solid ${theme.association.strokeSelected}`,
                          borderRadius: '4px',
                          boxShadow: 'var(--shadow-popover)',
                          outline: 'none',
                          resize: 'none',
                          padding: `${SEQUENCE_NOTE_PADDING_TOP}px ${SEQUENCE_NOTE_PADDING_X}px`,
                          fontSize: `${SEQUENCE_NOTE_FONT_SIZE}px`,
                          lineHeight: `${SEQUENCE_NOTE_LINE_HEIGHT}px`,
                          fontFamily: SEQUENCE_NOTE_FONT_FAMILY,
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          overflowWrap: 'break-word',
                        }}
                        value={inlineNoteEditor.value}
                        aria-label="Texto de la nota"
                        placeholder="Escribí la nota…"
                        onChange={(e) => {
                          const val = e.target.value;
                          const minH = getSequenceNoteMinimumHeight({ text: val, width: inlineNoteEditor.width });
                          setInlineNoteEditor({
                            ...inlineNoteEditor,
                            value: val,
                            height: Math.max(targetNote?.height ?? 0, minH),
                          });
                          if (targetNote && !inlineNoteEditor.draft) {
                            setNotePreview({ [targetNote.id]: { text: val } });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (shouldIgnoreEditorShortcut(e, document)) return;
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setNotePreview({});
                            setInlineNoteEditor(null);
                          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            commitInlineNoteEdit();
                          }
                        }}
                        onBlur={() => commitInlineNoteEdit()}
                      />
                      <div className="sequence-inline-note-hint">
                        {shortcutLabel('⌘Enter o clic afuera guarda · Esc cancela')}
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>
          </div>
        </section>
        {isReviewPanelOpen ? (
          <DiagramReviewPanel
            helper="Comprueba mensajes sin nombre, fragmentos incompletos y el ciclo de vida de los participantes. No reemplaza la revisión del diagrama."
            isEmpty={content.participants.length === 0 && content.items.length === 0}
            issues={reviewIssues}
            title="Revisión del diagrama"
            onClose={closeReviewPanel}
            onFocus={focusReviewIssue}
          />
        ) : null}
        <InspectorPanel
          actions={<InspectorDeleteButton label={inspectorHeader?.deleteLabel ?? 'Eliminar'} onClick={deleteSelection} />}
          bodyClassName="sequence-inspector-content"
          bodyId="sequence-inspector-content"
          className="sequence-inspector-panel"
          collapsed={inspectorCollapsed}
          edge={(
            <div
              aria-hidden="true"
              className="sequence-inspector-resizer"
              onPointerDown={startInspectorResize}
              title="Arrastrar para cambiar el ancho del panel"
            />
          )}
          hidden={inspectorIdle}
          kind={inspectorHeader?.kind ?? ''}
          title={inspectorHeader?.title ?? ''}
          tone={inspectorHeader?.tone}
          onToggleCollapsed={() => setInspectorCollapsed((current) => {
            inspectorCollapsedMemory = !current;
            return !current;
          })}
        >
          {selectedInspector}
        </InspectorPanel>
      </section>
      <div id="sequence-structured-description" className="sequence-structured-description" role="region" aria-label="Descripción estructurada del diagrama">
        <p>Diagrama de secuencia con {content.participants.length} participante{content.participants.length === 1 ? '' : 's'}, {messageCount} mensaje{messageCount === 1 ? '' : 's'} y {content.notes.length} nota{content.notes.length === 1 ? '' : 's'}.</p>
        <ul>
          {content.participants.map((participant) => <li key={`structured-participant:${participant.id}`}>Participante: {formatSequenceParticipantName(participant)}</li>)}
          {flatEntries.map((entry) => <li key={`structured-item:${entry.item.id}`} aria-level={entry.depth + 1}>{getSequenceStructuredItemLabel(entry.item, participantNames)}</li>)}
          {content.notes.map((note) => <li key={`structured-note:${note.id}`}>Nota: {note.text}</li>)}
        </ul>
      </div>
      <SequenceExportDialog
        open={exportDialogOpen}
        content={displayContent}
        layout={layout}
        getSvg={getExportSvg}
        options={exportOptions}
        onOptionsChange={setExportOptions}
        onClose={() => setExportDialogOpen(false)}
        onExportPng={() => { void exportPng(); }}
        onExportPdf={() => { void exportPdf(); }}
      />
      {exportDialogOpen ? (
        <div className="sequence-export-source" aria-hidden="true">
          <SequenceDiagramCanvas
            svgRef={(element) => { exportSvgRef.current = element; }}
            content={displayContent}
            layout={layout}
            selected={null}
            interactive={false}
            theme={getExportTheme(theme.palette)}
            classNodesById={classNodesById}
            participantColorsEnabled={content.participantColors !== 'disabled'}
            onSelect={() => undefined}
            onParticipantPointerDown={() => undefined}
            onNotePointerDown={() => undefined}
            onNoteResizePointerDown={() => undefined}
            onFragmentPointerDown={() => undefined}
            onFragmentResizePointerDown={() => undefined}
          />
        </div>
      ) : null}
    </main>
  );
}
