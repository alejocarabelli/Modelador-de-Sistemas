import { describe, expect, it } from 'vitest';
import { padForContentSniffing, SNIFF_PADDING } from '../../scripts/vite-sniff-safe-assets.mjs';

// Same rule as `infer::archive::is_pdf`, which Tauri runs before looking at the extension.
const looksLikePdf = (code: string) => code.slice(0, 1024).includes('%PDF');

describe('padForContentSniffing', () => {
  it('keeps a chunk that writes PDFs from being served as one', () => {
    const chunk = 'import{a as e}from"./index.js";const t=e(`%PDF-1.4\\n`);';
    expect(looksLikePdf(chunk)).toBe(true);
    expect(looksLikePdf(padForContentSniffing('assets/pdfExport-abc.js', chunk))).toBe(false);
  });

  it('starts every script and stylesheet with a comment longer than the sniffed window', () => {
    expect(SNIFF_PADDING.length).toBeGreaterThanOrEqual(1024);
    expect(SNIFF_PADDING.startsWith('/*')).toBe(true);
    expect(SNIFF_PADDING.trimEnd().endsWith('*/')).toBe(true);
    for (const name of ['a.js', 'b.mjs', 'c.css']) {
      expect(padForContentSniffing(name, 'x')).toBe(`${SNIFF_PADDING}x`);
    }
  });

  it('leaves other files, already padded files and @charset stylesheets alone', () => {
    expect(padForContentSniffing('index.html', '<!doctype html>')).toBe('<!doctype html>');
    expect(padForContentSniffing('a.js', `${SNIFF_PADDING}x`)).toBe(`${SNIFF_PADDING}x`);
    expect(padForContentSniffing('c.css', '@charset "UTF-8";')).toBe('@charset "UTF-8";');
  });
});
