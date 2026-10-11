import { ExternalLink, FileX } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ProjectFile } from '../types/diagram';
import { CanvasZoom } from './ui/CanvasZoom';
import { EditorToolbar, ToolButton } from './ui/Toolbar';
import { hasNativeFiles, openFileExternally, readStoredFile } from '../storage/projectFiles';
import { readUiPreference, writeUiPreference } from '../storage/uiPreferences';
import { closePdfDocument, openPdfDocument, type PDFDocumentProxy, type RenderTask } from '../utils/pdfjs';
import { fileDisplayName } from '../utils/projectFiles';
import {
  capturePdfZoomAnchor,
  clampPdfZoom,
  clampPinchFactor,
  computePdfLayout,
  nextPdfZoom,
  parsePdfView,
  PDF_GAP,
  PDF_MARGIN,
  pdfPageAt,
  pdfCanvasSize,
  pdfRegionCovers,
  pdfRenderRegion,
  restorePdfZoomAnchor,
  visiblePdfPages,
  type PdfRect,
  type PdfRegion,
  type PdfView,
  type PdfZoomAnchor,
} from '../utils/pdfLayout';

const viewKey = (fileId: string): string => `modelador.pdfView.${fileId}`;
/** A zoom or a scroll settles this long before pages are drawn again; until then what is shown is stretched. */
const ZOOM_SETTLE_MS = 140;
const SCROLL_SETTLE_MS = 80;
/** Pages measured before the first one is shown; a longer document keeps measuring in the background. */
const PAGES_MEASURED_FIRST = 300;

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; doc: PDFDocumentProxy }
  | { status: 'missing' }
  | { status: 'error' };

type PdfPageProps = {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  height: number;
  scale: number;
  /** Where the sheet sits inside the scrolling area, to tell which part of it is in view. */
  top: number;
  left: number;
  active: boolean;
  getView: () => PdfRect;
  subscribe: (listener: () => void) => () => void;
  onFailure: () => void;
};

/**
 * One sheet. Only active pages hold a canvas: leaving the screen frees it and cancels a render in flight.
 * A page that fits is drawn whole; a huge one is drawn only where it is being read, at full resolution.
 * Zooming never blanks it: the canvas on screen is stretched at once and drawn again once the zoom settles.
 */
