import { useEffect, useState } from 'react';
import type { DiagramProject } from '../types/diagram';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { projectTabIds, readArtifactTabs, reconcileArtifactTabs } from '../utils/artifactTabs';
import { getActiveArtifact } from '../utils/diagramNormalization';

const preferenceKey = (projectId: string): string => `modelador.openTabs.${projectId}`;
const readProjectTabs = (project: DiagramProject): string[] => readArtifactTabs(
  readUiPreference(preferenceKey(project.id)),
  projectTabIds(project),
  getActiveArtifact(project)?.id ?? null,
).openArtifactIds;

export function useArtifactTabs(projects: DiagramProject[], activeProjectId: string | null) {
  const [state, setState] = useState(() => ({
    projects,
    activeProjectId,
    tabsByProject: Object.fromEntries(projects.map((project) => [project.id, readProjectTabs(project)])),
    // The PDF being shown in each project, if any. Not saved: the project reopens on its active artifact.
    activeFileByProject: {} as Record<string, string | null>,
  }));

  let current = state;
  if (state.projects !== projects || state.activeProjectId !== activeProjectId) {
    let changed = Object.keys(state.tabsByProject).length !== projects.length;
    // A removed PDF can no longer be the one being shown, and any other way of choosing an
    // artifact (a new one, an import, a move) takes the foreground from it.
    const activeFileByProject = Object.fromEntries(Object.entries(state.activeFileByProject).filter(([projectId, fileId]) => {
      const project = projects.find((candidate) => candidate.id === projectId);
      const previous = state.projects.find((candidate) => candidate.id === projectId);
      return fileId !== null && project?.files?.some((file) => file.id === fileId) === true
        && (previous === undefined || previous.activeArtifactId === project.activeArtifactId);
    }));
    const tabsByProject = Object.fromEntries(projects.map((project) => {
      const previous = state.projects.find((candidate) => candidate.id === project.id);
      const saved = state.tabsByProject[project.id];
      const existingIds = projectTabIds(project);
      // The tab really in front: with a PDF shown, the hidden artifact must not be pulled back into the tabs.
      const shownFileId = activeFileByProject[project.id] ?? null;
      const activeArtifactId = shownFileId ?? getActiveArtifact(project)?.id ?? null;
      const previousFileId = state.activeFileByProject[project.id] ?? null;
      const previousActiveId = previous === undefined ? null : previousFileId ?? getActiveArtifact(previous)?.id ?? null;
      let ids = reconcileArtifactTabs({ openArtifactIds: saved ?? readProjectTabs(project), activeArtifactId: previousActiveId }, {
        existingArtifactIds: existingIds,
        activeArtifactId,
        projectOpened: project.id === activeProjectId && activeProjectId !== state.activeProjectId,
        projectActive: project.id === activeProjectId,
      }).openArtifactIds;
      if (saved !== undefined && ids.length === saved.length && ids.every((id, index) => id === saved[index])) ids = saved;
      if (ids !== saved) changed = true;
      return [project.id, ids];
    }));
    const sameActiveFiles = Object.keys(activeFileByProject).length === Object.keys(state.activeFileByProject).length;
    current = {
      projects,
      activeProjectId,
      tabsByProject: changed ? tabsByProject : state.tabsByProject,
      activeFileByProject: sameActiveFiles ? state.activeFileByProject : activeFileByProject,
    };
    setState(current);
  }

  useEffect(() => {
    for (const [projectId, ids] of Object.entries(current.tabsByProject)) {
      writeUiPreference(preferenceKey(projectId), JSON.stringify(ids));
    }
  }, [current.tabsByProject]);

  const setOpenArtifactIds = (projectId: string, ids: string[]): void => {
    setState((previous) => ({ ...previous, tabsByProject: { ...previous.tabsByProject, [projectId]: ids } }));
  };

  const setActiveFileId = (projectId: string, fileId: string | null): void => {
    setState((previous) => ({ ...previous, activeFileByProject: { ...previous.activeFileByProject, [projectId]: fileId } }));
  };

  return { tabsByProject: current.tabsByProject, activeFileByProject: current.activeFileByProject, setOpenArtifactIds, setActiveFileId };
}
