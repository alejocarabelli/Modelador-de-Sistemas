import { isClassGroupColor } from '../constants/classGroupColors';
import { reconcileSequenceModelLinks } from './sequenceModelLink';
import type {
  ArtifactNotebook,
  ClassDiagramArtifact,
  ClassDiagramContent,
  ClassDiagramEdge,
  ClassDiagramNode,
  ClassAttribute,
  ClassMethod,
  ClassSequenceDiagramArtifact,
  ClassSequenceDiagramContent,
  ClassModelArtifact,
  DesignArtifact,
  DiagramProject,
  LegacyDiagramProject,
  ParametricValue,
  SequenceDiagramArtifact,
  AlternativeUseCaseFlow,
  UseCaseEdgeData,
  UseCaseFlowArtifact,
  UseCaseFlowContent,
  UseCaseFlowDescription,
  UseCaseFlowPriority,
  UseCaseFlowStep,
  UseCaseModelArtifact,
  UseCaseModelContent,
  UseCaseModelEdge,
  UseCaseModelNode,
} from '../types/diagram';
import { normalizeAssociationEdge } from './association';
import { createId } from './id';
import { normalizeArtifactNotebook } from './artifactNotebook';
import { normalizeSequenceDiagramContent } from './sequenceDiagram';
import { normalizeProjectFiles } from './projectFiles';

const DEFAULT_CLASS_ARTIFACT_ID = 'default-class-diagram';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const ensureUniqueIds = <T extends { id: string }>(items: T[]): T[] => {
  const usedIds = new Set<string>();

  return items.map((item) => {
    const id = typeof item.id === 'string' ? item.id.trim() : '';

    if (id.length > 0 && !usedIds.has(id)) {
      usedIds.add(id);
      return item;
    }

    let nextId = createId();
    while (usedIds.has(nextId)) {
      nextId = createId();
    }
    usedIds.add(nextId);
    return { ...item, id: nextId };
  });
};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizePosition = (value: unknown, fallback = { x: 0, y: 0 }): { x: number; y: number } => {
  if (!isRecord(value)) {
    return fallback;
  }

  return {
    x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : fallback.x,
    y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : fallback.y,
  };
};

const noteHandles = ['top', 'right', 'bottom', 'left'] as const;
const normalizeNoteHandle = (value: unknown, fallback: (typeof noteHandles)[number]) =>
  noteHandles.some((handle) => handle === value) ? (value as (typeof noteHandles)[number]) : fallback;

export const normalizeClassNode = (node: ClassDiagramNode): ClassDiagramNode => {
  const data: Record<string, unknown> = isRecord(node?.data) ? node.data : {};
  const rawAttributes: unknown[] = Array.isArray(data.attributes) ? data.attributes : [];
  const rawMethods: unknown[] = Array.isArray(data.methods) ? data.methods : [];
  const rawParametricValues: unknown[] = Array.isArray(data.parametricValues) ? data.parametricValues : [];
  const attributes: ClassAttribute[] = ensureUniqueIds(
    rawAttributes
      .filter(isRecord)
      .map((attribute) => ({
        id: normalizeString(attribute.id),
        name: normalizeString(attribute.name),
        type: normalizeString(attribute.type),
        ...(attribute.isStatic === true ? { isStatic: true } : {}),
      })),
  );
  const methods: ClassMethod[] = ensureUniqueIds(
    rawMethods
      .filter(isRecord)
      .map((method) => ({
        id: normalizeString(method.id),
        visibility:
          method.visibility === '+' || method.visibility === '-' || method.visibility === '#'
            ? method.visibility
            : '',
        name: normalizeString(method.name),
        parameters: normalizeString(method.parameters),
        returnType: normalizeString(method.returnType),
        ...(method.isStatic === true ? { isStatic: true } : {}),
      })),
  );
  const parametricValues: ParametricValue[] = ensureUniqueIds(
    rawParametricValues
      .filter(isRecord)
      .map((value) => ({ id: normalizeString(value.id), value: normalizeString(value.value) })),
  );
  const normalizedNode: ClassDiagramNode = {
    ...node,
    id: normalizeString(node?.id),
    type: 'classNode',
    position: normalizePosition(node?.position),
    data: {
      name: normalizeString(data.name),
      ...(isClassGroupColor(data.groupColor) ? { groupColor: data.groupColor } : {}),
      ...(data.hideAttributes === true ? { hideAttributes: true } : {}),
      ...(data.hideMethods === true ? { hideMethods: true } : {}),
      description: normalizeString(data.description),
      attributes,
      methods,
      hasParametricValuesNote: data.hasParametricValuesNote === true,
      parametricValuesNoteConnectionMode:
        data.parametricValuesNoteConnectionMode === 'automatic' || data.parametricValuesNoteConnectionMode === 'manual'
          ? data.parametricValuesNoteConnectionMode
          : data.hasParametricValuesNote === true
            ? 'manual'
            : 'automatic',
      parametricValuesNoteHandle: normalizeNoteHandle(data.parametricValuesNoteHandle, 'bottom'),
      parametricValuesNoteTargetHandle: normalizeNoteHandle(data.parametricValuesNoteTargetHandle, 'top'),
      parametricValuesNotePosition: isRecord(data.parametricValuesNotePosition)
        ? normalizePosition(data.parametricValuesNotePosition)
        : undefined,
      parametricValues,
    },
  };

  delete normalizedNode.selected;
  delete normalizedNode.dragging;
  delete normalizedNode.width;
  delete normalizedNode.height;
  delete (normalizedNode as ClassDiagramNode & { positionAbsolute?: { x: number; y: number } }).positionAbsolute;

  return normalizedNode;
};

