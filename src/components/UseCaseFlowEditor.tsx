import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCopy,
  Download,
  Eye,
  FileText,
  FileType,
  SlidersHorizontal,
  Split,
  Trash2,
} from 'lucide-react';
import type {
  AlternativeUseCaseFlow,
  ClassDiagramArtifact,
  DiagramProject,
  FlowMainStep,
  StepAnchorRef,
  UseCaseFlowArtifact,
  UseCaseFlowContent,
  UseCaseFlowPriority,
  UseCaseModelArtifact,
} from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';
import {
  DEFAULT_FLOW_EXPORT_OPTIONS,
  type FlowExportOptions,
} from '../types/useCaseFlowEditor';
import { createId } from '../utils/id';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { buildProjectSymbolIndex } from '../utils/projectSymbolIndex';
import {
  buildFlowDocument,
  buildFlowVocabulary,
  renderFlowPlainText,
} from '../utils/flowDocument';
import {
  computeFlowNumbering,
  createAlternativeFlow,
  extractPseudoEntities,
  formatAlternativeRef,
  getNextAlternativeNumber,
  mapSubNodes,
  parseStateTextToBlocks,
} from '../utils/useCaseFlowModel';
import { reviewUseCaseFlow, type FlowIssue } from '../utils/useCaseFlowReview';
import { createFlowDocx } from '../utils/flowExportDocx';
import { downloadBlob } from '../utils/pdfExport';
import type { SaveOutcome } from '../utils/saveFile';
import { useArtifactScrollMemory } from '../hooks/useArtifactViewMemory';
import { artifactViewKey, readArtifactScrollView } from '../utils/artifactViewMemory';
import { isNotebookEvent } from '../utils/notebookKeyboard';
import { shortcutLabel } from '../utils/shortcutLabel';
import type { DiagramSaveStatus } from '../hooks/useProjects';
import {
  EditorToolbar,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  NotebookButton,
  ReviewButton,
  ToolButton,
  ToolMenu,
} from './ui/Toolbar';
import { ToolbarHistory } from './ToolbarHistory';
import { DiagramReviewPanel } from './DiagramReviewPanel';
import { AutoGrowTextarea } from './AutoGrowTextarea';
import { InputParametersEditor } from './useCaseFlow/InputParametersEditor';
import { StateTreeEditor } from './useCaseFlow/StateTreeEditor';
import { FlowStepsTable } from './useCaseFlow/FlowStepsTable';
import { ClassDiagramSidePanel } from './useCaseFlow/ClassDiagramSidePanel';
import { FlowDocumentPreview } from './useCaseFlow/FlowDocumentPreview';
import { FlowExportDialog } from './useCaseFlow/FlowExportDialog';

type UseCaseFlowEditorProps = {
  artifact: UseCaseFlowArtifact;
  canRedo: boolean;
  saveStatus?: DiagramSaveStatus;
  canUndo: boolean;
  project: DiagramProject;
  theme: DiagramTheme;
  onChangeContent: (content: UseCaseFlowContent) => void;
  onRedo: () => void;
  onUndo: () => void;
};

const PRIORITIES: UseCaseFlowPriority[] = ['A', 'B', 'C'];

