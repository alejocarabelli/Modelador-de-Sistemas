import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIndexedDbBackend, hasNativeFiles, listStoredFileIds, openFileExternally, pickNativeFiles, readStoredFile } from './projectFiles';

const DAY = 24 * 60 * 60 * 1000;
const pdf = (text = '%PDF-1.4 contenido'): Blob => new Blob([text], { type: 'application/pdf' });
const text = (blob: Blob): Promise<string> => new Response(blob).text();

describe('IndexedDB file backend', () => {
  let factory: IDBFactory;
  let clock: number;
  const backend = () => createIndexedDbBackend(factory, () => clock);

  beforeEach(() => {
    factory = new IDBFactory();
    clock = Date.UTC(2026, 9, 11);
  });

  it('stores a file and reads the same bytes back by id', async () => {
    await backend().save('a1', pdf('%PDF-1.4 uno'));
    expect(await text((await backend().read('a1'))!)).toBe('%PDF-1.4 uno');
  });

  it('answers null for a file that is not stored', async () => {
    expect(await backend().read('nada')).toBeNull();
  });

  it('replaces the bytes when the same id is saved again', async () => {
    await backend().save('a1', pdf('%PDF-1.4 viejo'));
    await backend().save('a1', pdf('%PDF-1.4 nuevo'));
    expect(await text((await backend().read('a1'))!)).toBe('%PDF-1.4 nuevo');
    expect(await backend().list()).toEqual(['a1']);
  });

  it('lists what is stored', async () => {
    expect(await backend().list()).toEqual([]);
    await backend().save('a1', pdf());
    await backend().save('b2', pdf());
    expect((await backend().list())?.sort()).toEqual(['a1', 'b2']);
  });

  it('collects only unreferenced files older than a week', async () => {
    await backend().save('referenced-old', pdf());
    await backend().save('orphan-old', pdf());
    clock += 6 * DAY;
    await backend().save('orphan-new', pdf());
    clock += 2 * DAY;
    await backend().collect(['referenced-old']);
    expect((await backend().list())?.sort()).toEqual(['orphan-new', 'referenced-old']);
  });

  it('never throws when the database cannot be opened', async () => {
    const broken = createIndexedDbBackend({ open: () => { throw new Error('sin permiso'); } } as unknown as IDBFactory);
    await expect(broken.collect([])).resolves.toBeUndefined();
    expect(await broken.list()).toBeNull();
    expect(await broken.read('a')).toBeNull();
  });
});

describe('native backend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses IndexedDB unless the Mac shell raised its flag', async () => {
    vi.stubGlobal('window', {});
    expect(hasNativeFiles()).toBe(false);
    expect(await listStoredFileIds()).toEqual([]);
  });

  it('asks the native bridge for the listing', async () => {
    const postMessage = vi.fn(async () => ({ ids: ['a', 7, 'b'] }));
    vi.stubGlobal('window', { __modeladorNativeFiles: true, __modeladorBridges: { files: { postMessage } } });
    expect(await listStoredFileIds()).toEqual(['a', 'b']);
    expect(postMessage).toHaveBeenCalledWith({ action: 'list' });
  });

  it('keeps only well-formed files from the picker', async () => {
    const reply = {
      files: [{ id: 'ok-1', name: 'A.pdf', size: 10 }, { id: '../mal', name: 'B.pdf', size: 1 }, { id: 'sin-nombre', size: 1 }],
      rejected: [{ name: 'foto.png', reason: 'not-pdf' }],
    };
    const postMessage = vi.fn(async () => reply);
    vi.stubGlobal('window', { __modeladorNativeFiles: true, __modeladorBridges: { files: { postMessage } } });
    expect(await pickNativeFiles()).toEqual({ files: [reply.files[0]], rejected: reply.rejected });
    expect(await pickNativeFiles('abc')).not.toBeNull();
    expect(postMessage).toHaveBeenLastCalledWith({ action: 'pick', replaceId: 'abc' });
  });

  it('keeps the original name of the picked PDF, which the store names after its id', async () => {
    const id = 'd7e8ef84-97b8-488c-95d4-79435d831c2b';
    const reply = { files: [{ id, name: 'miviaje recortado-2.pdf', size: 183752 }], rejected: [] };
    vi.stubGlobal('window', { __modeladorNativeFiles: true, __modeladorBridges: { files: { postMessage: async () => reply } } });
    expect((await pickNativeFiles())?.files[0]).toEqual(reply.files[0]);
  });

  it('treats a cancelled picker as no result', async () => {
    vi.stubGlobal('window', { __modeladorNativeFiles: true, __modeladorBridges: { files: { postMessage: async () => null } } });
    expect(await pickNativeFiles()).toBeNull();
  });

  it('reads a stored PDF through the app scheme and answers null when the response is not ok', async () => {
    vi.stubGlobal('window', { __modeladorNativeFiles: true });
    vi.stubGlobal('document', { baseURI: 'modeladorv2://app/index.html' });
    const fetchMock = vi.fn(async () => new Response('%PDF-1.4', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await readStoredFile('abc-1')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('modeladorv2://app/__archivos/abc-1.pdf');
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await readStoredFile('abc-1')).toBeNull();
  });
});

describe('opening a PDF in the browser', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (open: () => unknown) => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:prueba', revokeObjectURL: revoke }));
    vi.stubGlobal('window', { open, setTimeout: (callback: () => void) => { callback(); return 0; } });
    return revoke;
  };

  it('revokes the blob URL after the tab opened', async () => {
    const revoke = stub(() => ({}));
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    await createIndexedDbBackend(factory).save('abc', new Blob(['%PDF-1.4']));
    expect(await openFileExternally('abc')).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:prueba');
  });

  it('revokes it at once, and reports failure, when the popup is blocked', async () => {
    const revoke = stub(() => null);
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    await createIndexedDbBackend(factory).save('abc', new Blob(['%PDF-1.4']));
    expect(await openFileExternally('abc')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:prueba');
  });
});
