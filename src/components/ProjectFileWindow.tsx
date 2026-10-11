import { lazy, Suspense, useEffect } from 'react';
import { useLiveProjects } from '../hooks/useLiveProjects';
import { useTheme } from '../hooks/useTheme';
import { fileDisplayName } from '../utils/projectFiles';

const PdfViewer = lazy(() => import('./PdfViewer').then(({ PdfViewer: viewer }) => ({ default: viewer })));

/** A PDF in its own read-only window, e.g. to take it to an iPad used as a second display. */
export function ProjectFileWindow({ projectId, fileId }: { projectId: string; fileId: string }) {
  const { theme, themeStyle } = useTheme();
  const projects = useLiveProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const file = project?.files?.find((candidate) => candidate.id === fileId);

  useEffect(() => {
    document.title = file ? `${fileDisplayName(file.name)} · vista` : 'Modelador de Sistemas';
  }, [file]);

  return (
    <div className="app-shell artifact-viewer" data-theme={theme.id} data-ui-version="refined" style={themeStyle}>
      <header className="artifact-viewer-bar">
        <div className="artifact-viewer-title">
          <strong>{file ? fileDisplayName(file.name) : 'Archivo no disponible'}</strong>
          {project ? <span>{project.name} · solo lectura</span> : null}
        </div>
      </header>
      <div className="artifact-viewer-canvas">
        {file ? (
          <Suspense fallback={null}>
            <PdfViewer key={file.id} file={file} />
          </Suspense>
        ) : (
          <p className="artifact-viewer-empty">Este archivo ya no está en el proyecto. Podés cerrar esta ventana.</p>
        )}
      </div>
    </div>
  );
}
