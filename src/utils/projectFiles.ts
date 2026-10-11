import type { DiagramProject, ProjectFile } from '../types/diagram';

export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

/** Ids become file names in the native store, so they are restricted to a safe alphabet. */
export const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps the valid entries and drops the rest; a broken entry never makes the whole project unreadable. */
export const normalizeProjectFiles = (raw: unknown): ProjectFile[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const files: ProjectFile[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { id, name, size, pageCount, addedAt } = item;
    if (typeof id !== 'string' || !FILE_ID_PATTERN.test(id) || seen.has(id)) continue;
    if (typeof name !== 'string' || name.trim().length === 0) continue;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) continue;
    seen.add(id);
    files.push({
      id,
      name: name.trim(),
      size,
      ...(typeof pageCount === 'number' && Number.isInteger(pageCount) && pageCount > 0 ? { pageCount } : {}),
      addedAt: typeof addedAt === 'string' && !Number.isNaN(Date.parse(addedAt)) ? addedAt : new Date(0).toISOString(),
    });
  }
  return files;
};

export const hasPdfSignature = (bytes: ArrayLike<number>): boolean =>
  bytes.length >= PDF_SIGNATURE.length && PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);

export type PdfRejection = 'empty' | 'too-large' | 'not-pdf';

/** Checks size first, so a huge file is never read; then the %PDF- signature of its first bytes. */
export const validatePdf = async (file: Pick<Blob, 'size' | 'slice'>): Promise<PdfRejection | null> => {
  if (file.size === 0) return 'empty';
  if (file.size > MAX_PROJECT_FILE_BYTES) return 'too-large';
  const head = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
  return hasPdfSignature(head) ? null : 'not-pdf';
};

export const rejectionMessage = (name: string, reason: PdfRejection): string => {
  if (reason === 'too-large') return `«${name}» pesa más de ${MAX_PROJECT_FILE_BYTES / 1024 / 1024} MB. Probá con una versión más liviana.`;
  if (reason === 'empty') return `«${name}» está vacío.`;
  return `«${name}» no es un PDF. Por ahora solo se pueden agregar PDF.`;
};

/** «Enunciado TP2.pdf» shows as «Enunciado TP2». */
export const fileDisplayName = (name: string): string => name.replace(/\.pdf$/i, '').trim() || name;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
};

export const projectFiles = (project: Pick<DiagramProject, 'files'>): ProjectFile[] => project.files ?? [];

export const addFilesToProject = (project: DiagramProject, files: ProjectFile[], now: string): DiagramProject => {
  const known = new Set(projectFiles(project).map((file) => file.id));
  const fresh = files.filter((file) => !known.has(file.id));
  return fresh.length === 0 ? project : { ...project, files: [...projectFiles(project), ...fresh], updatedAt: now };
};

export const renameFileInProject = (project: DiagramProject, fileId: string, name: string, now: string): DiagramProject => {
  const clean = name.trim();
  const target = projectFiles(project).find((file) => file.id === fileId);
  if (target === undefined || clean.length === 0 || target.name === clean) return project;
  return { ...project, files: projectFiles(project).map((file) => file.id === fileId ? { ...file, name: clean } : file), updatedAt: now };
};

export const removeFileFromProject = (project: DiagramProject, fileId: string, now: string): DiagramProject => {
  if (!projectFiles(project).some((file) => file.id === fileId)) return project;
  const files = projectFiles(project).filter((file) => file.id !== fileId);
  const { files: _previous, ...rest } = project;
  void _previous;
  return { ...rest, ...(files.length > 0 ? { files } : {}), updatedAt: now };
};

/** The page count is learned when the file is first opened and the size when it is added again: neither is an edit, so `updatedAt` stays. */
export const patchFileInProject = (
  project: DiagramProject,
  fileId: string,
  patch: Partial<Pick<ProjectFile, 'size' | 'pageCount'>>,
): DiagramProject => {
  const target = projectFiles(project).find((file) => file.id === fileId);
  if (target === undefined) return project;
  const next = {
    ...target,
    ...(patch.size !== undefined && Number.isFinite(patch.size) && patch.size >= 0 ? { size: patch.size } : {}),
    ...(patch.pageCount !== undefined && Number.isInteger(patch.pageCount) && patch.pageCount > 0 ? { pageCount: patch.pageCount } : {}),
  };
  if (next.size === target.size && next.pageCount === target.pageCount) return project;
  return { ...project, files: projectFiles(project).map((file) => file.id === fileId ? next : file) };
};

/** A stored binary is only collected once it is older than this and no project refers to it. */
export const FILE_GC_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const referencedFileIds = (projects: readonly Pick<DiagramProject, 'files'>[]): string[] =>
  [...new Set(projects.flatMap((project) => projectFiles(project).map((file) => file.id)))];

/** Ids of stored binaries that may be collected: not referenced and old enough. */
export const collectableFileIds = (
  stored: readonly { id: string; addedAt: number }[],
  referenced: readonly string[],
  now: number,
): string[] => {
  const kept = new Set(referenced);
  return stored.filter((item) => !kept.has(item.id) && now - item.addedAt > FILE_GC_MIN_AGE_MS).map((item) => item.id);
};
