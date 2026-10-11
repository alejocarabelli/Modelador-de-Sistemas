import { useCallback, useEffect, useState } from 'react';
import { loadProjects } from '../storage/projectsStorage';
import type { DiagramProject } from '../types/diagram';

const POLL_INTERVAL_MS = 1000;
const STORAGE_KEY = 'design-projects:v2';

const readRaw = (): string | null => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

/**
 * Keeps the diagram as the main window last saved it. This window never writes
 * the projects: it only re-reads them, so it can never overwrite an edit.
 */
export const useLiveProjects = (): DiagramProject[] => {
  const [state, setState] = useState(() => ({ raw: readRaw(), projects: loadProjects().projects }));
  const refresh = useCallback((): void => {
    const raw = readRaw();
    setState((current) => raw === current.raw ? current : { raw, projects: loadProjects().projects });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  return state.projects;
};
