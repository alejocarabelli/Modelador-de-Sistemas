import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from '../utils/diagramNormalization';

const LEGACY_STORAGE_KEY = 'class-diagram-projects:v1';
const STORAGE_KEY = 'design-projects:v2';

type StoredProjectsEnvelope = {
  version: 2;
  projects: DiagramProject[];
};

export type LoadProjectsResult = {
  projects: DiagramProject[];
  skipInitialSave: boolean;
  storageUnavailable: boolean;
  warning: string | null;
  recoveryRaw: string | null;
};

export type SaveProjectsResult = {
  ok: boolean;
  error: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectionSize = (value: unknown): number =>
  Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : 0;

const messageCount = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((total, item) => total + messageCount(item), 0);
  if (!isRecord(value)) return 0;
  return (value.kind === 'message' ? 1 : 0) + Object.values(value).reduce<number>((total, item) => total + messageCount(item), 0);
};

// Only schema collections are compared: optional missing collections and
// empty arrays are normal in older projects. A malformed nonempty collection
// is loss even when the normalizer creates a replacement item as a fallback.
const contentCollectionKeys = new Set([
  'nodes', 'edges', 'messages', 'participants', 'notes', 'activations',
  'items', 'operands', 'attributes', 'methods', 'parametricValues',
  'basicFlow', 'alternativeFlows', 'steps', 'linkedSequenceDiagramIds',
]);

const hasCollectionData = (value: unknown): boolean =>
  collectionSize(value) > 0 || (typeof value === 'string' && value.length > 0)
    || typeof value === 'number' || typeof value === 'boolean';

// IDs are not unique until normalization. Positional matching avoids pairing
// a reassigned duplicate with the first element carrying its original ID.
const collectionCounterparts = (raw: unknown[], clean: unknown[]): unknown[] => {
  const ids = raw.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : []);
  const duplicated = ids.length !== new Set(ids).size;
  const cleanIds = new Set(clean.flatMap((item) => isRecord(item) && typeof item.id === 'string' ? [item.id] : []));
  const reassigned = ids.some((id) => !cleanIds.has(id));
  return raw.map((item, index) => !duplicated && !reassigned && isRecord(item) && typeof item.id === 'string'
    ? clean.find((candidate) => isRecord(candidate) && candidate.id === item.id) ?? clean[index]
    : clean[index]);
};

const contentLost = (raw: unknown, normalized: unknown): boolean => {
  if (!isRecord(raw)) return false;
  const clean = isRecord(normalized) ? normalized : {};
  // Legacy v1 → v2 use-case-flow migration restructures flat rows into nested turn trees.
  // Verify that no alternative flow was dropped and non-empty flows stayed non-empty.
  if (raw.version !== 2 && clean.version === 2 && isRecord(raw.description) && ('basicFlow' in raw || 'alternativeFlows' in raw)) {
    const rawBasic = Array.isArray(raw.basicFlow) ? raw.basicFlow : null;
    const rawAlts = Array.isArray(raw.alternativeFlows) ? raw.alternativeFlows : null;
    if (raw.basicFlow !== undefined && rawBasic === null && hasCollectionData(raw.basicFlow)) return true;
    if (raw.alternativeFlows !== undefined && rawAlts === null && hasCollectionData(raw.alternativeFlows)) return true;
    const cleanBasic = Array.isArray(clean.basicFlow) ? clean.basicFlow : [];
    const cleanAlts = Array.isArray(clean.alternativeFlows) ? clean.alternativeFlows : [];
    if (rawBasic && rawBasic.length > 0 && cleanBasic.length === 0) return true;
    if (rawAlts && rawAlts.length > cleanAlts.length) return true;
    return false;
  }
  return Object.entries(raw).some(([key, value]) => {
    const next = clean[key];
    if (contentCollectionKeys.has(key)) {
      if (!Array.isArray(value)) return hasCollectionData(value);
      const nextItems: unknown[] = Array.isArray(next) ? next : [];
      if (key === 'linkedSequenceDiagramIds') {
        const nextIds = new Set(nextItems);
        return [...new Set(value)].some((id) => !nextIds.has(id));
      }
      if (value.length > nextItems.length) return true;
      const counterparts = collectionCounterparts(value, nextItems);
      return value.some((item, index) => contentLost(item, counterparts[index]));
    }
    return isRecord(value) && contentLost(value, next);
  }) || messageCount(raw.items) > messageCount(clean.items);
};

