import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ProjectSidebar } from './ProjectSidebar';
import { APP_VERSION } from '../constants/appInfo';

const release = { version: '9.9.9', url: 'https://github.com/alejocarabelli/Modelador-de-Sistemas/releases/tag/v9.9.9' };

const render = (overrides: Partial<Parameters<typeof ProjectSidebar>[0]> = {}) => {
  const handler = vi.fn();
  return renderToString(
    <ProjectSidebar
      activeArtifactId={null}
      activeProjectId={null}
      isCollapsed={false}
      isHome
      onCreateArtifact={handler}
      onCreateProject={handler}
      onDeleteArtifact={handler}
      onDeleteProject={handler}
      onExportArtifact={handler}
      onExportProject={handler}
      onImportArtifact={handler}
      onMoveArtifact={handler}
      onOpenHome={handler}
      onOpenShortcuts={handler}
      onRenameArtifact={handler}
      onRenameProject={handler}
      onSelectArtifact={handler}
      onSelectProject={handler}
      onThemePreferenceChange={handler}
      palette="indigo"
      onPaletteChange={handler}
      onToggleCollapsed={handler}
      projects={[]}
      themePreference="system"
      {...overrides}
    />,
  );
};

describe('ProjectSidebar version and update notice', () => {
  it('shows the installed version in the expanded footer', () => {
    const html = render();

    expect(html).toContain(`v${APP_VERSION}`);
    expect(html).toContain('title="Versión instalada"');
    expect(html).not.toContain('Hay una versión nueva');
  });

  it('shows no version when the sidebar is collapsed', () => {
    const html = render({ isCollapsed: true });

    expect(html).not.toContain('Versión instalada');
    expect(html).not.toContain(`v${APP_VERSION}`);
  });

  it('announces a newer release above the footer controls, with a link out and a hide button', () => {
    const html = render({ update: release, onDismissUpdate: vi.fn() });

    expect(html).toContain('Hay una versión nueva (9.9.9)');
    expect(html).toContain(`href="${release.url}"`);
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain('target=');
    expect(html).toContain('title="Ocultar"');
    expect(html.indexOf('Hay una versión nueva')).toBeLessThan(html.indexOf('v2-sidebar-footer"'));
  });

  it('marks the collapsed rail with a dot instead of a banner', () => {
    const html = render({ isCollapsed: true, update: release });

    expect(html).toContain('title="Hay una versión nueva (9.9.9)"');
    expect(html).not.toContain('Descargar');
  });

  it('shows no notice and no dot when there is no release to announce', () => {
    expect(render({ isCollapsed: true, update: null })).not.toContain('v2-update-dot');
    expect(render({ update: null })).not.toContain('v2-sidebar-update');
  });
});

describe('ProjectSidebar PDF files', () => {
  const project = {
    id: 'p', name: 'Parcial', createdAt: '', updatedAt: '2026-10-01T00:00:00.000Z', activeArtifactId: 'a1',
    artifacts: [{ id: 'a1', type: 'class-diagram' as const, name: 'Clases', createdAt: '', updatedAt: '', content: { nodes: [], edges: [] } }],
    files: [
      { id: 'f1', name: 'Enunciado TP2.pdf', size: 10, pageCount: 4, addedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'f2', name: 'Resolución.pdf', size: 10, addedAt: '2026-10-01T00:00:00.000Z' },
    ],
  };
  const open = { activeProjectId: 'p', isHome: false, projects: [project], onAddFiles: vi.fn() };

  it('lists the PDFs under the artifacts, with their page count and without the extension', () => {
    const html = render(open);
    expect(html).toContain('aria-label="Archivos de Parcial"');
    expect(html).toContain('>Enunciado TP2<');
    expect(html).toContain('4 pág.');
    expect(html).toContain('Agregar PDF…');
    expect(html.indexOf('Artefactos de Parcial')).toBeLessThan(html.indexOf('Archivos de Parcial'));
  });

  it('marks the current PDF and not the artifact', () => {
    const html = render({ ...open, activeArtifactId: null, activeFileId: 'f1' });
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/is-current[^>]*>\s*<button[^>]*aria-current="page"[^>]*>(?:(?!<\/li>).)*Enunciado TP2/s);
  });

  it('flags a PDF that is not stored on this computer', () => {
    const html = render({ ...open, unavailableFileIds: new Set(['f2']) });
    expect(html).toContain('no disponible');
    expect(html).not.toContain('4 pág.no disponible');
  });

  it('offers the section only where files are supported, and keeps an empty one useful', () => {
    expect(render({ ...open, onAddFiles: undefined })).not.toContain('Archivos');
    const empty = render({ ...open, projects: [{ ...project, files: undefined }] });
    expect(empty).toContain('Agregar PDF…');
    expect(empty).not.toContain('pág.');
  });

  it('puts the PDFs in the collapsed rail too', () => {
    const html = render({ ...open, isCollapsed: true, activeFileId: 'f1' });
    expect(html).toContain('aria-label="Enunciado TP2"');
    expect(html).toContain('Enunciado TP2 · PDF');
  });
});
