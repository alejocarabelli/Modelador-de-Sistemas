import { describe, expect, it, vi } from 'vitest';
import { normalizeDiagramProject } from './diagramNormalization';
import { loadProjects, saveProjects } from '../storage/projectsStorage';
import { createMemoryStorage } from '../hooks/testHookHarness';

const file = { id: 'f1', name: 'Enunciado.pdf', size: 2048, pageCount: 4, addedAt: '2026-10-01T00:00:00.000Z' };
const raw = (extra: Record<string, unknown> = {}) => ({
  id: 'p', name: 'Proyecto', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  artifacts: [], ...extra,
});

describe('projects with files', () => {
  it('keeps the files through normalization', () => {
    expect(normalizeDiagramProject(raw({ files: [file] })).files).toEqual([file]);
  });

  it('leaves a project without files exactly as before', () => {
    expect('files' in normalizeDiagramProject(raw())).toBe(false);
    expect('files' in normalizeDiagramProject(raw({ files: [] }))).toBe(false);
    expect('files' in normalizeDiagramProject(raw({ files: 'roto' }))).toBe(false);
  });

  it('discards invalid entries and keeps the rest', () => {
    const project = normalizeDiagramProject(raw({ files: [file, { id: 'x/y', name: 'a.pdf', size: 1 }, 7] }));
    expect(project.files).toEqual([file]);
  });

  it('does not treat a discarded file entry as a damaged project', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      storage.setItem('design-projects:v2', JSON.stringify({ version: 2, projects: [raw({ files: [file, { id: '../x', name: 'a', size: 1 }] })] }));
      const loaded = loadProjects();
      expect(loaded.recoveryRaw).toBeNull();
      expect(loaded.projects[0].files).toEqual([file]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the files of a legacy project that still has a single `content`', () => {
    const legacy = normalizeDiagramProject({
      id: 'old', name: 'Viejo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      content: { nodes: [], edges: [] }, files: [file, { id: '../x', name: 'a', size: 1 }],
    } as never);
    expect(legacy.files).toEqual([file]);
    expect(legacy.artifacts).toHaveLength(1);
  });

  it('survives a save and a load', () => {
    const storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      saveProjects([normalizeDiagramProject(raw({ files: [file] }))]);
      expect(loadProjects().projects[0].files).toEqual([file]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
