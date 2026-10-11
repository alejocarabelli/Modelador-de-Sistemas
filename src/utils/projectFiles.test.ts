import { describe, expect, it } from 'vitest';
import type { DiagramProject, ProjectFile } from '../types/diagram';
import {
  addFilesToProject,
  collectableFileIds,
  FILE_GC_MIN_AGE_MS,
  fileDisplayName,
  formatFileSize,
  hasPdfSignature,
  MAX_PROJECT_FILE_BYTES,
  normalizeProjectFiles,
  patchFileInProject,
  referencedFileIds,
  rejectionMessage,
  removeFileFromProject,
  renameFileInProject,
  validatePdf,
} from './projectFiles';

const NOW = '2026-10-11T12:00:00.000Z';
const file = (id: string, name = `${id}.pdf`): ProjectFile => ({ id, name, size: 1200, addedAt: '2026-10-01T00:00:00.000Z' });
const project = (files?: ProjectFile[]): DiagramProject => ({
  id: 'p', name: 'Proyecto', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', artifacts: [], ...(files ? { files } : {}),
});
const pdfBlob = (bytes: string | number[], size?: number): Blob => {
  const body = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  const blob = new Blob([body]);
  return size === undefined ? blob : { size, slice: blob.slice.bind(blob) } as Blob;
};

describe('normalizeProjectFiles', () => {
  it('keeps valid entries and drops the broken ones without throwing', () => {
    const valid = { id: 'a1', name: 'Enunciado.pdf', size: 10, pageCount: 3, addedAt: '2026-10-01T00:00:00.000Z' };
    const withoutPageCount = { id: 'e5', name: 'Otro.pdf', size: 10, addedAt: valid.addedAt };
    expect(normalizeProjectFiles([
      valid,
      null,
      'texto',
      { ...valid, id: '../etc/passwd' },
      { ...valid, id: 'a1' },
      { ...valid, id: 'b2', name: '   ' },
      { ...valid, id: 'c3', size: -1 },
      { ...valid, id: 'd4', size: 'grande' },
      { ...withoutPageCount, pageCount: 0 },
    ])).toEqual([valid, withoutPageCount]);
  });

  it('returns nothing for a value that is not a list', () => {
    expect(normalizeProjectFiles(undefined)).toEqual([]);
    expect(normalizeProjectFiles({ id: 'a' })).toEqual([]);
  });

  it('repairs a missing date instead of discarding the file', () => {
    const [kept] = normalizeProjectFiles([{ id: 'a', name: 'A.pdf', size: 1 }]);
    expect(kept.id).toBe('a');
    expect(typeof kept.addedAt).toBe('string');
  });
});

describe('PDF validation', () => {
  it('recognizes the %PDF- signature', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('<html>'))).toBe(false);
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false);
  });

  it('accepts a PDF and rejects empty, oversized and non-PDF files', async () => {
    expect(await validatePdf(pdfBlob('%PDF-1.4 resto'))).toBeNull();
    expect(await validatePdf(pdfBlob(''))).toBe('empty');
    expect(await validatePdf(pdfBlob('PK\u0003\u0004 zip'))).toBe('not-pdf');
    expect(await validatePdf(pdfBlob('%PDF-1.4', MAX_PROJECT_FILE_BYTES + 1))).toBe('too-large');
  });

  it('checks the size before reading any byte', async () => {
    let read = false;
    const huge = { size: MAX_PROJECT_FILE_BYTES + 1, slice: () => { read = true; return new Blob([]); } };
    expect(await validatePdf(huge)).toBe('too-large');
    expect(read).toBe(false);
  });

  it('explains each rejection in the app voice', () => {
    expect(rejectionMessage('TP.pdf', 'too-large')).toContain('50 MB');
    expect(rejectionMessage('foto.png', 'not-pdf')).toContain('no es un PDF');
    expect(rejectionMessage('vacio.pdf', 'empty')).toContain('vacío');
  });
});

describe('names and sizes', () => {
  it('shows names without the .pdf extension', () => {
    expect(fileDisplayName('Enunciado TP2.pdf')).toBe('Enunciado TP2');
    expect(fileDisplayName('resolución.PDF')).toBe('resolución');
    expect(fileDisplayName('.pdf')).toBe('.pdf');
    expect(fileDisplayName('sin extensión')).toBe('sin extensión');
  });

  it('formats sizes for the interface', () => {
    expect(formatFileSize(100)).toBe('1 KB');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('editing the files of a project', () => {
  it('adds files once and bumps updatedAt', () => {
    const added = addFilesToProject(project(), [file('a'), file('b')], NOW);
    expect(added.files?.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(added.updatedAt).toBe(NOW);
    expect(addFilesToProject(added, [file('a')], NOW)).toBe(added);
  });

  it('renames a file and ignores empty or unchanged names', () => {
    const base = project([file('a', 'Viejo.pdf')]);
    expect(renameFileInProject(base, 'a', '  Nuevo  ', NOW).files?.[0].name).toBe('Nuevo');
    expect(renameFileInProject(base, 'a', '   ', NOW)).toBe(base);
    expect(renameFileInProject(base, 'a', 'Viejo.pdf', NOW)).toBe(base);
    expect(renameFileInProject(base, 'zz', 'X', NOW)).toBe(base);
  });

  it('removes a file and drops the list when it was the last one', () => {
    const base = project([file('a'), file('b')]);
    expect(removeFileFromProject(base, 'a', NOW).files?.map((entry) => entry.id)).toEqual(['b']);
    const empty = removeFileFromProject(project([file('a')]), 'a', NOW);
    expect('files' in empty).toBe(false);
    expect(empty.updatedAt).toBe(NOW);
    expect(removeFileFromProject(base, 'zz', NOW)).toBe(base);
  });

  it('learns the page count or size without counting as an edit', () => {
    const base = project([file('a')]);
    const patched = patchFileInProject(base, 'a', { pageCount: 12 });
    expect(patched.files?.[0].pageCount).toBe(12);
    expect(patched.updatedAt).toBe(base.updatedAt);
    expect(patchFileInProject(patched, 'a', { pageCount: 12 })).toBe(patched);
    expect(patchFileInProject(base, 'a', { pageCount: -3 })).toBe(base);
    expect(patchFileInProject(base, 'zz', { pageCount: 3 })).toBe(base);
  });
});

describe('collecting stored binaries', () => {
  it('lists every id any project refers to, once', () => {
    expect(referencedFileIds([project([file('a'), file('b')]), project([file('b')]), project()])).toEqual(['a', 'b']);
  });

  it('only collects what is unreferenced and old enough', () => {
    const now = Date.UTC(2026, 9, 11);
    const day = 24 * 60 * 60 * 1000;
    const stored = [
      { id: 'kept', addedAt: now - 30 * day },
      { id: 'orphan-old', addedAt: now - 8 * day },
      { id: 'orphan-new', addedAt: now - 2 * day },
      { id: 'edge', addedAt: now - FILE_GC_MIN_AGE_MS },
    ];
    expect(collectableFileIds(stored, ['kept'], now)).toEqual(['orphan-old']);
    expect(collectableFileIds(stored, [], now)).toEqual(['kept', 'orphan-old']);
  });
});
