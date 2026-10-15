import type { Plugin } from 'vite';

export const SNIFF_PADDING: string;
export function padForContentSniffing(fileName: string, code: string): string;
export default function sniffSafeAssets(): Plugin;
