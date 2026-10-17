import {
  Blocks,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderClosed,
  FolderSearch,
  GitBranch,
  Home,
  Keyboard,
  MoreHorizontal,
  MoveRight,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import type { ThemePreference } from '../hooks/useTheme';
import type { PaletteId } from '../theme/themes';
import { APP_NAME, APP_VERSION } from '../constants/appInfo';
import { ARTIFACT_TYPES } from '../constants/artifactTypes';
import { ArtifactTypeIcon } from './ArtifactTypeIcon';
import { ThemeToggle } from './ThemeToggle';
import { MenuItem, MenuSeparator } from './ui/Toolbar';
import { shortcutLabel } from '../utils/shortcutLabel';
import {
  readSidebarOthersOpen,
  readSidebarSplit,
  writeSidebarOthersOpen,
  writeSidebarSplit,
} from '../storage/uiPreferences';
import { filterProjectsByName, formatShortProjectDate, shouldShowProjectFilter, sortProjectsByRecency } from '../utils/projectSidebar';
import { SidebarFilter, SidebarPane, SidebarSash } from './SidebarPane';
import { fileDisplayName, projectFiles } from '../utils/projectFiles';
import type { LatestRelease } from '../utils/appUpdate';

type ProjectSidebarProps = {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  palette: PaletteId;
  onPaletteChange: (palette: PaletteId) => void;
  activeArtifactId: string | null;
  activeProjectId: string | null;
  isCollapsed: boolean;
  isHome: boolean;
  onCreateProject: () => void;
  onOpenHome: () => void;
  onOpenShortcuts: () => void;
  onCreateArtifact: (projectId: string, artifactType: DesignArtifact['type']) => void;
  onDeleteArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportProject: (projectId: string) => void;
  onExportArtifact: (projectId: string, artifactId: string) => void;
  onCopyProject: (projectId: string) => void;
  onCopyArtifact: (projectId: string, artifactId: string) => void;
  onImportArtifact: (projectId: string) => void;
  onMoveArtifact: (projectId: string, artifactId: string) => void;
  onConvertToSequenceModel?: (projectId: string, artifactId: string) => void;
  onRenameArtifact: (projectId: string, artifactId: string) => void;
  onRenameProject: (projectId: string) => void;
  onSelectArtifact: (projectId: string, artifactId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggleCollapsed: () => void;
  onDismissUpdate?: () => void;
  /** The PDF being shown instead of an artifact, if any. */
  activeFileId?: string | null;
  /** PDFs known to be missing on this computer (their binary is not stored here). */
  unavailableFileIds?: ReadonlySet<string>;
  /** Mac only: the PDFs sit in a folder that Finder can show. */
  canRevealFiles?: boolean;
  /** False where a PDF cannot have its own window (the Windows shell). */
  canOpenFileWindow?: boolean;
  onAddFiles?: (projectId: string) => void;
  onSelectFile?: (projectId: string, fileId: string) => void;
  onOpenFileWindow?: (projectId: string, fileId: string) => void;
  onRenameFile?: (projectId: string, fileId: string) => void;
  onRevealFile?: (fileId: string) => void;
  onRemoveFile?: (projectId: string, fileId: string) => void;
  projects: DiagramProject[];
  /** A newer release to announce, already filtered for a hidden version. */
  update?: LatestRelease | null;
};

type SidebarOptionsMenuState = {
  artifactId?: string;
  canDelete?: boolean;
  fileId?: string;
  kind: 'artifact' | 'file' | 'project';
  left: number;
  projectId: string;
  top: number;
};

type NewArtifactMenuState = {
  left: number;
  projectId: string;
  top: number;
};

const formatRelativeDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `hoy, ${new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
  }
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(date);
};

const placeMenu = (trigger: HTMLElement, width: number, height: number): { left: number; top: number } => {
  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
  return { left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top };
};

export function ProjectSidebar({
  activeArtifactId,
  activeProjectId,
  isCollapsed,
  isHome,
  onCreateArtifact,
  onCreateProject,
  onOpenHome,
  onOpenShortcuts,
  onDeleteArtifact,
  onDeleteProject,
  onExportProject,
  onExportArtifact,
  onCopyProject,
  onCopyArtifact,
  onImportArtifact,
  onMoveArtifact,
  onConvertToSequenceModel,
  onRenameArtifact,
  onRenameProject,
  onSelectArtifact,
  onSelectProject,
  onDismissUpdate,
  onToggleCollapsed,
  onThemePreferenceChange,
  palette,
  onPaletteChange,
  projects,
  themePreference,
  update,
  activeFileId = null,
  unavailableFileIds,
  canRevealFiles = false,
  canOpenFileWindow = false,
  onAddFiles,
  onSelectFile,
  onOpenFileWindow,
  onRenameFile,
  onRevealFile,
  onRemoveFile,
}: ProjectSidebarProps) {
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const newArtifactMenuRef = useRef<HTMLDivElement | null>(null);
  const [optionsMenu, setOptionsMenu] = useState<SidebarOptionsMenuState | null>(null);
  const [newArtifactMenu, setNewArtifactMenu] = useState<NewArtifactMenuState | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const currentPaneRef = useRef<HTMLElement | null>(null);
  const [othersOpen, setOthersOpen] = useState(readSidebarOthersOpen);
  const [split, setSplit] = useState<number | null>(readSidebarSplit);
  const [filterQuery, setFilterQuery] = useState('');

  // The open project, only while one is open: Inicio shows a single «Proyectos» list instead.
  const openProject = isHome ? null : projects.find((project) => project.id === activeProjectId) ?? null;
  const otherProjects = sortProjectsByRecency(projects, openProject?.id ?? null);
  const showFilter = (openProject === null || othersOpen) && shouldShowProjectFilter(otherProjects.length);
  const visibleProjects = showFilter ? filterProjectsByName(otherProjects, filterQuery) : otherProjects;
  // On Inicio the list is the whole screen of the sidebar, so it is never folded.
  const projectsPaneOpen = openProject === null || othersOpen;
  const bothOpen = openProject !== null && othersOpen;

  const toggleOthers = (): void => {
    setOthersOpen(!othersOpen);
    writeSidebarOthersOpen(!othersOpen);
  };

  const changeSplit = (fraction: number | null, persist: boolean): void => {
    setSplit(fraction);
    if (persist) writeSidebarSplit(fraction);
  };

  const openNewArtifactMenu = (projectId: string, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (newArtifactMenu?.projectId === projectId) {
      setNewArtifactMenu(null);
      return;
    }
    setOptionsMenu(null);
    setNewArtifactMenu({ projectId, ...placeMenu(event.currentTarget, 310, 310) });
  };

  const openOptionsMenu = (values: Omit<SidebarOptionsMenuState, 'left' | 'top'>, event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    setNewArtifactMenu(null);
    setOptionsMenu({ ...values, ...placeMenu(event.currentTarget, 260, 180) });
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: globalThis.MouseEvent): void => {
      const target = event.target as globalThis.Node;
      if (
        optionsMenuRef.current?.contains(target)
        || newArtifactMenuRef.current?.contains(target)
        || (target instanceof Element && target.closest('.sidebar-row-menu, .sidebar-section-action') !== null)
      ) {
        return;
      }
      setOptionsMenu(null);
      setNewArtifactMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOptionsMenu(null);
        setNewArtifactMenu(null);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const newArtifactMenuElement = newArtifactMenu !== null ? (
        <div
          aria-label="Nuevo artefacto"
          className="artifact-floating-menu new-artifact-floating-menu"
          ref={newArtifactMenuRef}
          role="menu"
          style={{ left: newArtifactMenu.left, top: newArtifactMenu.top }}
        >
          {ARTIFACT_TYPES.map((type) => (
            <MenuItem
              key={type.id}
              icon={type.icon}
              onSelect={() => {
                onCreateArtifact(newArtifactMenu.projectId, type.id);
                setNewArtifactMenu(null);
              }}
            >
              {type.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem icon={Upload} onSelect={() => {
            onImportArtifact(newArtifactMenu.projectId);
            setNewArtifactMenu(null);
          }}>Importar artefacto…</MenuItem>
        </div>
      ) : null;

  const collapseButton = (
    <button
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral'}
      className="v2-tool v2-sidebar-toggle"
      type="button"
      onClick={onToggleCollapsed}
      title={shortcutLabel(`${isCollapsed ? 'Mostrar' : 'Ocultar'} barra lateral (⌘\\)`)}
    >
      {isCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
    </button>
  );

  if (isCollapsed) {
    // The rail keeps what you use most: the toggle in the very same spot as
    // when the sidebar is open, Inicio, and the open project's artifacts.
    const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
    return (
      <aside className="project-sidebar collapsed v2-sidebar" aria-label="Navegación">
        <div className="v2-sidebar-header">{collapseButton}</div>
        <nav className="v2-sidebar-rail" aria-label="Navegación rápida">
          <button
            aria-current={isHome ? 'page' : undefined}
            aria-label="Inicio"
            className={`v2-tool ${isHome ? 'is-pressed' : ''}`}
            type="button"
            onClick={onOpenHome}
            title="Inicio"
          >
            <Home size={16} aria-hidden="true" />
          </button>
          {activeProject !== null ? (
            <>
              <span className="v2-sidebar-rail-divider" aria-hidden="true" />
              {activeProject.artifacts.map((artifact) => {
                const isCurrent = artifact.id === activeArtifactId;
                return (
                  <button
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={artifact.name}
                    className={`v2-tool ${isCurrent ? 'is-pressed' : ''}`}
                    key={artifact.id}
                    type="button"
                    onClick={() => onSelectArtifact(activeProject.id, artifact.id)}
                    title={`${artifact.name} · ${activeProject.name}`}
                  >
                    <ArtifactTypeIcon type={artifact.type} />
                  </button>
                );
              })}
              <button
                aria-expanded={newArtifactMenu?.projectId === activeProject.id}
                aria-haspopup="menu"
                aria-label="Nuevo artefacto"
                className="v2-tool"
                type="button"
                onClick={(event) => openNewArtifactMenu(activeProject.id, event)}
                title="Nuevo artefacto"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
              {projectFiles(activeProject).length > 0 ? (
                <>
                  <span className="v2-sidebar-rail-divider" aria-hidden="true" />
                  {projectFiles(activeProject).map((file) => {
                    const isCurrent = file.id === activeFileId;
                    return (
                      <button
                        aria-current={isCurrent ? 'page' : undefined}
                        aria-label={fileDisplayName(file.name)}
                        className={`v2-tool ${isCurrent ? 'is-pressed' : ''}`}
                        key={file.id}
                        type="button"
                        onClick={() => onSelectFile?.(activeProject.id, file.id)}
                        title={`${fileDisplayName(file.name)} · PDF`}
                      >
                        <FileText size={16} aria-hidden="true" />
                      </button>
                    );
                  })}
                </>
              ) : null}
            </>
          ) : null}
        </nav>
        <div className="v2-sidebar-rail-footer">
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
            {update ? (
              <span className="v2-update-dot" role="img" aria-label={`Hay una versión nueva (${update.version})`} title={`Hay una versión nueva (${update.version})`} />
            ) : null}
          </button>
          <ThemeToggle preference={themePreference} onChange={onThemePreferenceChange} palette={palette} onPaletteChange={onPaletteChange} />
        </div>
        {newArtifactMenuElement}
      </aside>
    );
  }

  return (
    <aside className="project-sidebar v2-sidebar" aria-label="Navegación">
      <div className="v2-sidebar-header">
        {collapseButton}
        <p className="sidebar-brand-name v2-brand-name">
          <span className="v2-brand-mark" aria-hidden="true"><Blocks size={15} /></span>
          {APP_NAME}
        </p>
      </div>

      <nav className="v2-sidebar-nav" aria-label="Proyectos">
        <button
          aria-current={isHome ? 'page' : undefined}
          className={`v2-sidebar-row v2-sidebar-home ${isHome ? 'is-current' : ''}`}
          type="button"
          onClick={onOpenHome}
        >
          <Home size={15} aria-hidden="true" />
          <span className="v2-sidebar-row-label">Inicio</span>
        </button>

        <div className="v2-sidebar-panes" ref={panesRef}>
          {openProject !== null ? (
            <SidebarPane
              actions={(
                <>
                  <button
                    aria-expanded={newArtifactMenu?.projectId === openProject.id}
                    aria-haspopup="menu"
                    aria-label="Nuevo artefacto"
                    className="v2-tool sidebar-section-action"
                    type="button"
                    onClick={(event) => openNewArtifactMenu(openProject.id, event)}
                    title="Nuevo artefacto"
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                  <button
                    aria-controls="sidebar-options-menu"
                    aria-expanded={optionsMenu?.kind === 'project' && optionsMenu.projectId === openProject.id}
                    aria-haspopup="menu"
                    aria-label={`Opciones del proyecto ${openProject.name}`}
                    className="v2-tool sidebar-section-action"
                    type="button"
                    onClick={(event) => openOptionsMenu({ kind: 'project', projectId: openProject.id }, event)}
                    title="Opciones del proyecto"
                  >
                    <MoreHorizontal size={15} aria-hidden="true" />
                  </button>
                </>
              )}
              className={bothOpen ? (split === null ? 'is-auto-split' : '') : ''}
              id="sidebar-current-pane"
              // The open project's artifacts are always shown: no fold button.
              collapsible={false}
              open
              paneRef={currentPaneRef}
              revealActions
              strong
              style={bothOpen && split !== null ? { flex: `${split} 1 0` } : undefined}
              title={openProject.name}
            >
              <ul className="v2-sidebar-artifacts" aria-label={`Artefactos de ${openProject.name}`}>
                {openProject.artifacts.map((artifact) => {
                  const isCurrent = artifact.id === activeArtifactId;
                  return (
                    <li key={artifact.id} className={`v2-sidebar-row-wrap ${isCurrent ? 'is-current' : ''}`}>
                      <button
                        aria-current={isCurrent ? 'page' : undefined}
                        className="v2-sidebar-row v2-sidebar-artifact-row"
                        type="button"
                        onClick={() => onSelectArtifact(openProject.id, artifact.id)}
                      >
                        <ArtifactTypeIcon type={artifact.type} />
                        <span className="v2-sidebar-row-label">{artifact.name}</span>
                      </button>
                      <button
                        aria-controls="sidebar-options-menu"
                        aria-expanded={optionsMenu?.kind === 'artifact' && optionsMenu.artifactId === artifact.id}
                        aria-haspopup="menu"
                        aria-label={`Opciones de ${artifact.name}`}
                        className="v2-tool sidebar-row-menu"
                        type="button"
                        onClick={(event) => openOptionsMenu({
                          artifactId: artifact.id,
                          canDelete: openProject.artifacts.length > 1,
                          kind: 'artifact',
                          projectId: openProject.id,
                        }, event)}
                      >
                        <MoreHorizontal size={15} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    aria-expanded={newArtifactMenu?.projectId === openProject.id}
                    aria-haspopup="menu"
                    className="v2-sidebar-row v2-sidebar-add sidebar-section-action"
                    type="button"
                    onClick={(event) => openNewArtifactMenu(openProject.id, event)}
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="v2-sidebar-row-label">Nuevo artefacto</span>
                  </button>
                </li>
              </ul>
              {onAddFiles !== undefined ? (
                <section aria-labelledby="sidebar-files-title" className="v2-sidebar-files">
                  <div className="v2-sidebar-subhead">
                    <h3 className="v2-sidebar-subhead-title" id="sidebar-files-title">Archivos</h3>
                    <button
                      aria-label="Agregar PDF"
                      className="v2-tool sidebar-section-action"
                      type="button"
                      onClick={() => onAddFiles(openProject.id)}
                      title="Agregar PDF…"
                    >
                      <Plus size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="v2-sidebar-artifacts" aria-label={`Archivos de ${openProject.name}`}>
                    {projectFiles(openProject).map((file) => {
                      const isCurrent = file.id === activeFileId;
                      const isMissing = unavailableFileIds?.has(file.id) === true;
                      const detail = isMissing ? 'no disponible' : file.pageCount !== undefined ? `${file.pageCount} pág.` : '';
                      return (
                        <li key={file.id} className={`v2-sidebar-row-wrap v2-sidebar-other ${isCurrent ? 'is-current' : ''}`}>
                          <button
                            aria-current={isCurrent ? 'page' : undefined}
                            className="v2-sidebar-row v2-sidebar-artifact-row"
                            type="button"
                            title={fileDisplayName(file.name)}
                            onClick={() => onSelectFile?.(openProject.id, file.id)}
                          >
                            <FileText size={15} aria-hidden="true" />
                            <span className="v2-sidebar-row-label">{fileDisplayName(file.name)}</span>
                            {detail !== '' ? <span className="v2-sidebar-row-date" aria-hidden="true">{detail}</span> : null}
                          </button>
                          <button
                            aria-controls="sidebar-options-menu"
                            aria-expanded={optionsMenu?.kind === 'file' && optionsMenu.fileId === file.id}
                            aria-haspopup="menu"
                            aria-label={`Opciones de ${fileDisplayName(file.name)}`}
                            className="v2-tool sidebar-row-menu"
                            type="button"
                            onClick={(event) => openOptionsMenu({ fileId: file.id, kind: 'file', projectId: openProject.id }, event)}
                          >
                            <MoreHorizontal size={15} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        className="v2-sidebar-row v2-sidebar-add"
                        type="button"
                        onClick={() => onAddFiles(openProject.id)}
                      >
                        <Plus size={15} aria-hidden="true" />
                        <span className="v2-sidebar-row-label">Agregar PDF…</span>
                      </button>
                    </li>
                  </ul>
                </section>
              ) : null}
            </SidebarPane>
          ) : null}

          {bothOpen ? (
            <SidebarSash containerRef={panesRef} onSplit={changeSplit} topId="sidebar-current-pane" topRef={currentPaneRef} />
          ) : null}

          <SidebarPane
            actions={(
              <button aria-label="Nuevo proyecto" className="v2-tool sidebar-section-action" type="button" onClick={onCreateProject} title="Nuevo proyecto">
                <Plus size={15} aria-hidden="true" />
              </button>
            )}
            className={openProject !== null && !othersOpen ? 'has-rule' : ''}
            collapsible={openProject !== null}
            count={otherProjects.length}
            id="sidebar-projects-pane"
            onToggle={toggleOthers}
            open={projectsPaneOpen}
            style={bothOpen && split !== null ? { flex: `${1 - split} 1 0` } : undefined}
            title={openProject !== null ? 'Otros proyectos' : 'Proyectos'}
          >
            {showFilter ? <SidebarFilter value={filterQuery} onChange={setFilterQuery} /> : null}
            {otherProjects.length === 0 ? (
              <p className="v2-sidebar-empty">{openProject !== null ? 'No hay otros proyectos.' : 'Todavía no hay proyectos.'}</p>
            ) : visibleProjects.length === 0 ? (
              <p aria-live="polite" className="v2-sidebar-empty" role="status">Ningún proyecto coincide.</p>
            ) : (
              <ul className="v2-sidebar-projects">
                {visibleProjects.map((project) => (
                  <li key={project.id} className="v2-sidebar-row-wrap v2-sidebar-other">
                    <button
                      className="v2-sidebar-row v2-sidebar-project-row"
                      type="button"
                      title={`${project.name} · actualizado ${formatRelativeDate(project.updatedAt)}`}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <FolderClosed size={15} aria-hidden="true" />
                      <span className="v2-sidebar-row-label">{project.name}</span>
                      <span className="v2-sidebar-row-date" aria-hidden="true">{formatShortProjectDate(project.updatedAt)}</span>
                    </button>
                    <button
                      aria-controls="sidebar-options-menu"
                      aria-expanded={optionsMenu?.kind === 'project' && optionsMenu.projectId === project.id}
                      aria-haspopup="menu"
                      aria-label={`Opciones del proyecto ${project.name}`}
                      className="v2-tool sidebar-row-menu"
                      type="button"
                      onClick={(event) => openOptionsMenu({ kind: 'project', projectId: project.id }, event)}
                    >
                      <MoreHorizontal size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SidebarPane>
        </div>
      </nav>

      {update ? (
        <div className="v2-sidebar-update" role="status">
          <span>{`Hay una versión nueva (${update.version})`}</span>
          <a href={update.url} rel="noreferrer">Descargar</a>
          <button aria-label="Ocultar" className="v2-tool" type="button" onClick={onDismissUpdate} title="Ocultar">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="v2-sidebar-footer">
        <ThemeToggle preference={themePreference} onChange={onThemePreferenceChange} palette={palette} onPaletteChange={onPaletteChange} showLabel />
        <div className="v2-sidebar-footer-end">
          <span className="v2-sidebar-version" title="Versión instalada">{`v${APP_VERSION}`}</span>
          <button aria-label="Atajos de teclado" className="v2-tool" type="button" onClick={onOpenShortcuts} title="Atajos de teclado (?)">
            <Keyboard size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {optionsMenu !== null ? (
        <div
          aria-label={optionsMenu.kind === 'project' ? 'Opciones del proyecto' : optionsMenu.kind === 'file' ? 'Opciones del archivo' : 'Opciones del artefacto'}
          className="artifact-floating-menu"
          id="sidebar-options-menu"
          ref={optionsMenuRef}
          role="menu"
          style={{ left: optionsMenu.left, top: optionsMenu.top }}
        >
          {optionsMenu.kind === 'file' && optionsMenu.fileId !== undefined && canOpenFileWindow ? (
            <MenuItem icon={ExternalLink} onSelect={() => {
              onOpenFileWindow?.(optionsMenu.projectId, optionsMenu.fileId!);
              setOptionsMenu(null);
            }}>Abrir en ventana nueva</MenuItem>
          ) : null}
          <MenuItem
            icon={Pencil}
            onSelect={() => {
              if (optionsMenu.kind === 'file' && optionsMenu.fileId !== undefined) {
                onRenameFile?.(optionsMenu.projectId, optionsMenu.fileId);
              } else if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onRenameArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onRenameProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            Renombrar…
          </MenuItem>
          {optionsMenu.kind === 'project' ? (
            <>
              <MenuItem icon={Upload} onSelect={() => {
                onImportArtifact(optionsMenu.projectId);
                setOptionsMenu(null);
              }}>Importar artefacto…</MenuItem>
              <MenuItem
                icon={Download}
                onSelect={() => {
                  onExportProject(optionsMenu.projectId);
                  setOptionsMenu(null);
                }}
              >
                Exportar proyecto (JSON)
              </MenuItem>
              <MenuItem icon={Copy} onSelect={() => {
                onCopyProject(optionsMenu.projectId);
                setOptionsMenu(null);
              }}>Copiar proyecto (JSON)</MenuItem>
            </>
          ) : optionsMenu.kind === 'file' ? (
            canRevealFiles && optionsMenu.fileId !== undefined ? (
              <MenuItem icon={FolderSearch} onSelect={() => {
                onRevealFile?.(optionsMenu.fileId!);
                setOptionsMenu(null);
              }}>Mostrar en Finder</MenuItem>
            ) : null
          ) : optionsMenu.artifactId !== undefined ? (
            <>
              <MenuItem icon={Download} onSelect={() => {
                onExportArtifact(optionsMenu.projectId, optionsMenu.artifactId!);
                setOptionsMenu(null);
              }}>Exportar artefacto (JSON)</MenuItem>
              <MenuItem icon={Copy} onSelect={() => {
                onCopyArtifact(optionsMenu.projectId, optionsMenu.artifactId!);
                setOptionsMenu(null);
              }}>Copiar artefacto (JSON)</MenuItem>
              <MenuItem icon={MoveRight} onSelect={() => {
                onMoveArtifact(optionsMenu.projectId, optionsMenu.artifactId!);
                setOptionsMenu(null);
              }}>Mover a otro proyecto…</MenuItem>
              {onConvertToSequenceModel && projects.find((project) => project.id === optionsMenu.projectId)?.artifacts
                .some((artifact) => artifact.id === optionsMenu.artifactId && artifact.type === 'class-diagram') ? (
                <MenuItem icon={GitBranch} onSelect={() => {
                  onConvertToSequenceModel(optionsMenu.projectId, optionsMenu.artifactId!);
                  setOptionsMenu(null);
                }}>Convertir en clases de secuencias…</MenuItem>
              ) : null}
            </>
          ) : null}
          <MenuSeparator />
          <MenuItem
            danger
            disabled={optionsMenu.kind === 'artifact' && !optionsMenu.canDelete}
            icon={Trash2}
            onSelect={() => {
              if (optionsMenu.kind === 'file' && optionsMenu.fileId !== undefined) {
                onRemoveFile?.(optionsMenu.projectId, optionsMenu.fileId);
              } else if (optionsMenu.kind === 'artifact' && optionsMenu.artifactId !== undefined) {
                onDeleteArtifact(optionsMenu.projectId, optionsMenu.artifactId);
              } else {
                onDeleteProject(optionsMenu.projectId);
              }
              setOptionsMenu(null);
            }}
          >
            {optionsMenu.kind === 'project' ? 'Eliminar proyecto…' : optionsMenu.kind === 'file' ? 'Quitar del proyecto…' : 'Eliminar…'}
          </MenuItem>
        </div>
      ) : null}

      {newArtifactMenuElement}
    </aside>
  );
}
