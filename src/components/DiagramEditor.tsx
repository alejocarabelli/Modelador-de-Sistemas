import { ClassGroupColorPicker } from './ClassGroupColorPicker';
import type { ClassGroupColor } from '../constants/classGroupColors';
import { CanvasControls } from './CanvasControls';
import { EditorToolbar, MenuItem, MenuLabel, MenuSeparator, NotebookButton, ReviewButton, ToolButton, ToolMenu } from './ui/Toolbar';
import { isNotebookEvent } from '../utils/notebookKeyboard';
import { CanvasStartCard } from './CanvasStartCard';
import { ClassAlignmentGuides } from './ClassAlignmentGuides';
import { DiagramSelectionTools } from './DiagramSelectionTools';
import { DiagramReviewPanel } from './DiagramReviewPanel';
import { arrangeClasses, duplicateClasses, moveClass, type ClassArrangement, type ClassSize } from '../utils/classDiagramOperations';
import { reviewClassDiagram, type DiagramIssue } from '../utils/classDiagramReview';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Node,
  type ReactFlowInstance,
  type XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Download,
  Eye,
  EyeOff,
  FileText,
  ImageDown,
  Link2,
  Plus,
} from 'lucide-react';
import type {
  AssociationEdgeData,
  AssociationRelationType,
  ClassAttribute,
  ClassDiagramArtifact,
  ClassDiagramEdge,
  ClassDiagramNode,
  ClassMethod,
  DiagramContent,
  DiagramProject,
  ParametricValue,
  ParametricValuesNoteConnectionMode,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';
import { createId } from '../utils/id';
import { reorderItemsByIds } from '../utils/reorder';
import { useDiagramImageExport } from '../hooks/useDiagramImageExport';
import { useGentleWheelZoom } from '../hooks/useGentleWheelZoom';
import { getDiagramImageExportBounds } from '../utils/diagramImageExport';
import { CANVAS_GRID_KEY, MULTI_SELECT_HINT_KEY, readCanvasGridEnabled, readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { shortcutLabel } from '../utils/shortcutLabel';
import {
  readAssociationLineStyle,
  readAssociationRelationType,
  writeAssociationLineStyle,
  writeAssociationRelationType,
} from '../storage/associationPreferences';
import { ASSOCIATION_RELATION_TYPES, getAssociationMarker, handleForSide, normalizeAssociationData, normalizeAssociationEdge } from '../utils/association';
import {
  oppositeConnectionSide,
  resolveAutomaticNoteHandles,
  distributeAssociationEnds,
} from '../utils/associationRouting';
import { normalizeClassNode, normalizeDiagramContent } from '../utils/diagramNormalization';
import { AssociationEdge } from './AssociationEdge';
import { AssociationConnectionPreview } from './AssociationConnectionPreview';
import { AssociationInspector } from './AssociationInspector';
import { ASSOCIATION_RELATION_LABELS } from '../constants/associationLabels';
import { InspectorDeleteButton, InspectorPanel } from './ui/Panel';
import { ClassInspector } from './ClassInspector';
import { ClassNode } from './ClassNode';
import { ParametricValuesNote } from './ParametricValuesNote';
import { useArtifactViewport } from '../hooks/useArtifactViewMemory';
import { ToolbarHistory } from './ToolbarHistory';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import { DEFAULT_CLASS_SIZE, findFreeClassPosition } from '../utils/classPlacement';
import { ClassKeyboardOverlay } from './ClassKeyboardOverlay';
import { useClassKeyboardMode, type ClassKeyboardImport } from '../hooks/useClassKeyboardMode';

type DiagramEditorProps = {
  artifact: ClassDiagramArtifact;
  saveStatus?: DiagramSaveStatus;
  canRedo: boolean;
  canUndo: boolean;
  project: DiagramProject;
  toolbarContext?: ReactNode;
  /** A message raised by the wrapping editor (e.g. an import summary), shown like the editor's own. */
  externalFeedback?: string | null;
  /** Each new value frames these classes (e.g. the ones an import just added), selected. */
  revealRequest?: { key: number; nodeIds: string[] } | null;
  /** Replaces the default card shown on an empty canvas, for editors that explain their own empty state. */
  emptyState?: ReactNode;
  /** What T brings in keyboard mode; only Clases de secuencias offers it. */
  keyboardImport?: ClassKeyboardImport;
  theme: DiagramTheme;
  onChangeContent: (content: DiagramContent, options?: ContentChangeOptions) => void;
  onRedo: () => void;
  onUndo: () => void;
};

type ContentChangeOptions = {
  separateHistoryEntry?: boolean;
};

type ContextMenuState = {
  nodeId?: string;
  screenPosition: XYPosition;
  flowPosition: XYPosition;
};

const nodeTypes = {
  classNode: ClassNode,
  parametricValuesNote: ParametricValuesNote,
};

const edgeTypes = {
  association: AssociationEdge,
};

const INSPECTOR_COLLAPSED_KEY = 'class-diagram-inspector-collapsed';
const SNAP_ENABLED_KEY = 'class-diagram-snap-enabled';
const MINIMAP_ENABLED_KEY = 'class-diagram-minimap-enabled';
const NOTE_NODE_OFFSET = { x: 24, y: 116 };
const NOTE_EDGE_SUFFIX = '__values-edge';
const NOTE_NODE_SUFFIX = '__values-note';

const getDefaultNotePosition = (node: ClassDiagramNode): XYPosition => ({
  x: node.position.x + NOTE_NODE_OFFSET.x,
  y: node.position.y + NOTE_NODE_OFFSET.y,
});

const getClassNodeIdFromNoteId = (nodeId: string): string | null =>
  nodeId.endsWith(NOTE_NODE_SUFFIX) ? nodeId.slice(0, -NOTE_NODE_SUFFIX.length) : null;

const getChangedNodeId = (change: NodeChange): string | null =>
  'id' in change && typeof change.id === 'string' ? change.id : null;

/** Mayús, ⌘ o Ctrl: el clic suma o quita elementos de la selección en vez de reemplazarla. */
const isAdditiveSelectionEvent = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean =>
  event.shiftKey || event.metaKey || event.ctrlKey;

/** Pista de la selección múltiple, escrita al estilo Mac; shortcutLabel la adapta a Windows. */
export const MULTI_SELECT_HINT = 'Consejo: con Mayús+clic o ⌘ clic sumás elementos a la selección.';

/** Inspector de dos o más elementos seleccionados: solo se mueven y se eliminan en conjunto. */
export function MultiSelectionInspector({
  bodyId,
  collapsed,
  count,
  onDelete,
  onToggleCollapsed,
}: {
  bodyId?: string;
  collapsed: boolean;
  count: number;
  onDelete: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <InspectorPanel
      actions={<InspectorDeleteButton label={`Eliminar ${count} elementos`} onClick={onDelete} />}
      bodyId={bodyId}
      className="inspector"
      collapsed={collapsed}
      kind="Selección"
      title={`${count} elementos seleccionados`}
      tone="neutral"
      onToggleCollapsed={onToggleCollapsed}
    >
      <p className="helper-text">Arrastrá cualquiera para moverlos juntos.</p>
    </InspectorPanel>
  );
}

const isEditableElement = (element: Element | null): boolean => {
  if (element === null) {
    return false;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element.closest('[contenteditable="true"], input, select, textarea, button') !== null
  );
};

export function DiagramEditor({
  artifact,
  saveStatus = 'saved',
  canRedo,
  canUndo,
  project,
  toolbarContext,
  externalFeedback = null,
  revealRequest = null,
  emptyState,
  keyboardImport,
  theme,
  onChangeContent,
  onRedo,
  onUndo,
}: DiagramEditorProps) {
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const setSelectedNodeId = useCallback((id: string | null) => setSelectedNodeIds(id === null ? [] : [id]), []);
  const [nodeSizes, setNodeSizes] = useState<Record<string, ClassSize>>({});
  const [movingNodeIds, setMovingNodeIds] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [hideAttributes, setHideAttributes] = useState(() => readUiPreference('class-diagram-hide-attributes') === 'true');
  const [hideGroupColors, setHideGroupColors] = useState(() => readUiPreference('class-diagram-hide-group-colors') === 'true');
  const [hideMethods, setHideMethods] = useState(() => readUiPreference('class-diagram-hide-methods') === 'true');
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const setSelectedEdgeId = useCallback((id: string | null) => setSelectedEdgeIds(id === null ? [] : [id]), []);
  const [associationLineStyle, setAssociationLineStyle] = useState(readAssociationLineStyle);
  const [defaultRelationType, setDefaultRelationType] = useState(readAssociationRelationType);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(
    () => readUiPreference(INSPECTOR_COLLAPSED_KEY) === 'true',
  );
  const [isGridEnabled, setIsGridEnabled] = useState(readCanvasGridEnabled);
  const [isSnapEnabled, setIsSnapEnabled] = useState(() => readUiPreference(SNAP_ENABLED_KEY) === 'true');
  const [isMiniMapEnabled, setIsMiniMapEnabled] = useState(
    () => readUiPreference(MINIMAP_ENABLED_KEY) !== 'false',
  );
  const [nameEditingNodeId, setNameEditingNodeId] = useState<string | null>(null);
  const [attributeEditingRequest, setAttributeEditingRequest] = useState<{ nodeId: string; attributeId: string } | null>(null);
  const [valueEditingRequest, setValueEditingRequest] = useState<{ nodeId: string; valueId: string } | null>(null);
  const [methodEditingRequest, setMethodEditingRequest] = useState<{ nodeId: string; methodId: string } | null>(null);
  const [selectedNoteNodeId, setSelectedNoteNodeId] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const { defaultViewport, onMoveEnd } = useArtifactViewport(project.id, artifact.id, reactFlowInstance);
  const [openedWithContent] = useState(() => (artifact.content.nodes?.length ?? 0) > 0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [connectionSourceNodeId, setConnectionSourceNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const editorRootRef = useRef<HTMLElement | null>(null);
  useGentleWheelZoom(canvasRef, reactFlowInstance);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  // Si el último clic o tecla traía Mayús, ⌘ o Ctrl. React Flow decide antes que el editor, así que se guarda aquí.
  const additiveSelectionRef = useRef(false);
  const rememberSelectionModifiers = (event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): void => {
    additiveSelectionRef.current = isAdditiveSelectionEvent(event);
  };
  const normalizedContent = useMemo(() => normalizeDiagramContent(artifact.content), [artifact.content]);
  const { nodes, edges } = normalizedContent;
  const activeSelectedIds = selectedNodeIds.filter(id => nodes.some(node => node.id === id));
  const activeSelectedEdgeIds = selectedEdgeIds.filter(id => edges.some(edge => edge.id === id));
  // Una sola relación elegida, y ninguna clase: el inspector muestra esa relación.
  const selectedEdgeId = activeSelectedIds.length === 0 && activeSelectedEdgeIds.length === 1 ? activeSelectedEdgeIds[0] : null;
  const selectedNodeId = activeSelectedIds.length === 1 && activeSelectedEdgeIds.length === 0 ? activeSelectedIds[0] : null;
  const selectionCount = activeSelectedIds.length + activeSelectedEdgeIds.length;
  const isMultiSelection = selectionCount > 1;
  const selectionColors = new Set(nodes.filter(node => activeSelectedIds.includes(node.id)).map(node => node.data.groupColor));
  const selectionColor = selectionColors.size > 1 ? 'mixed' : [...selectionColors][0];
  const reviewIssues = useMemo(() => reviewClassDiagram(normalizedContent), [normalizedContent]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const normalizedEdges = useMemo(
    () => edges.map((edge) => normalizeAssociationEdge(edge)),
    [edges],
  );

  const selectedEdge = useMemo(
    () => normalizedEdges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [normalizedEdges, selectedEdgeId],
  );
  const hasInspectorSelection = selectionCount > 0;
  const relationTitle = (edge: ClassDiagramEdge): string => {
    const nameOf = (nodeId: string): string => nodes.find((node) => node.id === nodeId)?.data.name.trim() || 'Clase sin nombre';
    return `${nameOf(edge.source)} — ${nameOf(edge.target)}`;
  };

  const updateNodes = useCallback(
    (nextNodes: ClassDiagramNode[], options?: ContentChangeOptions): void => {
      onChangeContent({ nodes: nextNodes.map(normalizeClassNode), edges }, options);
    },
    [edges, onChangeContent],
  );

  const updateEdges = useCallback(
    (nextEdges: ClassDiagramEdge[], options?: ContentChangeOptions): void => {
      onChangeContent({ nodes, edges: nextEdges.map(normalizeAssociationEdge) }, options);
    },
    [nodes, onChangeContent],
  );

  const deleteSelectedElement = useCallback((): void => {
    if (selectedNoteNodeId !== null) {
      onChangeContent(
        {
          nodes: nodes.map((node) =>
            node.id === selectedNoteNodeId
              ? normalizeClassNode({
                  ...node,
                  data: {
                    ...node.data,
                    hasParametricValuesNote: false,
                    parametricValuesNotePosition: undefined,
                    parametricValues: [],
                  },
                })
              : normalizeClassNode(node),
          ),
          edges: normalizedEdges.map(normalizeAssociationEdge),
        },
        { separateHistoryEntry: true },
      );
      setSelectedNoteNodeId(null);
      setSelectedNodeId(null);
      setContextMenu(null);
      return;
    }

    // Clases y relaciones de la selección se borran en un solo paso (un Deshacer las trae de vuelta).
    const deletingNodeIds = new Set(selectedNodeIds);
    const deletingEdgeIds = new Set(selectedEdgeIds);
    if (!nodes.some(node => deletingNodeIds.has(node.id)) && !normalizedEdges.some(edge => deletingEdgeIds.has(edge.id))) return;
    onChangeContent({
      nodes: nodes.filter(node => !deletingNodeIds.has(node.id)).map(normalizeClassNode),
      edges: normalizedEdges
        .filter(edge => !deletingEdgeIds.has(edge.id) && !deletingNodeIds.has(edge.source) && !deletingNodeIds.has(edge.target))
        .map(normalizeAssociationEdge),
    }, { separateHistoryEntry: true });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [nodes, normalizedEdges, onChangeContent, selectedEdgeIds, selectedNodeIds, selectedNoteNodeId, setSelectedEdgeId, setSelectedNodeId]);

  const showFeedback = useCallback((message: string): void => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    setFeedbackMessage(message);
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimeoutRef.current = null;
    }, 1800);
  }, []);

  // Una sola vez por instalación: la primera selección con clic simple enseña Mayús+clic.
  const showMultiSelectHintOnce = (): void => {
    if (readUiPreference(MULTI_SELECT_HINT_KEY) === 'true') return;
    showFeedback(shortcutLabel(MULTI_SELECT_HINT));
    writeUiPreference(MULTI_SELECT_HINT_KEY, 'true');
  };

  const handleNodesChange = useCallback(
    (changes: NodeChange[]): void => {
      const selections = changes.filter(change => change.type === 'select');
      if (selections.length > 0) {
        if (selections.some(change => change.type === 'select' && change.selected)) {
          // Una selección con Mayús, ⌘ o Ctrl suma clases; sin ellas reemplaza también a las relaciones.
          if (!additiveSelectionRef.current) setSelectedEdgeId(null);
          setSelectedNoteNodeId(null);
        }
        setSelectedNodeIds(current => {
          const next = new Set(current.filter(id => nodes.some(node => node.id === id)));
          for (const change of selections) if (change.type === 'select' && getClassNodeIdFromNoteId(change.id) === null) {
            if (change.selected) next.add(change.id); else next.delete(change.id);
          }
          return next.size === current.length && current.every(id => next.has(id)) ? current : [...next];
        });
      }
      const dimensions = changes.filter(change => change.type === 'dimensions');
      if (dimensions.length > 0) setNodeSizes(current => {
        const next = { ...current };
        let changed = false;
        for (const change of dimensions) if (change.type === 'dimensions' && change.dimensions) {
          if (current[change.id]?.width !== change.dimensions.width || current[change.id]?.height !== change.dimensions.height) {
            next[change.id] = change.dimensions;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      const classChanges = changes.filter((change) => {
        const changedNodeId = getChangedNodeId(change);
        return (
          change.type !== 'select' &&
          change.type !== 'dimensions' &&
          (changedNodeId === null || getClassNodeIdFromNoteId(changedNodeId) === null)
        );
      });
      const notePositionChanges = changes.filter(
        (change) => {
          const changedNodeId = getChangedNodeId(change);
          return (
            changedNodeId !== null &&
            getClassNodeIdFromNoteId(changedNodeId) !== null &&
            'position' in change &&
            change.position !== undefined
          );
        },
      );

      if (classChanges.length === 0 && notePositionChanges.length === 0) {
        return;
      }

      let nextNodes = (applyNodeChanges(classChanges, nodes) as ClassDiagramNode[]).map(node => {
        const previous = nodes.find(item => item.id === node.id);
        return previous && (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
          ? { ...node, data: moveClass(previous, node.position).data } : node;
      });

      if (notePositionChanges.length > 0) {
        nextNodes = nextNodes.map((node) => {
          const noteChange = notePositionChanges.find((change) => {
            const changedNodeId = getChangedNodeId(change);
            return changedNodeId !== null && getClassNodeIdFromNoteId(changedNodeId) === node.id;
          });

          if (noteChange === undefined || !('position' in noteChange) || noteChange.position === undefined) {
            return node;
          }

          return {
            ...node,
            data: {
              ...node.data,
              parametricValuesNotePosition: noteChange.position,
            },
          };
        });
      }

      updateNodes(nextNodes);
    },
    [nodes, updateNodes, setSelectedEdgeId],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]): void => {
      const durableChanges = changes.filter((change) => change.type !== 'select');

      if (durableChanges.length === 0) {
        return;
      }

      updateEdges(applyEdgeChanges(durableChanges, normalizedEdges) as ClassDiagramEdge[]);
    },
    [normalizedEdges, updateEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection): void => {
      const navigability = 'source-to-target';
      const edgeId = createId();
      const nextEdges = addEdge(
        {
          ...connection,
          id: edgeId,
          type: 'association',
          data: normalizeAssociationData({
            navigability,
            relationType: defaultRelationType,
            lineStyle: associationLineStyle,
            sourceSide: 'automatic',
            targetSide: 'automatic',
          }),
          markerStart: getAssociationMarker(navigability, 'source', defaultRelationType),
          markerEnd: getAssociationMarker(navigability, 'target', defaultRelationType),
        },
        normalizedEdges,
      ) as ClassDiagramEdge[];
      if (nextEdges.some(edge => edge.id === edgeId)) {
        updateEdges(nextEdges, { separateHistoryEntry: true });
        setContextMenu(null);
        setSelectedEdgeId(edgeId);
        setSelectedNodeId(null);
        setSelectedNoteNodeId(null);
      }
      setConnectionSourceNodeId(null);
    },
    [associationLineStyle, defaultRelationType, normalizedEdges, updateEdges, setSelectedEdgeId, setSelectedNodeId],
  );

  const chooseDefaultRelationType = useCallback((relationType: AssociationRelationType): void => {
    setDefaultRelationType(relationType);
    writeAssociationRelationType(relationType);
  }, []);

  // Without an explicit point (toolbar, empty-state card), the class lands in
  // the free slot nearest the middle of what the person is looking at.
  const nextClassPosition = (): XYPosition => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center = reactFlowInstance !== null && bounds !== undefined
      ? reactFlowInstance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 240, y: 195 };
    const preferred = {
      x: Math.round(center.x - DEFAULT_CLASS_SIZE.width / 2),
      y: Math.round(center.y - DEFAULT_CLASS_SIZE.height / 2),
    };
    return findFreeClassPosition(reactFlowInstance?.getNodes() ?? nodes, preferred);
  };

  const addClassNode = (position?: XYPosition): void => {
    const newNode: ClassDiagramNode = {
      id: createId(),
      type: 'classNode',
      position: position ?? nextClassPosition(),
      data: {
        name: '',
        attributes: [],
        methods: [],
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    };

    updateNodes([...nodes, newNode], { separateHistoryEntry: true });
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setNameEditingNodeId(newNode.id);
    window.setTimeout(() => {
      const nodeElement = Array.from(
        canvasRef.current?.querySelectorAll<HTMLElement>('.react-flow__node-classNode') ?? [],
      ).find((element) => element.dataset.id === newNode.id);
      const input = nodeElement?.querySelector<HTMLInputElement>('input[aria-label="Nombre de la clase"]');
      input?.focus();
      input?.select();
    }, 50);
  };

  const selectKeyboardClass = useCallback((nodeId: string | null): void => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
  }, [setSelectedEdgeId, setSelectedNodeId]);

  const classKeyboard = useClassKeyboardMode({
    nodes,
    edges: normalizedEdges,
    nodeSizes,
    reactFlowInstance,
    canvasRef,
    editorRootRef,
    selectedNodeId,
    relationType: defaultRelationType,
    lineStyle: associationLineStyle,
    keyboardImport,
    onChangeContent,
    selectClass: selectKeyboardClass,
    chooseRelationType: chooseDefaultRelationType,
    showFeedback,
    defaultClassPosition: nextClassPosition,
  });
  const keyboardTargetId = classKeyboard.targetId;

  const renameClassById = useCallback((nodeId: string, name: string): void => {
    updateNodes(nodes.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, name } } : node)));
  }, [nodes, updateNodes]);

  const renameClassAndCreateAttributeByNodeId = useCallback(
    (nodeId: string, name: string, attribute: ClassAttribute): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  name,
                  attributes: [...node.data.attributes, attribute],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const renameClass = (name: string): void => {
    if (selectedNode !== null) {
      renameClassById(selectedNode.id, name);
    }
  };

  const updateClassDescription = (description: string): void => {
    if (selectedNode === null) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, data: { ...node.data, description } } : node,
      ),
    );
  };

  const addAttribute = (): void => {
    if (selectedNode === null) {
      return;
    }

    const attribute: ClassAttribute = {
      id: createId(),
      name: '',
      type: '',
    };

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, attributes: [...node.data.attributes, attribute] } }
          : node,
      ),
    );
    setAttributeEditingRequest({ nodeId: selectedNode.id, attributeId: attribute.id });
  };

  const updateAttributeByNodeId = useCallback(
    (nodeId: string, attributeId: string, field: 'name' | 'type', value: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.map((attribute) =>
                    attribute.id === attributeId ? { ...attribute, [field]: value } : attribute,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const createAttributeByNodeId = useCallback(
    (nodeId: string, attribute: ClassAttribute): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, attributes: [...node.data.attributes, attribute] } }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteAttributeByNodeId = useCallback(
    (nodeId: string, attributeId: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttributeFieldsByNodeId = useCallback(
    (nodeId: string, attributeId: string, values: Pick<ClassAttribute, 'name' | 'type'>): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.map((attribute) =>
                    attribute.id === attributeId ? { ...attribute, ...values } : attribute,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttributeFieldsAndCreateAttributeByNodeId = useCallback(
    (
      nodeId: string,
      attributeId: string,
      values: Pick<ClassAttribute, 'name' | 'type'>,
      nextAttribute: ClassAttribute,
    ): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: [
                    ...node.data.attributes.map((attribute) =>
                      attribute.id === attributeId ? { ...attribute, ...values } : attribute,
                    ),
                    nextAttribute,
                  ],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateAttribute = (
    attributeId: string,
    field: 'name' | 'type',
    value: string,
  ): void => {
    if (selectedNode !== null) {
      updateAttributeByNodeId(selectedNode.id, attributeId, field, value);
    }
  };

  const setAttributeStatic = (attributeId: string, isStatic: boolean): void => {
    if (selectedNode === null) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                attributes: node.data.attributes.map((attribute) =>
                  attribute.id === attributeId ? { ...attribute, isStatic } : attribute,
                ),
              },
            }
          : node,
      ),
    );
  };

  const deleteAttribute = (attributeId: string): void => {
    if (selectedNode === null) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
              },
            }
          : node,
      ),
    );
  };

  const reorderAttributes = (attributeIds: string[]): void => {
    if (selectedNode === null) {
      return;
    }

    const reorderedAttributes = reorderItemsByIds(selectedNode.data.attributes, attributeIds);

    if (reorderedAttributes === selectedNode.data.attributes) {
      return;
    }

    updateNodes(
      nodes.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, attributes: reorderedAttributes } }
          : node,
      ),
      { separateHistoryEntry: true },
    );
  };

  const createMethodByNodeId = useCallback(
    (nodeId: string, method: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, methods: [...node.data.methods, method] } } : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteMethodByNodeId = useCallback(
    (nodeId: string, methodId: string): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: node.data.methods.filter((method) => method.id !== methodId),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const deleteAttributeAndCreateMethodByNodeId = useCallback(
    (nodeId: string, attributeId: string, method: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  attributes: node.data.attributes.filter((attribute) => attribute.id !== attributeId),
                  methods: [...node.data.methods, method],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateMethodFieldsByNodeId = useCallback(
    (nodeId: string, methodId: string, values: Omit<ClassMethod, 'id'>): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: node.data.methods.map((method) =>
                    method.id === methodId ? { ...method, ...values } : method,
                  ),
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateMethodFieldsAndCreateMethodByNodeId = useCallback(
    (nodeId: string, methodId: string, values: Omit<ClassMethod, 'id'>, nextMethod: ClassMethod): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  methods: [
                    ...node.data.methods.map((method) => (method.id === methodId ? { ...method, ...values } : method)),
                    nextMethod,
                  ],
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const addMethod = (): void => {
    if (selectedNode === null) {
      return;
    }

    addMethodAndStartEditing(selectedNode.id);
  };

  const addMethodAndStartEditing = (nodeId: string): void => {
    const method: ClassMethod = {
      id: createId(),
      visibility: '',
      name: '',
      parameters: '',
      returnType: '',
    };

    createMethodByNodeId(nodeId, method);
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setMethodEditingRequest({ nodeId, methodId: method.id });
  };

  const updateMethod = (methodId: string, values: Omit<ClassMethod, 'id'>): void => {
    if (selectedNode !== null) {
      updateMethodFieldsByNodeId(selectedNode.id, methodId, values);
    }
  };

  const deleteMethod = (methodId: string): void => {
    if (selectedNode !== null) {
      deleteMethodByNodeId(selectedNode.id, methodId);
    }
  };

  const setParametricValuesNoteByNodeId = useCallback(
    (nodeId: string, enabled: boolean): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  hasParametricValuesNote: enabled,
                  parametricValuesNoteConnectionMode: enabled
                    ? node.data.parametricValuesNoteConnectionMode ?? 'automatic'
                    : node.data.parametricValuesNoteConnectionMode,
                  parametricValuesNotePosition: enabled
                    ? node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)
                    : undefined,
                  parametricValues: enabled ? node.data.parametricValues ?? [] : [],
                },
              }
            : node,
        ),
        { separateHistoryEntry: true },
      );
    },
    [nodes, updateNodes],
  );

  const addParametricValuesNoteAndStartEditing = (nodeId: string): void => {
    const firstValue = { id: createId(), value: '' };

    updateNodes(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                hasParametricValuesNote: true,
                parametricValuesNoteConnectionMode: 'automatic',
                parametricValuesNoteHandle: node.data.parametricValuesNoteHandle ?? 'bottom',
                parametricValuesNoteTargetHandle: node.data.parametricValuesNoteTargetHandle ?? 'top',
                parametricValuesNotePosition: node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node),
                parametricValues: [
                  ...(node.data.parametricValues ?? []).filter((value) => value.value.trim().length > 0),
                  firstValue,
                ],
              },
            }
          : node,
      ),
    );
    setValueEditingRequest({ nodeId, valueId: firstValue.id });
  };

  const updateParametricValuesByNodeId = useCallback(
    (nodeId: string, values: ParametricValue[]): void => {
      updateNodes(
        nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  hasParametricValuesNote: true,
                  parametricValues: values,
                },
              }
            : node,
        ),
      );
    },
    [nodes, updateNodes],
  );

  const updateParametricValuesNoteConnection = (
    nodeId: string,
    values: {
      mode?: ParametricValuesNoteConnectionMode;
      handle?: ParametricValuesNoteHandle;
      changedEnd?: 'class' | 'note';
    },
  ): void => {
    updateNodes(
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                parametricValuesNoteConnectionMode:
                  values.mode ?? node.data.parametricValuesNoteConnectionMode ?? 'automatic',
                ...(values.handle !== undefined && values.changedEnd === 'class'
                  ? {
                      parametricValuesNoteHandle: values.handle,
                      parametricValuesNoteTargetHandle: oppositeConnectionSide(values.handle),
                    }
                  : {}),
                ...(values.handle !== undefined && values.changedEnd === 'note'
                  ? {
                      parametricValuesNoteHandle: oppositeConnectionSide(values.handle),
                      parametricValuesNoteTargetHandle: values.handle,
                    }
                  : {}),
              },
            }
          : node,
      ),
      { separateHistoryEntry: true },
    );
  };

  const duplicateSelection = (ids = activeSelectedIds): void => {
    const result = duplicateClasses(normalizedContent, ids);
    if (result.ids.length === 0) return;
    onChangeContent(result.content, { separateHistoryEntry: true });
    setSelectedNodeIds(result.ids);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setContextMenu(null);
    showFeedback(`${result.ids.length} clase(s) duplicada(s)`);
  };

  const duplicateClassNode = (id: string): void => duplicateSelection([id]);

  const arrangeSelection = (action: ClassArrangement): void => {
    const next = arrangeClasses(nodes, activeSelectedIds, action, new globalThis.Map(Object.entries(nodeSizes)));
    if (next !== nodes) updateNodes(next, { separateHistoryEntry: true });
  };

  useEffect(() => {
    if (revealRequest === null || reactFlowInstance === null) return undefined;
    // Wait a frame so the new classes are measured before framing them.
    const timer = window.setTimeout(() => {
      const targets = reactFlowInstance.getNodes().filter((node) => revealRequest.nodeIds.includes(node.id));
      if (targets.length === 0) return;
      setSelectedNodeIds(targets.map((node) => node.id));
      void reactFlowInstance.fitView({ nodes: targets, padding: 0.3, maxZoom: 1, duration: 300 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [reactFlowInstance, revealRequest]);

  const focusIssue = (issue: DiagramIssue): void => {
    const edge = normalizedEdges.find(item => item.id === issue.edgeId);
    const targets = nodes.filter(node => node.id === issue.nodeId || node.id === edge?.source || node.id === edge?.target);
    setSelectedNodeId(issue.nodeId ?? null);
    setSelectedEdgeId(issue.edgeId ?? null);
    setSelectedNoteNodeId(null);
    if (targets.length) void reactFlowInstance?.fitView({ nodes: targets, padding: 0.5, maxZoom: 1.2, duration: 250 });
  };

  const setSelectionColor = (groupColor: ClassGroupColor | undefined): void => {
    const selected = new Set(activeSelectedIds);
    const changed = nodes.some(node => selected.has(node.id) && node.data.groupColor !== groupColor);
    if (changed) updateNodes(nodes.map(node => selected.has(node.id) ? {
      ...node, data: { ...node.data, groupColor },
    } : node), { separateHistoryEntry: true });
    if (groupColor !== undefined) setHideGroupColors(false);
    setContextMenu(null);
  };

  const toggleClassDetail = (field: 'hideAttributes' | 'hideMethods'): void => {
    const selected = new Set(activeSelectedIds);
    const allHidden = nodes.filter(node => selected.has(node.id)).every(node => node.data[field]);
    updateNodes(nodes.map(node => selected.has(node.id) ? { ...node, data: { ...node.data, [field]: !allHidden } } : node), { separateHistoryEntry: true });
  };

  const updateAssociation = useCallback((edgeId: string, values: Partial<AssociationEdgeData>): void => {
    if (values.lineStyle !== undefined) {
      setAssociationLineStyle(values.lineStyle);
      writeAssociationLineStyle(values.lineStyle);
    }
    updateEdges(
      normalizedEdges.map((edge) => {
        if (edge.id !== edgeId) {
          return edge;
        }

        const data = normalizeAssociationData({ ...edge.data, ...values });

        return {
          ...edge,
          sourceHandle: handleForSide(data.sourceSide, edge.sourceHandle),
          targetHandle: handleForSide(data.targetSide, edge.targetHandle),
          data,
          markerStart: getAssociationMarker(data.navigability, 'source', data.relationType),
          markerEnd: getAssociationMarker(data.navigability, 'target', data.relationType),
        };
      }),
    );
  }, [normalizedEdges, updateEdges]);

  const updateAssociationMultiplicity = useCallback(
    (edgeId: string, end: 'source' | 'target', value: string): void => {
      updateAssociation(edgeId, end === 'source' ? { sourceMultiplicity: value } : { targetMultiplicity: value });
    },
    [updateAssociation],
  );

  const handleReconnect = useCallback(
    (renderedEdge: Edge, connection: Connection): void => {
      const storedEdge = normalizedEdges.find((edge) => edge.id === renderedEdge.id);

      if (storedEdge === undefined) {
        return;
      }

      const sourceChanged =
        storedEdge.source !== connection.source || storedEdge.sourceHandle !== connection.sourceHandle;
      const targetChanged =
        storedEdge.target !== connection.target || storedEdge.targetHandle !== connection.targetHandle;
      const reconnectableEdge: ClassDiagramEdge = {
        ...storedEdge,
        data: normalizeAssociationData({
          ...storedEdge.data,
          ...(sourceChanged ? { sourceSide: 'automatic' as const } : {}),
          ...(targetChanged ? { targetSide: 'automatic' as const } : {}),
        }),
      };
      const edgesWithReconnectableSource = normalizedEdges.map((edge) =>
        edge.id === storedEdge.id ? reconnectableEdge : edge,
      );
      const nextEdges = reconnectEdge(
        reconnectableEdge,
        connection,
        edgesWithReconnectableSource,
        { shouldReplaceId: false },
      ) as ClassDiagramEdge[];

      updateEdges(nextEdges, { separateHistoryEntry: true });
      setSelectedEdgeId(storedEdge.id);
      setSelectedNodeId(null);
      setSelectedNoteNodeId(null);
      showFeedback('Punto de conexión actualizado');
    },
    [normalizedEdges, showFeedback, updateEdges, setSelectedEdgeId, setSelectedNodeId],
  );

  const handleClassContextMenu = useCallback((nodeId: string, event: MouseEvent<HTMLElement>): void => {
    if (canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const bounds = canvasRef.current.getBoundingClientRect();

    setSelectedNodeIds(current => current.includes(nodeId) ? current : [nodeId]);
    setSelectedEdgeId(null);
    setSelectedNoteNodeId(null);
    setContextMenu({
      nodeId,
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 },
    });
  }, [reactFlowInstance, setSelectedEdgeId]);

  const renderedNodes = useMemo<Node[]>(
    () => {
      const knownClassNames = nodes.map((node) => node.data.name.trim()).filter((name) => name.length > 0);
      const classNodes = nodes.map((node) => {
        const measuredNode = nodeSizes[node.id];
        const measuredDimensions =
          typeof measuredNode?.width === 'number' && measuredNode.width > 0 &&
          typeof measuredNode?.height === 'number' && measuredNode.height > 0
            ? { width: measuredNode.width, height: measuredNode.height }
            : {};

        return {
          ...node,
          ...measuredDimensions,
          className: node.id === keyboardTargetId ? 'class-keyboard-target' : undefined,
          selected: selectedNodeIds.includes(node.id) && selectedNoteNodeId === null,
          data: {
            ...node.data,
            groupColor: hideGroupColors ? undefined : node.data.groupColor,
            hideAttributes: hideAttributes || node.data.hideAttributes,
            hideMethods: hideMethods || node.data.hideMethods,
            isConnectionInProgress: connectionSourceNodeId !== null,
            isConnectionSource: connectionSourceNodeId === node.id,
            knownClassNames,
            shouldStartNameEditing: node.id === nameEditingNodeId,
            shouldStartAttributeEditing:
              node.id === attributeEditingRequest?.nodeId ? attributeEditingRequest.attributeId : undefined,
            shouldStartMethodEditing:
              node.id === methodEditingRequest?.nodeId ? methodEditingRequest.methodId : undefined,
            onAttributeEditingStarted: (nodeId: string) => {
              if (nodeId === attributeEditingRequest?.nodeId) {
                setAttributeEditingRequest(null);
              }
            },
            onCreateAttribute: createAttributeByNodeId,
            onCreateMethod: createMethodByNodeId,
            onDeleteAttribute: deleteAttributeByNodeId,
            onDeleteAttributeAndCreateMethod: deleteAttributeAndCreateMethodByNodeId,
            onDeleteMethod: deleteMethodByNodeId,
            onMethodEditingStarted: (nodeId: string) => {
              if (nodeId === methodEditingRequest?.nodeId) {
                setMethodEditingRequest(null);
              }
            },
            onNameEditingStarted: (nodeId: string) => {
              if (nodeId === nameEditingNodeId) {
                setNameEditingNodeId(null);
              }
            },
            onOpenContextMenu: handleClassContextMenu,
            onRenameClass: renameClassById,
            onRenameClassAndCreateAttribute: renameClassAndCreateAttributeByNodeId,
            onSetParametricValuesNote: setParametricValuesNoteByNodeId,
            onUpdateAttribute: updateAttributeByNodeId,
            onUpdateAttributeFields: updateAttributeFieldsByNodeId,
            onUpdateAttributeFieldsAndCreateAttribute: updateAttributeFieldsAndCreateAttributeByNodeId,
            onUpdateMethodFields: updateMethodFieldsByNodeId,
            onUpdateMethodFieldsAndCreateMethod: updateMethodFieldsAndCreateMethodByNodeId,
            onUpdateParametricValues: updateParametricValuesByNodeId,
          },
        };
      });

      const noteNodes = nodes
        .filter((node) => node.data.hasParametricValuesNote)
        .map((node) => ({
          id: `${node.id}${NOTE_NODE_SUFFIX}`,
          type: 'parametricValuesNote',
          position: {
            x: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).x,
            y: (node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node)).y,
          },
          data: {
            classNodeId: node.id,
            startEditingValueId: node.id === valueEditingRequest?.nodeId ? valueEditingRequest.valueId : undefined,
            values: node.data.parametricValues ?? [],
            onValueEditingStarted: (nodeId: string) => {
              if (nodeId === valueEditingRequest?.nodeId) {
                setValueEditingRequest(null);
              }
            },
            onUpdateValues: updateParametricValuesByNodeId,
          },
          draggable: true,
          selectable: false,
          connectable: false,
          selected: node.id === selectedNoteNodeId,
          width: 180,
          height: 90,
        }));

      return [...classNodes, ...noteNodes];
    },
    [
      nodes,
      keyboardTargetId,
      connectionSourceNodeId,
      attributeEditingRequest,
      createAttributeByNodeId,
      createMethodByNodeId,
      deleteAttributeByNodeId,
      deleteAttributeAndCreateMethodByNodeId,
      deleteMethodByNodeId,
      handleClassContextMenu,
      methodEditingRequest,
      nameEditingNodeId,
      renameClassById,
      renameClassAndCreateAttributeByNodeId,
      selectedNodeIds,
      hideAttributes,
      hideMethods,
      hideGroupColors,
      nodeSizes,
      selectedNoteNodeId,
      setParametricValuesNoteByNodeId,
      updateAttributeByNodeId,
      updateAttributeFieldsByNodeId,
      updateAttributeFieldsAndCreateAttributeByNodeId,
      updateMethodFieldsByNodeId,
      updateMethodFieldsAndCreateMethodByNodeId,
      updateParametricValuesByNodeId,
      valueEditingRequest,
    ],
  );

  const renderedEdges = useMemo<Edge[]>(
    () => {
      const geometryById = new globalThis.Map(nodes.map((node) => [node.id, {
        position: node.position,
        width: nodeSizes[node.id]?.width,
        height: nodeSizes[node.id]?.height,
      }]));
      const endsByEdge = distributeAssociationEnds(normalizedEdges, geometryById);
      const associationEdges = normalizedEdges.map((edge) => {
        const ends = endsByEdge.get(edge.id);
        return {
          ...edge,
          ...(ends === undefined ? {} : { sourceHandle: ends.sourceHandle, targetHandle: ends.targetHandle }),
          selected: selectedEdgeIds.includes(edge.id),
          reconnectable: edge.id === selectedEdgeId,
          data: {
            ...edge.data,
            onUpdateMultiplicity: updateAssociationMultiplicity,
            onUpdateLabel: updateAssociation,
            onUpdateAssociation: updateAssociation,
            sourcePoint: ends?.sourcePoint,
            targetPoint: ends?.targetPoint,
            routingObstacles: nodes.map(node => {
              // Handles sit one pixel inside the class border. Other classes get an 8px clearance.
              const inset = node.id === edge.source || node.id === edge.target ? 2 : -8;
              return {
                x: node.position.x + inset, y: node.position.y + inset,
                width: (nodeSizes[node.id]?.width ?? 220) - inset * 2,
                height: (nodeSizes[node.id]?.height ?? 100) - inset * 2,
              };
            }),
          },
        };
      });

      const noteEdges = nodes
        .filter((node) => node.data.hasParametricValuesNote)
        .map((node) => {
          const classNode = reactFlowInstance?.getNode(node.id) ?? node;
          const notePosition = node.data.parametricValuesNotePosition ?? getDefaultNotePosition(node);
          const automaticHandles = resolveAutomaticNoteHandles(classNode, {
            position: notePosition,
            width: 180,
            height: 90,
          });
          const isAutomatic = node.data.parametricValuesNoteConnectionMode === 'automatic';

          return {
            id: `${node.id}${NOTE_EDGE_SUFFIX}`,
            source: node.id,
            sourceHandle: isAutomatic
              ? automaticHandles.sourceHandle
              : node.data.parametricValuesNoteHandle ?? 'bottom',
            target: `${node.id}${NOTE_NODE_SUFFIX}`,
            targetHandle: isAutomatic
              ? automaticHandles.targetHandle
              : node.data.parametricValuesNoteTargetHandle ?? 'top',
            selectable: true,
            focusable: false,
            reconnectable: false,
            style: {
              stroke: 'var(--note-connection-line)',
              strokeDasharray: 'var(--note-connection-dash)',
              strokeWidth: 1.2,
            },
            interactionWidth: 12,
            type: 'straight',
          };
        });

      return [...associationEdges, ...noteEdges];
    },
    [nodes, nodeSizes, normalizedEdges, reactFlowInstance, selectedEdgeId, selectedEdgeIds, updateAssociationMultiplicity, updateAssociation],
  );

  useEffect(() => { writeUiPreference('class-diagram-hide-attributes', String(hideAttributes)); }, [hideAttributes]);
  useEffect(() => { writeUiPreference('class-diagram-hide-group-colors', String(hideGroupColors)); }, [hideGroupColors]);
  useEffect(() => { writeUiPreference('class-diagram-hide-methods', String(hideMethods)); }, [hideMethods]);

  useEffect(() => {
    writeUiPreference(INSPECTOR_COLLAPSED_KEY, String(isInspectorCollapsed));
  }, [isInspectorCollapsed]);

  useEffect(() => {
    writeUiPreference(CANVAS_GRID_KEY, String(isGridEnabled));
  }, [isGridEnabled]);

  useEffect(() => {
    writeUiPreference(SNAP_ENABLED_KEY, String(isSnapEnabled));
  }, [isSnapEnabled]);

  useEffect(() => {
    writeUiPreference(MINIMAP_ENABLED_KEY, String(isMiniMapEnabled));
  }, [isMiniMapEnabled]);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  // 1…6 pick the relation new connections start as, in the order of the Relación menu.
  useEffect(() => {
    const handleRelationKey = (event: globalThis.KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const relationType = ASSOCIATION_RELATION_TYPES[Number(event.key) - 1];

      if (relationType === undefined || isNotebookEvent(event) || isEditableElement(document.activeElement)) {
        return;
      }

      if (document.querySelector('.modal-backdrop, [aria-modal="true"], dialog[open]') !== null) {
        return;
      }

      event.preventDefault();
      chooseDefaultRelationType(relationType);
    };

    document.addEventListener('keydown', handleRelationKey);

    return () => {
      document.removeEventListener('keydown', handleRelationKey);
    };
  }, [chooseDefaultRelationType]);

  useEffect(() => {
    const handleDeleteKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (isNotebookEvent(event) || isEditableElement(document.activeElement)) {
        return;
      }

      if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0 && selectedNoteNodeId === null) {
        return;
      }

      event.preventDefault();
      deleteSelectedElement();
    };

    document.addEventListener('keydown', handleDeleteKey);

    return () => {
      document.removeEventListener('keydown', handleDeleteKey);
    };
  }, [deleteSelectedElement, selectedEdgeIds, selectedNodeIds, selectedNoteNodeId]);

  const getDiagramBounds = useCallback(() => {
    const renderedNodeIds = new Set(renderedNodes.map((node) => node.id));
    const measuredNodes = reactFlowInstance
      ?.getNodes()
      .filter((node) => renderedNodeIds.has(node.id));

    const nodeBounds = getNodesBounds(measuredNodes !== undefined && measuredNodes.length > 0 ? measuredNodes : renderedNodes);
    const viewport = canvasRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    return viewport ? getDiagramImageExportBounds(viewport, nodeBounds, reactFlowInstance?.getZoom() ?? 1) : nodeBounds;
  }, [reactFlowInstance, renderedNodes]);

  const { exportPng, exportPdf, isExporting } = useDiagramImageExport({
    canvasRef,
    hasNodes: renderedNodes.length > 0,
    getDiagramBounds,
    projectName: project.name,
    artifactName: artifact.name,
    showFeedback,
  });

  const handlePaneContextMenu = (event: MouseEvent<Element>): void => {
    if (reactFlowInstance === null || canvasRef.current === null) {
      return;
    }

    event.preventDefault();
    const bounds = canvasRef.current.getBoundingClientRect();

    setContextMenu({
      screenPosition: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      },
      flowPosition: reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    });
  };

  const createClassFromContextMenu = (): void => {
    if (contextMenu !== null) {
      addClassNode(contextMenu.flowPosition);
      setContextMenu(null);
    }
  };

  const selectedContextNode = contextMenu?.nodeId
    ? nodes.find((node) => node.id === contextMenu.nodeId) ?? null
    : null;

  const closeToolbarMenus = (except?: HTMLDetailsElement): void => {
    toolbarRef.current?.querySelectorAll<HTMLDetailsElement>('details.toolbar-menu').forEach((details) => {
      if (details !== except) {
        details.removeAttribute('open');
      }
    });
  };

  useLayoutEffect(() => {
    if (contextMenu === null || contextMenuRef.current === null || canvasRef.current === null) {
      return;
    }

    const padding = 8;
    const menuBounds = contextMenuRef.current.getBoundingClientRect();
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    const nextX = Math.min(
      Math.max(padding, contextMenu.screenPosition.x),
      Math.max(padding, canvasBounds.width - menuBounds.width - padding),
    );
    const nextY = Math.min(
      Math.max(padding, contextMenu.screenPosition.y),
      Math.max(padding, canvasBounds.height - menuBounds.height - padding),
    );

    if (nextX !== contextMenu.screenPosition.x || nextY !== contextMenu.screenPosition.y) {
      setContextMenu((currentMenu) =>
        currentMenu === null
          ? null
          : { ...currentMenu, screenPosition: { x: nextX, y: nextY } },
      );
    }
  }, [contextMenu]);

  useEffect(() => {
    if (contextMenu === null) {
      return;
    }

    const closeOnClick = (event: globalThis.MouseEvent): void => {
      if (contextMenuRef.current?.contains(event.target as globalThis.Node)) {
        return;
      }

      setContextMenu(null);
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && !isNotebookEvent(event)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', closeOnClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      if (toolbarRef.current?.contains(event.target as globalThis.Node)) {
        return;
      }

      closeToolbarMenus();
    };

    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape' && !isNotebookEvent(event)) {
        closeToolbarMenus();
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick, true);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <main className="diagram-editor class-diagram-editor" ref={editorRootRef}>
      <EditorToolbar
        toolbarRef={toolbarRef}
        start={(
          <>
            <ToolbarHistory
              canRedo={canRedo}
              canUndo={canUndo}
              saveStatus={saveStatus}
              onBeforeAction={closeToolbarMenus}
              onRedo={onRedo}
              onUndo={onUndo}
            />
          </>
        )}
        create={(
          <>
            <ToolButton
              icon={Plus}
              label="Clase"
              showLabel
              variant="primary"
              title="Crear clase (o doble clic en el lienzo)"
              onClick={(event) => {
                event.currentTarget.blur();
                closeToolbarMenus();
                addClassNode();
              }}
            />
            <ToolMenu
              icon={Link2}
              label={`Relación: ${ASSOCIATION_RELATION_LABELS[defaultRelationType]}`}
              title="Relación con la que se crean las conexiones nuevas (teclas 1 a 6)"
              align="start"
            >
              <MenuLabel>Al conectar dos clases, crear</MenuLabel>
              {ASSOCIATION_RELATION_TYPES.map((relationType, index) => (
                <MenuItem
                  key={relationType}
                  checked={relationType === defaultRelationType}
                  shortcut={String(index + 1)}
                  onSelect={() => chooseDefaultRelationType(relationType)}
                >
                  {ASSOCIATION_RELATION_LABELS[relationType]}
                </MenuItem>
              ))}
            </ToolMenu>
            <DiagramSelectionTools
              count={activeSelectedIds.length}
              onArrange={arrangeSelection}
              onDuplicate={() => { duplicateSelection(); closeToolbarMenus(); }}
              onSelectAll={() => { setSelectedNodeIds(nodes.map(node => node.id)); setSelectedEdgeId(null); setSelectedNoteNodeId(null); closeToolbarMenus(); }}
            />
            {toolbarContext}
          </>
        )}
        end={(
          <>
            <NotebookButton />
            <ReviewButton
              count={reviewIssues.length}
              open={reviewOpen}
              onToggle={() => { closeToolbarMenus(); setReviewOpen(open => !open); }}
            />
            <ToolMenu icon={Eye} label="Vista">
              <MenuLabel>Clases</MenuLabel>
              <MenuItem checked={!hideAttributes} onSelect={() => setHideAttributes(hidden => !hidden)}>Atributos</MenuItem>
              <MenuItem checked={!hideMethods} onSelect={() => setHideMethods(hidden => !hidden)}>Métodos</MenuItem>
              {nodes.some(node => node.data.groupColor) ? (
                <MenuItem checked={!hideGroupColors} onSelect={() => setHideGroupColors(hidden => !hidden)}>Colores de grupo</MenuItem>
              ) : null}
              <MenuItem icon={EyeOff} disabled={activeSelectedIds.length === 0} onSelect={() => toggleClassDetail('hideAttributes')}>Alternar atributos de la selección</MenuItem>
              <MenuItem icon={EyeOff} disabled={activeSelectedIds.length === 0} onSelect={() => toggleClassDetail('hideMethods')}>Alternar métodos de la selección</MenuItem>
              <MenuSeparator />
              <MenuLabel>Lienzo</MenuLabel>
              <MenuItem checked={isGridEnabled} onSelect={() => setIsGridEnabled(enabled => !enabled)}>Grilla</MenuItem>
              <MenuItem checked={isSnapEnabled} onSelect={() => setIsSnapEnabled(enabled => !enabled)}>Ajustar a la grilla</MenuItem>
              <MenuItem checked={isMiniMapEnabled} onSelect={() => setIsMiniMapEnabled(enabled => !enabled)}>Minimapa</MenuItem>
            </ToolMenu>
            <ToolMenu icon={Download} label="Exportar">
              <MenuItem icon={ImageDown} disabled={isExporting} onSelect={() => { void exportPng(); }}>Imagen PNG</MenuItem>
              <MenuItem icon={FileText} disabled={isExporting} onSelect={() => { void exportPdf(); }}>Documento PDF</MenuItem>
            </ToolMenu>
          </>
        )}
      />
      {(feedbackMessage ?? externalFeedback) !== null ? (
        <div className="editor-feedback" role="status" aria-live="polite">
          {feedbackMessage ?? externalFeedback}
        </div>
      ) : null}

      <div
        className={`editor-body ${hasInspectorSelection ? '' : 'inspector-hidden'} ${
          hasInspectorSelection && isInspectorCollapsed ? 'inspector-collapsed' : ''
        }`}
      >
        <div
          className={`canvas-shell class-diagram-canvas ${connectionSourceNodeId !== null ? 'is-connecting' : ''}`}
          data-editor-canvas=""
          ref={canvasRef}
          tabIndex={-1}
          onKeyDownCapture={rememberSelectionModifiers}
          onPointerDownCapture={rememberSelectionModifiers}
          onDoubleClick={(event) => {
            // Double-click on empty canvas creates a class right there, as the
            // empty state and the Clase tooltip promise.
            if (reactFlowInstance === null || !(event.target as Element).closest('.react-flow__pane')) return;
            const point = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            addClassNode({ x: Math.round(point.x - DEFAULT_CLASS_SIZE.width / 2), y: Math.round(point.y - 24) });
          }}
        >
          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setReactFlowInstance}
            defaultViewport={defaultViewport}
            onMoveEnd={onMoveEnd}
            // Dos dedos (o la rueda) desplazan; pellizcar o Ctrl + rueda hace zoom.
            panOnScroll
            zoomOnDoubleClick={false}
            onNodesChange={handleNodesChange}
            onNodeDragStart={(_, node, group) => {
              // Como React Flow: arrastrar un elemento fuera de la selección la reemplaza; dentro, se mueve con ella.
              if (!additiveSelectionRef.current && !activeSelectedIds.includes(node.id)) setSelectedEdgeId(null);
              setSelectedNoteNodeId(null);
              setMovingNodeIds(group.length ? group.map(item => item.id) : [node.id]);
            }}
            onNodeDragStop={() => setMovingNodeIds([])}
            onSelectionDragStart={(_, group) => setMovingNodeIds(group.map(node => node.id))}
            onSelectionDragStop={() => setMovingNodeIds([])}
            // Mayús + arrastrar elige un área: reemplaza la selección, relaciones incluidas.
            onSelectionStart={() => setSelectedEdgeId(null)}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onConnectStart={(_, params) => {
              window.getSelection()?.removeAllRanges();
              setConnectionSourceNodeId(params.nodeId ?? null);
            }}
            onConnectEnd={() => setConnectionSourceNodeId(null)}
            onReconnect={handleReconnect}
            onReconnectStart={(_, edge) => {
              window.getSelection()?.removeAllRanges();
              setConnectionSourceNodeId(edge.source);
            }}
            onReconnectEnd={() => setConnectionSourceNodeId(null)}
            reconnectRadius={12}
            edgesUpdatable={false}
            connectionLineComponent={AssociationConnectionPreview}
            connectionLineStyle={{
              stroke: 'var(--association-stroke)',
              strokeWidth: 'var(--association-stroke-width)',
            }}
            onEdgeClick={(event, edge) => {
              const noteClassNodeId = edge.id.endsWith(NOTE_EDGE_SUFFIX)
                ? edge.id.slice(0, -NOTE_EDGE_SUFFIX.length)
                : null;

              if (noteClassNodeId !== null) {
                setContextMenu(null);
                setSelectedEdgeId(null);
                setSelectedNodeId(noteClassNodeId);
                setSelectedNoteNodeId(noteClassNodeId);
                return;
              }

              setContextMenu(null);
              setSelectedNoteNodeId(null);
              if (isAdditiveSelectionEvent(event)) {
                setSelectedEdgeIds(activeSelectedEdgeIds.includes(edge.id)
                  ? activeSelectedEdgeIds.filter(id => id !== edge.id)
                  : [...activeSelectedEdgeIds, edge.id]);
                return;
              }
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
              showMultiSelectHintOnce();
            }}
            onEdgeContextMenu={(event) => event.stopPropagation()}
            onNodeClick={(event, node) => {
              if (classKeyboard.handleClassClick(node.id)) return;
              const noteClassNodeId = getClassNodeIdFromNoteId(node.id);
              const classNodeId = noteClassNodeId ?? node.id;

              setContextMenu(null);
              if (noteClassNodeId !== null) {
                setSelectedEdgeId(null);
                setSelectedNodeId(classNodeId);
              } else if (isAdditiveSelectionEvent(event)) {
                // Use the selection from before this click; React Flow may also emit selection changes.
                setSelectedNodeIds(activeSelectedIds.includes(node.id)
                  ? activeSelectedIds.filter(id => id !== node.id)
                  : [...activeSelectedIds, node.id]);
              } else {
                // Un clic simple reemplaza las relaciones elegidas; las clases las reemplaza React Flow.
                setSelectedEdgeId(null);
                showMultiSelectHintOnce();
              }
              setSelectedNoteNodeId(noteClassNodeId);
            }}
            onPaneClick={() => {
              setContextMenu(null);
              setSelectedEdgeId(null);
              setSelectedNodeId(null);
              setSelectedNoteNodeId(null);
            }}
            onPaneContextMenu={handlePaneContextMenu}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
            selectNodesOnDrag={false}
            nodeDragThreshold={3}
            proOptions={{ hideAttribution: true }}
            selectionKeyCode="Shift"
            selectionOnDrag={false}
            snapGrid={[20, 20]}
            snapToGrid={isSnapEnabled}
            // Fit only a diagram that opens with content. React Flow fits the
            // first time nodes appear, so on an empty diagram it used to jump the
            // view to the first class — away from where it was double-clicked
            // and half under the inspector. Never above 100%.
            fitView={openedWithContent && defaultViewport === undefined}
            fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          >
            {isGridEnabled ? (
              <>
                <Background
                  color={theme.canvas.paperLine}
                  gap={20}
                  id="paper-fine"
                  lineWidth={1}
                  variant={BackgroundVariant.Lines}
                />
                <Background
                  color={theme.canvas.paperLineStrong}
                  gap={100}
                  id="paper-major"
                  lineWidth={1}
                  variant={BackgroundVariant.Lines}
                />
              </>
            ) : null}
            {classKeyboard.active ? <ClassKeyboardOverlay {...classKeyboard.overlayProps} /> : null}
            {renderedNodes.length === 0 ? (emptyState ?? (
              <CanvasStartCard
                title="Empezá por una clase"
                action={(
                  <button className="secondary-action" type="button" onClick={() => addClassNode()}>
                    <Plus size={14} />Crear clase
                  </button>
                )}
              >
                Agregá las clases del dominio. También podés hacer doble clic en el lienzo
                para crear una donde quieras.
              </CanvasStartCard>
            )) : null}
            <ClassAlignmentGuides movingIds={movingNodeIds} />
            <CanvasControls label="Controles del diagrama de clases" />
            {isMiniMapEnabled && nodes.length > 0 ? <MiniMap aria-label="Minimapa del diagrama" pannable zoomable /> : null}
          </ReactFlow>
          {nodes.length >= 2 && normalizedEdges.length === 0 ? (
            // Only until the first association exists: after that the hint has nothing left to teach.
            <div className="canvas-hint" role="note">
              Para relacionar dos clases, arrastrá uno de los puntos del borde de una clase hasta la otra.
              Después tocá la línea para elegir multiplicidades.
            </div>
          ) : null}
          {reviewOpen ? <DiagramReviewPanel isEmpty={nodes.length === 0} issues={reviewIssues} onFocus={focusIssue} onClose={() => setReviewOpen(false)} /> : null}
          {contextMenu !== null ? (
            <div
              className="canvas-context-menu"
              ref={contextMenuRef}
              style={{ left: contextMenu.screenPosition.x, top: contextMenu.screenPosition.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {contextMenu.nodeId === undefined ? (
                <button type="button" onClick={createClassFromContextMenu}>
                  Crear clase
                </button>
              ) : (
                <>
                  <ClassGroupColorPicker value={selectionColor} count={activeSelectedIds.length} onChange={setSelectionColor} />
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSelectedIds.length > 1) duplicateSelection(); else duplicateClassNode(contextMenu.nodeId ?? '');
                      setContextMenu(null);
                    }}
                  >
                    {activeSelectedIds.length > 1 ? 'Duplicar selección' : 'Duplicar clase'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addMethodAndStartEditing(contextMenu.nodeId ?? '');
                      setContextMenu(null);
                    }}
                  >
                    Agregar método
                  </button>
                  {activeSelectedIds.length <= 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        // A loop over the top-right corner, from the handles nearest to it.
                        const nodeId = contextMenu.nodeId ?? '';
                        handleConnect({ source: nodeId, sourceHandle: 'right-start', target: nodeId, targetHandle: 'top-end' });
                        setContextMenu(null);
                      }}
                    >
                      Agregar autorrelación
                    </button>
                  ) : null}
                  {selectedContextNode?.data.hasParametricValuesNote ? (
                    <button
                      type="button"
                      onClick={() => {
                        setParametricValuesNoteByNodeId(contextMenu.nodeId ?? '', false);
                        setContextMenu(null);
                      }}
                    >
                      Eliminar valores paramétricos
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        addParametricValuesNoteAndStartEditing(contextMenu.nodeId ?? '');
                        setContextMenu(null);
                      }}
                    >
                      Agregar valores paramétricos
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
        {isMultiSelection ? (
          <MultiSelectionInspector
            bodyId="class-inspector-body"
            collapsed={isInspectorCollapsed}
            count={selectionCount}
            onDelete={deleteSelectedElement}
            onToggleCollapsed={() => setIsInspectorCollapsed((isCollapsed) => !isCollapsed)}
          />
        ) : hasInspectorSelection ? (
          <InspectorPanel
            actions={selectedNoteNodeId === null ? (
              <InspectorDeleteButton
                label={selectedEdge !== null ? 'Eliminar relación' : 'Eliminar clase'}
                onClick={deleteSelectedElement}
              />
            ) : null}
            bodyId="class-inspector-body"
            className="inspector"
            collapsed={isInspectorCollapsed}
            kind={selectedEdge !== null ? ASSOCIATION_RELATION_LABELS[selectedEdge.data?.relationType ?? 'association'] : 'Clase'}
            title={selectedEdge !== null ? relationTitle(selectedEdge) : selectedNode?.data.name.trim() || 'Clase sin nombre'}
            tone={selectedEdge !== null ? 'neutral' : 'accent'}
            onToggleCollapsed={() => setIsInspectorCollapsed((isCollapsed) => !isCollapsed)}
          >
            {selectedEdge !== null ? (
              <AssociationInspector edge={selectedEdge} onUpdateAssociation={updateAssociation} />
            ) : (
              <ClassInspector
                node={selectedNode}
                onAddAttribute={addAttribute}
                onAddMethod={addMethod}
                onDeleteAttribute={deleteAttribute}
                onDeleteMethod={deleteMethod}
                onReorderAttributes={reorderAttributes}
                onRenameClass={renameClass}
                onSetParametricValuesNote={(nodeId, enabled) => {
                  if (enabled) {
                    addParametricValuesNoteAndStartEditing(nodeId);
                  } else {
                    setParametricValuesNoteByNodeId(nodeId, false);
                  }
                }}
                onUpdateDescription={updateClassDescription}
                onUpdateAttribute={updateAttribute}
                onSetAttributeStatic={setAttributeStatic}
                onUpdateMethod={updateMethod}
                onUpdateParametricValues={updateParametricValuesByNodeId}
                onUpdateParametricValuesNoteConnection={updateParametricValuesNoteConnection}
              />
            )}
          </InspectorPanel>
        ) : null}
      </div>
    </main>
  );
}