const notebookLost = (raw: unknown, normalized: unknown): boolean => {
  if (raw === undefined || raw === null) return false;
  if (!isRecord(raw) || !Array.isArray(raw.blocks)) return true;
  const clean = isRecord(normalized) && Array.isArray(normalized.blocks) ? normalized.blocks : [];
  if (raw.blocks.some((block) => isRecord(block) && block.kind === 'sketch'
    && block.shapes !== undefined && !Array.isArray(block.shapes))) return true;
  if (raw.blocks.length > clean.length) return true;
  const shapeCount = (blocks: unknown[]): number => blocks.reduce<number>((total, block) =>
    total + (isRecord(block) && block.kind === 'sketch' ? collectionSize(block.shapes) : 0), 0);
  return shapeCount(raw.blocks) > shapeCount(clean);
};

const projectLost = (raw: unknown, normalized: DiagramProject): boolean => {
  if (!isRecord(raw)) return true;
  if (!Array.isArray(raw.artifacts)) return hasCollectionData(raw.artifacts) || contentLost(raw.content, normalized.artifacts[0]?.content);
  if (raw.artifacts.length > normalized.artifacts.length) return true;
  const counterparts = collectionCounterparts(raw.artifacts, normalized.artifacts);
  return raw.artifacts.some((artifact, index) => {
    if (!isRecord(artifact)) return true;
    const clean = counterparts[index];
    return !isRecord(clean) || clean.type !== artifact.type || contentLost(artifact.content, clean.content)
      || notebookLost(artifact.notebook, clean.notebook);
  });
};

const parseStoredProjects = (rawProjects: string): { projects: DiagramProject[]; loss: boolean } => {
  const parsed: unknown = JSON.parse(rawProjects);
  const raw = Array.isArray(parsed) ? parsed
    : isRecord(parsed) && parsed.version === 2 && Array.isArray(parsed.projects) ? parsed.projects : null;
  if (raw === null) throw new Error('Unrecognized storage format.');
  const readable = raw.flatMap((project) => {
    try {
      return [{ raw: project, project: normalizeDiagramProject(project) }];
    } catch {
      return [];
    }
  });
  const projects = readable.map((item) => item.project);
  return { projects, loss: projects.length < raw.length || readable.some((item) => projectLost(item.raw, item.project)) };
};

const RECOVERY_WARNING = 'No se pudo leer todo el trabajo guardado. El guardado está en pausa para proteger el original. Descargá una copia de seguridad antes de seguir.';

export const loadProjects = (): LoadProjectsResult => {
  let currentProjects: string | null;
  let legacyProjects: string | null;

  try {
    currentProjects = localStorage.getItem(STORAGE_KEY);
    legacyProjects = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return {
      projects: [],
      skipInitialSave: true,
      recoveryRaw: null,
      storageUnavailable: true,
      warning: 'No se pudo abrir el almacenamiento de la app. Tus cambios de esta sesión se guardan solo en los respaldos de Documentos.',
    };
  }

  const rawProjects = currentProjects ?? legacyProjects;

  if (rawProjects === null) {
    return { projects: [], skipInitialSave: false, storageUnavailable: false, warning: null, recoveryRaw: null };
  }

  try {
    const { projects, loss } = parseStoredProjects(rawProjects);
    return {
      projects,
      skipInitialSave: loss,
      storageUnavailable: false,
      warning: loss ? RECOVERY_WARNING : null,
      recoveryRaw: loss ? rawProjects : null,
    };
  } catch {
    return {
      projects: [],
      skipInitialSave: true,
      storageUnavailable: false,
      warning: RECOVERY_WARNING,
      recoveryRaw: rawProjects,
    };
  }
};

export const saveProjects = (projects: DiagramProject[]): SaveProjectsResult => {
  const payload: StoredProjectsEnvelope = { version: 2, projects };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true, error: null };
  } catch {
    return {
      ok: false,
      error: 'No se pudieron guardar los cambios en este dispositivo. Exportá tu proyecto para conservar el trabajo.',
    };
  }
};
