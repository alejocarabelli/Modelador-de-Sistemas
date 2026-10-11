import { afterEach, describe, expect, it, vi } from 'vitest';
import { canOpenFileWindow, openFileWindow, parseFileHash, parseViewerHash } from './nativeWindows';

afterEach(() => vi.unstubAllGlobals());

describe('file window hash', () => {
  it('reads project and file from #archivo=', () => {
    expect(parseFileHash('#archivo=p%201/f-2')).toEqual({ projectId: 'p 1', fileId: 'f-2' });
  });

  it('rejects other hashes and incomplete ones', () => {
    expect(parseFileHash('#viewer=p/a')).toBeNull();
    expect(parseFileHash('#archivo=solo')).toBeNull();
    expect(parseFileHash('')).toBeNull();
    expect(parseViewerHash('#archivo=p/f')).toBeNull();
  });
});

describe('opening a PDF in its own window', () => {
  it('is offered in a plain browser, and opens a #archivo= tab', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open, location: { pathname: '/app/' } });
    expect(canOpenFileWindow()).toBe(true);
    openFileWindow('p 1', 'f2', 'Título');
    expect(open).toHaveBeenCalledWith('/app/#archivo=p%201/f2', '_blank');
  });

  it('is offered on the Mac shell, which asks for kind: file', () => {
    const postMessage = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('window', { __modeladorNativeWindows: true, __modeladorNativeFiles: true, __modeladorBridges: { windows: { postMessage } } });
    expect(canOpenFileWindow()).toBe(true);
    openFileWindow('p', 'f', 'Enunciado · vista');
    expect(postMessage).toHaveBeenCalledWith({ action: 'open', kind: 'file', projectId: 'p', fileId: 'f', title: 'Enunciado · vista' });
  });

  it('is hidden where there are native windows but no files bridge (the Windows shell)', () => {
    vi.stubGlobal('window', { __modeladorNativeWindows: true, __modeladorBridges: { windows: { postMessage: vi.fn() } } });
    expect(canOpenFileWindow()).toBe(false);
  });
});
