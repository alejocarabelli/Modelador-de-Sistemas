import { collectableFileIds, FILE_ID_PATTERN } from '../utils/projectFiles';

type FilesBridge = { postMessage: (message: Record<string, unknown>) => Promise<unknown> };

declare global {
  interface Window {
    /** Set by the Mac shell in every window: PDFs live in ~/Documents and are read through the app's own scheme. */
    __modeladorNativeFiles?: boolean;
  }
}

/** What a backend can do with the bytes of a PDF; the project itself only stores the metadata. */
export type FileBackend = {
  save: (fileId: string, blob: Blob) => Promise<void>;
  /** null when the binary is not there (another machine, a restored backup). */
  read: (fileId: string) => Promise<Blob | null>;
  /** Ids that are stored right now, or null when that cannot be known. */
  list: () => Promise<string[] | null>;
  /** Collects what no project refers to any more; see collectableFileIds for the rules. */
  collect: (referenced: string[]) => Promise<void>;
};

const nativeBridge = (): FilesBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorNativeFiles !== true) return null;
  const handlers = (window as unknown as { webkit?: { messageHandlers?: { modeladorFiles?: FilesBridge } } }).webkit?.messageHandlers;
  return window.__modeladorBridges?.files ?? handlers?.modeladorFiles ?? null;
};

/** Mac only: the files sit in Documents, so they can be shown in Finder and opened in Vista Previa. */
export const hasNativeFiles = (): boolean => typeof window !== 'undefined' && window.__modeladorNativeFiles === true;

const nativeFileUrl = (fileId: string): string => new URL(`__archivos/${fileId}.pdf`, document.baseURI).href;

const toBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
  reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
  reader.readAsDataURL(blob);
});

const nativeBackend: FileBackend = {
  async save(fileId, blob) {
    const bridge = nativeBridge();
    if (bridge === null) throw new Error('No se pudo guardar el archivo.');
    await bridge.postMessage({ action: 'save', fileId, data: await toBase64(blob) });
  },
  async read(fileId) {
    try {
      const response = await fetch(nativeFileUrl(fileId));
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  },
  async list() {
    try {
      const reply = await nativeBridge()?.postMessage({ action: 'list' }) as { ids?: unknown } | undefined;
      return Array.isArray(reply?.ids) ? reply.ids.filter((id): id is string => typeof id === 'string') : null;
    } catch {
      return null;
    }
  },
  async collect(referenced) {
    await nativeBridge()?.postMessage({ action: 'gc', referenced }).catch(() => undefined);
  },
};

const DB_NAME = 'modelador-archivos';
const STORE = 'files';

type StoredRecord = { blob: Blob; addedAt: number };

const request = <T,>(source: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  source.onsuccess = () => resolve(source.result);
  source.onerror = () => reject(source.error ?? new Error('IndexedDB falló.'));
});

const finished = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB falló.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB falló.'));
});

/** Browser, dev and Windows: the bytes go to IndexedDB, keyed by file id. */
export const createIndexedDbBackend = (factory: IDBFactory, now: () => number = Date.now): FileBackend => {
  const open = (): Promise<IDBDatabase> => {
    const opening = factory.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
    return request(opening);
  };
  return {
    async save(fileId, blob) {
      const db = await open();
      try {
        const transaction = db.transaction(STORE, 'readwrite');
        const done = finished(transaction);
        transaction.objectStore(STORE).put({ blob, addedAt: now() } satisfies StoredRecord, fileId);
        await done;
      } finally {
        db.close();
      }
    },
    async read(fileId) {
      try {
        const db = await open();
        try {
          const record = await request<StoredRecord | undefined>(db.transaction(STORE).objectStore(STORE).get(fileId));
          return record?.blob ?? null;
        } finally {
          db.close();
        }
      } catch {
        return null;
      }
    },
    async list() {
      try {
        const db = await open();
        try {
          return (await request(db.transaction(STORE).objectStore(STORE).getAllKeys())).map(String);
        } finally {
          db.close();
        }
      } catch {
        return null;
      }
    },
    async collect(referenced) {
      try {
        const db = await open();
        try {
          const store = db.transaction(STORE).objectStore(STORE);
          const [keys, records] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
          const stored = keys.map((key, index) => ({ id: String(key), addedAt: (records[index] as StoredRecord).addedAt }));
          const doomed = collectableFileIds(stored, referenced, now());
          if (doomed.length === 0) return;
          const transaction = db.transaction(STORE, 'readwrite');
          const done = finished(transaction);
          doomed.forEach((id) => transaction.objectStore(STORE).delete(id));
          await done;
        } finally {
          db.close();
        }
      } catch {
        // Collecting is housekeeping: an orphan binary does no harm.
      }
    },
  };
};

const backend = (): FileBackend => hasNativeFiles() ? nativeBackend : createIndexedDbBackend(indexedDB);

export const storeFile = (fileId: string, blob: Blob): Promise<void> => backend().save(fileId, blob);
export const readStoredFile = (fileId: string): Promise<Blob | null> => backend().read(fileId);
export const listStoredFileIds = (): Promise<string[] | null> => backend().list();
export const collectStoredFiles = (referenced: string[]): Promise<void> => backend().collect(referenced);

export type PickedFile = { id: string; name: string; size: number };
export type PickResult = { files: PickedFile[]; rejected: { name: string; reason: 'empty' | 'too-large' | 'not-pdf' | 'failed' }[] };

/** Mac: the system open panel copies the chosen PDFs straight into the store, with no base64 round trip. With `replaceFileId` it takes one PDF and stores it under that id. */
export const pickNativeFiles = async (replaceFileId?: string): Promise<PickResult | null> => {
  const reply = await nativeBridge()?.postMessage({ action: 'pick', ...(replaceFileId === undefined ? {} : { replaceId: replaceFileId }) }) as Partial<PickResult> | null | undefined;
  if (reply === null || reply === undefined) return null;
  const files = (Array.isArray(reply.files) ? reply.files : []).filter((file): file is PickedFile =>
    typeof file?.id === 'string' && FILE_ID_PATTERN.test(file.id) && typeof file.name === 'string' && typeof file.size === 'number');
  return { files, rejected: Array.isArray(reply.rejected) ? reply.rejected : [] };
};

export const revealStoredFile = (fileId: string): void => {
  void nativeBridge()?.postMessage({ action: 'reveal', fileId }).catch(() => undefined);
};

/** Last resort when the built-in viewer cannot show a file: Vista Previa on Mac, the browser's own viewer elsewhere. */
export const openFileExternally = async (fileId: string): Promise<boolean> => {
  const bridge = nativeBridge();
  if (bridge !== null) {
    try {
      await bridge.postMessage({ action: 'open-external', fileId });
      return true;
    } catch {
      return false;
    }
  }
  const blob = await readStoredFile(fileId);
  if (blob === null) return false;
  const url = URL.createObjectURL(blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' }));
  const opened = window.open(url, '_blank');
  // The new tab has its own reference once it loads; a blocked popup never will.
  if (opened === null) URL.revokeObjectURL(url);
  else window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return opened !== null;
};