export const normalizeDiagramContent = (
  content: Partial<ClassDiagramContent> | undefined,
): ClassDiagramContent => {
  const nodes = ensureUniqueIds(
    Array.isArray(content?.nodes)
      ? content.nodes.filter(isRecord).map((node) => normalizeClassNode(node as unknown as ClassDiagramNode))
      : [],
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = ensureUniqueIds(
    Array.isArray(content?.edges)
      ? content.edges
          .filter(isRecord)
          .map((edge) => normalizeAssociationEdge(edge as unknown as ClassDiagramEdge))
          .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      : [],
  );

  return {
    nodes,
    edges,
  };
};

// The editor trims these as text: a number is its text, anything else is empty.
const normalizeText = (value: unknown): string =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';

export const normalizeUseCaseNode = (node: UseCaseModelNode): UseCaseModelNode => {
  const kind = node.data?.kind ?? (node.type === 'useCaseActor' ? 'actor' : node.type === 'systemBoundary' ? 'system-boundary' : 'use-case');
  const type = kind === 'actor' ? 'useCaseActor' : kind === 'system-boundary' ? 'systemBoundary' : 'useCaseOval';
  const normalizedNode: UseCaseModelNode = {
    ...node,
    type,
    data: {
      ...node.data,
      kind,
      name: normalizeText(node.data?.name),
    },
    style: {
      ...node.style,
      width: kind === 'system-boundary' ? node.style?.width ?? node.width ?? 420 : node.style?.width,
      height: kind === 'system-boundary' ? node.style?.height ?? node.height ?? 300 : node.style?.height,
    },
  };

  // Selection and React Flow measurements are not content: they never reach the saved artifact or its undo history.
  delete normalizedNode.selected;
  delete normalizedNode.dragging;
  delete normalizedNode.width;
  delete normalizedNode.height;
  delete (normalizedNode as UseCaseModelNode & { positionAbsolute?: unknown }).positionAbsolute;
  delete (normalizedNode as UseCaseModelNode & { resizing?: unknown }).resizing;

  return normalizedNode;
};

export const normalizeUseCaseEdge = (edge: UseCaseModelEdge): UseCaseModelEdge => {
  const normalizedEdge: UseCaseModelEdge = {
    ...edge,
    type: 'useCaseRelation',
    data: {
      relationType: edge.data?.relationType ?? 'association',
      label: normalizeText(edge.data?.label),
    } satisfies UseCaseEdgeData,
  };

  delete normalizedEdge.selected;

  return normalizedEdge;
};

export const normalizeUseCaseModelContent = (
  content: Partial<UseCaseModelContent> | undefined,
): UseCaseModelContent => {
  const nodes = Array.isArray(content?.nodes) ? (content.nodes as UseCaseModelNode[]).map(normalizeUseCaseNode) : [];
  const edges = Array.isArray(content?.edges) ? (content.edges as UseCaseModelEdge[]).map(normalizeUseCaseEdge) : [];

  return {
    nodes: ensureUniqueIds(nodes),
    edges: ensureUniqueIds(edges),
  };
};

const normalizeUseCaseFlowPriority = (value: unknown): UseCaseFlowPriority =>
  value === 'B' || value === 'C' ? value : 'A';

const normalizeUseCaseFlowDescription = (
  description: Partial<UseCaseFlowDescription> | undefined,
): UseCaseFlowDescription => ({
  useCaseNumber: normalizeString(description?.useCaseNumber),
  useCaseName: normalizeString(description?.useCaseName),
  actor: normalizeString(description?.actor),
  description: normalizeString(description?.description),
  priority: normalizeUseCaseFlowPriority(description?.priority),
  inputParameters: normalizeString(description?.inputParameters),
  precondition: normalizeString(description?.precondition),
  postcondition: normalizeString(description?.postcondition),
  initialState: normalizeString(description?.initialState),
  finalState: normalizeString(description?.finalState),
});

export const normalizeUseCaseFlowStep = (step: Partial<UseCaseFlowStep> | undefined): UseCaseFlowStep => ({
  id: typeof step?.id === 'string' && step.id.length > 0 ? step.id : createId(),
  actor: normalizeString(step?.actor),
  system: normalizeString(step?.system),
  ref: normalizeString(step?.ref),
});

export const normalizeUseCaseFlowContent = (
  content: Partial<UseCaseFlowContent> | undefined,
): UseCaseFlowContent => {
  const basicFlow = Array.isArray(content?.basicFlow)
    ? (content.basicFlow as Partial<UseCaseFlowStep>[]).map(normalizeUseCaseFlowStep)
    : [];
  const alternativeFlows = Array.isArray(content?.alternativeFlows)
    ? (content.alternativeFlows as Partial<AlternativeUseCaseFlow>[]).map((flow, index) => ({
        id: typeof flow?.id === 'string' && flow.id.length > 0 ? flow.id : createId(),
        code: normalizeString(flow?.code) || `CA ${index + 1}`,
        name: normalizeString(flow?.name),
        ...(typeof flow?.firstStepNumber === 'number' && Number.isInteger(flow.firstStepNumber) && flow.firstStepNumber > 0
          ? { firstStepNumber: flow.firstStepNumber }
          : {}),
        steps: ensureUniqueIds(
          Array.isArray(flow?.steps)
            ? (flow.steps as Partial<UseCaseFlowStep>[]).map(normalizeUseCaseFlowStep)
            : [],
        ),
      }))
    : [];

  return {
    classDiagramArtifactId: content?.classDiagramArtifactId === null
      ? null
      : normalizeString(content?.classDiagramArtifactId) || undefined,
    description: normalizeUseCaseFlowDescription(content?.description),
    basicFlow: ensureUniqueIds(basicFlow),
    alternativeFlows: ensureUniqueIds(alternativeFlows),
  };
};

// The key is only present when there are notes, so old projects serialize as before.
const withNotebook = (notebook: unknown): { notebook?: ArtifactNotebook } => {
  const normalized = normalizeArtifactNotebook(notebook);
  return normalized === undefined ? {} : { notebook: normalized };
};

const normalizeClassDiagramArtifact = (
  artifact: Partial<ClassDiagramArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): ClassDiagramArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : createId(),
  type: 'class-diagram',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Diagrama de clases',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  ...withNotebook(artifact?.notebook),
  content: normalizeDiagramContent(artifact?.content),
});

