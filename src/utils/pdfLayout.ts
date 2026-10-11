export type PdfView = { page: number; zoom: 'fit' | number };

export const PDF_ZOOM_MIN = 0.25;
export const PDF_ZOOM_MAX = 4;
/** Space around the sheets and between them, in screen pixels. */
export const PDF_MARGIN = 24;
export const PDF_GAP = 12;
const PDF_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** A4 at 100 %, for the pages whose real size is not measured yet. */
const FALLBACK_SIZE = { width: 595, height: 842 };

export const clampPdfZoom = (zoom: number): number =>
  Number.isFinite(zoom) ? Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom)) : 1;

/** The page and zoom left on a file; anything unreadable falls back to the first page, fitted to the width. */
export const parsePdfView = (serialized: string | null): PdfView => {
  try {
    const value: unknown = serialized === null ? null : JSON.parse(serialized);
    if (typeof value !== 'object' || value === null) return { page: 1, zoom: 'fit' };
    const { page, zoom } = value as { page?: unknown; zoom?: unknown };
    return {
      page: typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : 1,
      zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? clampPdfZoom(zoom) : 'fit',
    };
  } catch {
    return { page: 1, zoom: 'fit' };
  }
};

/** The next stop of the zoom buttons above or below the current scale. */
export const nextPdfZoom = (current: number, direction: 1 | -1): number => {
  const epsilon = 0.005;
  const stop = direction === 1
    ? PDF_ZOOM_STEPS.find((step) => step > current + epsilon)
    : [...PDF_ZOOM_STEPS].reverse().find((step) => step < current - epsilon);
  return stop ?? (direction === 1 ? PDF_ZOOM_MAX : PDF_ZOOM_MIN);
};

export type PdfLayout = {
  scales: number[];
  widths: number[];
  heights: number[];
  /** Top of each page inside the scrolling area. */
  offsets: number[];
  total: number;
  contentWidth: number;
};

export const computePdfLayout = (
  sizes: readonly { width: number; height: number }[],
  pageCount: number,
  zoom: 'fit' | number,
  boxWidth: number,
): PdfLayout => {
  const scales: number[] = [];
  const widths: number[] = [];
  const heights: number[] = [];
  const offsets: number[] = [];
  let top = PDF_MARGIN;
  for (let index = 0; index < pageCount; index += 1) {
    const size = sizes[index] ?? sizes[0] ?? FALLBACK_SIZE;
    const scale = zoom === 'fit'
      ? clampPdfZoom(boxWidth > 0 ? (boxWidth - 2 * PDF_MARGIN) / size.width : 1)
      : zoom;
    scales.push(scale);
    widths.push(size.width * scale);
    heights.push(size.height * scale);
    offsets.push(top);
    top += size.height * scale + PDF_GAP;
  }
  return {
    scales, widths, heights, offsets,
    total: pageCount === 0 ? 0 : top - PDF_GAP + PDF_MARGIN,
    contentWidth: Math.max(boxWidth, ...widths.map((width) => width + 2 * PDF_MARGIN)),
  };
};

/** The 1-based page that contains the vertical position `y` (the gap before a page counts for that page). */
export const pdfPageAt = (layout: PdfLayout, y: number): number => {
  let low = 0;
  let high = layout.offsets.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (layout.offsets[middle] - PDF_GAP / 2 <= y) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found + 1;
};

/** First and last 1-based pages that overlap the window [top, top + height]. */
export const visiblePdfPages = (layout: PdfLayout, top: number, height: number): [number, number] => {
  const count = layout.offsets.length;
  if (count === 0) return [0, 0];
  // First page that ends at or after `top`.
  let low = 0;
  let high = count - 1;
  let first = count;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (layout.offsets[middle] + layout.heights[middle] >= top) { first = middle; high = middle - 1; } else low = middle + 1;
  }
  const bottom = top + height;
  low = 0;
  high = count - 1;
  let last = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (layout.offsets[middle] <= bottom) { last = middle; low = middle + 1; } else high = middle - 1;
  }
  return first > last ? [pdfPageAt(layout, top), pdfPageAt(layout, top)] : [first + 1, last + 1];
};

/** More pixels than this on one canvas risk running out of memory in WebKit. */
export const PDF_MAX_CANVAS_PIXELS = 8_000_000;
/** No side of a canvas goes past this, whatever its area. */
export const PDF_MAX_CANVAS_SIDE = 8192;

export type PdfRect = { left: number; top: number; width: number; height: number };

/** The part of a page that gets a canvas, in the page's own CSS pixels, and how many canvas pixels each one is worth. */
export type PdfRegion = { x: number; y: number; width: number; height: number; ratio: number };

/** The canvas size a region really gets: each side is rounded up, so the limits are checked on the rounded size. */
export const pdfCanvasSize = (region: Pick<PdfRegion, 'width' | 'height' | 'ratio'>): { width: number; height: number } => ({
  width: Math.ceil(region.width * region.ratio),
  height: Math.ceil(region.height * region.ratio),
});

/** The largest ratio up to `dpr` whose rounded-up canvas stays inside both limits. */
const canvasRatioFor = (width: number, height: number, dpr: number, maxPixels: number, maxSide: number): number => {
  let ratio = Math.min(dpr, Math.sqrt(maxPixels / (width * height)), maxSide / Math.max(width, height));
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const size = pdfCanvasSize({ width, height, ratio });
    if (size.width * size.height <= maxPixels && Math.max(size.width, size.height) <= maxSide) break;
    ratio *= 0.999;
  }
  return ratio;
};

/**
 * What to draw for one page. A page whose full-resolution canvas fits under the limits is drawn whole, as ever.
 * A huge one (a long exported diagram, a big zoom) is drawn only where the reader is looking, plus a margin, at
 * full resolution: sharp text beats a whole page squeezed into a bitmap and stretched.
 * `view` is the visible window in the page's coordinates (it may stick out of the page).
 */
