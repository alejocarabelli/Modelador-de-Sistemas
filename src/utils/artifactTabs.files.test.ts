import { describe, expect, it } from 'vitest';
import type { DesignArtifact, DiagramProject, ProjectFile } from '../types/diagram';
import {
  artifactTabShortcut,
  closeArtifactTabs,
  closeOtherArtifactTabs,
  filterArtifactTabs,
  projectTabIds,
  readArtifactTabs,
  reconcileArtifactTabs,
  resolveActiveTab,
} from './artifactTabs';

const file = (id: string): ProjectFile => ({ id, name: `${id}.pdf`, size: 1, addedAt: '2026-10-01T00:00:00.000Z' });
const artifact = (id: string): DesignArtifact => ({ id, type: 'class-diagram', name: id, createdAt: '', updatedAt: '', content: { nodes: [], edges: [] } });
const project = (files: ProjectFile[] = []): DiagramProject => ({
  id: 'p', name: 'P', createdAt: '', updatedAt: '', activeArtifactId: 'a1', artifacts: [artifact('a1'), artifact('a2')], files,
});
const tabs = (activeArtifactId: string | null, openArtifactIds: string[]) => ({ openArtifactIds, activeArtifactId });

describe('tabs that mix artifacts and PDFs', () => {
  it('lists artifact and file ids together', () => {
    expect(projectTabIds(project([file('f1')]))).toEqual(['a1', 'a2', 'f1']);
    expect(projectTabIds({ artifacts: [artifact('a1')] })).toEqual(['a1']);
  });

  it('keeps file ids when restoring saved tabs', () => {
    const ids = projectTabIds(project([file('f1')]));
    expect(readArtifactTabs(JSON.stringify(['f1', 'gone', 'a2']), ids, 'a1').openArtifactIds).toEqual(['f1', 'a2', 'a1']);
    expect(filterArtifactTabs(['f1', 'x'], ids)).toEqual(['f1']);
  });

  it('drops the tab of a PDF that left the project', () => {
    const state = reconcileArtifactTabs(tabs('a1', ['a1', 'f1', 'a2']), {
      existingArtifactIds: projectTabIds(project()), activeArtifactId: 'a1', projectOpened: false, projectActive: true,
    });
    expect(state.openArtifactIds).toEqual(['a1', 'a2']);
  });

  it('closing the active PDF activates its neighbor, which can be an artifact', () => {
    expect(closeArtifactTabs(tabs('f1', ['a1', 'f1', 'a2']), ['f1'])).toEqual(tabs('a2', ['a1', 'a2']));
    expect(closeArtifactTabs(tabs('f1', ['a1', 'f1']), ['f1'])).toEqual(tabs('a1', ['a1']));
  });

  it('closing an artifact while a PDF is active keeps the PDF active', () => {
    expect(closeArtifactTabs(tabs('f1', ['a1', 'f1']), ['a1'])).toEqual(tabs('f1', ['f1']));
  });

  it('close others keeps only the chosen PDF', () => {
    expect(closeOtherArtifactTabs(tabs('a1', ['a1', 'f1', 'a2']), 'f1')).toEqual(tabs('f1', ['f1']));
  });

  it('shortcuts move through artifacts and PDFs alike', () => {
    const state = tabs('f1', ['a1', 'f1', 'a2']);
    const key = (extra: Partial<Parameters<typeof artifactTabShortcut>[0]>) =>
      artifactTabShortcut({ key: '1', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, ...extra }, state, true);
    expect(key({})).toEqual({ type: 'select', artifactId: 'a1' });
    expect(key({ key: '2' })).toEqual({ type: 'select', artifactId: 'f1' });
    expect(key({ key: '9' })).toEqual({ type: 'select', artifactId: 'a2' });
    expect(key({ key: 'w' })).toEqual({ type: 'close', artifactId: 'f1' });
    expect(key({ key: 'Tab', metaKey: false, ctrlKey: true })).toEqual({ type: 'select', artifactId: 'a2' });
  });
});

describe('the one active tab', () => {
  it('is the chosen PDF when there is one', () => {
    const result = resolveActiveTab(project([file('f1')]), 'f1');
    expect(result).toEqual({ kind: 'file', file: file('f1') });
  });

  it('falls back to the active artifact when no PDF is chosen or it no longer exists', () => {
    expect(resolveActiveTab(project([file('f1')]), null)?.kind).toBe('artifact');
    expect(resolveActiveTab(project([file('f1')]), undefined)?.kind).toBe('artifact');
    const stale = resolveActiveTab(project(), 'f1');
    expect(stale).toEqual({ kind: 'artifact', artifact: artifact('a1') });
  });

  it('uses the first artifact if the active one is missing, and nothing for an empty project', () => {
    expect(resolveActiveTab({ ...project(), activeArtifactId: 'gone' }, null)).toEqual({ kind: 'artifact', artifact: artifact('a1') });
    expect(resolveActiveTab({ artifacts: [], files: [] }, null)).toBeNull();
  });
});
