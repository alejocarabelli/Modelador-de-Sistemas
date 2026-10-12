import type { DesignArtifact, DiagramProject } from '../types/diagram';
import { extractImportableArtifacts } from '../utils/artifactFile';

/**
 * Propuestas de cambio que deja Claude (la extensión de Claude Desktop, en
 * claude-mcp/) en Documentos › Modelador de Sistemas › Claude › Propuestas.
 * La app nunca las aplica sola: las muestra y el usuario decide. Solo la
 * ventana principal del Mac y de Windows tiene el puente; en el navegador no
 * hay propuestas.
 */

export type ClaudeProposalsBridge = { postMessage: (message: unknown) => Promise<unknown> };

declare global {
  interface Window {
    __modeladorClaudeProposals?: boolean;
  }
}

export const PROPOSAL_FORMAT = 'modelador-propuesta';

export type ClaudeProposal = {
  file: string;
  projectId: string;
  /** El artefacto que reemplaza; null si propone uno nuevo. */
  artifactId: string | null;
  /** Ya validado y normalizado igual que un artefacto importado. */
  artifact: DesignArtifact;
  description: string;
  /** updatedAt del artefacto cuando Claude lo leyó, para avisar si cambió después. */
  basedOnUpdatedAt: string | null;
};

export type InvalidClaudeProposal = { file: string; error: string };

export type ParsedClaudeProposal = ClaudeProposal | InvalidClaudeProposal;

export const isInvalidProposal = (proposal: ParsedClaudeProposal): proposal is InvalidClaudeProposal => 'error' in proposal;

const bridge = (): ClaudeProposalsBridge | null => {
  if (typeof window === 'undefined' || window.__modeladorClaudeProposals !== true) return null;
  const handlers = (window as unknown as { webkit?: { messageHandlers?: { modeladorClaude?: ClaudeProposalsBridge } } })
    .webkit?.messageHandlers;
  return window.__modeladorBridges?.claude ?? handlers?.modeladorClaude ?? null;
};

export const areClaudeProposalsAvailable = (): boolean => bridge() !== null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

export const parseClaudeProposal = (file: string, text: string): ParsedClaudeProposal => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { file, error: 'El archivo no es un JSON válido.' };
  }
  if (!isRecord(value) || value.format !== PROPOSAL_FORMAT || value.version !== 1) {
    return { file, error: 'El archivo no es una propuesta de Claude.' };
  }
  const projectId = optionalString(value.projectId);
  if (projectId === null) return { file, error: 'La propuesta no dice a qué proyecto va.' };

  const artifacts = extractImportableArtifacts({ type: value.type, name: value.name, content: value.content });
  if (artifacts === null || artifacts.length !== 1) {
    return { file, error: 'El contenido propuesto no tiene la forma de un artefacto del Modelador.' };
  }

  return {
    file,
    projectId,
    artifactId: optionalString(value.artifactId),
    artifact: artifacts[0],
    description: typeof value.description === 'string' ? value.description.trim() : '',
    basedOnUpdatedAt: optionalString(value.basedOnUpdatedAt),
  };
};

export const listClaudeProposals = async (): Promise<ParsedClaudeProposal[]> => {
  const native = bridge();
  if (native === null) return [];
  const reply = await native.postMessage({ action: 'list' });
  const entries = isRecord(reply) && Array.isArray(reply.proposals) ? reply.proposals : [];
  return entries
    .filter((entry): entry is { file: string; text: string } => isRecord(entry) && typeof entry.file === 'string' && typeof entry.text === 'string')
    .map((entry) => parseClaudeProposal(entry.file, entry.text));
};

/** Aplicada o descartada: la propuesta sale de la carpeta. */
export const resolveClaudeProposal = async (file: string): Promise<void> => {
  const native = bridge();
  if (native !== null) await native.postMessage({ action: 'resolve', file });
};

export type ProposalTarget =
  | { kind: 'replace'; project: DiagramProject; artifact: DesignArtifact; changedSinceRead: boolean }
  | { kind: 'new'; project: DiagramProject }
  | { kind: 'invalid'; error: string };

/** Dónde cae la propuesta hoy: el proyecto o el artefacto pueden haber cambiado desde que Claude los leyó. */
export const resolveProposalTarget = (proposal: ParsedClaudeProposal, projects: DiagramProject[]): ProposalTarget => {
  if (isInvalidProposal(proposal)) return { kind: 'invalid', error: proposal.error };
  const project = projects.find((candidate) => candidate.id === proposal.projectId);
  if (project === undefined) return { kind: 'invalid', error: 'El proyecto de esta propuesta ya no existe.' };
  if (proposal.artifactId === null) return { kind: 'new', project };
  const artifact = project.artifacts.find((candidate) => candidate.id === proposal.artifactId);
  if (artifact === undefined) return { kind: 'invalid', error: 'El artefacto de esta propuesta ya no existe.' };
  if (artifact.type !== proposal.artifact.type) {
    return { kind: 'invalid', error: 'La propuesta es de otro tipo de artefacto que el que tiene que cambiar.' };
  }
  const changedSinceRead = proposal.basedOnUpdatedAt !== null && proposal.basedOnUpdatedAt !== artifact.updatedAt;
  return { kind: 'replace', project, artifact, changedSinceRead };
};
