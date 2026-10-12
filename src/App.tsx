import { accessorAttribute, importChangesModel, importClassesFromSequences } from './utils/sequenceClassImport';
import { createId } from './utils/id';
import { artifactTypeInfo } from './constants/artifactTypes';
import { createExampleProject, findExampleProject } from './utils/exampleProject';
import { useDialogs } from './hooks/useDialogs';
import { useAppUpdate } from './hooks/useAppUpdate';
import { ProjectNameDialog } from './components/ProjectNameDialog';
import { PaletteWelcomeDialog } from './components/PaletteWelcomeDialog';
import { ArtifactImportDialog } from './components/ArtifactImportDialog';
import { ArtifactMoveDialog } from './components/ArtifactMoveDialog';
import { ProjectHome } from './components/ProjectHome';
import { ProjectBackupWarning } from './components/ProjectBackupWarning';
import { ArtifactErrorBoundary } from './components/ArtifactErrorBoundary';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ArtifactTabs } from './components/ArtifactTabs';
import { useArtifactTabs } from './hooks/useArtifactTabs';
import { artifactTabShortcut, closeArtifactTabs, closeOtherArtifactTabs, closeArtifactTabsToRight, openArtifactTab, resolveActiveTab, type ActiveTab, type ArtifactTabState } from './utils/artifactTabs';
import { artifactViewKey, forgetArtifactView } from './utils/artifactViewMemory';
import { downloadProjectFile } from './utils/projectFile';
import { downloadArtifactFile, downloadTextFile } from './utils/artifactFile';
import { relinkArtifactForProject } from './utils/artifactTransfer';
import artifactGuide from '../docs/artifact-json-guide.md?raw';
import { useProjects } from './hooks/useProjects';
import { canOpenFileWindow, openArtifactWindow, openFileWindow } from './storage/nativeWindows';
import {
  collectStoredFiles,
  hasNativeFiles,
  listStoredFileIds,
  pickNativeFiles,
  revealStoredFile,
  storeFile,
} from './storage/projectFiles';
import { countPdfPages } from './utils/pdfjs';
import {
  fileDisplayName,
  projectFiles,
  referencedFileIds,
  rejectionMessage,
  validatePdf,
} from './utils/projectFiles';
import { useTheme } from './hooks/useTheme';
import {
  clampNotebookWidth,
  readNotebookOpen,
  readNotebookWidth,
  readUiPreference,
  writeNotebookOpen,
  writeNotebookWidth,
  writeUiPreference,
} from './storage/uiPreferences';
import { NotebookContext, type NotebookContextValue } from './components/notebook/NotebookContext';
import { NotebookSheet } from './components/notebook/NotebookSheet';
import { countPendingQuestions } from './utils/artifactNotebook';
import { isNotebookEvent, isNotebookShortcut } from './utils/notebookKeyboard';
import { shouldOverlayNotebook } from './utils/notebookLayout';
import { isMacPlatform } from './utils/shortcutLabel';
import type { ArtifactContent, ClassMethod, ClassModelArtifact, ClassSequenceDiagramContent, DesignArtifact, ProjectFile, SequenceDiagramContent } from './types/diagram';
import {
  normalizeClassSequenceDiagramContent,
  normalizeDiagramContent,
  normalizeUseCaseFlowContent,
  normalizeUseCaseModelContent,
} from './utils/diagramNormalization';
import { normalizeSequenceDiagramContent } from './utils/sequenceDiagram';
import { changeHistory, redoHistory, undoHistory, type ArtifactHistory } from './utils/artifactHistory';
import { FileText } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

const DiagramEditor = lazy(() => import('./components/DiagramEditor').then(({ DiagramEditor: editor }) => ({ default: editor })));
const UseCaseModelEditor = lazy(() => import('./components/UseCaseModelEditor').then(({ UseCaseModelEditor: editor }) => ({ default: editor })));
const UseCaseFlowEditor = lazy(() => import('./components/UseCaseFlowEditor').then(({ UseCaseFlowEditor: editor }) => ({ default: editor })));
const SequenceDiagramEditor = lazy(() => import('./components/SequenceDiagramEditor').then(({ SequenceDiagramEditor: editor }) => ({ default: editor })));
const PdfViewer = lazy(() => import('./components/PdfViewer').then(({ PdfViewer: viewer }) => ({ default: viewer })));
const ClassSequenceDiagramEditor = lazy(() => import('./components/ClassSequenceDiagramEditor').then(({ ClassSequenceDiagramEditor: editor }) => ({ default: editor })));

type ProjectDialogState =
  | { mode: 'create'; projectId?: never; initialName: string }
  | { mode: 'rename'; projectId: string; initialName: string }
  | { mode: 'createArtifact'; projectId: string; initialName: string; artifactType: DesignArtifact['type'] }
  | { mode: 'renameArtifact'; projectId: string; artifactId: string; initialName: string }
  | { mode: 'renameFile'; projectId: string; fileId: string; initialName: string };

type ArtifactTransferDialogState =
  | { mode: 'import'; projectId: string }
  | { mode: 'move'; projectId: string; artifactId: string };

const PROJECT_SIDEBAR_COLLAPSED_KEY = 'class-diagram-project-sidebar-collapsed';
const MAX_HISTORY_ENTRIES = 60;
const HISTORY_BURST_WINDOW_MS = 650;

type ProjectHistory = ArtifactHistory<ArtifactContent>;

type ContentChangeOptions = {
  separateHistoryEntry?: boolean;
  alreadyNormalized?: boolean;
};

