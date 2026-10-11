import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const destroy = vi.fn(async () => undefined);
let outcome: Promise<unknown>;
const getDocument = vi.fn(() => ({ promise: outcome, destroy }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument, GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }));
const { openPdfDocument } = await import('./pdfjs');

describe('openPdfDocument', () => {
  beforeEach(() => {
    destroy.mockClear();
    getDocument.mockClear();
    vi.stubGlobal('document', { baseURI: 'modeladorv2://app/index.html' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hands back the document and keeps the task alive', async () => {
    outcome = Promise.resolve({ numPages: 2 });
    expect(await openPdfDocument(new Blob(['%PDF-1.4']))).toEqual({ numPages: 2 });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('destroys the loading task, and so its worker, when opening fails', async () => {
    outcome = Promise.reject(new Error('dañado'));
    await expect(openPdfDocument(new Blob(['%PDF-1.4']))).rejects.toThrow('dañado');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('destroys the task when the viewer goes away while it is still loading', async () => {
    const controller = new AbortController();
    let finish: (value: unknown) => void = () => undefined;
    outcome = new Promise((resolve) => { finish = resolve; });
    const opening = openPdfDocument(new Blob(['%PDF-1.4']), controller.signal);
    await vi.waitFor(() => expect(getDocument).toHaveBeenCalled());
    controller.abort();
    expect(destroy).toHaveBeenCalledOnce();
    finish({ numPages: 1 });
    await opening;
  });

  it('does not even start when it was cancelled before the bytes were read', async () => {
    getDocument.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(openPdfDocument(new Blob(['%PDF-1.4']), controller.signal)).rejects.toThrow();
    expect(getDocument).not.toHaveBeenCalled();
  });
});