export const pdfRenderRegion = (options: {
  pageWidth: number;
  pageHeight: number;
  view: PdfRect;
  dpr: number;
  maxPixels?: number;
  maxSide?: number;
}): PdfRegion => {
  const { pageWidth, pageHeight, view, dpr: rawDpr } = options;
  const maxPixels = options.maxPixels ?? PDF_MAX_CANVAS_PIXELS;
  const maxSide = options.maxSide ?? PDF_MAX_CANVAS_SIDE;
  const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
  if (canvasRatioFor(pageWidth, pageHeight, dpr, maxPixels, maxSide) >= dpr) {
    return { x: 0, y: 0, width: pageWidth, height: pageHeight, ratio: dpr };
  }
  const clip = (start: number, size: number, limit: number): [number, number] => {
    const from = Math.max(0, Math.min(start, limit));
    const to = Math.max(from, Math.min(start + size, limit));
    return [from, to];
  };
  // A page that is off screen (a neighbor kept ready) gets the strip nearest to the window.
  const nearest = (start: number, size: number, limit: number): [number, number] => {
    const [from, to] = clip(start, size, limit);
    if (to > from) return [from, to];
    return start >= limit ? [Math.max(0, limit - size), limit] : [0, Math.min(limit, size)];
  };
  const build = (marginX: number, marginY: number): PdfRegion => {
    const [x0, x1] = nearest(view.left - marginX, view.width + 2 * marginX, pageWidth);
    const [y0, y1] = nearest(view.top - marginY, view.height + 2 * marginY, pageHeight);
    const x = Math.floor(x0);
    const y = Math.floor(y0);
    const width = Math.ceil(x1) - x;
    const height = Math.ceil(y1) - y;
    return { x, y, width, height, ratio: Math.min(dpr, canvasRatioFor(width, height, dpr, maxPixels, maxSide)) };
  };
  // As much margin around the window as the limits allow, so a short scroll needs no new drawing.
  for (const fraction of [0.5, 0.25, 0.1]) {
    const attempt = build(Math.round(view.width * fraction), Math.round(view.height * fraction));
    if (attempt.ratio >= dpr) return attempt;
  }
  if (build(0, 0).ratio >= dpr) return build(0, 0);
  // Even the window alone is too much for full resolution (a huge window at a huge zoom): the least blur possible.
  return build(0, 0);
};

/** Whether what is on screen is still inside `region`: no need to draw again until the reader leaves it. */
export const pdfRegionCovers = (region: PdfRegion, pageWidth: number, pageHeight: number, view: PdfRect): boolean => {
  const left = Math.max(0, view.left);
  const top = Math.max(0, view.top);
  const right = Math.min(pageWidth, view.left + view.width);
  const bottom = Math.min(pageHeight, view.top + view.height);
  if (right <= left || bottom <= top) return true; // nothing of this page is in view
  return region.x <= left && region.y <= top && region.x + region.width >= right && region.y + region.height >= bottom;
};

/** The point of the document that stays under the cursor (or the center of the window) while zooming. */
export type PdfZoomAnchor = { page: number; fraction: number; fractionX: number; viewX: number; viewY: number };

/** Left edge of a page: sheets are centered in the scrolling width. */
const pageLeft = (layout: PdfLayout, page: number): number => (layout.contentWidth - layout.widths[page - 1]) / 2;

/** `viewX`/`viewY` are the focus point inside the visible window, in screen pixels. */
export const capturePdfZoomAnchor = (layout: PdfLayout, scrollLeft: number, scrollTop: number, viewX: number, viewY: number): PdfZoomAnchor => {
  const y = scrollTop + viewY;
  const page = pdfPageAt(layout, y);
  const fraction = layout.heights[page - 1] > 0 ? (y - layout.offsets[page - 1]) / layout.heights[page - 1] : 0;
  const width = layout.widths[page - 1];
  // Across the sheet, not the scrolling area: the margins around a centered sheet change with the zoom.
  const fractionX = width > 0 ? (scrollLeft + viewX - pageLeft(layout, page)) / width : 0;
  return { page, fraction, fractionX, viewX, viewY };
};

/**
 * Where to scroll in the new layout so the anchored point is back under the same screen position. With the size of
 * the window, the result stays inside what can really be scrolled: a document smaller than the window sits at 0.
 */
export const restorePdfZoomAnchor = (
  layout: PdfLayout,
  anchor: PdfZoomAnchor,
  view?: { width: number; height: number },
): { left: number; top: number } => {
  const index = Math.min(anchor.page, layout.heights.length) - 1;
  if (index < 0) return { left: 0, top: 0 };
  const maxLeft = view ? Math.max(0, layout.contentWidth - view.width) : Infinity;
  const maxTop = view ? Math.max(0, layout.total - view.height) : Infinity;
  return {
    left: Math.min(maxLeft, Math.max(0, pageLeft(layout, index + 1) + anchor.fractionX * layout.widths[index] - anchor.viewX)),
    top: Math.min(maxTop, Math.max(0, layout.offsets[index] + anchor.fraction * layout.heights[index] - anchor.viewY)),
  };
};

/** The zoom of a trackpad pinch in WebKit: `scale` is relative to the zoom when the gesture started. */
export const pinchPdfZoom = (base: number, scale: number): number => clampPdfZoom(base * scale);

/** The zoom after one Ctrl + wheel step (a pinch in other browsers): the same distance in or out is the same factor. */
export const wheelPdfZoom = (current: number, deltaY: number, deltaMode = 0): number =>
  clampPdfZoom(current * Math.exp(-(deltaMode === 1 ? deltaY * 40 : deltaY) * 0.01));
