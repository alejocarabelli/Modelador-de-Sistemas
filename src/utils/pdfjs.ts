import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

let library: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

/** pdf.js is heavy, so it loads the first time a PDF is opened. The legacy build runs on the oldest macOS the app supports. */
const loadPdfJs = (): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> => {
  library ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })().catch((error: unknown) => {
    library = null;
    throw error;
  });
  return library;
};

/** CMaps, standard fonts and decoders ship inside the app (see scripts/vite-pdfjs-assets.mjs). */
const assetUrl = (folder: string): string => new URL(`pdfjs/${folder}/`, document.baseURI).href;

/** The loading task owns a worker: it is destroyed if opening fails or `signal` aborts (the viewer went away). */
export const openPdfDocument = async (blob: Blob, signal?: AbortSignal): Promise<PDFDocumentProxy> => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  const task = pdfjs.getDocument({
    data,
    cMapUrl: assetUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: assetUrl('standard_fonts'),
    wasmUrl: assetUrl('wasm'),
    iccUrl: assetUrl('iccs'),
  });
  const abort = (): void => { void task.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await task.promise;
  } catch (error) {
    abort();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
};

/** Frees the worker and every page the document still holds. */
export const closePdfDocument = (document: PDFDocumentProxy): void => {
  void document.loadingTask.destroy().catch(() => undefined);
};

/** Page count of a PDF that was just added; null if pdf.js cannot read it (it is still stored). */
export const countPdfPages = async (blob: Blob): Promise<number | null> => {
  try {
    const document = await openPdfDocument(blob);
    const count = document.numPages;
    closePdfDocument(document);
    return count;
  } catch {
    return null;
  }
};