export const normalizeClassSequenceDiagramContent = (
  content: Partial<ClassSequenceDiagramContent> | undefined,
): ClassSequenceDiagramContent => ({
  ...normalizeDiagramContent(content),
  version: 1,
  sourceClassDiagramArtifactId: normalizeString(content?.sourceClassDiagramArtifactId) || undefined,
  linkedSequenceDiagramIds: Array.from(new Set(
    Array.isArray(content?.linkedSequenceDiagramIds)
      ? content.linkedSequenceDiagramIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [],
  )),
});

const normalizeClassSequenceDiagramArtifact = (
  artifact: Partial<ClassSequenceDiagramArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): ClassSequenceDiagramArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : createId(),
  type: 'class-sequence-diagram',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Diagrama de clases (Secuencia)',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  ...withNotebook(artifact?.notebook),
  content: normalizeClassSequenceDiagramContent(artifact?.content),
});

const normalizeUseCaseModelArtifact = (
  artifact: Partial<UseCaseModelArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): UseCaseModelArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : createId(),
  type: 'use-case-model',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Modelo de casos de uso',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  ...withNotebook(artifact?.notebook),
  content: normalizeUseCaseModelContent(artifact?.content),
});

const normalizeUseCaseFlowArtifact = (
  artifact: Partial<UseCaseFlowArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): UseCaseFlowArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : createId(),
  type: 'use-case-flow',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Flujo de sucesos',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  ...withNotebook(artifact?.notebook),
  content: normalizeUseCaseFlowContent(artifact?.content),
});

const normalizeSequenceDiagramArtifact = (
  artifact: Partial<SequenceDiagramArtifact> | undefined,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): SequenceDiagramArtifact => ({
  id: typeof artifact?.id === 'string' && artifact.id.length > 0 ? artifact.id : createId(),
  type: 'sequence-diagram',
  name: typeof artifact?.name === 'string' && artifact.name.length > 0 ? artifact.name : 'Diagrama de secuencia',
  createdAt: typeof artifact?.createdAt === 'string' ? artifact.createdAt : fallbackDates.createdAt,
  updatedAt: typeof artifact?.updatedAt === 'string' ? artifact.updatedAt : fallbackDates.updatedAt,
  ...withNotebook(artifact?.notebook),
  content: normalizeSequenceDiagramContent(artifact?.content),
});

