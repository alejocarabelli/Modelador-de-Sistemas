import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, BackgroundVariant, ConnectionMode, ReactFlowProvider, type Edge, type Node, type NodeChange, type ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import { SquarePen } from 'lucide-react';
import { CanvasControls } from './CanvasControls';
import { ClassNode } from './ClassNode';
import { AssociationEdge } from './AssociationEdge';
import { SystemBoundaryNode, UseCaseActorNode, UseCaseOvalNode } from './useCaseNodes';
import { UseCaseRelationEdge } from './UseCaseRelationEdge';
import { SequenceDiagramCanvas } from './SequenceDiagramCanvas';
import { CanvasZoom } from './ui/CanvasZoom';
import { useGentleWheelZoom } from '../hooks/useGentleWheelZoom';
import { useTheme } from '../hooks/useTheme';
import { useLiveProjects } from '../hooks/useLiveProjects';
import { readCanvasGridEnabled } from '../storage/uiPreferences';
import { focusArtifactInMainWindow } from '../storage/nativeWindows';
import { normalizeAssociationEdge } from '../utils/association';
import { normalizeDiagramContent, normalizeUseCaseModelContent } from '../utils/diagramNormalization';
import { analyzeSequenceDiagramSemantics } from '../utils/sequenceDiagram';
import { buildSequenceLayout } from '../utils/sequenceDiagramLayout';
import { buildFlowDocument, splitRowByRefs, type FlowDocLine, type FlowDocTable } from '../utils/flowDocument';
import { buildProjectSymbolIndex } from '../utils/projectSymbolIndex';
import type {
  ClassDiagramArtifact,
  ClassModelArtifact,
  DesignArtifact,
  DiagramProject,
  SequenceDiagramArtifact,
  UseCaseFlowArtifact,
  UseCaseModelArtifact,
} from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';