export function UseCaseFlowEditor({
  artifact,
  canRedo,
  saveStatus = 'saved',
  canUndo,
  project,
  onChangeContent,
  onRedo,
  onUndo,
}: UseCaseFlowEditorProps) {
  const content = useMemo(() => normalizeUseCaseFlowContent(artifact.content), [artifact.content]);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const viewKey = artifactViewKey(project.id, artifact.id);
  const [initialView] = useState(() => readArtifactScrollView(viewKey));
  useArtifactScrollMemory(viewKey, scrollRef, initialView);

  const feedbackTimeoutRef = useRef<number | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const fieldRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const altTitleRefs = useRef(new Map<string, HTMLInputElement>());
  const activeInsertRef = useRef<((token: string) => void) | null>(null);

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const [pendingAltFocusId, setPendingAltFocusId] = useState<string | null>(null);

  // Collapsible sections (UI state, outside undo history)
  const [showDescription, setShowDescription] = useState(true);
  const [showBasicFlow, setShowBasicFlow] = useState(true);
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  const [collapsedAltIds, setCollapsedAltIds] = useState<Set<string>>(() => new Set());
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(() => new Set());

  // Right side panel: only one open at a time ('none' | 'review' | 'class-diagram')
  const [sidePanel, setSidePanel] = useState<'none' | 'review' | 'class-diagram'>('none');
  const [exportDialogFormat, setExportDialogFormat] = useState<'pdf' | 'docx' | null>(null);

  const classDiagramArtifacts = useMemo(
    () =>
      project.artifacts.filter(
        (candidate): candidate is ClassDiagramArtifact => candidate.type === 'class-diagram',
      ),
    [project.artifacts],
  );

  // Only a flow that never chose a diagram (undefined) takes the project's single one. null is an explicit
  // "Sin referencia", and a stored id that no longer exists is reported, never replaced by another diagram.
  const associatedClassDiagramId =
    content.classDiagramArtifactId === undefined
      ? classDiagramArtifacts.length === 1
        ? classDiagramArtifacts[0].id
        : undefined
      : content.classDiagramArtifactId ?? undefined;
  const associatedClassDiagram = classDiagramArtifacts.find(
    (candidate) => candidate.id === associatedClassDiagramId,
  );

  const symbolIndex = useMemo(() => buildProjectSymbolIndex(associatedClassDiagram), [associatedClassDiagram]);
  const pseudoEntities = useMemo(() => extractPseudoEntities(content), [content]);
  const vocabulary = useMemo(
    () =>
      buildFlowVocabulary(
        symbolIndex,
        pseudoEntities.map((pe) => pe.name),
        pseudoEntities.flatMap((pe) => pe.fields),
      ),
    [pseudoEntities, symbolIndex],
  );

  const { actorSuggestions, useCaseNames } = useMemo(() => {
    const actors = new Set<string>();
    const useCases = new Set<string>();
    project.artifacts.forEach((candidate) => {
      if (candidate.type === 'use-case-model') {
        const model = candidate as UseCaseModelArtifact;
        model.content.nodes.forEach((node) => {
          const name = node.data?.name?.trim();
          if (!name) return;
          if (node.data.kind === 'actor') actors.add(name);
          else if (node.data.kind === 'use-case') useCases.add(name);
        });
      } else if (candidate.type === 'use-case-flow' && candidate.id !== artifact.id) {
        const normalized = normalizeUseCaseFlowContent(candidate.content);
        if (normalized.description.useCaseName.trim()) useCases.add(normalized.description.useCaseName.trim());
        if (normalized.description.actor.trim()) actors.add(normalized.description.actor.trim());
      }
    });
    return {
      actorSuggestions: Array.from(actors),
      useCaseNames: Array.from(useCases),
    };
  }, [artifact.id, project.artifacts]);

  const numbering = useMemo(() => computeFlowNumbering(content), [content]);
  const reviewIssues = useMemo(() => reviewUseCaseFlow(content, symbolIndex), [content, symbolIndex]);
  const errorCount = useMemo(() => reviewIssues.filter((issue) => issue.kind === 'error').length, [reviewIssues]);

  const previewDocument = useMemo(
    () =>
      previewMode
        ? buildFlowDocument(content, artifact.name, symbolIndex, {
            includeDescription: showDescription,
            includeBasicFlow: showBasicFlow,
            includeAlternatives: showAlternatives,
          })
        : null,
    [artifact.name, content, previewMode, showAlternatives, showBasicFlow, showDescription, symbolIndex],
  );

  const showFeedback = useCallback((message: string): void => {
    setFeedbackMessage(message);
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedbackMessage(null), 2400);
  }, []);

  const flashHighlight = useCallback((id: string): void => {
    setHighlightedId(id);
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedId(null), 2000);
  }, []);

  const commitContent = useCallback(
    (next: UseCaseFlowContent): void => {
      const normalized = normalizeUseCaseFlowContent(next);
      if (JSON.stringify(normalized) === JSON.stringify(content)) return;
      onChangeContent(normalized);
    },
    [content, onChangeContent],
  );

  const updateDescription = useCallback(
    (patch: Partial<UseCaseFlowContent['description']>): void => {
      commitContent({
        ...content,
        description: { ...content.description, ...patch },
      });
    },
    [commitContent, content],
  );

  const updateAssociatedClassDiagram = (artifactId: string): void => {
    commitContent({
      ...content,
      classDiagramArtifactId: artifactId.length > 0 ? artifactId : null,
    });
  };

  const registerFieldRef = useCallback((key: string, el: HTMLTextAreaElement | null): void => {
    if (el === null) fieldRefs.current.delete(key);
    else fieldRefs.current.set(key, el);
  }, []);

  const handleFocusEditable = useCallback((_el: HTMLTextAreaElement, applyInsert: (token: string) => void): void => {
    activeInsertRef.current = applyInsert;
  }, []);

  const handleInsertTokenFromPanel = useCallback(
    (token: string): void => {
      if (activeInsertRef.current) {
        activeInsertRef.current(token);
      } else {
        void navigator.clipboard?.writeText(token);
        showFeedback(`«${token}» copiado al portapapeles`);
      }
    },
    [showFeedback],
  );

  // -------------------------------------------------------------------------
  // Alternative flows management

  const addAlternativeFlow = (): void => {
    const num = getNextAlternativeNumber(content.alternativeFlows);
    const created = createAlternativeFlow(num);
    commitContent({
      ...content,
      alternativeFlows: [...content.alternativeFlows, created],
    });
    setShowAlternatives(true);
    setCollapsedAltIds((current) => {
      const next = new Set(current);
      next.delete(created.id);
      return next;
    });
    setPendingAltFocusId(created.id);
  };

  const createAlternativeFromStep = useCallback(
    (sourceFlowId: 'basic' | string, targetStepId: string, isMainStep: boolean): void => {
      const num = getNextAlternativeNumber(content.alternativeFlows);
      const created = createAlternativeFlow(num);
      const refItem = { id: createId(), kind: 'ca' as const, flowId: created.id };

      const attachToSteps = (steps: FlowMainStep[]): FlowMainStep[] =>
        steps.map((step) => {
          if (isMainStep && step.id === targetStepId) {
            return { ...step, refs: [...step.refs, refItem] };
          }
          if (!isMainStep) {
            return {
              ...step,
              children: mapSubNodes(step.children, (node) =>
                node.id === targetStepId ? { ...node, refs: [...node.refs, refItem] } : node,
              ),
            };
          }
          return step;
        });

      const nextBasic = sourceFlowId === 'basic' ? attachToSteps(content.basicFlow) : content.basicFlow;
      const nextAlts = content.alternativeFlows.map((alt) =>
        alt.id === sourceFlowId ? { ...alt, steps: attachToSteps(alt.steps) } : alt,
      );

      commitContent({
        ...content,
        basicFlow: nextBasic,
        alternativeFlows: [...nextAlts, created],
      });
      setShowAlternatives(true);
      setCollapsedAltIds((current) => {
        const next = new Set(current);
        next.delete(created.id);
        return next;
      });
      setPendingAltFocusId(created.id);
      showFeedback(`${formatAlternativeRef(num)} creado y vinculado en Ref.`);
    },
    [commitContent, content, showFeedback],
  );

  const updateAlternativeFlow = (
    flowId: string,
    patch: Partial<Pick<AlternativeUseCaseFlow, 'number' | 'title' | 'firstStepNumberOverride' | 'steps'>>,
  ): void => {
    commitContent({
      ...content,
      alternativeFlows: content.alternativeFlows.map((alt) => {
        if (alt.id !== flowId) return alt;
        const next = { ...alt, ...patch };
        if ('firstStepNumberOverride' in patch && patch.firstStepNumberOverride === undefined) {
          delete next.firstStepNumberOverride;
        }
        return next;
      }),
    });
  };

  const moveAlternativeFlow = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= content.alternativeFlows.length) return;
    const next = [...content.alternativeFlows];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitContent({ ...content, alternativeFlows: next });
  };

  const deleteAlternativeFlow = (flow: AlternativeUseCaseFlow): void => {
    commitContent({
      ...content,
      alternativeFlows: content.alternativeFlows.filter((alt) => alt.id !== flow.id),
    });
    showFeedback(`${formatAlternativeRef(flow.number)} eliminado (podés deshacer)`);
  };

  // -------------------------------------------------------------------------
  // Navigation & focus helpers

  const jumpToAlternative = useCallback((flowId: string): void => {
    setShowAlternatives(true);
    setPreviewMode(false);
    setCollapsedAltIds((current) => {
      const next = new Set(current);
      next.delete(flowId);
      return next;
    });
    setPendingAltFocusId(flowId);
    flashHighlight(flowId);
  }, [flashHighlight]);

  const jumpToStep = useCallback((anchor: StepAnchorRef): void => {
    setPreviewMode(false);
    if (anchor.flowId === 'basic') {
      setShowBasicFlow(true);
    } else {
      setShowAlternatives(true);
      setCollapsedAltIds((current) => {
        const next = new Set(current);
        next.delete(anchor.flowId);
        return next;
      });
    }
    const entry = numbering.entries.find((e) => e.stepId === anchor.stepId);
    if (entry) {
      setCollapsedStepIds((current) => {
        const next = new Set(current);
        next.delete(entry.mainStepId);
        return next;
      });
      setPendingFocusKey(entry.isMain ? `main:${entry.stepId}` : `sub:${entry.stepId}`);
      flashHighlight(entry.stepId);
    }
  }, [flashHighlight, numbering.entries]);

  const focusIssue = (issue: FlowIssue): void => {
    const loc = issue.location;
    if (!loc) return;
    setPreviewMode(false);
    if (loc.kind === 'alternative') {
      jumpToAlternative(loc.flowId);
    } else if (loc.kind === 'step') {
      jumpToStep({ flowId: loc.flowId, stepId: loc.stepId });
    } else if (loc.kind === 'state') {
      setShowDescription(true);
      flashHighlight(loc.detailId ?? loc.blockId);
      document.getElementById('ucf-descripcion')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (loc.kind === 'description') {
      setShowDescription(true);
      document.getElementById('ucf-descripcion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleCollapseStep = useCallback((stepId: string): void => {
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const foldLongSteps = (): void => {
    const allMain = [...content.basicFlow, ...content.alternativeFlows.flatMap((a) => a.steps)];
    const longIds = allMain.filter((s) => s.children.length >= 4).map((s) => s.id);
    setCollapsedStepIds(new Set(longIds));
    showFeedback(longIds.length === 0 ? 'No hay pasos largos para plegar' : `${longIds.length} pasos plegados`);
  };

  // -------------------------------------------------------------------------
  // Export & clipboard

  const fileBaseName =
    (content.description.useCaseName.trim() || artifact.name).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'caso-de-uso';

  const runExport = async (format: 'pdf' | 'docx', options: FlowExportOptions): Promise<void> => {
    const doc = buildFlowDocument(content, artifact.name, symbolIndex, options);
    try {
      let outcome: SaveOutcome;
      if (format === 'docx') {
        outcome = await downloadBlob(`${fileBaseName}.docx`, createFlowDocx(doc, { orientation: options.orientation }));
      } else {
        const { createFlowPdf } = await import('../utils/flowExportPdf');
        outcome = await downloadBlob(`${fileBaseName}.pdf`, createFlowPdf(doc, { orientation: options.orientation }));
      }
      if (outcome.status === 'cancelled') return;
      if (outcome.status === 'failed') throw new Error(outcome.error);
      showFeedback(format === 'pdf' ? 'PDF exportado' : 'Documento Word (.docx) exportado');
    } catch {
      showFeedback('No se pudo exportar el documento. Probá de nuevo.');
    }
  };

  const copyPlainSummary = async (): Promise<void> => {
    const doc = buildFlowDocument(content, artifact.name, symbolIndex, {
      includeDescription: showDescription,
      includeBasicFlow: showBasicFlow,
      includeAlternatives: showAlternatives,
    });
    try {
      await navigator.clipboard.writeText(renderFlowPlainText(doc));
      showFeedback('Resumen de texto copiado al portapapeles');
    } catch {
      showFeedback('No se pudo copiar al portapapeles.');
    }
  };

  // -------------------------------------------------------------------------
  // Effects: toolbar menus, focus, cleanup

  const closeToolbarMenus = (except?: HTMLDetailsElement): void => {
    toolbarRef.current?.querySelectorAll<HTMLDetailsElement>('details.toolbar-menu').forEach((details) => {
      if (details !== except) details.removeAttribute('open');
    });
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
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

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
      if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!pendingFocusKey) return;
    const el = fieldRefs.current.get(pendingFocusKey);
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPendingFocusKey(null);
  }, [content, pendingFocusKey]);

  useEffect(() => {
    if (!pendingAltFocusId) return;
    const input = altTitleRefs.current.get(pendingAltFocusId);
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPendingAltFocusId(null);
  }, [content, pendingAltFocusId]);

  const inputParamNames = useMemo(
    () => content.description.inputParameters.map((p) => p.name.trim()).filter(Boolean),
    [content.description.inputParameters],
  );

  return (
    <main className="editor-shell ucf-editor-shell">
      <EditorToolbar
        toolbarRef={toolbarRef}
        start={
          <ToolbarHistory canRedo={canRedo} canUndo={canUndo} saveStatus={saveStatus} onRedo={onRedo} onUndo={onUndo} />
        }
        create={
          <>
            <ToolButton
              icon={Split}
              label="Camino alternativo"
              showLabel
              title={shortcutLabel('Agregar un Camino Alternativo (⇧⌘A desde un paso lo vincula directo)')}
              variant="primary"
              onClick={addAlternativeFlow}
            />
            <ToolButton
              icon={BookOpen}
              label="Clases (DC)"
              pressed={sidePanel === 'class-diagram'}
              showLabel
              title="Abrir panel de consulta del Diagrama de Clases vinculado"
              onClick={() => setSidePanel((p) => (p === 'class-diagram' ? 'none' : 'class-diagram'))}
            />
          </>
        }
        end={
          <>
            <NotebookButton />
            <ReviewButton
              count={reviewIssues.length}
              hasErrors={errorCount > 0}
              open={sidePanel === 'review'}
              onToggle={() => setSidePanel((p) => (p === 'review' ? 'none' : 'review'))}
            />
            <ToolMenu icon={Eye} label="Vista">
              <MenuItem
                checked={previewMode}
                icon={FileText}
                onSelect={() => setPreviewMode((m) => !m)}
              >
                Vista previa de entrega
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Secciones visibles</MenuLabel>
              <MenuItem checked={showDescription} onSelect={() => setShowDescription((v) => !v)}>
                Lista Descriptiva
              </MenuItem>
              <MenuItem checked={showBasicFlow} onSelect={() => setShowBasicFlow((v) => !v)}>
                Camino Básico
              </MenuItem>
              <MenuItem checked={showAlternatives} onSelect={() => setShowAlternatives((v) => !v)}>
                Caminos Alternativos
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={ChevronsDownUp} onSelect={foldLongSteps}>
                Plegar pasos largos
              </MenuItem>
              <MenuItem
                disabled={collapsedStepIds.size === 0}
                icon={ChevronsUpDown}
                onSelect={() => setCollapsedStepIds(new Set())}
              >
                Desplegar todos los pasos
              </MenuItem>
            </ToolMenu>
            <ToolMenu icon={Download} label="Exportar">
              <MenuItem icon={FileText} onSelect={() => { void runExport('pdf', DEFAULT_FLOW_EXPORT_OPTIONS); }}>
                PDF completo (A4 vertical)
              </MenuItem>
              <MenuItem icon={FileType} onSelect={() => { void runExport('docx', DEFAULT_FLOW_EXPORT_OPTIONS); }}>
                Word (.docx) completo
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={SlidersHorizontal} onSelect={() => setExportDialogFormat('pdf')}>
                Exportar con opciones (selectivo / apaisado)…
              </MenuItem>
              <MenuItem icon={ClipboardCopy} onSelect={() => { void copyPlainSummary(); }}>
                Copiar texto plano
              </MenuItem>
            </ToolMenu>
          </>
        }
      />

      {feedbackMessage !== null ? <div className="editor-feedback" role="status">{feedbackMessage}</div> : null}

      <div className={`ucf-editor-body${sidePanel !== 'none' ? ' has-side-panel' : ''}`}>
        <section className="ucf-canvas" data-editor-canvas="" ref={scrollRef} tabIndex={-1}>
          {/* Sticky navigation & quick jump bar */}
          <nav aria-label="Navegación del Caso de Uso" className="ucf-section-nav">
            <a href="#ucf-descripcion" onClick={() => { setShowDescription(true); setPreviewMode(false); }}>
              Lista Descriptiva
            </a>
            <a href="#ucf-basico" onClick={() => { setShowBasicFlow(true); setPreviewMode(false); }}>
              Camino Básico <span className="ucf-nav-count">{content.basicFlow.length}</span>
            </a>
            <a href="#ucf-alternativos" onClick={() => { setShowAlternatives(true); setPreviewMode(false); }}>
              Caminos Alternativos <span className="ucf-nav-count">{content.alternativeFlows.length}</span>
            </a>
            {content.alternativeFlows.length > 0 ? (
              <div className="ucf-nav-ca-chips">
                {content.alternativeFlows.map((alt) => (
                  <button
                    key={alt.id}
                    title={alt.title || formatAlternativeRef(alt.number)}
                    type="button"
                    onClick={() => jumpToAlternative(alt.id)}
                  >
                    {formatAlternativeRef(alt.number)}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              className={`ucf-preview-toggle${previewMode ? ' is-active' : ''}`}
              type="button"
              onClick={() => setPreviewMode((m) => !m)}
            >
              <Eye size={13} aria-hidden="true" />
              <span>{previewMode ? 'Volver a editar' : 'Vista previa'}</span>
            </button>
          </nav>

          {previewMode && previewDocument ? (
            <div className="ucf-preview-container">
              <FlowDocumentPreview document={previewDocument} />
            </div>
          ) : (
            <div className="ucf-document-stack">
              {/* Linked Class Diagram bar */}
              <div className="ucf-dc-link-bar">
                <label className="ucf-dc-select-label">
                  <span>Diagrama de clases vinculado</span>
                  <select
                    title="Vincular el diagrama de clases habilita autocompletado, subrayado de clases, cursiva de atributos y validación de navegabilidad en Leer."
                    value={associatedClassDiagramId ?? ''}
                    onChange={(event) => updateAssociatedClassDiagram(event.target.value)}
                  >
                    <option value="">
                      {classDiagramArtifacts.length === 0 ? 'Sin diagramas de clases' : 'Sin referencia'}
                    </option>
                    {classDiagramArtifacts.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                {typeof content.classDiagramArtifactId === 'string' && associatedClassDiagram === undefined ? (
                  <small className="ucf-dc-missing">La referencia guardada ya no existe.</small>
                ) : associatedClassDiagram ? (
                  <span className="ucf-dc-status">
                    {symbolIndex.classes.length} clases disponibles ·{' '}
                    <button
                      className="ucf-link-btn"
                      type="button"
                      onClick={() => setSidePanel((p) => (p === 'class-diagram' ? 'none' : 'class-diagram'))}
                    >
                      {sidePanel === 'class-diagram' ? 'ocultar panel' : 'consultar DC'}
                    </button>
                  </span>
                ) : null}
              </div>

              {/* ============================================================
                  BLOQUE 1: LISTA DESCRIPTIVA (tabla de 2 columnas, 9 campos)
                 ============================================================ */}
              <section className="ucf-block-card" id="ucf-descripcion">
                <header className="ucf-block-header">
                  <button
                    aria-expanded={showDescription}
                    className="ucf-collapse-toggle"
                    type="button"
                    onClick={() => setShowDescription((v) => !v)}
                  >
                    {showDescription ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>1. Lista Descriptiva del Caso de Uso</span>
                  </button>
                  <span className="ucf-block-meta">Formato oficial · 9 campos</span>
                </header>

                {showDescription ? (
                  <div className="ucf-desc-table">
                    <datalist id="ucf-actor-suggestions">
                      {actorSuggestions.map((actor) => <option key={actor} value={actor} />)}
                    </datalist>
                    <datalist id="ucf-cu-suggestions">
                      {useCaseNames.map((name) => <option key={name} value={`(CU ${name})`} />)}
                    </datalist>

                    <div className="ucf-desc-row">
                      <label className="ucf-desc-label" htmlFor="ucf-field-number">Número</label>
                      <div className="ucf-desc-value is-compact">
                        <input
                          id="ucf-field-number"
                          inputMode="numeric"
                          placeholder="ej. 16"
                          value={content.description.useCaseNumber}
                          onChange={(event) => updateDescription({ useCaseNumber: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <label className="ucf-desc-label" htmlFor="ucf-field-name">Nombre del Caso de Uso</label>
                      <div className="ucf-desc-value">
                        <input
                          className="ucf-desc-name-input"
                          id="ucf-field-name"
                          placeholder="Verbo en infinitivo + objeto (ej. Asentar Resultado, Registrar Trámite)"
                          value={content.description.useCaseName}
                          onChange={(event) => updateDescription({ useCaseName: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <label className="ucf-desc-label" htmlFor="ucf-field-actor">Actor</label>
                      <div className="ucf-desc-value">
                        <input
                          id="ucf-field-actor"
                          list="ucf-actor-suggestions"
                          placeholder="Actor principal / iniciador (ej. Especialista, Consultor)"
                          value={content.description.actor}
                          onChange={(event) => updateDescription({ actor: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <label className="ucf-desc-label" htmlFor="ucf-field-desc">Descripción</label>
                      <div className="ucf-desc-value">
                        <AutoGrowTextarea
                          id="ucf-field-desc"
                          minRows={2}
                          placeholder="Objetivo, alcance y reglas de negocio clave del Caso de Uso (sin repetir solo el título)."
                          value={content.description.description}
                          onChange={(event) => updateDescription({ description: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <span className="ucf-desc-label" id="ucf-priority-lbl">Prioridad</span>
                      <div className="ucf-desc-value">
                        <div aria-labelledby="ucf-priority-lbl" className="ucf-priority-group" role="radiogroup">
                          {PRIORITIES.map((priority) => (
                            <button
                              aria-checked={content.description.priority === priority}
                              className={content.description.priority === priority ? 'active' : undefined}
                              key={priority}
                              role="radio"
                              type="button"
                              onClick={() => updateDescription({ priority })}
                            >
                              {priority}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <span className="ucf-desc-label">Parámetros de Entrada</span>
                      <div className="ucf-desc-value">
                        <InputParametersEditor
                          parameters={content.description.inputParameters}
                          onChange={(inputParameters) => updateDescription({ inputParameters })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <label className="ucf-desc-label" htmlFor="ucf-field-precondition">
                        Precondición
                        <small>Opcional · garantizado por CU previo</small>
                      </label>
                      <div className="ucf-desc-value">
                        <AutoGrowTextarea
                          id="ucf-field-precondition"
                          minRows={1}
                          placeholder="ej. Especialista instanciado (CU Loguear Usuario) — no se valida en este CU"
                          value={content.description.precondition}
                          onChange={(event) => updateDescription({ precondition: event.target.value })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <span className="ucf-desc-label">
                        Estado Inicial
                        <small>Instancias persistidas controladas al inicio</small>
                      </span>
                      <div className="ucf-desc-value">
                        <StateTreeEditor
                          blocks={content.description.initialState}
                          highlightedId={highlightedId}
                          inputParamNames={inputParamNames}
                          mode="initial"
                          symbolIndex={symbolIndex}
                          vocabulary={vocabulary}
                          onChange={(initialState) => updateDescription({ initialState })}
                        />
                      </div>
                    </div>

                    <div className="ucf-desc-row">
                      <span className="ucf-desc-label">
                        Estado Final
                        <small>Instancias creadas o modificadas</small>
                      </span>
                      <div className="ucf-desc-value">
                        <StateTreeEditor
                          blocks={content.description.finalState}
                          highlightedId={highlightedId}
                          inputParamNames={inputParamNames}
                          mode="final"
                          symbolIndex={symbolIndex}
                          vocabulary={vocabulary}
                          onChange={(finalState) => updateDescription({ finalState })}
                        />
                      </div>
                    </div>

                    {content.description.legacyPostcondition ? (
                      <div className="ucf-desc-row is-legacy">
                        <span className="ucf-desc-label">
                          Postcondición (v1)
                          <small>No pertenece a la ficha oficial</small>
                        </span>
                        <div className="ucf-desc-value ucf-legacy-notice">
                          <p>{content.description.legacyPostcondition}</p>
                          <div className="ucf-legacy-actions">
                            <button
                              type="button"
                              onClick={() => {
                                const parsed = parseStateTextToBlocks(
                                  content.description.legacyPostcondition ?? '',
                                  'final',
                                );
                                updateDescription({
                                  finalState: [...content.description.finalState, ...parsed],
                                  legacyPostcondition: undefined,
                                });
                              }}
                            >
                              Mover a Estado Final
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDescription({ legacyPostcondition: undefined })}
                            >
                              Descartar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {/* ============================================================
                  BLOQUE 2: CAMINO BÁSICO / PRINCIPAL (Actor | Sistema | Ref.)
                 ============================================================ */}
              <section className="ucf-block-card" id="ucf-basico">
                <header className="ucf-block-header">
                  <button
                    aria-expanded={showBasicFlow}
                    className="ucf-collapse-toggle"
                    type="button"
                    onClick={() => setShowBasicFlow((v) => !v)}
                  >
                    {showBasicFlow ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>2. Camino Básico / Principal</span>
                  </button>
                  <label className="ucf-start-num-control" title="Número inicial del camino básico (normalmente 1)">
                    <span>empieza en</span>
                    <input
                      inputMode="numeric"
                      min={1}
                      placeholder="1"
                      type="number"
                      value={content.basicFlowFirstStepNumber ?? ''}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        commitContent({
                          ...content,
                          basicFlowFirstStepNumber: Number.isFinite(parsed) && parsed > 1 ? parsed : undefined,
                        });
                      }}
                    />
                  </label>
                </header>

                {showBasicFlow ? (
                  <FlowStepsTable
                    collapsedStepIds={collapsedStepIds}
                    content={content}
                    flowId="basic"
                    highlightedStepId={highlightedId}
                    numbering={numbering}
                    registerFieldRef={registerFieldRef}
                    steps={content.basicFlow}
                    symbolIndex={symbolIndex}
                    useCaseNames={useCaseNames}
                    vocabulary={vocabulary}
                    onChangeSteps={(basicFlow) => commitContent({ ...content, basicFlow })}
                    onCreateAlternativeFromStep={createAlternativeFromStep}
                    onFocusEditable={handleFocusEditable}
                    onJumpToAlternative={jumpToAlternative}
                    onJumpToStep={jumpToStep}
                    onRequestFocusKey={setPendingFocusKey}
                    onToggleCollapseStep={toggleCollapseStep}
                  />
                ) : null}
              </section>

              {/* ============================================================
                  BLOQUE 3: CAMINOS ALTERNATIVOS
                 ============================================================ */}
              <section className="ucf-block-card" id="ucf-alternativos">
                <header className="ucf-block-header">
                  <button
                    aria-expanded={showAlternatives}
                    className="ucf-collapse-toggle"
                    type="button"
                    onClick={() => setShowAlternatives((v) => !v)}
                  >
                    {showAlternatives ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span>3. Caminos Alternativos ({content.alternativeFlows.length})</span>
                  </button>
                  <button className="secondary-action ucf-header-add" type="button" onClick={addAlternativeFlow}>
                    <Split size={13} aria-hidden="true" /> Agregar CA
                  </button>
                </header>

                {showAlternatives ? (
                  content.alternativeFlows.length === 0 ? (
                    <div className="ucf-alt-empty">
                      <p>
                        Todavía no hay Caminos Alternativos. Usá <strong>+ CA</strong> en la columna <strong>Ref.</strong> de un <em>Comprobar</em>, <em>Controlar consistencia</em> o <em>Buscar</em>, o apretá <kbd>{shortcutLabel('⇧⌘A')}</kbd> desde cualquier subpaso.
                      </p>
                      <button className="secondary-action" type="button" onClick={addAlternativeFlow}>
                        <Split size={14} aria-hidden="true" /> Crear Camino Alternativo N°1
                      </button>
                    </div>
                  ) : (
                    <div className="ucf-alt-list">
                      {content.alternativeFlows.map((alt, index) => {
                        const isCollapsed = collapsedAltIds.has(alt.id);
                        const origin = numbering.branchOriginByFlowId.get(alt.id);
                        const defaultStart = numbering.defaultFirstStepNumberByFlowId.get(alt.id) ?? 1;
                        const effectiveStart = numbering.firstStepNumberByFlowId.get(alt.id) ?? defaultStart;
                        const originFlowName = origin
                          ? origin.flowId === 'basic'
                            ? 'Camino básico'
                            : formatAlternativeRef(
                                content.alternativeFlows.find((a) => a.id === origin.flowId)?.number ?? 1,
                              )
                          : '';

                        return (
                          <article
                            className={`ucf-alt-card${highlightedId === alt.id ? ' is-highlighted' : ''}`}
                            id={`ucf-alt-${alt.id}`}
                            key={alt.id}
                          >
                            <div className="ucf-alt-banner">
                              <button
                                aria-expanded={!isCollapsed}
                                aria-label={isCollapsed ? `Expandir CA N°${alt.number}` : `Colapsar CA N°${alt.number}`}
                                className="ucf-alt-collapse"
                                type="button"
                                onClick={() =>
                                  setCollapsedAltIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(alt.id)) next.delete(alt.id);
                                    else next.add(alt.id);
                                    return next;
                                  })
                                }
                              >
                                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                              </button>

                              <span className="ucf-alt-prefix">Camino alternativo N°</span>
                              <input
                                aria-label="Número de Camino Alternativo"
                                className="ucf-alt-num-input"
                                inputMode="numeric"
                                min={1}
                                type="number"
                                value={alt.number}
                                onChange={(event) => {
                                  const parsed = Number.parseInt(event.target.value, 10);
                                  if (Number.isFinite(parsed) && parsed > 0) {
                                    updateAlternativeFlow(alt.id, { number: parsed });
                                  }
                                }}
                              />
                              <span className="ucf-alt-colon">:</span>
                              <input
                                aria-label={`Causa de CA N°${alt.number}`}
                                className="ucf-alt-title-input"
                                placeholder="Descripción concreta de la causa (ej. No existe socio con número ingresado)"
                                ref={(el) => {
                                  if (el === null) altTitleRefs.current.delete(alt.id);
                                  else altTitleRefs.current.set(alt.id, el);
                                }}
                                value={alt.title}
                                onChange={(event) => updateAlternativeFlow(alt.id, { title: event.target.value })}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' && alt.steps[0]) {
                                    event.preventDefault();
                                    setPendingFocusKey(`main:${alt.steps[0].id}`);
                                  }
                                }}
                              />

                              <div className="ucf-alt-meta">
                                {origin ? (
                                  <button
                                    className="ucf-alt-origin"
                                    title="Volver al paso donde se dispara este CA"
                                    type="button"
                                    onClick={() => jumpToStep({ flowId: origin.flowId, stepId: origin.stepId })}
                                  >
                                    {`desde paso ${origin.stepNumber} · ${originFlowName}`}
                                  </button>
                                ) : (
                                  <span className="ucf-alt-origin is-orphan" title="Agregá este CA en la columna Ref. del paso que lo dispara">
                                    sin origen en Ref.
                                  </span>
                                )}

                                <label
                                  className="ucf-start-num-control"
                                  title={`Inicio automático: ${defaultStart} (paso origen + 1). Podés sobreescribirlo si hace falta.`}
                                >
                                  <span>paso</span>
                                  <input
                                    inputMode="numeric"
                                    min={1}
                                    placeholder={String(defaultStart)}
                                    type="number"
                                    value={alt.firstStepNumberOverride ?? ''}
                                    onChange={(event) => {
                                      const parsed = Number.parseInt(event.target.value, 10);
                                      updateAlternativeFlow(alt.id, {
                                        firstStepNumberOverride:
                                          Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
                                      });
                                    }}
                                  />
                                </label>

                                <button
                                  aria-label="Subir camino alternativo"
                                  className="ucf-tiny-btn"
                                  disabled={index === 0}
                                  tabIndex={-1}
                                  type="button"
                                  onClick={() => moveAlternativeFlow(index, -1)}
                                >
                                  ↑
                                </button>
                                <button
                                  aria-label="Bajar camino alternativo"
                                  className="ucf-tiny-btn"
                                  disabled={index === content.alternativeFlows.length - 1}
                                  tabIndex={-1}
                                  type="button"
                                  onClick={() => moveAlternativeFlow(index, 1)}
                                >
                                  ↓
                                </button>
                                <button
                                  aria-label={`Eliminar CA N°${alt.number}`}
                                  className="ucf-tiny-btn is-danger"
                                  tabIndex={-1}
                                  type="button"
                                  onClick={() => deleteAlternativeFlow(alt)}
                                >
                                  <Trash2 size={13} aria-hidden="true" />
                                </button>
                              </div>
                            </div>

                            {isCollapsed ? (
                              <p className="ucf-alt-collapsed-summary">
                                {effectiveStart}. {alt.steps[0]?.title.trim() || 'Sin pasos'} ({alt.steps.length} {alt.steps.length === 1 ? 'paso' : 'pasos'})
                              </p>
                            ) : (
                              <FlowStepsTable
                                collapsedStepIds={collapsedStepIds}
                                content={content}
                                flowId={alt.id}
                                highlightedStepId={highlightedId}
                                numbering={numbering}
                                registerFieldRef={registerFieldRef}
                                steps={alt.steps}
                                symbolIndex={symbolIndex}
                                useCaseNames={useCaseNames}
                                vocabulary={vocabulary}
                                onChangeSteps={(steps) => updateAlternativeFlow(alt.id, { steps })}
                                onCreateAlternativeFromStep={createAlternativeFromStep}
                                onFocusEditable={handleFocusEditable}
                                onJumpToAlternative={jumpToAlternative}
                                onJumpToStep={jumpToStep}
                                onRequestFocusKey={setPendingFocusKey}
                                onToggleCollapseStep={toggleCollapseStep}
                              />
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </section>
            </div>
          )}
        </section>

        {sidePanel === 'class-diagram' ? (
          <ClassDiagramSidePanel
            diagramName={associatedClassDiagram?.name}
            pseudoEntities={pseudoEntities}
            symbolIndex={symbolIndex}
            onClose={() => setSidePanel('none')}
            onInsertToken={handleInsertTokenFromPanel}
          />
        ) : sidePanel === 'review' ? (
          <DiagramReviewPanel
            helper="Comprueba navegabilidad en Leer, clases y atributos contra el DC, referencias a CAs y pasos, Guardar Cambios y cierre de caminos. No bloquea la edición."
            isEmpty={content.basicFlow.length === 0 && content.alternativeFlows.length === 0 && content.description.initialState.length === 0}
            issues={reviewIssues}
            title="Revisión de cátedra"
            onClose={() => setSidePanel('none')}
            onFocus={focusIssue}
          />
        ) : null}
      </div>

      {exportDialogFormat !== null ? (
        <FlowExportDialog
          alternatives={content.alternativeFlows}
          initialFormat={exportDialogFormat}
          onClose={() => setExportDialogFormat(null)}
          onExport={(format, opts) => {
            void runExport(format, opts);
          }}
        />
      ) : null}
    </main>
  );
}
