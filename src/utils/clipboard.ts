type NativeBridge = { postMessage: (message: unknown) => Promise<unknown> };

declare global {
  interface Window {
    /** Set by the macOS shell: its windows bridge also writes text to the system pasteboard. */
    __modeladorNativeClipboard?: boolean;
  }
}

const nativeBridge = (): NativeBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorNativeClipboard !== true) return null;
  const handlers = (window as unknown as { webkit?: { messageHandlers?: { modeladorWindows?: NativeBridge } } })
    .webkit?.messageHandlers;
  return window.__modeladorBridges?.windows ?? handlers?.modeladorWindows ?? null;
};

/** Hidden textarea + execCommand: synchronous, so it still counts as part of the click. */
const copyWithSelection = (text: string): boolean => {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(field);
  field.select();
  let copied: boolean;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  previousFocus?.focus();
  return copied;
};

/**
 * Puts text on the system clipboard. The Mac shell writes it natively
 * (NSPasteboard), since its custom scheme does not count as a secure origin
 * for the Clipboard API. Elsewhere the copy runs synchronously inside the
 * click that asked for it (the selection copy needs that user gesture), and
 * the Clipboard API is the fallback.
 */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  const native = nativeBridge();
  if (native) {
    try {
      await native.postMessage({ action: 'copy-text', text });
      return true;
    } catch {
      // Falls through to the web paths.
    }
  }
  if (copyWithSelection(text)) return true;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
