import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignArtifact, DiagramProject, ProjectFile } from '../types/diagram';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';

vi.mock('react', async () => (await import('./testHookHarness')).runtime.api);
const { useArtifactTabs } = await import('./useArtifactTabs');

const file = (id: string): ProjectFile => ({ id, name: `${id}.pdf`, size: 1, addedAt: '2026-10-01T00:00:00.000Z' });
const artifact = (id: string): DesignArtifact => ({ id, type: 'class-diagram', name: id, createdAt: '', updatedAt: '', content: { nodes: [], edges: [] } });
const project = (activeArtifactId: string, files: ProjectFile[] = []): DiagramProject => ({
  id: 'p', name: 'P', createdAt: '', updatedAt: '', activeArtifactId, artifacts: [artifact('a1'), artifact('a2')], ...(files.length ? { files } : {}),
});

const hookUnderTest = useArtifactTabs;
const renderHook = (projects: DiagramProject[], activeProjectId: string | null = 'p') => {
  runtime.begin();
  return hookUnderTest(projects, activeProjectId);
};

describe('useArtifactTabs with PDFs', () => {
  beforeEach(() => {
    stubBrowser();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });
  afterEach(() => {
    runtime.reset();
    vi.unstubAllGlobals();
  });

  it('keeps the tab of a PDF that was opened', () => {
    const projects = [project('a1', [file('f1')])];
    const first = renderHook(projects);
    first.setOpenArtifactIds('p', [...first.tabsByProject.p, 'f1']);
    expect(renderHook(projects).tabsByProject.p).toEqual(['a1', 'f1']);
    // A new project list (any edit) must not drop the PDF tab.
    const edited = [{ ...projects[0], updatedAt: 'ahora' }];
    renderHook(edited);
    expect(renderHook(edited).tabsByProject.p).toEqual(['a1', 'f1']);
  });

  it('shows one PDF at a time per project, and nothing is active until one is chosen', () => {
    const projects = [project('a1', [file('f1'), file('f2')])];
    const first = renderHook(projects);
    expect(first.activeFileByProject).toEqual({});
    first.setActiveFileId('p', 'f1');
    expect(renderHook(projects).activeFileByProject.p).toBe('f1');
    first.setActiveFileId('p', 'f2');
    expect(renderHook(projects).activeFileByProject.p).toBe('f2');
  });

  it('forgets the active PDF once it leaves the project, and closes its tab', () => {
    const withFile = [project('a1', [file('f1')])];
    const first = renderHook(withFile);
    first.setOpenArtifactIds('p', ['a1', 'f1']);
    first.setActiveFileId('p', 'f1');
    renderHook(withFile);
    const without = [project('a1')];
    renderHook(without);
    const after = renderHook(without);
    expect(after.activeFileByProject.p).toBeUndefined();
    expect(after.tabsByProject.p).toEqual(['a1']);
  });

  it('gives the foreground back to an artifact chosen any other way', () => {
    const projects = [project('a1', [file('f1')])];
    const first = renderHook(projects);
    first.setActiveFileId('p', 'f1');
    expect(renderHook(projects).activeFileByProject.p).toBe('f1');
    // A new, imported or moved artifact becomes the project's active one.
    const next = [project('a2', [file('f1')])];
    renderHook(next);
    expect(renderHook(next).activeFileByProject.p).toBeUndefined();
  });

  it('leaves the active PDF alone when the project merely changes', () => {
    const projects = [project('a1', [file('f1')])];
    const first = renderHook(projects);
    first.setActiveFileId('p', 'f1');
    renderHook(projects);
    const edited = [{ ...projects[0], files: [{ ...file('f1'), pageCount: 9 }] }];
    renderHook(edited);
    expect(renderHook(edited).activeFileByProject.p).toBe('f1');
  });

  it('does not pull the hidden artifact back into the tabs while a PDF is shown', () => {
    const projects = [project('a1', [file('f1')])];
    const first = renderHook(projects);
    first.setActiveFileId('p', 'f1');
    first.setOpenArtifactIds('p', ['f1']); // "cerrar las demás" on the PDF
    renderHook(projects);
    const edited = [{ ...projects[0], files: [{ ...file('f1'), pageCount: 9 }] }];
    renderHook(edited);
    const after = renderHook(edited);
    expect(after.tabsByProject.p).toEqual(['f1']);
    expect(after.activeFileByProject.p).toBe('f1');
  });
});
