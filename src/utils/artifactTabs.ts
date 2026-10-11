import type { DesignArtifact, DiagramProject, ProjectFile } from '../types/diagram';

export type ArtifactTabState = {
  openArtifactIds: string[];
  activeArtifactId: string | null;
};

/**
 * A tab is an artifact or a PDF of the project; their ids never collide, so one list
 * keeps both and the helpers below treat every id alike.
 */
export const projectTabIds = (project: Pick<DiagramProject, 'artifacts' | 'files'>): string[] => [
  ...project.artifacts.map((artifact) => artifact.id),
  ...(project.files ?? []).map((file) => file.id),
];

export type ActiveTab =
  | { kind: 'artifact'; artifact: DesignArtifact }
  | { kind: 'file'; file: ProjectFile };

/**
 * The one thing the project shows: the PDF chosen last, or else the project's active artifact.
 * `project.activeArtifactId` never points at a file, so the history and the editors stay untouched.
 */
export const resolveActiveTab = (
  project: Pick<DiagramProject, 'artifacts' | 'files' | 'activeArtifactId'>,
  activeFileId: string | null | undefined,
): ActiveTab | null => {
  const file = activeFileId == null ? undefined : (project.files ?? []).find((candidate) => candidate.id === activeFileId);
  if (file !== undefined) return { kind: 'file', file };
  const artifact = project.artifacts.find((candidate) => candidate.id === project.activeArtifactId) ?? project.artifacts[0];
  return artifact === undefined ? null : { kind: 'artifact', artifact };
};

export const filterArtifactTabs = (ids: readonly unknown[], existingIds: readonly string[]): string[] => {
  const existing = new Set(existingIds);
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && existing.has(id)))];
};

export const openArtifactTab = (state: ArtifactTabState, artifactId: string): ArtifactTabState => {
  if (state.openArtifactIds.includes(artifactId)) return { ...state, activeArtifactId: artifactId };
  const openArtifactIds = [...state.openArtifactIds];
  const activeIndex = state.activeArtifactId === null ? -1 : openArtifactIds.indexOf(state.activeArtifactId);
  openArtifactIds.splice(activeIndex < 0 ? openArtifactIds.length : activeIndex + 1, 0, artifactId);
  return { openArtifactIds, activeArtifactId: artifactId };
};

export const readArtifactTabs = (serialized: string | null, existingIds: readonly string[], activeArtifactId: string | null): ArtifactTabState => {
  let ids: unknown[] = [];
  try {
    const parsed: unknown = serialized === null ? [] : JSON.parse(serialized);
    if (Array.isArray(parsed)) ids = parsed;
  } catch { /* Invalid preferences fall back to the active artifact. */ }
  const state = { openArtifactIds: filterArtifactTabs(ids, existingIds), activeArtifactId };
  return activeArtifactId !== null && existingIds.includes(activeArtifactId)
    ? openArtifactTab(state, activeArtifactId)
    : { ...state, activeArtifactId: state.openArtifactIds[0] ?? null };
};

export const closeArtifactTabs = (state: ArtifactTabState, artifactIds: readonly string[]): ArtifactTabState => {
  const removed = new Set(artifactIds);
  const openArtifactIds = state.openArtifactIds.filter((id) => !removed.has(id));
  if (state.activeArtifactId === null || !removed.has(state.activeArtifactId)) return { ...state, openArtifactIds };
  const activeIndex = state.openArtifactIds.indexOf(state.activeArtifactId);
  const rightNeighbor = state.openArtifactIds.slice(activeIndex + 1).find((id) => !removed.has(id));
  const leftNeighbor = state.openArtifactIds.slice(0, Math.max(0, activeIndex)).reverse().find((id) => !removed.has(id));
  return { openArtifactIds, activeArtifactId: rightNeighbor ?? leftNeighbor ?? null };
};

export const closeOtherArtifactTabs = (state: ArtifactTabState, artifactId: string): ArtifactTabState =>
  state.openArtifactIds.includes(artifactId)
    ? closeArtifactTabs(state, state.openArtifactIds.filter((id) => id !== artifactId))
    : state;

export const closeArtifactTabsToRight = (state: ArtifactTabState, artifactId: string): ArtifactTabState => {
  const index = state.openArtifactIds.indexOf(artifactId);
  return index < 0 ? state : closeArtifactTabs(state, state.openArtifactIds.slice(index + 1));
};

export const removeMissingArtifactTabs = (state: ArtifactTabState, existingIds: readonly string[]): ArtifactTabState => {
  const existing = new Set(existingIds);
  return closeArtifactTabs(state, state.openArtifactIds.filter((id) => !existing.has(id)));
};

export const reconcileArtifactTabs = (
  state: ArtifactTabState,
  options: { existingArtifactIds: string[]; activeArtifactId: string | null; projectOpened: boolean; projectActive: boolean },
): ArtifactTabState => {
  const { existingArtifactIds, activeArtifactId, projectOpened, projectActive } = options;
  const openArtifactIds = filterArtifactTabs(state.openArtifactIds, existingArtifactIds);
  const previousActiveRemoved = state.activeArtifactId !== null && !existingArtifactIds.includes(state.activeArtifactId);
  const artifactOpened = state.activeArtifactId !== activeArtifactId && !previousActiveRemoved;
  if (activeArtifactId !== null && (projectOpened || artifactOpened || (projectActive && !openArtifactIds.includes(activeArtifactId)))) {
    return openArtifactTab({ openArtifactIds, activeArtifactId: state.activeArtifactId }, activeArtifactId);
  }
  return { openArtifactIds, activeArtifactId };
};

export const reorderArtifactTabs = (ids: readonly string[], artifactId: string, toIndex: number): string[] => {
  const fromIndex = ids.indexOf(artifactId);
  if (fromIndex < 0) return [...ids];
  const next = [...ids];
  next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, artifactId);
  return next;
};

export const artifactTabShortcut = (
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  state: ArtifactTabState,
  isMac: boolean,
): { type: 'select' | 'close'; artifactId: string } | null => {
  const { openArtifactIds, activeArtifactId } = state;
  if (event.altKey || openArtifactIds.length === 0 || activeArtifactId === null) return null;
  if (event.key === 'Tab' && event.ctrlKey && !event.metaKey) {
    const index = openArtifactIds.indexOf(activeArtifactId);
    const next = (index + (event.shiftKey ? -1 : 1) + openArtifactIds.length) % openArtifactIds.length;
    return { type: 'select', artifactId: openArtifactIds[next] };
  }
  if (!(isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) || event.shiftKey) return null;
  if (event.key.toLowerCase() === 'w') return { type: 'close', artifactId: activeArtifactId };
  if (!/^[1-9]$/.test(event.key)) return null;
  const index = event.key === '9' ? openArtifactIds.length - 1 : Number(event.key) - 1;
  const artifactId = openArtifactIds[index];
  return artifactId === undefined ? null : { type: 'select', artifactId };
};
