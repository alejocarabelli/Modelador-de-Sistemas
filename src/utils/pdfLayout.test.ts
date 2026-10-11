import { describe, expect, it } from 'vitest';
import {
  capturePdfZoomAnchor,
  clampPdfZoom,
  clampPinchFactor,
  pdfCanvasSize,
  restorePdfZoomAnchor,
  computePdfLayout,
  nextPdfZoom,
  parsePdfView,
  PDF_GAP,
  PDF_MARGIN,
  pdfPageAt,
  pdfRegionCovers,
  pdfRenderRegion,
  visiblePdfPages,
} from './pdfLayout';

const a4 = { width: 600, height: 800 };

describe('remembered view', () => {
  it('reads the saved page and zoom', () => {
    expect(parsePdfView(JSON.stringify({ page: 5, zoom: 1.5 }))).toEqual({ page: 5, zoom: 1.5 });
    expect(parsePdfView(JSON.stringify({ page: 2, zoom: 'fit' }))).toEqual({ page: 2, zoom: 'fit' });
  });

  it('falls back to the first page fitted to the width', () => {
    const fallback = { page: 1, zoom: 'fit' };
    expect(parsePdfView(null)).toEqual(fallback);
    expect(parsePdfView('{roto')).toEqual(fallback);
    expect(parsePdfView('7')).toEqual(fallback);
    expect(parsePdfView(JSON.stringify({ page: -3, zoom: 'x' }))).toEqual(fallback);
  });

  it('keeps a saved zoom inside the limits', () => {
    expect(parsePdfView(JSON.stringify({ page: 1, zoom: 99 })).zoom).toBe(4);
    expect(clampPdfZoom(0.01)).toBe(0.25);
    expect(clampPdfZoom(Number.NaN)).toBe(1);
  });
});

describe('zoom steps', () => {
  it('moves to the next stop above or below, and stops at the ends', () => {
    expect(nextPdfZoom(1, 1)).toBe(1.25);
    expect(nextPdfZoom(1, -1)).toBe(0.75);
    expect(nextPdfZoom(1.1, 1)).toBe(1.25);
    expect(nextPdfZoom(1.1, -1)).toBe(1);
    expect(nextPdfZoom(4, 1)).toBe(4);
    expect(nextPdfZoom(0.25, -1)).toBe(0.25);
  });
});

describe('page layout', () => {
  it('fits the page to the width of the area', () => {
    const layout = computePdfLayout([a4], 3, 'fit', 600 + 2 * PDF_MARGIN);
    expect(layout.scales).toEqual([1, 1, 1]);
    expect(layout.offsets).toEqual([PDF_MARGIN, PDF_MARGIN + 800 + PDF_GAP, PDF_MARGIN + 2 * (800 + PDF_GAP)]);
    expect(layout.total).toBe(PDF_MARGIN * 2 + 3 * 800 + 2 * PDF_GAP);
  });

  it('uses the measured size of each page and the first one for those still unknown', () => {
    const layout = computePdfLayout([a4, { width: 300, height: 400 }], 3, 1, 1000);
    expect(layout.heights).toEqual([800, 400, 800]);
    expect(layout.widths).toEqual([600, 300, 600]);
  });

  it('grows the scrolling width past the area when zoomed in', () => {
    const layout = computePdfLayout([a4], 1, 2, 500);
    expect(layout.contentWidth).toBe(1200 + 2 * PDF_MARGIN);
    expect(computePdfLayout([a4], 1, 0.5, 900).contentWidth).toBe(900);
  });

  it('survives an area that is not measured yet and an empty document', () => {
    expect(computePdfLayout([a4], 1, 'fit', 0).scales).toEqual([1]);
    expect(computePdfLayout([], 0, 'fit', 800)).toMatchObject({ total: 0, heights: [] });
  });

  it('finds the page at a position and the pages in view', () => {
    const layout = computePdfLayout([a4], 5, 1, 800);
    expect(pdfPageAt(layout, 0)).toBe(1);
    expect(pdfPageAt(layout, layout.offsets[2] + 10)).toBe(3);
    expect(pdfPageAt(layout, 1e9)).toBe(5);
    expect(visiblePdfPages(layout, 0, 500)).toEqual([1, 1]);
    expect(visiblePdfPages(layout, layout.offsets[1] - 20, 900)).toEqual([1, 3]);
    expect(visiblePdfPages(computePdfLayout([], 0, 1, 800), 0, 500)).toEqual([0, 0]);
  });
});

