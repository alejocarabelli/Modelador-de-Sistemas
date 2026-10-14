import { Import, Link2, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DiagramTheme } from '../theme/themes';
import type {
  ArtifactContent,
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassSequenceDiagramArtifact,
  DesignProject,
  DiagramContent,
  SequenceDiagramArtifact,
} from '../types/diagram';
import { importClassesFromSequences, planSequenceClassImport, planSequenceRelationSuggestions } from '../utils/sequenceClassImport';
import type { ClassKeyboardImportItem } from '../utils/classKeyboardMode';
import { findUnlinkedSequences } from '../utils/sequenceModelLink';
import { CanvasStartCard } from './CanvasStartCard';
import { DiagramEditor } from './DiagramEditor';
import { MenuItem, MenuLabel, MenuSeparator, ToolMenu } from './ui/Toolbar';
import type { DiagramSaveStatus } from '../hooks/useProjects';

type ClassSequenceDiagramEditorProps = {
  artifact: ClassSequenceDiagramArtifact;
  canRedo: boolean;
  saveStatus?: DiagramSaveStatus;
  canUndo: boolean;
  project: DesignProject;
  theme: DiagramTheme;
  onNavigateToArtifact?: (artifactId: string) => void;
  onLinkAllSequenceDiagrams?: (classModelArtifactId: string) => void;
  onChangeContent: (content: ArtifactContent, options?: { separateHistoryEntry?: boolean; alreadyNormalized?: boolean }) => void;
  onRedo: () => void;
  onUndo: () => void;
};

const asClassContent = (content: DiagramContent): ClassDiagramContent => ({
  nodes: (content as ClassDiagramContent).nodes,
  edges: (content as ClassDiagramContent).edges,
});

