import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, PointerEvent, ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDiagramArtifact } from '../types/diagram';
import { ArtifactTab, ArtifactTabs } from './ArtifactTabs';

const artifact: ClassDiagramArtifact = {
  id: 'classes', type: 'class-diagram', name: 'Clases del sistema',
  createdAt: '', updatedAt: '', content: { nodes: [], edges: [] },
};

describe('ArtifactTabs', () => {
  it('activates a clicked tab', () => {
    const onSelect = vi.fn();
    const tab = ArtifactTab({ artifact, active: false, onSelect, onClose: vi.fn() });
    tab.props.onClick();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('closes through × without activating or starting a drag', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const tab = ArtifactTab({ artifact, active: false, onSelect, onClose });
    const children = tab.props.children as ReactElement[];
    const close = children[2] as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
    const stopPropagation = vi.fn();
    close.props.onPointerDown?.({ stopPropagation } as unknown as PointerEvent<HTMLButtonElement>);
    close.props.onClick?.({ stopPropagation } as unknown as MouseEvent<HTMLButtonElement>);
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    expect(close.props.tabIndex).toBe(-1);
    expect(close.props['aria-label']).toBe('Cerrar Clases del sistema');
  });

  it('closes on a middle click and ignores other auxiliary clicks', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const tab = ArtifactTab({ artifact, active: false, onSelect, onClose });
    const preventDefault = vi.fn();
    tab.props.onMouseDown({ button: 1, preventDefault });
    tab.props.onAuxClick({ button: 1, preventDefault });
    tab.props.onAuxClick({ button: 2, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exposes a labeled tablist, selected state, roving tabindex and one hidden h1', () => {
    const other = { ...artifact, id: 'other', name: 'Otro diagrama' };
    const html = renderToString(<ArtifactTabs
      projectName="Proyecto de prueba" artifacts={[artifact, other]} openArtifactIds={['other', artifact.id]} activeArtifactId={artifact.id}
      onSelect={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()} onCloseRight={vi.fn()} onReorder={vi.fn()}
    />);
    expect(html).toContain('role="tablist" aria-label="Artefactos abiertos"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true" aria-controls="artifact-editor-panel" tabindex="0"');
    expect(html).toContain('aria-selected="false" aria-controls="artifact-editor-panel" tabindex="-1"');
    expect(html).toContain('Clases del sistema · Diagrama de clases');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<h1 class="visually-hidden">Clases del sistema</h1>');
    expect(html.indexOf('id="artifact-tab-other"')).toBeLessThan(html.indexOf('id="artifact-tab-classes"'));
  });

  it('preserves tab keyboard and pointer handlers on the focusable tab', () => {
    const onKeyDown = vi.fn();
    const onPointerDown = vi.fn();
    const tab: ReactElement<HTMLAttributes<HTMLDivElement>> = ArtifactTab({ artifact, active: true, onSelect: vi.fn(), onClose: vi.fn(), onKeyDown, onPointerDown });
    expect(tab.props.onKeyDown).toBe(onKeyDown);
    expect(tab.props.onPointerDown).toBe(onPointerDown);
    expect(tab.props.tabIndex).toBe(0);
    expect(tab.props['aria-selected']).toBe(true);
  });

  describe('PDF tabs', () => {
    const pdf = { id: 'enunciado', name: 'Enunciado TP2.pdf', size: 10, addedAt: '2026-10-01T00:00:00.000Z' };
    const renderTabs = (extra: Partial<Parameters<typeof ArtifactTabs>[0]> = {}) => renderToString(<ArtifactTabs
      projectName="Proyecto" artifacts={[artifact]} files={[pdf]} openArtifactIds={[artifact.id, pdf.id]} activeArtifactId={pdf.id}
      onSelect={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()} onCloseRight={vi.fn()} onReorder={vi.fn()} {...extra}
    />);

    it('shows the PDF next to the artifacts, without its extension, and selects only the active one', () => {
      const html = renderTabs();
      expect(html.match(/role="tab"/g)).toHaveLength(2);
      expect(html).toContain('id="artifact-tab-enunciado"');
      expect(html).toContain('aria-label="Enunciado TP2"');
      expect(html).toContain('Enunciado TP2 · PDF');
      expect(html).toContain('<h1 class="visually-hidden">Enunciado TP2</h1>');
      expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
      expect(html.indexOf('id="artifact-tab-classes"')).toBeLessThan(html.indexOf('id="artifact-tab-enunciado"'));
    });

    it('does not show a tab for a PDF that no longer exists', () => {
      const html = renderTabs({ files: [], activeArtifactId: artifact.id });
      expect(html.match(/role="tab"/g)).toHaveLength(1);
    });

    it('labels the close button with the display name and keeps the artifact tab calls working', () => {
      const tab = ArtifactTab({ artifact: pdf, active: true, onSelect: vi.fn(), onClose: vi.fn() });
      const close = (tab.props.children as ReactElement[])[2] as ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
      expect(close.props['aria-label']).toBe('Cerrar Enunciado TP2');
    });
  });
});