describe('render region', () => {
  const view = { left: 0, top: 0, width: 1000, height: 700 };

  it('draws a page that fits whole, at the full device ratio', () => {
    expect(pdfRenderRegion({ pageWidth: 900, pageHeight: 1200, view, dpr: 2 })).toEqual({ x: 0, y: 0, width: 900, height: 1200, ratio: 2 });
  });

  it('draws only the visible part, at full resolution, when the whole page would not fit', () => {
    // A long diagram at 100 %: 2000 x 6000 css px is 48 M canvas pixels at ratio 2.
    const region = pdfRenderRegion({ pageWidth: 2000, pageHeight: 6000, view: { left: 300, top: 2000, width: 1000, height: 700 }, dpr: 2 });
    expect(region.ratio).toBe(2);
    expect(region.width * region.height * 4).toBeLessThanOrEqual(8_000_000);
    expect(region.y).toBeLessThanOrEqual(2000);
    expect(region.y + region.height).toBeGreaterThanOrEqual(2700);
    expect(region.x).toBeLessThanOrEqual(300);
    expect(region.x + region.width).toBeGreaterThanOrEqual(1300);
    expect(region.height).toBeLessThan(6000);
  });

  it('keeps the region inside the page near its edges', () => {
    const top = pdfRenderRegion({ pageWidth: 2000, pageHeight: 6000, view: { left: 0, top: -30, width: 1000, height: 700 }, dpr: 2 });
    expect(top.y).toBe(0);
    const bottom = pdfRenderRegion({ pageWidth: 2000, pageHeight: 6000, view: { left: 0, top: 5500, width: 1000, height: 700 }, dpr: 2 });
    expect(bottom.y + bottom.height).toBe(6000);
  });

  it('gives a neighbor page that is off screen the strip nearest to the window', () => {
    const below = pdfRenderRegion({ pageWidth: 2000, pageHeight: 6000, view: { left: 0, top: -3000, width: 1000, height: 700 }, dpr: 2 });
    expect(below.y).toBe(0);
    expect(below.height).toBeLessThanOrEqual(700 * 2);
    const above = pdfRenderRegion({ pageWidth: 2000, pageHeight: 6000, view: { left: 0, top: 9000, width: 1000, height: 700 }, dpr: 2 });
    expect(above.y + above.height).toBe(6000);
  });

  it('respects the side limit even for a thin, tall page', () => {
    const region = pdfRenderRegion({ pageWidth: 300, pageHeight: 20000, view: { left: 0, top: 9000, width: 300, height: 700 }, dpr: 2 });
    expect(region.height * region.ratio).toBeLessThanOrEqual(8192);
    expect(region.ratio).toBe(2);
  });

  it('lowers the ratio only when the window alone is more than the limit', () => {
    const region = pdfRenderRegion({ pageWidth: 20000, pageHeight: 20000, view: { left: 0, top: 0, width: 6000, height: 4000 }, dpr: 2 });
    expect(region.ratio).toBeLessThan(2);
    expect(region.width * region.height * region.ratio ** 2).toBeLessThanOrEqual(8_000_000 + 1);
  });

  it('treats a bad device ratio as 1', () => {
    expect(pdfRenderRegion({ pageWidth: 500, pageHeight: 500, view, dpr: Number.NaN }).ratio).toBe(1);
  });

  it('covers the window until it leaves the region', () => {
    const region = { x: 0, y: 1000, width: 2000, height: 2000, ratio: 2 };
    expect(pdfRegionCovers(region, 2000, 6000, { left: 100, top: 1200, width: 1000, height: 700 })).toBe(true);
    expect(pdfRegionCovers(region, 2000, 6000, { left: 100, top: 2800, width: 1000, height: 700 })).toBe(false);
    expect(pdfRegionCovers(region, 2000, 6000, { left: 100, top: 9000, width: 1000, height: 700 })).toBe(true);
    expect(pdfRegionCovers({ x: 0, y: 0, width: 2000, height: 6000, ratio: 1 }, 2000, 6000, { left: -50, top: -50, width: 3000, height: 9000 })).toBe(true);
  });
});

