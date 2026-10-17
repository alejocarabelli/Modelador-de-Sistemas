import { useCallback, useEffect, useRef, useState } from 'react';
import {
  areClaudeProposalsAvailable,
  listClaudeProposals,
  resolveClaudeProposal,
  type ParsedClaudeProposal,
} from '../storage/claudeProposals';

/** Cada cuánto se mira la carpeta de propuestas mientras la app está a la vista. */
export const CLAUDE_PROPOSALS_POLL_MS = 2000;

const signature = (proposals: ParsedClaudeProposal[]): string =>
  JSON.stringify(proposals.map((proposal) => proposal.file));

/**
 * Las propuestas de Claude pendientes, de la más vieja a la más nueva. Solo
 * mira la carpeta con la app visible: en segundo plano no gasta nada, y al
 * volver a la app la propuesta ya está.
 */
export const useClaudeProposals = () => {
  const [proposals, setProposals] = useState<ParsedClaudeProposal[]>([]);
  const lastSignature = useRef(signature([]));
  const resolved = useRef(new Set<string>());

  const refresh = useCallback(async (): Promise<void> => {
    let next: ParsedClaudeProposal[];
    try {
      next = await listClaudeProposals();
    } catch {
      return; // Un error leyendo la carpeta no es motivo para molestar: se reintenta solo.
    }
    // Una propuesta ya resuelta puede volver en una lectura que salió antes de borrarla.
    next = next.filter((proposal) => !resolved.current.has(proposal.file));
    const nextSignature = signature(next);
    if (nextSignature === lastSignature.current) return;
    lastSignature.current = nextSignature;
    setProposals(next);
  }, []);

  useEffect(() => {
    if (!areClaudeProposalsAvailable()) return undefined;
    let timer: number | null = null;
    const schedule = (): void => {
      if (timer !== null) window.clearTimeout(timer);
      timer = document.visibilityState === 'visible'
        ? window.setTimeout(() => { void refresh().finally(schedule); }, CLAUDE_PROPOSALS_POLL_MS)
        : null;
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void refresh();
      schedule();
    };
    void refresh();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const resolve = useCallback(async (file: string): Promise<void> => {
    resolved.current.add(file);
    setProposals((current) => {
      const next = current.filter((proposal) => proposal.file !== file);
      lastSignature.current = signature(next);
      return next;
    });
    try {
      await resolveClaudeProposal(file);
    } catch {
      // Si no se pudo borrar, igual queda oculta en esta sesión.
    }
  }, []);

  return { proposals, resolve };
};