export function ClassSequenceDiagramEditor({
  artifact,
  canRedo,
  saveStatus = 'saved',
  canUndo,
  project,
  theme,
  onNavigateToArtifact,
  onLinkAllSequenceDiagrams,
  onChangeContent,
  onRedo,
  onUndo,
}: ClassSequenceDiagramEditorProps) {
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [revealRequest, setRevealRequest] = useState<{ key: number; nodeIds: string[] } | null>(null);
  const sequenceDiagrams = useMemo(
    () => project.artifacts.filter((candidate): candidate is SequenceDiagramArtifact => candidate.type === 'sequence-diagram'),
    [project.artifacts],
  );
  const linkedSequenceDiagrams = useMemo(
    () => sequenceDiagrams.filter((candidate) => artifact.content.linkedSequenceDiagramIds.includes(candidate.id)),
    [artifact.content.linkedSequenceDiagramIds, sequenceDiagrams],
  );
  const pending = useMemo(() => planSequenceClassImport(artifact.content, linkedSequenceDiagrams.map((sequence) => sequence.content)), [artifact.content, linkedSequenceDiagrams]);
  const [rejectedKeys, setRejectedKeys] = useState<Set<string>>(new Set());
  const acceptedKeys = new Set(pending.filter((novelty) => !rejectedKeys.has(novelty.key)).map((novelty) => novelty.key));
  const pendingGroups = new Map<string, typeof pending>();
  for (const novelty of pending) pendingGroups.set(novelty.className, [...(pendingGroups.get(novelty.className) ?? []), novelty]);
  const unlinkedCount = findUnlinkedSequences(project.artifacts).length;

  // The empty canvas's button opens the same novelties menu as the toolbar, so it stays the one place to import from.
  const syncMenuSlot = useRef<HTMLDivElement | null>(null);
  const openSyncMenu = useCallback((): void => {
    const details = syncMenuSlot.current?.querySelector('details');
    if (details) details.open = true;
  }, []);

  // The menu opens under its trigger, which sits right of the toolbar's start: when the panel would run past the
  // window's right edge, it opens to the left instead (and stays put if it would not fit there either).
  const attachSyncMenuSlot = useCallback((slot: HTMLDivElement | null): (() => void) | undefined => {
    syncMenuSlot.current = slot;
    if (slot === null) return undefined;
    const placePanel = (event: Event): void => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const panel = details.querySelector<HTMLElement>('.v2-menu-panel');
      if (!panel) return;
      const margin = 8;
      details.classList.remove('opens-left');
      if (panel.getBoundingClientRect().right <= window.innerWidth - margin) return;
      details.classList.add('opens-left');
      if (panel.getBoundingClientRect().left < margin) details.classList.remove('opens-left');
    };
    slot.addEventListener('toggle', placePanel, true);
    return () => {
      slot.removeEventListener('toggle', placePanel, true);
      syncMenuSlot.current = null;
    };
  }, []);

  const handleChangeContent = useCallback(
    (content: DiagramContent, options?: { separateHistoryEntry?: boolean }): void => {
      const classContent = asClassContent(content);
      onChangeContent(
        {
          ...artifact.content,
          ...classContent,
          version: 1 as const,
        },
        options,
      );
    },
    [artifact.content, onChangeContent],
  );

  // Links live on the sequences; the model's list follows them. Only the
  // sequences with no model yet are taken, never one drawn on another model.
  const refreshLinks = useCallback((): void => {
    onLinkAllSequenceDiagrams?.(artifact.id);
  }, [artifact.id, onLinkAllSequenceDiagrams]);

  useEffect(() => {
    if (importFeedback === null) return undefined;
    const timeout = window.setTimeout(() => setImportFeedback(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [importFeedback]);

  const importFromSequences = useCallback((sources: SequenceDiagramArtifact[], keys?: ReadonlySet<string>, reveal = true): void => {
    const { content, summary } = importClassesFromSequences(
      { nodes: artifact.content.nodes, edges: artifact.content.edges },
      sources.map((source) => source.content),
      keys,
    );

    if (summary.createdClasses === 0 && summary.addedMethods === 0 && summary.updatedMethods === 0 && summary.addedAttributes === 0) {
      setImportFeedback('No hay clases, atributos ni métodos nuevos: el modelo ya incluye todo lo de esa secuencia.');
      return;
    }

    onChangeContent(
      { ...artifact.content, ...content, version: 1 },
      { separateHistoryEntry: true },
    );
    // Frame what changed: the new classes, or the classes that gained members.
    const previousNodes = new Map(artifact.content.nodes.map((node) => [node.id, node]));
    const created = content.nodes.filter((node) => !previousNodes.has(node.id)).map((node) => node.id);
    const updated = content.nodes.filter((node) => previousNodes.has(node.id) && previousNodes.get(node.id) !== node).map((node) => node.id);
    // The keyboard mode moves its own cursor; framing each class would make the canvas jump on every Enter.
    if (reveal) setRevealRequest({ key: Date.now(), nodeIds: created.length > 0 ? created : updated });

    const parts = [
      summary.createdClasses > 0 ? `${summary.createdClasses} ${summary.createdClasses === 1 ? 'clase nueva' : 'clases nuevas'}` : null,
      summary.addedAttributes > 0 ? `${summary.addedAttributes} ${summary.addedAttributes === 1 ? 'atributo' : 'atributos'}` : null,
      summary.addedMethods > 0 ? `${summary.addedMethods} ${summary.addedMethods === 1 ? 'método' : 'métodos'}` : null,
      summary.updatedMethods > 0 ? `${summary.updatedMethods} ${summary.updatedMethods === 1 ? 'método completado' : 'métodos completados'}` : null,
    ].filter((part): part is string => part !== null);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0];
    setImportFeedback(`Importado: ${list}.`);
  }, [artifact.content, onChangeContent]);

  // T in keyboard mode walks the same novelties as the menu, one class at a
  // time, then the relations the messages ask for and the model lacks.
  const relationSuggestions = useMemo(
    () => planSequenceRelationSuggestions(artifact.content, linkedSequenceDiagrams.map((sequence) => sequence.content)),
    [artifact.content, linkedSequenceDiagrams],
  );
  const keyboardImport = useMemo(() => {
    const groups = new Map<string, typeof pending>();
    for (const novelty of pending) groups.set(novelty.className, [...(groups.get(novelty.className) ?? []), novelty]);
    const items: ClassKeyboardImportItem[] = [...groups].map(([className, novelties]) => ({
      key: `class:${className.trim().toLocaleLowerCase()}`,
      kind: novelties.some((novelty) => novelty.type === 'class') ? 'class' as const : 'members' as const,
      className,
      noveltyKeys: novelties.map((novelty) => novelty.key),
      members: novelties.filter((novelty) => novelty.type !== 'class').map((novelty) => novelty.type === 'method'
        ? `${novelty.elementName}(${novelty.parameters ?? ''})${novelty.returnType ? `: ${novelty.returnType}` : ''}`
        : `${novelty.elementName}${novelty.attributeType ? `: ${novelty.attributeType}` : ''}`),
    }));
    for (const suggestion of relationSuggestions) {
      items.push({ key: suggestion.key, kind: 'relation', sourceClassName: suggestion.sourceClassName, targetClassName: suggestion.targetClassName, message: suggestion.message });
    }
    return {
      items,
      onImportClass: (noveltyKeys: string[]) => importFromSequences(linkedSequenceDiagrams, new Set(noveltyKeys), false),
    };
  }, [importFromSequences, linkedSequenceDiagrams, pending, relationSuggestions]);

  const displayArtifact: ClassDiagramArtifact = useMemo(() => ({
    id: artifact.id,
    type: 'class-diagram',
    name: artifact.name,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    content: {
      nodes: artifact.content.nodes,
      edges: artifact.content.edges,
    },
  }), [artifact.createdAt, artifact.content.edges, artifact.content.nodes, artifact.id, artifact.name, artifact.updatedAt]);

  const linkedNames = linkedSequenceDiagrams.map((sequence) => sequence.name).join(', ');
  const renderEmptyState = (): ReactNode => {
    const card = (note: ReactNode, action?: ReactNode): ReactNode => (
      <CanvasStartCard title="Clases de secuencias" note={note} action={action}>
        Reúne las clases y operaciones que aparecen en tus diagramas de secuencia.
      </CanvasStartCard>
    );

    if (sequenceDiagrams.length === 0) {
      return card('Primero armá un diagrama de secuencia; sus clases y mensajes van a aparecer acá para traerlas.');
    }

    if (linkedSequenceDiagrams.length === 0) {
      if (unlinkedCount === 0) {
        return card('Las secuencias del proyecto ya están vinculadas a otro modelo de clases.');
      }
      return card(
        'Vinculá una secuencia para traer sus clases y mensajes.',
        onLinkAllSequenceDiagrams ? <button className="secondary-action" type="button" onClick={refreshLinks}>Vincular secuencias</button> : undefined,
      );
    }

    return card(
      <>
        Vinculado a: {linkedNames}.
        {pending.length === 0 ? <><br />Todavía no hay clases para traer: asigná una clase a los participantes de la secuencia.</> : null}
      </>,
      pending.length > 0 ? <button className="secondary-action" type="button" onClick={openSyncMenu}>{`Ver lo que se puede traer (${pending.length})`}</button> : undefined,
    );
  };

  const linkedCount = linkedSequenceDiagrams.length;
  const toolbarStatus = pending.length > 0
    ? { label: `${pending.length} para traer`, title: 'Clases y operaciones de las secuencias vinculadas que todavía no están en este diagrama' }
    : linkedCount > 0
      ? { label: `✓ Todo traído de ${linkedCount} ${linkedCount === 1 ? 'secuencia' : 'secuencias'}`, title: 'Todo lo que aparece en las secuencias vinculadas ya está en este diagrama' }
      : { label: 'Sin secuencias vinculadas', title: undefined };

  const toolbarContext = (
    <ToolMenu
      label={toolbarStatus.label}
      title={toolbarStatus.title}
      align="start"
      className={`sequence-model-status ${pending.length > 0 ? 'has-novelties' : ''}`}
      panelClassName="sequence-model-sync-panel"
    >
      {pending.length > 0 ? <MenuLabel>Elegí qué traer de las secuencias</MenuLabel> : null}
      {[...pendingGroups].map(([className, novelties]) => (
        <div key={className} role="presentation">
          <div className="sequence-model-class-label" role="presentation">{className}</div>
          {novelties.map((novelty) => {
            const parentRejected = novelty.type !== 'class' && rejectedKeys.has(`class:${className.trim().toLocaleLowerCase()}`);
            return <MenuItem key={novelty.key} checked={acceptedKeys.has(novelty.key) && !parentRejected} disabled={parentRejected} keepOpen onSelect={() => setRejectedKeys((current) => {
              const next = new Set(current);
              if (next.has(novelty.key)) next.delete(novelty.key); else next.add(novelty.key);
              return next;
            })}>
              {novelty.type === 'class' ? 'Clase nueva' : novelty.type === 'method' ? `${novelty.elementName}(${novelty.parameters ?? ''})${novelty.returnType ? `: ${novelty.returnType}` : ''}` : `${novelty.elementName}${novelty.attributeType ? `: ${novelty.attributeType}` : ''}`}
            </MenuItem>;
          })}
        </div>
      ))}
      {pending.length > 0 ? <div className="sequence-model-import-action"><MenuItem icon={Import} disabled={!pending.some((novelty) => acceptedKeys.has(novelty.key) && (novelty.type === 'class' || !rejectedKeys.has(`class:${novelty.className.trim().toLocaleLowerCase()}`)))} onSelect={() => {
        importFromSequences(linkedSequenceDiagrams, acceptedKeys);
        setRejectedKeys(new Set());
      }}>Traer seleccionadas</MenuItem></div> : null}
      <MenuSeparator />
      {linkedSequenceDiagrams.length > 0 ? <>
        <MenuLabel>Abrir secuencia vinculada</MenuLabel>
        {linkedSequenceDiagrams.map((sequence) => <MenuItem key={sequence.id} icon={Workflow} disabled={!onNavigateToArtifact} onSelect={() => onNavigateToArtifact?.(sequence.id)}>{sequence.name}</MenuItem>)}
      </> : null}
      {unlinkedCount > 0 ? <MenuItem icon={Link2} onSelect={refreshLinks}>Vincular {unlinkedCount} {unlinkedCount === 1 ? 'secuencia sin vincular' : 'secuencias sin vincular'}</MenuItem> : null}
    </ToolMenu>
  );

  return (
    <DiagramEditor
      artifact={displayArtifact}
      canRedo={canRedo}
      canUndo={canUndo}
      saveStatus={saveStatus}
      project={project}
      theme={theme}
      toolbarContext={<div className="sequence-model-slot" ref={attachSyncMenuSlot}>{toolbarContext}</div>}
      externalFeedback={importFeedback}
      revealRequest={revealRequest}
      emptyState={renderEmptyState()}
      keyboardImport={keyboardImport}
      onChangeContent={handleChangeContent}
      onRedo={onRedo}
      onUndo={onUndo}
    />
  );
}