const cloneArtifactContent = (artifact: DesignArtifact): ArtifactContent => {
  const cloned = JSON.parse(JSON.stringify(artifact.content)) as ArtifactContent;

  if (artifact.type === 'use-case-model') {
    return normalizeUseCaseModelContent(cloned as Parameters<typeof normalizeUseCaseModelContent>[0]);
  }

  if (artifact.type === 'use-case-flow') {
    return normalizeUseCaseFlowContent(cloned as Parameters<typeof normalizeUseCaseFlowContent>[0]);
  }

    if (artifact.type === 'sequence-diagram') {
      return cloned;
    }

    if (artifact.type === 'class-sequence-diagram') {
      return normalizeClassSequenceDiagramContent(cloned as Partial<ClassSequenceDiagramContent>);
    }

  return normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const cloneContentForType = (artifactType: DesignArtifact['type'], content: ArtifactContent): ArtifactContent => {
  const cloned = JSON.parse(JSON.stringify(content)) as ArtifactContent;

  if (artifactType === 'use-case-model') {
    return normalizeUseCaseModelContent(cloned as Parameters<typeof normalizeUseCaseModelContent>[0]);
  }

  if (artifactType === 'use-case-flow') {
    return normalizeUseCaseFlowContent(cloned as Parameters<typeof normalizeUseCaseFlowContent>[0]);
  }

  if (artifactType === 'sequence-diagram') {
    return normalizeSequenceDiagramContent(cloned);
  }

  if (artifactType === 'class-sequence-diagram') {
    return normalizeClassSequenceDiagramContent(cloned as Partial<ClassSequenceDiagramContent>);
  }

  return normalizeDiagramContent(cloned as Parameters<typeof normalizeDiagramContent>[0]);
};

const areArtifactContentsEqual = (left: ArtifactContent, right: ArtifactContent): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const tabIdOf = (tab: ActiveTab): string => tab.kind === 'file' ? tab.file.id : tab.artifact.id;

const blurFocusedElement = (): void => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

function EditorLoadingState() {
  return (
    <main className="editor-shell editor-loading" aria-live="polite">
      <div className="editor-loading-card">
        <span className="editor-loading-dot" aria-hidden="true" />
        <p>Abriendo editor…</p>
      </div>
    </main>
  );
}

function App() {
  const { confirm, notify } = useDialogs();
  const appUpdate = useAppUpdate();
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | null>(null);
  const [artifactTransferDialog, setArtifactTransferDialog] = useState<ArtifactTransferDialogState | null>(null);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(
    () => readUiPreference(PROJECT_SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [historyByArtifactId, setHistoryByArtifactId] = useState<Record<string, ProjectHistory>>({});
  const historyByArtifactIdRef = useRef<Record<string, ProjectHistory>>({});
  const updateHistory = useCallback((update: (current: Record<string, ProjectHistory>) => Record<string, ProjectHistory>): void => {
    const next = update(historyByArtifactIdRef.current);
    historyByArtifactIdRef.current = next;
    setHistoryByArtifactId(next);
  }, []);
  const historyBurstRef = useRef<{ key: string; updatedAt: number } | null>(null);
  const {
    preference: themePreference,
    setPreference: setThemePreference,
    palette,
    paletteChosen,
    setPalette,
    setPreviewPalette,
    theme,
    themeStyle,
  } = useTheme();
  const {
    activeProject,
    activeProjectId,
    backup,
    backupAvailable,
    revealBackups,
    runBackupNow,
    createClassDiagramArtifact,
    createClassSequenceDiagramArtifact,
    createUseCaseFlowArtifact,
    createUseCaseModelArtifact,
    createSequenceDiagramArtifact,
    createProject,
    deleteArtifact,
    deleteProject,
    importProject,
    importProjects,
    importArtifact,
    moveArtifact,
    linkSequenceDiagramsToClassModel,
    convertClassDiagramToSequenceModel,
    projects,
    renameArtifact,
    renameProject,
    saveStatus,
    setActiveArtifactId,
    setActiveProjectId,
    storageWarning,
    recoveryPending,
    storageUnavailable,
    retryStorage,
    downloadRecoveryCopy,
    confirmRecoveryDownload,
    continueWithoutRecovery,
    updateArtifactNotebook,
    updateProjectArtifactContent,
    addProjectFiles,
    renameProjectFile,
    removeProjectFile,
    patchProjectFile,
  } = useProjects();
  const { tabsByProject, activeFileByProject, setOpenArtifactIds, setActiveFileId } = useArtifactTabs(projects, activeProjectId);

  // The active tab is a single thing: a PDF if one was chosen last, otherwise the project's active artifact.
  const getProjectTabState = (projectId: string): ArtifactTabState => {
    const project = projects.find((candidate) => candidate.id === projectId);
    const tab = project === undefined ? null : resolveActiveTab(project, activeFileByProject[projectId]);
    return { openArtifactIds: tabsByProject[projectId] ?? [], activeArtifactId: tab === null ? null : tabIdOf(tab) };
  };

  // Tab ids are artifact ids or file ids; the project only ever stores the artifact one.
  const activateTab = (projectId: string, tabId: string): void => {
    if (projects.find((project) => project.id === projectId)?.files?.some((file) => file.id === tabId)) {
      setActiveFileId(projectId, tabId);
      return;
    }
    setActiveFileId(projectId, null);
    setActiveArtifactId(projectId, tabId);
  };

  const applyTabState = (projectId: string, next: ArtifactTabState, openHomeIfEmpty = true): void => {
    if (projectId === activeProjectId && next.activeArtifactId !== getProjectTabState(projectId).activeArtifactId) blurFocusedElement();
    historyBurstRef.current = null;
    setOpenArtifactIds(projectId, next.openArtifactIds);
    if (next.activeArtifactId !== null) activateTab(projectId, next.activeArtifactId);
    else if (openHomeIfEmpty && projectId === activeProjectId) setActiveProjectId(null);
  };

  const handleCloseArtifactTab = (projectId: string, artifactId: string): void => {
    applyTabState(projectId, closeArtifactTabs(getProjectTabState(projectId), [artifactId]));
  };

  const handleCreateProject = (): void => {
    setProjectDialog({ mode: 'create', initialName: 'Nuevo proyecto' });
  };

  const handleExploreExample = (): void => {
    const example = findExampleProject(projects);
    if (example !== undefined) setActiveProjectId(example.id);
    else importProject(createExampleProject());
  };

  const handleOpenHome = (): void => {
    blurFocusedElement();
    setActiveProjectId(null);
  };

  const handleRenameProject = (projectId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    setProjectDialog({ mode: 'rename', projectId, initialName: project?.name ?? '' });
  };

  const handleConfirmProjectDialog = (name: string, artifactType: DesignArtifact['type'] = 'use-case-model'): void => {
    if (projectDialog?.mode === 'create') {
      createProject(name, artifactType);
    }

    if (projectDialog?.mode === 'rename') {
      renameProject(projectDialog.projectId, name);
    }

    if (projectDialog?.mode === 'createArtifact') {
      if (projectDialog.artifactType === 'use-case-model') {
        createUseCaseModelArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'use-case-flow') {
        createUseCaseFlowArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'sequence-diagram') {
        createSequenceDiagramArtifact(projectDialog.projectId, name);
      } else if (projectDialog.artifactType === 'class-sequence-diagram') {
        createClassSequenceDiagramArtifact(projectDialog.projectId, name);
      } else {
        createClassDiagramArtifact(projectDialog.projectId, name);
      }
      setActiveProjectId(projectDialog.projectId);
    }

    if (projectDialog?.mode === 'renameArtifact') {
      renameArtifact(projectDialog.projectId, projectDialog.artifactId, name);
    }

    if (projectDialog?.mode === 'renameFile') {
      renameProjectFile(projectDialog.projectId, projectDialog.fileId, name);
    }

    setProjectDialog(null);
  };

  const handleDeleteProject = async (projectId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const shouldDelete = await confirm({
      title: `¿Eliminar "${project?.name ?? 'este proyecto'}"?`,
      description: 'Se borran todos sus artefactos y el historial de cambios. No se puede deshacer.',
    });

    if (shouldDelete) {
      deleteProject(projectId);
      for (const artifact of project?.artifacts ?? []) forgetArtifactView(artifactViewKey(projectId, artifact.id));
      updateHistory((currentHistory) =>
        Object.fromEntries(Object.entries(currentHistory).filter(([key]) => !key.startsWith(`${projectId}:`))),
      );
      historyBurstRef.current = null;
    }
  };

  const handleCreateArtifact = (projectId: string, artifactType: DesignArtifact['type']): void => {
    setProjectDialog({
      mode: 'createArtifact',
      projectId,
      artifactType,
      initialName: artifactTypeInfo(artifactType).label,
    });
  };

  const handleRenameArtifact = (projectId: string, artifactId: string): void => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);

    setProjectDialog({
      mode: 'renameArtifact',
      projectId,
      artifactId,
      initialName: artifact?.name ?? '',
    });
  };

  const handleDeleteArtifact = async (projectId: string, artifactId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);

    if ((project?.artifacts.length ?? 0) <= 1) {
      await notify({
        title: 'El proyecto necesita al menos un artefacto',
        description: 'Creá otro artefacto antes de eliminar este.',
      });
      return;
    }

    const shouldDelete = await confirm({
      title: `¿Eliminar "${artifact?.name ?? 'este artefacto'}"?`,
      description: 'Se pierde su contenido y su historial de cambios. No se puede deshacer.',
    });

    if (shouldDelete) {
      deleteArtifact(projectId, artifactId);
      handleCloseArtifactTab(projectId, artifactId);
      forgetArtifactView(artifactViewKey(projectId, artifactId));
      updateHistory((currentHistory) => {
        const nextHistory = { ...currentHistory };
        delete nextHistory[`${projectId}:${artifactId}`];
        return nextHistory;
      });
      historyBurstRef.current = null;
    }
  };

  const handleSelectFile = (projectId: string, fileId: string): void => {
    blurFocusedElement();
    historyBurstRef.current = null;
    setActiveProjectId(projectId);
    setOpenArtifactIds(projectId, openArtifactTab(getProjectTabState(projectId), fileId).openArtifactIds);
    setActiveFileId(projectId, fileId);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // What the browser's file picker was opened for: new PDFs for a project, or the bytes of one that went missing.
  const pendingFilePickRef = useRef<{ projectId: string; replaceFileId?: string } | null>(null);
  const [unavailableFileIds, setUnavailableFileIds] = useState<ReadonlySet<string>>(new Set());
  const [storeRevision, setStoreRevision] = useState(0);
  const [fileReloads, setFileReloads] = useState<Record<string, number>>({});
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const fileDragDepthRef = useRef(0);

  const reportRejections = async (messages: string[]): Promise<void> => {
    if (messages.length === 0) return;
    await notify({
      title: messages.length === 1 ? 'No se pudo agregar el archivo' : 'Algunos archivos no se agregaron',
      description: messages.join(' '),
    });
  };

  // The bytes are stored first and only then does the project learn about the file: a failure leaves nothing half-added.
  const addPdfFiles = async (projectId: string, files: File[]): Promise<void> => {
    const added: ProjectFile[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const rejection = await validatePdf(file);
      if (rejection !== null) {
        problems.push(rejectionMessage(file.name, rejection));
        continue;
      }
      const id = createId();
      try {
        await storeFile(id, file);
      } catch {
        problems.push(`No se pudo guardar «${file.name}».`);
        continue;
      }
      added.push({ id, name: file.name, size: file.size, addedAt: new Date().toISOString() });
      void countPdfPages(file).then((pageCount) => {
        if (pageCount !== null) patchProjectFile(projectId, id, { pageCount });
      });
    }
    if (added.length > 0) {
      addProjectFiles(projectId, added);
      setStoreRevision((revision) => revision + 1);
      handleSelectFile(projectId, added[0].id);
    }
    await reportRejections(problems);
  };

  const replacePdfFile = async (projectId: string, fileId: string, file: File): Promise<void> => {
    const rejection = await validatePdf(file);
    if (rejection !== null) {
      await reportRejections([rejectionMessage(file.name, rejection)]);
      return;
    }
    try {
      await storeFile(fileId, file);
    } catch {
      await reportRejections([`No se pudo guardar «${file.name}».`]);
      return;
    }
    patchProjectFile(projectId, fileId, { size: file.size, pageCount: await countPdfPages(file) ?? undefined });
    setStoreRevision((revision) => revision + 1);
    setFileReloads((current) => ({ ...current, [fileId]: (current[fileId] ?? 0) + 1 }));
  };

  // On the Mac the system panel copies the PDFs straight into the store; elsewhere the browser's picker hands them over.
  const startFilePick = async (projectId: string, replaceFileId?: string): Promise<void> => {
    if (!hasNativeFiles()) {
      pendingFilePickRef.current = { projectId, replaceFileId };
      fileInputRef.current?.click();
      return;
    }
    let result: Awaited<ReturnType<typeof pickNativeFiles>>;
    try {
      result = await pickNativeFiles(replaceFileId);
    } catch {
      await reportRejections(['No se pudo abrir el selector de archivos.']);
      return;
    }
    if (result === null) return;
    const reasons = { 'too-large': 'too-large', empty: 'empty', 'not-pdf': 'not-pdf', failed: 'failed' } as const;
    await reportRejections(result.rejected.map(({ name, reason }) =>
      reasons[reason] === 'failed' ? `No se pudo guardar «${name}».` : rejectionMessage(name, reasons[reason])));
    if (result.files.length === 0) return;
    setStoreRevision((revision) => revision + 1);
    if (replaceFileId !== undefined) {
      patchProjectFile(projectId, replaceFileId, { size: result.files[0].size });
      setFileReloads((current) => ({ ...current, [replaceFileId]: (current[replaceFileId] ?? 0) + 1 }));
      return;
    }
    addProjectFiles(projectId, result.files.map((file) => ({ ...file, addedAt: new Date().toISOString() })));
    handleSelectFile(projectId, result.files[0].id);
  };

  const handleFileInputChange = (files: File[]): void => {
    const pending = pendingFilePickRef.current;
    pendingFilePickRef.current = null;
    if (pending === null || files.length === 0) return;
    if (pending.replaceFileId !== undefined) void replacePdfFile(pending.projectId, pending.replaceFileId, files[0]);
    else void addPdfFiles(pending.projectId, files);
  };

  const handleRenameFile = (projectId: string, fileId: string): void => {
    const file = projectFiles(projects.find((candidate) => candidate.id === projectId) ?? {}).find((candidate) => candidate.id === fileId);
    if (file !== undefined) setProjectDialog({ mode: 'renameFile', projectId, fileId, initialName: fileDisplayName(file.name) });
  };

  const handleRemoveFile = async (projectId: string, fileId: string): Promise<void> => {
    const file = projectFiles(projects.find((candidate) => candidate.id === projectId) ?? {}).find((candidate) => candidate.id === fileId);
    if (file === undefined) return;
    const shouldRemove = await confirm({
      title: `¿Quitar "${fileDisplayName(file.name)}" del proyecto?`,
      description: 'El PDF deja de estar en el proyecto y se cierra su pestaña. Los diagramas no se tocan.',
      confirmLabel: 'Quitar',
    });
    if (!shouldRemove) return;
    const next = closeArtifactTabs(getProjectTabState(projectId), [fileId]);
    setOpenArtifactIds(projectId, next.openArtifactIds);
    if (next.activeArtifactId !== null) activateTab(projectId, next.activeArtifactId);
    else setActiveFileId(projectId, null);
    removeProjectFile(projectId, fileId);
  };

  const handleOpenFileWindow = (projectId: string, fileId: string): void => {
    const file = projectFiles(projects.find((candidate) => candidate.id === projectId) ?? {}).find((candidate) => candidate.id === fileId);
    if (file !== undefined) openFileWindow(projectId, fileId, `${fileDisplayName(file.name)} · vista`);
  };

  // Which PDFs are really stored here: a project from another machine lists files this one does not have.
  const referencedIdsKey = referencedFileIds(projects).join(',');
  useEffect(() => {
    if (referencedIdsKey === '') return undefined;
    let cancelled = false;
    void listStoredFileIds().then((stored) => {
      if (cancelled) return;
      const present = new Set(stored ?? referencedIdsKey.split(','));
      setUnavailableFileIds(new Set(referencedIdsKey.split(',').filter((id) => !present.has(id))));
    });
    return () => { cancelled = true; };
  }, [referencedIdsKey, storeRevision]);

  // Housekeeping, once and only after a clean load: a project that failed to read must never make its PDFs look orphaned.
  const fileCollectionDoneRef = useRef(false);
  useEffect(() => {
    if (fileCollectionDoneRef.current || projects.length === 0 || storageWarning !== null || recoveryPending || storageUnavailable) return;
    fileCollectionDoneRef.current = true;
    void collectStoredFiles(referencedFileIds(projects));
  }, [projects, recoveryPending, storageUnavailable, storageWarning]);

  // Dropping PDFs from Finder anywhere in the window adds them to the open project. The page must always take
  // the drop, or the web view would navigate to the file.
  const dropFiles = useEffectEvent((files: File[]): void => {
    if (activeProject === null) {
      void notify({ title: 'Abrí un proyecto primero', description: 'Para guardar un PDF, abrí el proyecto donde lo querés y soltalo ahí.' });
      return;
    }
    void addPdfFiles(activeProject.id, files);
  });
  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') === true;
    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      fileDragDepthRef.current += 1;
      setIsFileDragActive(true);
    };
    const onOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
      if (fileDragDepthRef.current === 0) setIsFileDragActive(false);
    };
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      fileDragDepthRef.current = 0;
      setIsFileDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) dropFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const handleConvertToSequenceModel = async (projectId: string, artifactId: string): Promise<void> => {
    const project = projects.find((currentProject) => currentProject.id === projectId);
    const artifact = project?.artifacts.find((currentArtifact) => currentArtifact.id === artifactId);
    if (artifact?.type !== 'class-diagram') return;
    const shouldConvert = await confirm({
      title: `¿Convertir "${artifact.name}" en clases de secuencias?`,
      description: 'Conserva las clases y las relaciones, se vincula con las secuencias que todavía no tienen modelo y desde ahí se sincroniza con ellas. Deja de ser un diagrama de clases común. Si querés conservar el original, exportalo antes.',
      confirmLabel: 'Convertir',
      tone: 'neutral',
    });
    if (!shouldConvert) return;
    convertClassDiagramToSequenceModel(projectId, artifactId);
    // Earlier snapshots belong to the class diagram it was; undoing into them
    // would mix both kinds of content.
    updateHistory((currentHistory) => {
      const nextHistory = { ...currentHistory };
      delete nextHistory[`${projectId}:${artifactId}`];
      return nextHistory;
    });
    historyBurstRef.current = null;
    handleSelectArtifact(projectId, artifactId);
  };

  const handleSelectArtifact = (projectId: string, artifactId: string): void => {
    if (projectId !== activeProjectId || artifactId !== activeProject?.activeArtifactId || activeFileByProject[projectId]) blurFocusedElement();
    historyBurstRef.current = null;
    setActiveProjectId(projectId);
    setActiveFileId(projectId, null);
    setActiveArtifactId(projectId, artifactId);
  };

  // A read-only window asks to edit its diagram here: the main window is the only one that saves.
  const selectArtifactFromWindow = useEffectEvent((projectId: string, artifactId: string): void => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project?.artifacts.some((artifact) => artifact.id === artifactId)) return;
    const tabState = getProjectTabState(projectId);
    if (!tabState.openArtifactIds.includes(artifactId)) setOpenArtifactIds(projectId, [...tabState.openArtifactIds, artifactId]);
    handleSelectArtifact(projectId, artifactId);
  });
  useEffect(() => {
    const onSelect = (event: Event): void => {
      const detail = (event as CustomEvent<{ projectId?: string; artifactId?: string }>).detail;
      if (detail?.projectId && detail?.artifactId) selectArtifactFromWindow(detail.projectId, detail.artifactId);
    };
    window.addEventListener('modelador:select-artifact', onSelect);
    return () => window.removeEventListener('modelador:select-artifact', onSelect);
  }, []);

  const activeTab = useMemo(
    () => (activeProject !== null ? resolveActiveTab(activeProject, activeFileByProject[activeProject.id]) : null),
    [activeFileByProject, activeProject],
  );
  // With a PDF in front there is no active artifact: no editor is mounted, and history, Apuntes and the
  // artifact shortcuts have nothing to act on, so ⌘Z can never reach a diagram that is not on screen.
  const activeFile = activeTab?.kind === 'file' ? activeTab.file : null;
  const activeArtifact = activeTab?.kind === 'artifact' ? activeTab.artifact : null;
  const isFileActive = activeFile !== null;
  const isProjectHome = activeProject === null || activeTab === null;
  const openArtifactIds = useMemo(() => activeProject === null ? [] : tabsByProject[activeProject.id] ?? [], [activeProject, tabsByProject]);
  const activeHistoryKey = activeProject !== null && activeArtifact !== null
    ? `${activeProject.id}:${activeArtifact.id}`
    : null;
  const activeProjectHistory = useMemo(
    () => (activeHistoryKey !== null ? historyByArtifactId[activeHistoryKey] : undefined),
    [activeHistoryKey, historyByArtifactId],
  );

  const canUndo = (activeProjectHistory?.past.length ?? 0) > 0;
  const canRedo = (activeProjectHistory?.future.length ?? 0) > 0;

  const handleChangeProjectContent = useCallback(
    (content: ArtifactContent, options?: ContentChangeOptions): void => {
      if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
        return;
      }

      let previousContent: ArtifactContent;
      let nextContent: ArtifactContent;
      if (activeArtifact.type === 'sequence-diagram' && options?.alreadyNormalized) {
        const previousSerialized = JSON.stringify(activeArtifact.content);
        const nextSerialized = JSON.stringify(content);
        if (previousSerialized === nextSerialized) return;
        previousContent = JSON.parse(previousSerialized) as ArtifactContent;
        nextContent = JSON.parse(nextSerialized) as ArtifactContent;
      } else {
        previousContent = cloneArtifactContent(activeArtifact);
        nextContent = cloneContentForType(activeArtifact.type, content);
        if (areArtifactContentsEqual(previousContent, nextContent)) return;
      }

      const now = performance.now();
      const previousBurst = historyBurstRef.current;
      const shouldCreateHistoryEntry =
        options?.separateHistoryEntry === true ||
        previousBurst === null ||
        previousBurst.key !== activeHistoryKey ||
        now - previousBurst.updatedAt > HISTORY_BURST_WINDOW_MS;
      historyBurstRef.current = options?.separateHistoryEntry === true
        ? null
        : { key: activeHistoryKey, updatedAt: now };

      const projectHistory = historyByArtifactIdRef.current[activeHistoryKey] ?? { past: [], future: [] };
      const nextHistory = changeHistory(projectHistory, previousContent, shouldCreateHistoryEntry, MAX_HISTORY_ENTRIES);
      updateHistory((currentHistory) => ({ ...currentHistory, [activeHistoryKey]: nextHistory }));
      updateProjectArtifactContent(activeProject.id, activeArtifact.id, nextContent, {
        alreadyNormalized: true, historySnapshots: [...nextHistory.past, ...nextHistory.future],
      });
    },
    [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent],
  );

  const handleCreateClassMethodFromSequence = useCallback(
    (artifactId: string, nodeId: string, method: ClassMethod): void => {
      if (activeProject === null) {
        return;
      }

      const modelArtifact = activeProject.artifacts.find(
        (candidate): candidate is ClassModelArtifact => candidate.id === artifactId
          && (candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram'),
      );

      if (modelArtifact === undefined) {
        return;
      }

      const classNode = modelArtifact.content.nodes.find((node) => node.id === nodeId);
      if (classNode === undefined || classNode.data.methods.some((candidate) => candidate.id === method.id)) {
        return;
      }

      const previousContent = cloneArtifactContent(modelArtifact);
      const attribute = accessorAttribute(method);
      const addAttribute = attribute !== null && !classNode.data.attributes.some(
        (existing) => existing.name.trim().toLocaleLowerCase() === attribute.name.toLocaleLowerCase(),
      );
      const nextContent = {
        ...modelArtifact.content,
        nodes: modelArtifact.content.nodes.map((node) => node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                methods: [...node.data.methods, method],
                attributes: addAttribute && attribute ? [...node.data.attributes, { id: createId(), ...attribute }] : node.data.attributes,
              },
            }
          : node),
      };
      const normalizedNextContent = cloneContentForType(modelArtifact.type, nextContent);
      const historyKey = `${activeProject.id}:${modelArtifact.id}`;

      updateHistory((currentHistory) => {
        const modelHistory = currentHistory[historyKey] ?? { past: [], future: [] };
        return {
          ...currentHistory,
          [historyKey]: changeHistory(modelHistory, previousContent, true, MAX_HISTORY_ENTRIES),
        };
      });
      historyBurstRef.current = null;
      updateProjectArtifactContent(activeProject.id, modelArtifact.id, normalizedNextContent, { alreadyNormalized: true });
    },
    [activeProject, updateHistory, updateProjectArtifactContent],
  );

  const handleCompleteClassMethodParameters = useCallback(
    (artifactId: string, nodeId: string, methodId: string, parameters: string): void => {
      if (activeProject === null) return;
      const modelArtifact = activeProject.artifacts.find(
        (candidate): candidate is ClassModelArtifact => candidate.id === artifactId
          && (candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram'),
      );
      const classNode = modelArtifact?.content.nodes.find((node) => node.id === nodeId);
      const method = classNode?.data.methods.find((candidate) => candidate.id === methodId);
      // Parameters the student already wrote are never replaced.
      if (modelArtifact === undefined || method === undefined || method.parameters.trim() !== '' || parameters.trim() === '') return;
      const previousContent = cloneArtifactContent(modelArtifact);
      const nextContent = {
        ...modelArtifact.content,
        nodes: modelArtifact.content.nodes.map((node) => node.id === nodeId
          ? { ...node, data: { ...node.data, methods: node.data.methods.map((candidate) => candidate.id === methodId ? { ...candidate, parameters } : candidate) } }
          : node),
      };
      const normalizedNextContent = cloneContentForType(modelArtifact.type, nextContent);
      const historyKey = `${activeProject.id}:${modelArtifact.id}`;
      updateHistory((currentHistory) => {
        const modelHistory = currentHistory[historyKey] ?? { past: [], future: [] };
        return {
          ...currentHistory,
          [historyKey]: changeHistory(modelHistory, previousContent, true, MAX_HISTORY_ENTRIES),
        };
      });
      historyBurstRef.current = null;
      updateProjectArtifactContent(activeProject.id, modelArtifact.id, normalizedNextContent, { alreadyNormalized: true });
    },
    [activeProject, updateHistory, updateProjectArtifactContent],
  );

  const handleImportSequenceIntoClassModel = useCallback(
    (artifactId: string, sequenceContent: SequenceDiagramContent): void => {
      if (activeProject === null || activeArtifact?.type !== 'sequence-diagram') return;
      const modelArtifact = activeProject.artifacts.find(
        (candidate): candidate is ClassModelArtifact => candidate.id === artifactId
          && (candidate.type === 'class-diagram' || candidate.type === 'class-sequence-diagram'),
      );
      if (!modelArtifact) return;
      const { content, summary } = importClassesFromSequences(modelArtifact.content, [sequenceContent]);
      const needsLink = modelArtifact.type === 'class-sequence-diagram' && !modelArtifact.content.linkedSequenceDiagramIds.includes(activeArtifact.id);
      if (!needsLink && !importChangesModel(summary)) return;
      const previousContent = cloneArtifactContent(modelArtifact);
      const nextContent = modelArtifact.type === 'class-sequence-diagram'
        ? { ...content, linkedSequenceDiagramIds: [...new Set([...modelArtifact.content.linkedSequenceDiagramIds, activeArtifact.id])] }
        : content;
      const normalizedNextContent = cloneContentForType(modelArtifact.type, nextContent);
      const historyKey = `${activeProject.id}:${modelArtifact.id}`;
      updateHistory((currentHistory) => {
        const modelHistory = currentHistory[historyKey] ?? { past: [], future: [] };
        return {
          ...currentHistory,
          [historyKey]: changeHistory(modelHistory, previousContent, true, MAX_HISTORY_ENTRIES),
        };
      });
      historyBurstRef.current = null;
      updateProjectArtifactContent(activeProject.id, modelArtifact.id, normalizedNextContent, { alreadyNormalized: true });
    },
    [activeProject, activeArtifact, updateHistory, updateProjectArtifactContent],
  );

  const handleUndo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactIdRef.current[activeHistoryKey];
    const result = projectHistory ? undoHistory(projectHistory, cloneArtifactContent(activeArtifact), MAX_HISTORY_ENTRIES) : undefined;
    const previousContent = result?.content;

    if (projectHistory === undefined || result === undefined || previousContent === undefined) {
      return;
    }

    historyBurstRef.current = null;

    updateHistory((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: result.history,
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, previousContent), { alreadyNormalized: true, fromHistory: true, historySnapshots: [...result.history.past, ...result.history.future] });
  }, [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent]);

  const handleRedo = useCallback((): void => {
    if (activeProject === null || activeArtifact === null || activeHistoryKey === null) {
      return;
    }

    const projectHistory = historyByArtifactIdRef.current[activeHistoryKey];
    const result = projectHistory ? redoHistory(projectHistory, cloneArtifactContent(activeArtifact), MAX_HISTORY_ENTRIES) : undefined;
    const nextContent = result?.content;

    if (projectHistory === undefined || result === undefined || nextContent === undefined) {
      return;
    }

    historyBurstRef.current = null;

    updateHistory((currentHistory) => ({
      ...currentHistory,
      [activeHistoryKey]: result.history,
    }));
    updateProjectArtifactContent(activeProject.id, activeArtifact.id, cloneContentForType(activeArtifact.type, nextContent), { alreadyNormalized: true, fromHistory: true, historySnapshots: [...result.history.past, ...result.history.future] });
  }, [activeArtifact, activeHistoryKey, activeProject, updateHistory, updateProjectArtifactContent]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent): void => {
      if ((!event.metaKey && !event.ctrlKey) || document.querySelector('.modal-backdrop') !== null) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const isEditing = target?.closest('input, textarea, select, [contenteditable="true"]') !== null;

      // The notebook sketch is an SVG, not an input: ⌘Z there belongs to the sketch.
      if (isEditing || isNotebookEvent(event)) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsRedo = (key === 'z' && event.shiftKey) || key === 'y';
      const wantsUndo = key === 'z' && !event.shiftKey;

      if (wantsRedo && canRedo) {
        event.preventDefault();
        handleRedo();
      } else if (wantsUndo && canUndo) {
        event.preventDefault();
        handleUndo();
      }
    };

    document.addEventListener('keydown', handleHistoryShortcut);
    return () => document.removeEventListener('keydown', handleHistoryShortcut);
  }, [canRedo, canUndo, handleRedo, handleUndo]);

  useEffect(() => {
    writeUiPreference(PROJECT_SIDEBAR_COLLAPSED_KEY, String(isProjectSidebarCollapsed));
  }, [isProjectSidebarCollapsed]);

  useEffect(() => {
    if (activeProject === null || activeTab === null) return;
    const handleTabShortcut = (event: KeyboardEvent): void => {
      if (document.querySelector('.modal-backdrop, [aria-modal="true"], dialog[open]') !== null) return;
      const state = { openArtifactIds, activeArtifactId: tabIdOf(activeTab) };
      const action = artifactTabShortcut(event, state, /Mac|iPhone|iPad/.test(navigator.platform));
      if (action === null) return;
      event.preventDefault();
      event.stopPropagation();
      blurFocusedElement();
      historyBurstRef.current = null;
      if (action.type === 'close') {
        const next = closeArtifactTabs(state, [action.artifactId]);
        setOpenArtifactIds(activeProject.id, next.openArtifactIds);
        if (next.activeArtifactId !== null) activateTab(activeProject.id, next.activeArtifactId);
        else setActiveProjectId(null);
      } else activateTab(activeProject.id, action.artifactId);
    };
    document.addEventListener('keydown', handleTabShortcut, true);
    return () => document.removeEventListener('keydown', handleTabShortcut, true);
  });

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Apuntes: one global open/closed state and width; the sheet itself is keyed by artifact.
  const [isNotebookOpen, setIsNotebookOpen] = useState(readNotebookOpen);
  const [notebookWidth, setNotebookWidth] = useState(readNotebookWidth);
  // Focus requests belong to one artifact: remounting for another tab (or coming back) must not steal focus.
  const [notebookFocus, setNotebookFocus] = useState<{ key: string | null; count: number }>({ key: activeHistoryKey, count: 0 });
  if (notebookFocus.key !== activeHistoryKey) setNotebookFocus({ key: activeHistoryKey, count: 0 });
  const [workspaceWidth, setWorkspaceWidth] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const isNotebookOverlay = workspaceWidth !== null && shouldOverlayNotebook(workspaceWidth, notebookWidth);
  const pendingQuestionCount = useMemo(() => countPendingQuestions(activeArtifact?.notebook), [activeArtifact?.notebook]);

  useEffect(() => { writeNotebookOpen(isNotebookOpen); }, [isNotebookOpen]);
  useEffect(() => { writeNotebookWidth(notebookWidth); }, [notebookWidth]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return undefined;
    const observer = new ResizeObserver(() => setWorkspaceWidth(workspace.clientWidth));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [isProjectHome, isFileActive]);

  const returnFocusToCanvas = useCallback((): void => {
    const panel = document.getElementById('artifact-editor-panel');
    const target = panel?.querySelector<HTMLElement>('[data-editor-canvas]') ?? panel;
    target?.focus({ preventScroll: true });
  }, []);

  const closeNotebook = useCallback((): void => {
    setIsNotebookOpen(false);
    returnFocusToCanvas();
  }, [returnFocusToCanvas]);

  const toggleNotebook = useCallback((): void => {
    if (activeHistoryKey === null) return;
    if (isNotebookOpen) {
      closeNotebook();
      return;
    }
    const key = activeHistoryKey;
    setNotebookFocus({ key, count: 0 });
    setIsNotebookOpen(true);
    // Asked after the sheet mounted, so it takes focus at its end whichever way it watches the prop.
    window.requestAnimationFrame(() => {
      setNotebookFocus((current) => (current.key === key ? { key, count: current.count + 1 } : current));
    });
  }, [activeHistoryKey, closeNotebook, isNotebookOpen]);

  // ⇧⌘E opens or closes Apuntes from anywhere, even inside the sheet or a text field
  // (capture phase), so it never reaches the editors' own shortcuts.
  useEffect(() => {
    if (activeHistoryKey === null) return undefined;
    const handleNotebookShortcut = (event: KeyboardEvent): void => {
      if (event.repeat || !isNotebookShortcut(event, isMacPlatform())) return;
      if (document.querySelector('.modal-backdrop, [aria-modal="true"], dialog[open]') !== null) return;
      event.preventDefault();
      event.stopPropagation();
      toggleNotebook();
    };
    document.addEventListener('keydown', handleNotebookShortcut, true);
    return () => document.removeEventListener('keydown', handleNotebookShortcut, true);
  }, [activeHistoryKey, toggleNotebook]);

  const notebookContext = useMemo<NotebookContextValue>(
    () => ({ available: true, isOpen: isNotebookOpen, toggle: toggleNotebook, pendingCount: pendingQuestionCount }),
    [isNotebookOpen, pendingQuestionCount, toggleNotebook],
  );

  // `?` opens the shortcuts panel and ⌘\ toggles the sidebar, unless the user is typing.
  useEffect(() => {
    const handleHelpShortcut = (event: KeyboardEvent): void => {
      if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed);
        return;
      }
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || isNotebookEvent(event)) return;
      event.preventDefault();
      setIsShortcutsOpen((open) => !open);
    };
    document.addEventListener('keydown', handleHelpShortcut);
    return () => document.removeEventListener('keydown', handleHelpShortcut);
  }, []);

  const handleExportProject = (projectId: string): void => {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project !== undefined) void downloadProjectFile(project);
  };

  const handleExportArtifact = (projectId: string, artifactId: string): void => {
    const artifact = projects.find((project) => project.id === projectId)?.artifacts.find((candidate) => candidate.id === artifactId);
    if (artifact) void downloadArtifactFile(artifact);
  };

  const handleDownloadArtifactGuide = (): void => {
    void downloadTextFile(artifactGuide, 'guia-artefactos-ia.md', 'text/markdown;charset=utf-8');
  };

  const transferProject = projects.find((project) => project.id === artifactTransferDialog?.projectId);
  const transferArtifact = artifactTransferDialog?.mode === 'move'
    ? transferProject?.artifacts.find((artifact) => artifact.id === artifactTransferDialog.artifactId)
    : undefined;

  const handleMoveArtifact = (targetProjectId: string, includeLinked: boolean): void => {
    if (!transferProject || !transferArtifact) return;
    const result = moveArtifact(transferProject.id, targetProjectId, transferArtifact.id, includeLinked);
    if (result.idMap.size === 0) return;
    applyTabState(transferProject.id, closeArtifactTabs(getProjectTabState(transferProject.id), [...result.idMap.keys()]), false);
    updateHistory((currentHistory) => {
      const nextHistory = { ...currentHistory };
      // Carry undo/redo with the artifact, and keep old snapshots from restoring links across projects.
      for (const project of result.projects.filter((candidate) => candidate.id === transferProject.id || candidate.id === targetProjectId)) {
        for (const artifact of project.artifacts) {
          const oldId = project.id === targetProjectId
            ? [...result.idMap].find(([, newId]) => newId === artifact.id)?.[0]
            : undefined;
          if (project.id === targetProjectId && !oldId) continue;
          if (!oldId && transferProject.artifacts.find((candidate) => candidate.id === artifact.id)?.content === artifact.content) continue;
          const oldKey = `${oldId ? transferProject.id : project.id}:${oldId ?? artifact.id}`;
          const history = currentHistory[oldKey];
          if (!history) continue;
          const context = oldId ? project.artifacts.filter((candidate) => [...result.idMap.values()].includes(candidate.id)) : project.artifacts;
          const sanitize = (content: ArtifactContent): ArtifactContent => relinkArtifactForProject(
            { ...artifact, content } as DesignArtifact, context, oldId ? result.idMap : undefined, transferProject.artifacts,
          ).content;
          delete nextHistory[oldKey];
          nextHistory[`${project.id}:${artifact.id}`] = { past: history.past.map(sanitize), future: history.future.map(sanitize) };
        }
      }
      return nextHistory;
    });
    historyBurstRef.current = null;
    setArtifactTransferDialog(null);
  };

  return (
    <div
      className={`app-shell ${isProjectSidebarCollapsed ? 'project-sidebar-collapsed' : 'project-sidebar-expanded'} ${isProjectHome ? 'project-home-mode' : ''}`}
      data-theme={theme.id} data-appearance={theme.appearance} data-palette={theme.palette}
      data-ui-version="refined"
      style={themeStyle}
    >
      {storageWarning !== null ? (
        <div className="app-storage-warning" role="status">
          <span>{storageWarning}</span>
          {storageUnavailable ? (
            <button className="home-button" type="button" onClick={retryStorage}>Reintentar</button>
          ) : null}
          {recoveryPending ? (
            <div className="storage-warning-actions">
              <button className="home-button" type="button" onClick={async () => {
                if (await downloadRecoveryCopy()) {
                  const saved = await confirm({
                    title: '¿Guardaste la copia de seguridad?',
                    confirmLabel: 'Sí, guardé la copia',
                    tone: 'neutral',
                    description: 'Revisá que el archivo se haya guardado antes de continuar. Si cancelaste la descarga, elegí Cancelar.',
                  });
                  if (saved) confirmRecoveryDownload();
                }
              }}>Descargar copia de seguridad</button>
              <button className="home-button" type="button" onClick={async () => {
                const proceed = await confirm({
                  title: '¿Seguir sin copia de seguridad?',
                  confirmLabel: 'Seguir sin copia',
                  description: 'El próximo guardado reemplaza el original. Podés perder el trabajo que no se pudo leer.',
                });
                if (proceed) continueWithoutRecovery();
              }}>Seguir sin copia</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ProjectSidebar
        activeArtifactId={activeArtifact?.id ?? null}
        activeFileId={activeFile?.id ?? null}
        activeProjectId={activeProjectId}
        isCollapsed={isProjectSidebarCollapsed}
        isHome={isProjectHome}
        onCreateArtifact={handleCreateArtifact}
        onCreateProject={handleCreateProject}
        onExportProject={handleExportProject}
        onExportArtifact={handleExportArtifact}
        onImportArtifact={(projectId) => setArtifactTransferDialog({ mode: 'import', projectId })}
        onMoveArtifact={(projectId, artifactId) => setArtifactTransferDialog({ mode: 'move', projectId, artifactId })}
        onConvertToSequenceModel={(projectId, artifactId) => { void handleConvertToSequenceModel(projectId, artifactId); }}
        onOpenHome={handleOpenHome}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onDeleteArtifact={handleDeleteArtifact}
        onDeleteProject={handleDeleteProject}
        onDismissUpdate={appUpdate.dismissUpdate}
        onRenameArtifact={handleRenameArtifact}
        onRenameProject={handleRenameProject}
        onSelectArtifact={handleSelectArtifact}
        onSelectFile={handleSelectFile}
        onAddFiles={(projectId) => { void startFilePick(projectId); }}
        onOpenFileWindow={handleOpenFileWindow}
        onRenameFile={handleRenameFile}
        onRevealFile={revealStoredFile}
        onRemoveFile={(projectId, fileId) => { void handleRemoveFile(projectId, fileId); }}
        canRevealFiles={hasNativeFiles()}
        canOpenFileWindow={canOpenFileWindow()}
        unavailableFileIds={unavailableFileIds}
        onSelectProject={setActiveProjectId}
        onToggleCollapsed={() => setIsProjectSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onThemePreferenceChange={setThemePreference}
        palette={palette}
        onPaletteChange={setPalette}
        projects={projects}
        themePreference={themePreference}
        update={appUpdate.visibleUpdate}
      />
      {isProjectHome ? (
        <ProjectHome
          backup={backup}
          backupAvailable={backupAvailable}
          onRevealBackups={() => void revealBackups()}
          onRetryBackup={() => void runBackupNow()}
          projects={projects}
          onCreateProject={handleCreateProject}
          onExploreExample={handleExploreExample}
          onImportProject={importProject}
          onImportProjects={importProjects}
          onOpenProject={setActiveProjectId}
        />
      ) : (
        <div className={`artifact-editor-column ${backup.error !== null ? 'has-backup-error' : ''}`}>
          <ArtifactTabs
            key={activeProject.id}
            projectName={activeProject.name}
            artifacts={activeProject.artifacts}
            files={activeProject.files}
            openArtifactIds={openArtifactIds}
            activeArtifactId={tabIdOf(activeTab)}
            onSelect={(tabId) => activeProject.files?.some((file) => file.id === tabId)
              ? handleSelectFile(activeProject.id, tabId)
              : handleSelectArtifact(activeProject.id, tabId)}
            onClose={(artifactId) => handleCloseArtifactTab(activeProject.id, artifactId)}
            onCloseOthers={(artifactId) => applyTabState(activeProject.id, closeOtherArtifactTabs(getProjectTabState(activeProject.id), artifactId))}
            onCloseRight={(artifactId) => applyTabState(activeProject.id, closeArtifactTabsToRight(getProjectTabState(activeProject.id), artifactId))}
            onReorder={(ids) => setOpenArtifactIds(activeProject.id, ids)}
            onOpenInWindow={(artifactId) => openArtifactWindow(
              activeProject.id,
              artifactId,
              `${activeProject.artifacts.find((candidate) => candidate.id === artifactId)?.name ?? 'Diagrama'} · vista`,
            )}
            onOpenFileInWindow={canOpenFileWindow() ? (fileId) => handleOpenFileWindow(activeProject.id, fileId) : undefined}
          />
          <ProjectBackupWarning
            error={backup.error}
            saveStatus={saveStatus}
            onRetry={() => void runBackupNow()}
            onExport={() => handleExportProject(activeProject.id)}
          />
          {activeFile !== null ? (
            <div className="artifact-workspace">
              <div id="artifact-editor-panel" className="artifact-editor-panel" role="tabpanel" aria-labelledby={`artifact-tab-${activeFile.id}`} tabIndex={-1}>
                <Suspense fallback={<EditorLoadingState />}>
                  <PdfViewer
                    key={`${activeFile.id}:${fileReloads[activeFile.id] ?? 0}`}
                    file={activeFile}
                    onOpenInWindow={canOpenFileWindow() ? () => handleOpenFileWindow(activeProject.id, activeFile.id) : undefined}
                    onPageCount={(pageCount) => patchProjectFile(activeProject.id, activeFile.id, { pageCount })}
                    onRemove={() => { void handleRemoveFile(activeProject.id, activeFile.id); }}
                    onReplace={() => { void startFilePick(activeProject.id, activeFile.id); }}
                  />
                </Suspense>
              </div>
            </div>
          ) : activeArtifact !== null ? (
            <NotebookContext.Provider value={notebookContext}>
              <div
                className={`artifact-workspace ${isNotebookOpen && isNotebookOverlay ? 'is-notebook-overlay' : ''}`}
                ref={workspaceRef}
              >
                <div id="artifact-editor-panel" className="artifact-editor-panel" role="tabpanel" aria-labelledby={`artifact-tab-${activeArtifact.id}`} tabIndex={-1}>
                  <ArtifactErrorBoundary key={activeArtifact.id} onExportProject={() => handleExportProject(activeProject.id)}>
                    <Suspense fallback={<EditorLoadingState />}>
                      {activeArtifact.type === 'class-diagram' ? (
                        <DiagramEditor
                          key={`${activeProject.id}:${activeArtifact.id}`}
                          artifact={activeArtifact}
                          canRedo={canRedo}
                          canUndo={canUndo}
                          saveStatus={saveStatus}
                          project={activeProject}
                          theme={theme}
                          onChangeContent={handleChangeProjectContent}
                          onRedo={handleRedo}
                          onUndo={handleUndo}
                        />
                      ) : activeArtifact.type === 'class-sequence-diagram' ? (
                        <ClassSequenceDiagramEditor
                          key={`${activeProject.id}:${activeArtifact.id}`}
                          artifact={activeArtifact}
                          canRedo={canRedo}
                          canUndo={canUndo}
                          saveStatus={saveStatus}
                          project={activeProject}
                          theme={theme}
                          onNavigateToArtifact={(targetArtifactId) => handleSelectArtifact(activeProject.id, targetArtifactId)}
                          onLinkAllSequenceDiagrams={(classModelArtifactId) =>
                            linkSequenceDiagramsToClassModel(activeProject.id, classModelArtifactId)
                          }
                          onChangeContent={handleChangeProjectContent}
                          onRedo={handleRedo}
                          onUndo={handleUndo}
                        />
                      ) : activeArtifact.type === 'use-case-model' ? (
                        <UseCaseModelEditor
                          key={`${activeProject.id}:${activeArtifact.id}`}
                          artifact={activeArtifact}
                          canRedo={canRedo}
                          canUndo={canUndo}
                          saveStatus={saveStatus}
                          project={activeProject}
                          theme={theme}
                          onChangeContent={handleChangeProjectContent}
                          onRedo={handleRedo}
                          onUndo={handleUndo}
                        />
                      ) : activeArtifact.type === 'use-case-flow' ? (
                        <UseCaseFlowEditor
                          key={`${activeProject.id}:${activeArtifact.id}`}
                          artifact={activeArtifact}
                          canRedo={canRedo}
                          canUndo={canUndo}
                          saveStatus={saveStatus}
                          project={activeProject}
                          theme={theme}
                          onChangeContent={handleChangeProjectContent}
                          onRedo={handleRedo}
                          onUndo={handleUndo}
                        />
                      ) : (
                        <SequenceDiagramEditor
                          key={`${activeProject.id}:${activeArtifact.id}`}
                          artifact={activeArtifact}
                          canRedo={canRedo}
                          canUndo={canUndo}
                          saveStatus={saveStatus}
                          project={activeProject}
                          theme={theme}
                          onNavigateToArtifact={(targetArtifactId) =>
                            handleSelectArtifact(activeProject.id, targetArtifactId)
                          }
                          onCreateClassMethod={handleCreateClassMethodFromSequence}
                          onCompleteClassMethodParameters={handleCompleteClassMethodParameters}
                          onImportSequenceIntoClassModel={handleImportSequenceIntoClassModel}
                          onCreateSequenceModel={() => createClassSequenceDiagramArtifact(activeProject.id, 'Clases de secuencias', activeArtifact.id)}
                          onChangeContent={handleChangeProjectContent}
                          onRedo={handleRedo}
                          onUndo={handleUndo}
                        />
                      )}
                    </Suspense>
                  </ArtifactErrorBoundary>
                </div>
                {isNotebookOpen ? (
                  <NotebookSheet
                    key={`${activeProject.id}:${activeArtifact.id}`}
                    artifactName={activeArtifact.name}
                    notebook={activeArtifact.notebook}
                    // Built from the key's ids: a flush on unmount after a tab switch still writes to its own artifact.
                    onCommit={(notebook) => updateArtifactNotebook(activeProject.id, activeArtifact.id, notebook)}
                    saveFailed={saveStatus === 'error'}
                    width={notebookWidth}
                    onWidthChange={(width) => setNotebookWidth(clampNotebookWidth(width))}
                    focusRequest={notebookFocus.count}
                    onClose={closeNotebook}
                    onReturnFocus={returnFocusToCanvas}
                  />
                ) : null}
              </div>
            </NotebookContext.Provider>
          ) : null}
        </div>
      )}
      {!paletteChosen ? (
        <PaletteWelcomeDialog
          palette={palette}
          appearance={theme.appearance}
          themePreference={themePreference}
          onPreviewPalette={setPreviewPalette}
          onThemePreferenceChange={setThemePreference}
          onConfirm={setPalette}
        />
      ) : null}
      {projectDialog !== null ? (
        <ProjectNameDialog
          initialName={projectDialog.initialName}
          chooseInitialArtifact={projectDialog.mode === 'create'}
          title={
            projectDialog.mode === 'create'
              ? 'Crear proyecto'
              : projectDialog.mode === 'rename'
                ? 'Renombrar proyecto'
                : projectDialog.mode === 'createArtifact'
                  ? 'Crear artefacto'
                  : projectDialog.mode === 'renameFile'
                    ? 'Renombrar archivo'
                    : 'Renombrar artefacto'
          }
          description={
            projectDialog.mode === 'create' || projectDialog.mode === 'rename'
              ? 'Un proyecto reúne todos los diagramas y especificaciones de un sistema.'
              : projectDialog.mode === 'renameFile'
                ? 'Solo cambia el nombre que se ve en la app; el PDF original queda como está.'
                : 'El nombre distingue este artefacto de los otros del proyecto.'
          }
          confirmLabel={projectDialog.mode === 'create' || projectDialog.mode === 'createArtifact' ? 'Crear' : 'Guardar'}
          onCancel={() => setProjectDialog(null)}
          onConfirm={handleConfirmProjectDialog}
        />
      ) : null}
      {isShortcutsOpen ? (
        <ShortcutsDialog
          onCheckUpdate={() => { void appUpdate.checkNow(); }}
          onClose={() => setIsShortcutsOpen(false)}
          onDownloadArtifactGuide={handleDownloadArtifactGuide}
          update={appUpdate.update}
          updateStatus={appUpdate.status}
        />
      ) : null}
      {artifactTransferDialog?.mode === 'import' && transferProject ? (
        <ArtifactImportDialog
          key={transferProject.id}
          project={transferProject}
          onCancel={() => setArtifactTransferDialog(null)}
          onDownloadGuide={handleDownloadArtifactGuide}
          onConfirm={(artifact) => {
            importArtifact(transferProject.id, artifact);
            historyBurstRef.current = null;
            setArtifactTransferDialog(null);
          }}
        />
      ) : null}
      {artifactTransferDialog?.mode === 'move' && transferProject && transferArtifact ? (
        <ArtifactMoveDialog
          key={`${transferProject.id}:${transferArtifact.id}`}
          project={transferProject}
          artifact={transferArtifact}
          projects={projects}
          onCancel={() => setArtifactTransferDialog(null)}
          onConfirm={handleMoveArtifact}
        />
      ) : null}
      <input
        ref={fileInputRef}
        accept="application/pdf,.pdf"
        aria-hidden="true"
        className="visually-hidden"
        multiple
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          handleFileInputChange(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {isFileDragActive ? (
        <div className="file-drop-overlay" role="presentation">
          <div className="file-drop-card">
            <FileText aria-hidden="true" size={22} />
            <strong>
              {activeProject === null ? 'Abrí un proyecto para guardar PDF' : `Soltá el PDF para agregarlo a «${activeProject.name}»`}
            </strong>
            {activeProject === null ? null : <span>Hasta 50 MB por archivo.</span>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