const PdfPage = memo(function PdfPage({ doc, number, width, height, scale, top, left, active, getView, subscribe, onFailure }: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ width, height, scale, top, left });
  const controllerRef = useRef<{ update: () => void } | null>(null);

  useLayoutEffect(() => {
    latest.current = { width, height, scale, top, left };
  }, [width, height, scale, top, left]);

  useEffect(() => {
    const host = hostRef.current;
    if (!active || host === null) return undefined;
    let disposed = false;
    let busy = false;
    let timer = 0;
    let task: RenderTask | null = null;
    let renderingScale = 0;
    let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
    const shown: { canvas: HTMLCanvasElement | null; region: PdfRegion | null; scale: number } = { canvas: null, region: null, scale: 0 };

    const restyle = (): void => {
      if (shown.canvas === null || shown.region === null) return;
      const k = latest.current.scale / shown.scale;
      const { style } = shown.canvas;
      style.left = `${shown.region.x * k}px`;
      style.top = `${shown.region.y * k}px`;
      style.width = `${shown.region.width * k}px`;
      style.height = `${shown.region.height * k}px`;
    };
    const pageView = (): PdfRect => {
      const view = getView();
      return { left: view.left - latest.current.left, top: view.top - latest.current.top, width: view.width, height: view.height };
    };
    let pending = false;
    const schedule = (delay: number): void => {
      window.clearTimeout(timer);
      pending = true;
      timer = window.setTimeout(() => { pending = false; void render(); }, delay);
    };
    const render = async (): Promise<void> => {
      if (disposed || busy) return;
      const { width: pageWidth, height: pageHeight, scale: pageScale } = latest.current;
      const view = pageView();
      if (shown.region !== null && shown.scale === pageScale && pdfRegionCovers(shown.region, pageWidth, pageHeight, view)) return;
      busy = true;
      renderingScale = pageScale;
      try {
        page ??= await doc.getPage(number);
        if (disposed) return;
        const region = pdfRenderRegion({ pageWidth, pageHeight, view, dpr: window.devicePixelRatio || 1 });
        const canvas = document.createElement('canvas');
        const size = pdfCanvasSize(region);
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Página ${number}`);
        canvas.style.position = 'absolute';
        task = page.render({
          canvas,
          viewport: page.getViewport({ scale: pageScale * region.ratio, offsetX: -region.x * region.ratio, offsetY: -region.y * region.ratio }),
        });
        await task.promise;
        task = null;
        if (disposed) { canvas.width = 0; canvas.height = 0; return; }
        // The new drawing replaces the old one only when it is ready, so there is never a blank sheet.
        if (shown.canvas !== null) { shown.canvas.remove(); shown.canvas.width = 0; shown.canvas.height = 0; }
        host.appendChild(canvas);
        shown.canvas = canvas;
        shown.region = region;
        shown.scale = pageScale;
        restyle();
      } catch (error) {
        // Leaving the screen or zooming on cancels the render on purpose; anything else is a page that cannot be shown.
        if (!disposed && !(error instanceof Error && error.name === 'RenderingCancelledException')) onFailure();
      } finally {
        busy = false;
        task = null;
        // What was asked for while drawing is checked now, unless a zoom or scroll already has its own settle pending.
        if (!disposed && !pending) schedule(0);
      }
    };

    controllerRef.current = {
      update: () => {
        restyle();
        if (task !== null && renderingScale !== latest.current.scale) task.cancel();
        schedule(shown.canvas === null ? 0 : ZOOM_SETTLE_MS);
      },
    };
    const unsubscribe = subscribe(() => schedule(SCROLL_SETTLE_MS));
    schedule(0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unsubscribe();
      task?.cancel();
      controllerRef.current = null;
      if (shown.canvas !== null) { shown.canvas.remove(); shown.canvas.width = 0; shown.canvas.height = 0; }
      page?.cleanup();
    };
  }, [active, doc, number, getView, subscribe, onFailure]);

  useEffect(() => {
    controllerRef.current?.update();
  }, [width, height, scale, top, left]);

  return <div className="pdf-page" data-page={number} ref={hostRef} style={{ height, width }} />;
});

type PdfViewerProps = {
  file: ProjectFile;
  /** Called once the page count is known, so the sidebar can show it. */
  onPageCount?: (pageCount: number) => void;
  /** Main window only; the secondary window already is one. */
  onOpenInWindow?: () => void;
  onRemove?: () => void;
  onReplace?: () => void;
};

/** The viewer of a project PDF: continuous scroll, page counter and the app's zoom control. */
export function PdfViewer({ file, onPageCount, onOpenInWindow, onRemove, onReplace }: PdfViewerProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [initialView] = useState<PdfView>(() => parsePdfView(readUiPreference(viewKey(file.id))));
  const [zoom, setZoom] = useState(initialView.zoom);
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ current: initialView.page, first: 0, last: 0 });
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef<PDFDocumentProxy | null>(null);
  // Where the reader is (page + fraction of it), so a late measurement keeps the same spot.
  const anchorRef = useRef({ page: initialView.page, fraction: 0 });
  // Set by a zoom: the spot under the cursor that the next layout puts back under it.
  const zoomAnchorRef = useRef<PdfZoomAnchor | null>(null);
  const scrollFrameRef = useRef(0);
  const listenersRef = useRef(new Set<() => void>());

  // Frees the document and its worker as soon as the viewer gives up on it, not only when it goes away.
  const failViewer = useCallback((): void => {
    if (openedRef.current !== null) {
      closePdfDocument(openedRef.current);
      openedRef.current = null;
    }
    setLoad({ status: 'error' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const blob = await readStoredFile(file.id);
      if (cancelled) return;
      if (blob === null) { setLoad({ status: 'missing' }); return; }
      const opened = await openPdfDocument(blob, controller.signal);
      if (cancelled) { closePdfDocument(opened); return; }
      openedRef.current = opened;
      setLoad({ status: 'ready', doc: opened });
    })().catch(() => { if (!cancelled) failViewer(); });
    return () => {
      cancelled = true;
      controller.abort();
      if (openedRef.current !== null) {
        closePdfDocument(openedRef.current);
        openedRef.current = null;
      }
    };
  }, [file.id, failViewer]);

  const doc = load.status === 'ready' ? load.doc : null;
  const pageCount = doc?.numPages ?? 0;

  useEffect(() => {
    if (doc !== null && file.pageCount !== doc.numPages) onPageCount?.(doc.numPages);
  }, [doc, file.pageCount, onPageCount]);

  // Page sizes at 100 %. The first pages are measured before anything is drawn, so no sheet changes height
  // under the reader's eyes; only a very long document keeps measuring after that.
  useEffect(() => {
    if (doc === null) return undefined;
    let cancelled = false;
    void (async () => {
      const measured: Array<{ width: number; height: number }> = [];
      const firstBatch = Math.min(doc.numPages, PAGES_MEASURED_FIRST);
      for (let number = 1; number <= doc.numPages && !cancelled; number += 1) {
        const page = await doc.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        measured.push({ width: viewport.width, height: viewport.height });
        page.cleanup();
        if (number === firstBatch || (number > firstBatch && (number % 100 === 0 || number === doc.numPages))) setSizes([...measured]);
      }
    })().catch(() => { if (!cancelled) failViewer(); });
    return () => { cancelled = true; };
  }, [doc, failViewer]);

  const measured = doc !== null && sizes.length >= Math.min(doc.numPages, PAGES_MEASURED_FIRST);
  const layout = useMemo(
    () => computePdfLayout(measured ? sizes : [], measured ? pageCount : 0, zoom, box.width),
    [measured, sizes, pageCount, zoom, box.width],
  );
  // What the gesture handlers need, without re-attaching them at every layout.
  const latest = useRef({ layout, zoom });
  useLayoutEffect(() => {
    latest.current = { layout, zoom };
  }, [layout, zoom]);

  const getView = useCallback((): PdfRect => {
    const element = scrollRef.current;
    return element === null
      ? { left: 0, top: 0, width: 0, height: 0 }
      : { left: element.scrollLeft, top: element.scrollTop, width: element.clientWidth, height: element.clientHeight };
  }, []);
  const subscribe = useCallback((listener: () => void): (() => void) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);
  const notifyView = (): void => listenersRef.current.forEach((listener) => listener());

  const syncPosition = useCallback((): void => {
    const element = scrollRef.current;
    if (element === null || layout.heights.length === 0) return;
    const top = element.scrollTop;
    const current = pdfPageAt(layout, top + element.clientHeight / 3);
    const [first, last] = visiblePdfPages(layout, top, element.clientHeight);
    const anchored = pdfPageAt(layout, top + PDF_MARGIN);
    const fraction = (top + PDF_MARGIN - layout.offsets[anchored - 1]) / layout.heights[anchored - 1];
    anchorRef.current = { page: anchored, fraction: Math.min(1, Math.max(0, fraction)) };
    setPosition((previous) => previous.current === current && previous.first === first && previous.last === last
      ? previous : { current, first, last });
  }, [layout]);

  // Observes the area, not the window: the sidebar and Apuntes change how much room the sheet has.
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() => {
      setBox((previous) => previous.width === element.clientWidth && previous.height === element.clientHeight
        ? previous : { width: element.clientWidth, height: element.clientHeight });
      listenersRef.current.forEach((listener) => listener());
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [load.status]);

  // A new layout puts the reader back where they were: under the cursor after a zoom, on the same page otherwise.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null || layout.heights.length === 0) return;
    const zoomAnchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (zoomAnchor !== null) {
      const target = restorePdfZoomAnchor(layout, zoomAnchor);
      element.scrollLeft = target.left;
      element.scrollTop = target.top;
    } else {
      const { page, fraction } = anchorRef.current;
      const index = Math.min(page, layout.heights.length) - 1;
      element.scrollTop = Math.max(0, layout.offsets[index] + fraction * layout.heights[index] - PDF_MARGIN);
    }
    syncPosition();
  }, [layout, syncPosition]);

  // Remembering the page is housekeeping: it waits until the reader stops.
  const currentPage = position.current;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeUiPreference(viewKey(file.id), JSON.stringify({ page: currentPage, zoom } satisfies PdfView));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [file.id, currentPage, zoom]);

  const currentScale = (): number => {
    const { layout: now, zoom: nowZoom } = latest.current;
    return nowZoom === 'fit' ? now.scales[0] ?? 1 : nowZoom;
  };

  /** A zoom from the buttons: the layout changes at once, around the center of what is on screen. */
  const zoomTo = (next: number | 'fit'): void => {
    const element = scrollRef.current;
    if (element !== null) {
      zoomAnchorRef.current = capturePdfZoomAnchor(latest.current.layout, element.scrollLeft, element.scrollTop, element.clientWidth / 2, element.clientHeight / 2);
    }
    setZoom(next);
  };

  // A pinch (Ctrl + wheel in most browsers, a gesture event in WebKit) scales what is on screen with a CSS
  // transform, with no React work per event; the zoom is applied once, when the gesture settles.
  useEffect(() => {
    const element = scrollRef.current;
    const pages = pagesRef.current;
    if (element === null || pages === null) return undefined;
    let gesture: { base: number; factor: number; originX: number; originY: number; viewX: number; viewY: number } | null = null;
    let timer = 0;
    const commit = (): void => {
      if (gesture === null) return;
      const { base, factor, viewX, viewY } = gesture;
      gesture = null;
      pages.style.transform = '';
      pages.style.willChange = '';
      zoomAnchorRef.current = capturePdfZoomAnchor(latest.current.layout, element.scrollLeft, element.scrollTop, viewX, viewY);
      committedScale = clampPdfZoom(base * factor);
      setZoom(committedScale);
    };
    // What the last pause in the gesture settled on, until the layout catches up with it.
    let committedScale: number | null = null;
    /** `ratio` multiplies the current factor; with `absolute` it is the wanted scale, relative to the settled one. */
    const pinchBy = (ratio: number, clientX: number, clientY: number, absolute = false): void => {
      if (gesture === null) {
        const bounds = element.getBoundingClientRect();
        const viewX = clientX - bounds.left;
        const viewY = clientY - bounds.top;
        gesture = { base: committedScale ?? currentScale(), factor: 1, originX: element.scrollLeft + viewX, originY: element.scrollTop + viewY, viewX, viewY };
        pages.style.transformOrigin = `${gesture.originX}px ${gesture.originY}px`;
        pages.style.willChange = 'transform';
      }
      gesture.factor = clampPinchFactor(gesture.base, absolute ? ratio / gesture.base : gesture.factor * ratio);
      pages.style.transform = `scale(${gesture.factor})`;
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, ZOOM_SETTLE_MS);
    };
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (gesture === null) committedScale = null;
      const delta = event.deltaMode === 1 ? event.deltaY * 40 : event.deltaY;
      pinchBy(Math.exp(-delta * 0.01), event.clientX, event.clientY);
    };
    // WebKit reports the trackpad pinch as gesture events whose scale is relative to the start of the gesture.
    // `scale` is cumulative from `gesturestart`, so the base is the zoom at the start, not at the last pause.
    let gestureStart: { x: number; y: number; base: number } | null = null;
    const gestureBegin = (event: Event): void => {
      event.preventDefault();
      commit();
      committedScale = null;
      const point = event as unknown as { clientX: number; clientY: number };
      gestureStart = { x: point.clientX, y: point.clientY, base: currentScale() };
    };
    const gestureChange = (event: Event): void => {
      event.preventDefault();
      const gestureEvent = event as unknown as { scale: number; clientX: number; clientY: number };
      gestureStart ??= { x: gestureEvent.clientX, y: gestureEvent.clientY, base: currentScale() };
      pinchBy(gestureStart.base * gestureEvent.scale, gestureStart.x, gestureStart.y, true);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', gestureBegin);
    element.addEventListener('gesturechange', gestureChange);
    const gestureEnd = (): void => {
      commit();
      gestureStart = null;
    };
    element.addEventListener('gestureend', gestureEnd);
    return () => {
      window.clearTimeout(timer);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('gesturestart', gestureBegin);
      element.removeEventListener('gesturechange', gestureChange);
      element.removeEventListener('gestureend', gestureEnd);
      pages.style.transform = '';
    };
  }, [load.status, measured]);

  const goToPage = (number: number): void => {
    const element = scrollRef.current;
    if (element === null || layout.heights.length === 0) return;
    const target = Math.min(layout.heights.length, Math.max(1, Math.round(number)));
    element.scrollTop = Math.max(0, layout.offsets[target - 1] - PDF_GAP);
    anchorRef.current = { page: target, fraction: 0 };
    syncPosition();
  };

  const pageKeys = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToPage(Number(pageDraft));
      setPageDraft(null);
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setPageDraft(null);
      event.currentTarget.blur();
    }
  };

  const percent = Math.round((layout.scales[0] ?? (zoom === 'fit' ? 1 : zoom)) * 100);
  const name = fileDisplayName(file.name);

  if (load.status === 'missing' || load.status === 'error') {
    const missing = load.status === 'missing';
    return (
      <div className="artifact-error pdf-viewer-state">
        <section className="canvas-start-card artifact-error-card" role={missing ? 'status' : 'alert'}>
          <FileX aria-hidden="true" size={22} />
          <h3>{missing ? 'Archivo no disponible' : 'No se pudo mostrar este PDF'}</h3>
          <p>
            {missing
              ? `«${name}» no está en esta computadora (por ejemplo, el proyecto vino de otra máquina o de una copia de seguridad). Podés volver a agregarlo o quitarlo del proyecto.`
              : `Es posible que «${name}» esté dañado o use algo que el visor no entiende. Probá abrirlo en ${hasNativeFiles() ? 'Vista Previa' : 'el navegador'}.`}
          </p>
          <div>
            {!missing ? (
              <button className="secondary-action" type="button" onClick={() => { void openFileExternally(file.id); }}>
                {hasNativeFiles() ? 'Abrir en Vista Previa' : 'Abrir en el navegador'}
              </button>
            ) : null}
            {onReplace ? <button className={missing ? 'primary-action' : 'secondary-action'} type="button" onClick={onReplace}>Volver a agregar…</button> : null}
            {onRemove ? <button className="secondary-action" type="button" onClick={onRemove}>Quitar del proyecto</button> : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <EditorToolbar
        start={doc === null ? null : (
          <label className="pdf-page-field">
            <span>Página</span>
            <input
              aria-label="Número de página"
              inputMode="numeric"
              value={pageDraft ?? String(position.current)}
              onBlur={() => setPageDraft(null)}
              onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ''))}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={pageKeys}
            />
            <span>de {pageCount}</span>
          </label>
        )}
        end={onOpenInWindow ? (
          <ToolButton icon={ExternalLink} label="Abrir en ventana nueva" showLabel onClick={onOpenInWindow} />
        ) : undefined}
      />
      <div className="pdf-viewer-body">
        <div className="pdf-scroll" ref={scrollRef} tabIndex={0} aria-label={`PDF ${name}`} onScroll={() => {
          notifyView();
          cancelAnimationFrame(scrollFrameRef.current);
          scrollFrameRef.current = requestAnimationFrame(syncPosition);
        }}>
          {doc === null || !measured ? null : (
            <div className="pdf-pages" ref={pagesRef} style={{ height: layout.total, width: layout.contentWidth }}>
              {layout.heights.map((height, index) => {
                const number = index + 1;
                return (
                  <div key={number} className="pdf-page-slot" style={{ top: layout.offsets[index] }}>
                    <PdfPage
                      active={number >= position.first - 1 && number <= position.last + 1}
                      doc={doc}
                      getView={getView}
                      height={height}
                      left={(layout.contentWidth - layout.widths[index]) / 2}
                      number={number}
                      onFailure={failViewer}
                      scale={layout.scales[index]}
                      subscribe={subscribe}
                      top={layout.offsets[index]}
                      width={layout.widths[index]}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {doc === null || !measured ? <p className="pdf-viewer-loading" role="status">Abriendo PDF…</p> : (
          <CanvasZoom
            fitLabel="Ajustar al ancho de la página"
            label="Zoom del PDF"
            zoomPercent={percent}
            onFit={() => zoomTo('fit')}
            onResetZoom={() => zoomTo(1)}
            onZoomIn={() => zoomTo(nextPdfZoom(currentScale(), 1))}
            onZoomOut={() => zoomTo(nextPdfZoom(currentScale(), -1))}
          />
        )}
      </div>
    </div>
  );
}
