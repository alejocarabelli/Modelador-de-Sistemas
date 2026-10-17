import type { DiagramSaveStatus } from '../hooks/useProjects';

type ProjectBackupWarningProps = {
  error: string | null;
  saveStatus: DiagramSaveStatus;
  onRetry: () => void;
  onExport: () => void;
  onCopy?: () => void;
};

export function ProjectBackupWarning({ error, saveStatus, onRetry, onExport, onCopy }: ProjectBackupWarningProps) {
  if (error === null) return null;
  return (
    <div className="project-backup-warning" role="status">
      <span>No se pudo guardar la copia en disco. {saveStatus === 'saved' ? 'Los cambios están guardados en este dispositivo.' : 'Exportá el proyecto para conservar tu trabajo.'}</span>
      <button className="home-button" type="button" onClick={onRetry}>Reintentar respaldo</button>
      <button className="home-button" type="button" onClick={onExport}>Exportar proyecto</button>
      {onCopy ? <button className="home-button" type="button" onClick={onCopy}>Copiar JSON</button> : null}
    </div>
  );
}
