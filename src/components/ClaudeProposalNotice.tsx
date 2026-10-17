import { useMemo } from 'react';
import type { DiagramProject } from '../types/diagram';
import { isInvalidProposal, resolveProposalTarget, type ClaudeProposal, type ParsedClaudeProposal } from '../storage/claudeProposals';

type ClaudeProposalNoticeProps = {
  proposals: ParsedClaudeProposal[];
  projects: DiagramProject[];
  activeProjectId: string | null;
  activeArtifactId: string | null;
  onView: (projectId: string, artifactId: string) => void;
  onApply: (proposal: ClaudeProposal) => void;
  onDiscard: (file: string) => void;
};

/** Una propuesta de Claude por vez, la más vieja primero. Nada se aplica sin que el usuario lo pida. */
export function ClaudeProposalNotice({ proposals, projects, activeProjectId, activeArtifactId, onView, onApply, onDiscard }: ClaudeProposalNoticeProps) {
  const proposal = proposals[0];
  // Repetir las operaciones de Claude sobre un diagrama grande no es gratis: solo cuando cambia algo.
  const target = useMemo(() => (proposal === undefined ? null : resolveProposalTarget(proposal, projects)), [proposal, projects]);
  if (proposal === undefined || target === null) return null;
  const counter = proposals.length > 1 ? <span className="claude-proposal-counter">1 de {proposals.length}</span> : null;

  if (target.kind === 'invalid' || isInvalidProposal(proposal)) {
    return (
      <div className="claude-proposal-notice is-invalid" role="status">
        <div className="claude-proposal-text">
          <strong>Llegó una propuesta de Claude que no se puede aplicar.</strong>
          <span>{target.kind === 'invalid' ? target.error : ''}</span>
        </div>
        {counter}
        <button className="home-button" type="button" onClick={() => onDiscard(proposal.file)}>Descartar</button>
      </div>
    );
  }

  const title = target.kind === 'replace'
    ? <>Claude propone cambios en <em>{target.artifact.name}</em></>
    : <>Claude propone un artefacto nuevo: <em>{proposal.artifact.name}</em></>;
  const otherProject = target.project.id !== activeProjectId ? `, en el proyecto ${target.project.name}` : '';

  return (
    <div className="claude-proposal-notice" role="status">
      <div className="claude-proposal-text">
        <strong>{title}{otherProject}</strong>
        {proposal.description && <span>{proposal.description}</span>}
        {target.kind === 'replace' && target.changedSinceRead && (
          <span className="claude-proposal-warning">
            Cambiaste este artefacto después de que Claude lo leyó: si aplicás, esos cambios se reemplazan.
          </span>
        )}
        <span className="claude-proposal-hint">Después de aplicar, se deshace como cualquier cambio.</span>
      </div>
      {counter}
      {target.kind === 'replace' && (target.project.id !== activeProjectId || target.artifact.id !== activeArtifactId) && (
        <button className="home-button" type="button" onClick={() => onView(target.project.id, target.artifact.id)}>Ver</button>
      )}
      <button className="home-button" type="button" onClick={() => onDiscard(proposal.file)}>Descartar</button>
      <button className="home-button home-button-primary" type="button" onClick={() => onApply(proposal)}>Aplicar</button>
    </div>
  );
}