const nodeTypes = { classNode: ClassNode };
const edgeTypes = { association: AssociationEdge };
const useCaseNodeTypes = { systemBoundary: SystemBoundaryNode, useCaseActor: UseCaseActorNode, useCaseOval: UseCaseOvalNode };
const useCaseEdgeTypes = { useCaseRelation: UseCaseRelationEdge };
const POLL_INTERVAL_MS = 1000;
/** Follows the editors' Vista › Grilla, also when it changes in the main window. */
const useCanvasGrid = (): boolean => {
  const [isEnabled, setIsEnabled] = useState(readCanvasGridEnabled);
  useEffect(() => {
    const refresh = (): void => setIsEnabled(readCanvasGridEnabled());
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return isEnabled;
};

function ClassModelViewer({ artifact }: { artifact: ClassModelArtifact }) {
  const { theme } = useTheme();
  const isGridEnabled = useCanvasGrid();
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({});
  const content = useMemo(() => normalizeDiagramContent(artifact.content), [artifact.content]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  // The trackpad pinch arrives as Ctrl + wheel; the app's own zoom handles it.
  useGentleWheelZoom(canvasRef, instance, 0.1, 2);

  const nodes = useMemo<Node[]>(() => {
    const knownClassNames = content.nodes.map((node) => node.data.name.trim()).filter((name) => name.length > 0);
    return content.nodes.map((node) => ({
      ...node,
      ...(nodeSizes[node.id] ?? {}),
      draggable: false,
      selectable: false,
      data: { ...node.data, knownClassNames },
    }));
  }, [content.nodes, nodeSizes]);

  const edges = useMemo<Edge[]>(() => content.edges.map((rawEdge) => {
    const edge = normalizeAssociationEdge(rawEdge);
    return {
      ...edge,
      selectable: false,
      data: {
        ...edge.data,
        routingObstacles: content.nodes.map((node) => {
          // Same clearance the editor uses: 2px inside the ends, 8px around the rest.
          const inset = node.id === edge.source || node.id === edge.target ? 2 : -8;
          return {
            x: node.position.x + inset,
            y: node.position.y + inset,
            width: (nodeSizes[node.id]?.width ?? 220) - inset * 2,
            height: (nodeSizes[node.id]?.height ?? 100) - inset * 2,
          };
        }),
      },
    };
  }), [content.edges, content.nodes, nodeSizes]);

  const handleNodesChange = useCallback((changes: NodeChange[]): void => {
    const measured = changes.filter((change) => change.type === 'dimensions' && change.dimensions);
    if (measured.length === 0) return;
    setNodeSizes((current) => {
      const next = { ...current };
      let changed = false;
      for (const change of measured) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        const { width, height } = change.dimensions;
        if (current[change.id]?.width !== width || current[change.id]?.height !== height) {
          next[change.id] = { width, height };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  return (
    <div className="artifact-viewer-flow" ref={canvasRef}>
    <ReactFlow
      onInit={setInstance}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      // Class handles are all of type source; Loose lets either end of an association attach to them.
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesUpdatable={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      panOnScroll
      zoomOnDoubleClick={false}
      minZoom={0.1}
      maxZoom={2}
      fitView
      fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      {isGridEnabled ? <GridBackground theme={theme} /> : null}
      <CanvasControls label="Zoom del diagrama" />
    </ReactFlow>
    </div>
  );
}

function GridBackground({ theme }: { theme: DiagramTheme }) {
  return (
    <>
      <Background color={theme.canvas.paperLine} gap={20} id="viewer-paper-fine" lineWidth={1} variant={BackgroundVariant.Lines} />
      <Background color={theme.canvas.paperLineStrong} gap={100} id="viewer-paper-strong" lineWidth={1} variant={BackgroundVariant.Lines} />
    </>
  );
}

function UseCaseModelViewer({ artifact }: { artifact: UseCaseModelArtifact }) {
  const { theme } = useTheme();
  const isGridEnabled = useCanvasGrid();
  const content = useMemo(() => normalizeUseCaseModelContent(artifact.content), [artifact.content]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  useGentleWheelZoom(canvasRef, instance, 0.2, 2);

  // Same stacking as the editor: the system boundary always stays behind.
  const nodes = useMemo<Node[]>(() => content.nodes.map((node) => ({
    ...node,
    draggable: false,
    selectable: false,
    zIndex: node.data.kind === 'system-boundary' ? 0 : 10,
  })), [content.nodes]);
  const edges = useMemo<Edge[]>(() => content.edges.map((edge) => ({ ...edge, selectable: false })), [content.edges]);

  return (
    <div className="artifact-viewer-flow" ref={canvasRef}>
      <ReactFlow
        onInit={setInstance}
        nodes={nodes}
        edges={edges}
        nodeTypes={useCaseNodeTypes}
        edgeTypes={useCaseEdgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesUpdatable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        panOnScroll
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        {isGridEnabled ? <GridBackground theme={theme} /> : null}
        <CanvasControls label="Zoom del modelo de casos de uso" />
      </ReactFlow>
    </div>
  );
}

const SEQUENCE_MIN_ZOOM = 0.3;
const SEQUENCE_MAX_ZOOM = 1.8;

function SequenceViewer({ artifact, project }: { artifact: SequenceDiagramArtifact; project: DiagramProject }) {
  const { theme } = useTheme();
  const content = artifact.content;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const existingArtifactIds = useMemo(() => new Set(project.artifacts.map((candidate) => candidate.id)), [project.artifacts]);
  const layout = useMemo(
    () => buildSequenceLayout(content, analyzeSequenceDiagramSemantics(content, { existingArtifactIds })),
    [content, existingArtifactIds],
  );
  const classNodesById = useMemo(() => {
    const classModel = project.artifacts.find((candidate) =>
      candidate.type === 'class-sequence-diagram' && candidate.id === content.classDiagramArtifactId);
    const classNodes = classModel?.type === 'class-sequence-diagram' && Array.isArray(classModel.content.nodes) ? classModel.content.nodes : [];
    return new Map(classNodes.map((node) => [node.id, { name: node.data.name }]));
  }, [content.classDiagramArtifactId, project.artifacts]);

  const fit = useCallback((): void => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const diagramW = Math.max(400, layout.bounds.width + 80);
    const diagramH = Math.max(400, layout.bounds.height + 80);
    const nextZoom = Math.max(SEQUENCE_MIN_ZOOM, Math.min(1.2, (scrollEl.clientWidth - 40) / diagramW, (scrollEl.clientHeight - 40) / diagramH));
    setZoom(nextZoom);
    scrollEl.scrollTo({
      left: Math.max(0, (layout.bounds.left - 40) * nextZoom),
      top: Math.max(0, (layout.bounds.top - 40) * nextZoom),
    });
  }, [layout.bounds]);

  // Opens framed like the class diagrams; later changes keep the reader's zoom.
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (hasFittedRef.current) return;
    hasFittedRef.current = true;
    fit();
  }, [fit]);

  // The trackpad pinch arrives as Ctrl + wheel.
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return undefined;
    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => Math.min(SEQUENCE_MAX_ZOOM, Math.max(SEQUENCE_MIN_ZOOM, current - event.deltaY * 0.01)));
    };
    scrollEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <>
      <div className="sequence-canvas-scroll" ref={scrollRef} role="img" aria-label={`Diagrama de secuencia ${artifact.name}`}>
        <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: layout.width, height: layout.height }}>
            <SequenceDiagramCanvas
              content={content}
              layout={layout}
              selected={null}
              interactive={false}
              theme={theme}
              classNodesById={classNodesById}
              participantColorsEnabled={content.participantColors !== 'disabled'}
              onSelect={() => undefined}
              onParticipantPointerDown={() => undefined}
              onNotePointerDown={() => undefined}
              onNoteResizePointerDown={() => undefined}
            />
          </div>
        </div>
      </div>
      <CanvasZoom
        label="Zoom del diagrama de secuencia"
        zoomPercent={Math.round(zoom * 100)}
        onZoomOut={() => setZoom((value) => Math.max(SEQUENCE_MIN_ZOOM, value - 0.1))}
        onZoomIn={() => setZoom((value) => Math.min(SEQUENCE_MAX_ZOOM, value + 0.1))}
        onResetZoom={() => setZoom(1)}
        onFit={fit}
      />
    </>
  );
}

function FlowDocLines({ lines }: { lines: FlowDocLine[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <div
          key={index}
          className={`artifact-viewer-doc-line${line.bold ? ' is-bold' : ''}`}
          style={{ paddingLeft: `${line.depth * 1.25}rem` }}
        >
          {line.number !== undefined ? <span className="artifact-viewer-doc-number">{line.number} </span> : null}
          {line.bullet !== undefined ? <span aria-hidden="true">{['●', '○', '■'][line.bullet]} </span> : null}
          {line.segments.map((segment, segmentIndex) => (
            <span
              key={segmentIndex}
              style={{
                fontWeight: segment.bold ? 600 : undefined,
                fontStyle: segment.italic ? 'italic' : undefined,
                textDecoration: segment.underline ? 'underline' : undefined,
              }}
            >{segment.text}</span>
          ))}
          {line.segments.length === 0 && line.number === undefined ? ' ' : null}
        </div>
      ))}
    </>
  );
}

function FlowTable({ table }: { table: FlowDocTable }) {
  return (
    <table className="artifact-viewer-doc-table">
      <colgroup><col /><col /><col className="is-ref" /></colgroup>
      <thead>
        <tr><th colSpan={3} className="is-title">{table.title}</th></tr>
        <tr><th>ACTOR</th><th>SISTEMA</th><th className="is-ref">REF.</th></tr>
      </thead>
      <tbody>
        {table.rows.length === 0 ? (
          <tr><td colSpan={3} className="artifact-viewer-doc-empty">Sin pasos todavía.</td></tr>
        ) : table.rows.map((row, rowIndex) => (
          <Fragment key={rowIndex}>
            {splitRowByRefs(row).map((part, partIndex) => (
              <tr key={partIndex} className={partIndex > 0 ? 'is-continuation' : undefined}>
                <td><FlowDocLines lines={part.actor} /></td>
                <td><FlowDocLines lines={part.system} /></td>
                <td className="is-ref">{part.ref}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** The flow as its PDF and Word exports print it: description, basic path and alternative paths. */
function UseCaseFlowViewer({ artifact, project }: { artifact: UseCaseFlowArtifact; project: DiagramProject }) {
  const document = useMemo(() => {
    const classDiagrams = project.artifacts.filter((candidate): candidate is ClassDiagramArtifact => candidate.type === 'class-diagram');
    // Same association the editor uses: the linked class diagram, or the only one in the project.
    const classDiagram = classDiagrams.find((candidate) => candidate.id === artifact.content.classDiagramArtifactId)
      ?? (classDiagrams.length === 1 ? classDiagrams[0] : undefined);
    return buildFlowDocument(artifact.content, artifact.name, buildProjectSymbolIndex(classDiagram));
  }, [artifact.content, artifact.name, project.artifacts]);

  return (
    <div className="artifact-viewer-doc">
      <article className="artifact-viewer-doc-page">
        <table className="artifact-viewer-doc-table is-fields">
          <colgroup><col className="is-label" /><col /></colgroup>
          <tbody>
            {document.fields.map((field) => (
              <tr key={field.label}>
                <th scope="row">{field.label}</th>
                <td><FlowDocLines lines={field.lines} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <FlowTable table={document.basic} />
        {document.alternatives.map((table, index) => <FlowTable key={index} table={table} />)}
      </article>
    </div>
  );
}

function ArtifactViewerBody({ artifact, project }: { artifact: DesignArtifact; project: DiagramProject }) {
  switch (artifact.type) {
    case 'class-diagram':
    case 'class-sequence-diagram':
      return <ReactFlowProvider><ClassModelViewer artifact={artifact} /></ReactFlowProvider>;
    case 'use-case-model':
      return <ReactFlowProvider><UseCaseModelViewer artifact={artifact} /></ReactFlowProvider>;
    case 'sequence-diagram':
      return <SequenceViewer artifact={artifact} project={project} />;
    case 'use-case-flow':
      return <UseCaseFlowViewer artifact={artifact} project={project} />;
  }
}

export function ArtifactViewer({ projectId, artifactId }: { projectId: string; artifactId: string }) {
  const { theme, themeStyle } = useTheme();
  const projects = useLiveProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const artifact = project?.artifacts.find((candidate) => candidate.id === artifactId);

  useEffect(() => {
    document.title = artifact ? `${artifact.name} · vista` : 'Modelador de Sistemas';
  }, [artifact]);

  return (
    <div className="app-shell artifact-viewer" data-theme={theme.id} data-appearance={theme.appearance} data-palette={theme.palette} data-ui-version="refined" style={themeStyle}>
      <header className="artifact-viewer-bar">
        <div className="artifact-viewer-title">
          <strong>{artifact?.name ?? 'Artefacto no disponible'}</strong>
          {project ? <span>{project.name} · solo lectura</span> : null}
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={!artifact}
          onClick={() => focusArtifactInMainWindow(projectId, artifactId)}
        >
          <SquarePen aria-hidden="true" size={14} />Editar en la ventana principal
        </button>
      </header>
      <div className="artifact-viewer-canvas">
        {project && artifact ? (
          <ArtifactViewerBody artifact={artifact} project={project} />
        ) : (
          <p className="artifact-viewer-empty">Este artefacto ya no existe en el proyecto. Podés cerrar esta ventana.</p>
        )}
      </div>
    </div>
  );
}
