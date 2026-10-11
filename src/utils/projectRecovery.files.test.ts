import { describe, expect, it } from 'vitest';
import type { DiagramProject, ProjectFile } from '../types/diagram';
import { copyProject, sameProjectContent } from './projectRecovery';

const file = (id: string, name = `${id}.pdf`): ProjectFile => ({ id, name, size: 1, pageCount: 2, addedAt: '2026-10-01T00:00:00.000Z' });
const base = (files?: ProjectFile[]): DiagramProject => ({
  id: 'p', name: 'Proyecto', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', artifacts: [], ...(files ? { files } : {}),
});

describe('sameProjectContent with files', () => {
  it('is the same when the files match, ignoring dates and sizes', () => {
    expect(sameProjectContent(base([file('a')]), base([{ ...file('a'), size: 99, pageCount: 7, addedAt: 'otra' }]))).toBe(true);
  });

  it('differs when a file is added, removed or renamed', () => {
    expect(sameProjectContent(base([file('a')]), base([file('a'), file('b')]))).toBe(false);
    expect(sameProjectContent(base([file('a')]), base())).toBe(false);
    expect(sameProjectContent(base([file('a', 'Uno.pdf')]), base([file('a', 'Dos.pdf')]))).toBe(false);
  });

  it('treats no files and an empty list alike', () => {
    expect(sameProjectContent(base(), base([]))).toBe(true);
  });
});

describe('copyProject with files', () => {
  it('keeps the same files, so the copy shares their stored binaries', () => {
    const original = base([file('a'), file('b')]);
    const copy = copyProject(original, 'Copia');
    expect(copy.id).not.toBe(original.id);
    expect(copy.files).toEqual(original.files);
  });

  it('adds no files to a project that had none', () => {
    expect('files' in copyProject(base())).toBe(false);
  });
});
