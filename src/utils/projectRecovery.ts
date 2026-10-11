import type { DiagramProject } from '../types/diagram';
import { relinkArtifactForProject } from './artifactTransfer';
import { createId } from './id';

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonical(item)]));
};

export const sameProjectContent = (left: DiagramProject, right: DiagramProject): boolean => {
  const content = (project: DiagramProject): unknown => ({
    name: project.name,
    artifacts: project.artifacts.map((artifact) => ({
      id: artifact.id, type: artifact.type, name: artifact.name, content: artifact.content, notebook: artifact.notebook,
    })),
    files: (project.files ?? []).map((file) => ({ id: file.id, name: file.name })),
  });
  return JSON.stringify(canonical(content(left))) === JSON.stringify(canonical(content(right)));
};

export const copyProject = (project: DiagramProject, name = project.name): DiagramProject => {
  const now = new Date().toISOString();
  const idMap = new Map(project.artifacts.map((artifact) => [artifact.id, createId()]));
  const artifacts = project.artifacts.map((artifact) => ({ ...artifact, id: idMap.get(artifact.id)!, updatedAt: now }));
  // `files` travels as is: the copy points at the same stored binaries (same ids).
  return {
    ...project,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    activeArtifactId: project.activeArtifactId ? idMap.get(project.activeArtifactId) : artifacts[0]?.id,
    artifacts: artifacts.map((artifact) => relinkArtifactForProject(artifact, artifacts, idMap, project.artifacts)),
  };
};

export type ProjectImportCounts = { imported: number; recovered: number; skipped: number };