export const normalizeArtifact = (
  artifact: unknown,
  fallbackDates: Pick<DiagramProject, 'createdAt' | 'updatedAt'>,
): DesignArtifact | null => {
  if (!isRecord(artifact)) {
    return null;
  }

  if (artifact.type === 'class-diagram') {
    return normalizeClassDiagramArtifact(artifact as Partial<ClassDiagramArtifact>, fallbackDates);
  }

  if (artifact.type === 'class-sequence-diagram') {
    return normalizeClassSequenceDiagramArtifact(artifact as Partial<ClassSequenceDiagramArtifact>, fallbackDates);
  }

  if (artifact.type === 'use-case-model') {
    return normalizeUseCaseModelArtifact(artifact as Partial<UseCaseModelArtifact>, fallbackDates);
  }

  if (artifact.type === 'use-case-flow') {
    return normalizeUseCaseFlowArtifact(artifact as Partial<UseCaseFlowArtifact>, fallbackDates);
  }

  if (artifact.type === 'sequence-diagram') {
    return normalizeSequenceDiagramArtifact(artifact as Partial<SequenceDiagramArtifact>, fallbackDates);
  }

  return null;
};

const isLegacyProject = (project: unknown): project is Partial<LegacyDiagramProject> =>
  isRecord(project) && isRecord(project.content) && !Array.isArray(project.artifacts);

export const normalizeDiagramProject = (project: Partial<DiagramProject> | Partial<LegacyDiagramProject>): DiagramProject => {
  const now = new Date().toISOString();
  const id = typeof project.id === 'string' && project.id.length > 0 ? project.id : createId();
  const name = typeof project.name === 'string' && project.name.length > 0 ? project.name : 'Nuevo proyecto';
  const createdAt = typeof project.createdAt === 'string' ? project.createdAt : now;
  const updatedAt = typeof project.updatedAt === 'string' ? project.updatedAt : now;

  if (isLegacyProject(project)) {
    const artifact = normalizeClassDiagramArtifact(
      {
        id: DEFAULT_CLASS_ARTIFACT_ID,
        type: 'class-diagram',
        name: 'Diagrama de clases',
        createdAt,
        updatedAt,
        content: project.content,
      },
      { createdAt, updatedAt },
    );

    const legacyFiles = normalizeProjectFiles((project as Partial<DiagramProject>).files);
    return {
      id,
      name,
      createdAt,
      updatedAt,
      activeArtifactId: artifact.id,
      artifacts: [artifact],
      ...(legacyFiles.length > 0 ? { files: legacyFiles } : {}),
    };
  }

  const normalizedArtifacts = Array.isArray(project.artifacts)
    ? project.artifacts
        .map((artifact) => normalizeArtifact(artifact, { createdAt, updatedAt }))
        .filter((artifact): artifact is DesignArtifact => artifact !== null)
    : [];

  const artifacts = reconcileSequenceModelLinks(ensureUniqueIds(
    normalizedArtifacts.length > 0
      ? normalizedArtifacts
      : [normalizeClassDiagramArtifact(undefined, { createdAt, updatedAt })],
  ));
  const requestedActiveArtifactId =
    typeof project.activeArtifactId === 'string' ? project.activeArtifactId : undefined;
  const activeArtifactId = artifacts.some((artifact) => artifact.id === requestedActiveArtifactId)
    ? requestedActiveArtifactId
    : artifacts[0].id;
  const files = normalizeProjectFiles((project as Partial<DiagramProject>).files);

  return {
    id,
    name,
    createdAt,
    updatedAt,
    activeArtifactId,
    artifacts,
    ...(files.length > 0 ? { files } : {}),
  };
};

export const getActiveClassDiagramArtifact = (project: DiagramProject): ClassDiagramArtifact => {
  const activeArtifact = project.artifacts.find(
    (artifact): artifact is ClassDiagramArtifact =>
      artifact.id === project.activeArtifactId && artifact.type === 'class-diagram',
  );

  if (activeArtifact !== undefined) {
    return activeArtifact;
  }

  const firstClassDiagram = project.artifacts.find(
    (artifact): artifact is ClassDiagramArtifact => artifact.type === 'class-diagram',
  );

  if (firstClassDiagram !== undefined) {
    return firstClassDiagram;
  }

  return normalizeClassDiagramArtifact(undefined, {
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
};

export const isClassModelArtifact = (artifact: DesignArtifact): artifact is ClassModelArtifact =>
  artifact.type === 'class-diagram' || artifact.type === 'class-sequence-diagram';

export const getActiveArtifact = (project: DiagramProject): DesignArtifact => {
  const activeArtifact = project.artifacts.find((artifact) => artifact.id === project.activeArtifactId);

  return activeArtifact ?? project.artifacts[0];
};