describe('canvas size limits', () => {
  it('keeps the rounded-up canvas under the limits', () => {
    // Fractional css sizes round up to whole pixels: the cap must hold after rounding.
    for (const [w, h] of [[1000.4, 4003.3], [2377.7, 1683.2], [1999.9, 2000.9], [3333.3, 1201.1]]) {
      const region = pdfRenderRegion({ pageWidth: w, pageHeight: h, view: { left: 0, top: 0, width: w, height: h }, dpr: 2, maxPixels: 8_000_000 });
      const size = pdfCanvasSize(region);
      expect(size.width * size.height).toBeLessThanOrEqual(8_000_000);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(8192);
    }
  });

  it('still reaches the full ratio when the rounded canvas fits', () => {
    const region = pdfRenderRegion({ pageWidth: 900, pageHeight: 1200, view: { left: 0, top: 0, width: 900, height: 700 }, dpr: 2 });
    expect(region.ratio).toBe(2);
    expect(pdfCanvasSize(region)).toEqual({ width: 1800, height: 2400 });
  });
});

describe('zoom anchor', () => {
  it('keeps the point under the cursor through a zoom', () => {
    const before = computePdfLayout([a4], 10, 1, 800);
    const anchor = capturePdfZoomAnchor(before, 0, 3000, 300, 200);
    const after = computePdfLayout([a4], 10, 2, 800);
    const { top, left } = restorePdfZoomAnchor(after, anchor);
    // The same spot of the same page sits at the same screen position.
    const page = anchor.page - 1;
    expect(after.offsets[page] + anchor.fraction * after.heights[page] - top).toBeCloseTo(200, 6);
    // Horizontally too, measured across the centered sheet.
    const pageLeft = (after.contentWidth - after.widths[page]) / 2;
    expect(pageLeft + anchor.fractionX * after.widths[page] - left).toBeCloseTo(300, 6);
  });

  it('does not drift horizontally when the zoom changes a centered sheet', () => {
    const before = computePdfLayout([a4], 4, 1, 1000);
    const anchor = capturePdfZoomAnchor(before, 0, 1000, 500, 200);
    const after = computePdfLayout([a4], 4, 2, 1000);
    const { left } = restorePdfZoomAnchor(after, anchor);
    // 1000 px wide area, 600 pt sheet: at 100 % the sheet starts at x = 200; the point under x = 500 is 300 pt in.
    // At 200 % it is 600 px into a 1200 px sheet that starts at 24: it must still be at screen x = 500.
    expect(24 + 600 - left).toBeCloseTo(500, 6);
  });

  it('never scrolls to a negative position', () => {
    const layout = computePdfLayout([a4], 3, 1, 800);
    const anchor = capturePdfZoomAnchor(layout, 0, 0, 0, 500);
    expect(restorePdfZoomAnchor(layout, anchor)).toEqual({ left: 0, top: 0 });
    expect(restorePdfZoomAnchor(computePdfLayout([], 0, 1, 800), anchor)).toEqual({ left: 0, top: 0 });
  });

  it('limits a pinch to the zoom range', () => {
    expect(clampPinchFactor(1, 10)).toBe(4);
    expect(clampPinchFactor(1, 0.01)).toBe(0.25);
    expect(clampPinchFactor(2, 3)).toBe(2);
    expect(clampPinchFactor(1, 1.3)).toBe(1.3);
  });
});
