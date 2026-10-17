import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import guide from '../../docs/artifact-json-guide.md?raw';
import { normalizeDiagramProject, normalizeUseCaseFlowContent } from './diagramNormalization';
import type { ClassDiagramArtifact, ClassSequenceDiagramArtifact, SequenceDiagramArtifact, SequenceTimelineItem, UseCaseFlowArtifact, UseCaseModelArtifact } from '../types/diagram';
import { extractImportableArtifacts, serializeArtifact } from './artifactFile';
import { extractImportableProjects } from './projectImport';
import { getSequenceFlowOptions } from './sequenceMessageEditing';
import { createEmptySequenceDiagramContent } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import { buildProjectSymbolIndex } from './projectSymbolIndex';
import { reviewUseCaseFlow } from './useCaseFlowReview';

const guideExamples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
const example = guideExamples.find((candidate) => candidate.type === 'class-diagram');
const project = normalizeDiagramProject(demo as unknown as Parameters<typeof normalizeDiagramProject>[0]);

describe('artifact JSON files', () => {
  it('documents one complete example for every supported artifact type', () => {
    expect(guideExamples.map((candidate) => candidate.type)).toEqual([
      'class-diagram', 'use-case-model', 'use-case-flow', 'sequence-diagram', 'class-sequence-diagram',
    ]);
  });

  it.each(guideExamples.map((candidate) => [candidate.type, candidate] as const))('imports and round trips the documented %s example', (_, candidate) => {
    const imported = extractImportableArtifacts(candidate);
    expect(imported).toHaveLength(1);
    expect(imported![0].id).toBe(candidate.id);
    expect(imported![0].type).toBe(candidate.type);
    expect(extractImportableArtifacts(JSON.parse(serializeArtifact(imported![0])))).toEqual(imported);
    if (imported![0].type === 'sequence-diagram') expect(imported![0].content.problems).toEqual([]);
  });

  it('keeps the documented use cases inside the boundary and actors outside it', () => {
    const model = extractImportableArtifacts(guideExamples.find((candidate) => candidate.type === 'use-case-model'))![0] as UseCaseModelArtifact;
    const boundary = model.content.nodes.find((node) => node.data.kind === 'system-boundary')!;
    const right = boundary.position.x + Number(boundary.style!.width);
    const bottom = boundary.position.y + Number(boundary.style!.height);
    for (const node of model.content.nodes.filter((candidate) => candidate.data.kind !== 'system-boundary')) {
      if (node.data.kind === 'actor') {
        expect(node.position.x + 130).toBeLessThan(boundary.position.x);
      } else {
        expect(node.position.x).toBeGreaterThan(boundary.position.x + 60);
        expect(node.position.y).toBeGreaterThan(boundary.position.y + 60);
        expect(node.position.x + 226).toBeLessThan(right - 60);
        expect(node.position.y + 112).toBeLessThan(bottom - 60);
      }
    }
    const nodeIds = new Set(model.content.nodes.map((node) => node.id));
    for (const edge of model.content.edges) {
      expect(nodeIds.has(edge.source) && nodeIds.has(edge.target)).toBe(true);
      expect(edge.source).not.toBe(boundary.id);
      expect(edge.target).not.toBe(boundary.id);
    }
  });

  it('keeps an explicit "Sin referencia" through export and import, apart from a never-chosen flow', () => {
    const flowWith = (classDiagramArtifactId: string | null | undefined): UseCaseFlowArtifact => ({
      id: 'flow', type: 'use-case-flow', name: 'Flujo', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      content: { ...normalizeUseCaseFlowContent(undefined), classDiagramArtifactId },
    });
    const roundTrip = (artifact: UseCaseFlowArtifact): UseCaseFlowArtifact =>
      extractImportableArtifacts(JSON.parse(serializeArtifact(artifact)))![0] as UseCaseFlowArtifact;
    expect(JSON.parse(serializeArtifact(flowWith(null))).content.classDiagramArtifactId).toBeNull();
    expect(roundTrip(flowWith(null)).content.classDiagramArtifactId).toBeNull();
    expect(roundTrip(flowWith(undefined)).content.classDiagramArtifactId).toBeUndefined();
  });

  it('keeps a sequence "Sin vincular" through export and import, apart from a never-chosen one', () => {
    const sequenceWith = (classDiagramArtifactId: string | null | undefined): SequenceDiagramArtifact => ({
      id: 'seq', type: 'sequence-diagram', name: 'Secuencia', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      content: { ...createEmptySequenceDiagramContent(), classDiagramArtifactId },
    });
    const roundTrip = (artifact: SequenceDiagramArtifact): SequenceDiagramArtifact =>
      extractImportableArtifacts(JSON.parse(serializeArtifact(artifact)))![0] as SequenceDiagramArtifact;
    expect(JSON.parse(serializeArtifact(sequenceWith(null))).content.classDiagramArtifactId).toBeNull();
    expect(roundTrip(sequenceWith(null)).content.classDiagramArtifactId).toBeNull();
    expect(roundTrip(sequenceWith(undefined)).content.classDiagramArtifactId).toBeUndefined();
    expect(roundTrip(sequenceWith('model')).content.classDiagramArtifactId).toBe('model');
  });

  it('assembles the documented linked project without broken classifier, method or flow references', () => {
    const artifacts = guideExamples.flatMap((candidate) => extractImportableArtifacts(candidate)!);
    const model = artifacts.find((artifact) => artifact.type === 'class-diagram') as ClassDiagramArtifact;
    const classSequence = artifacts.find((artifact) => artifact.type === 'class-sequence-diagram') as ClassSequenceDiagramArtifact;
    const flow = artifacts.find((artifact) => artifact.type === 'use-case-flow') as UseCaseFlowArtifact;
    const sequence = artifacts.find((artifact) => artifact.type === 'sequence-diagram') as SequenceDiagramArtifact;
    classSequence.content = { ...structuredClone(model.content), version: 1, sourceClassDiagramArtifactId: model.id, linkedSequenceDiagramIds: [sequence.id] };
    flow.content.classDiagramArtifactId = model.id;
    sequence.content.classDiagramArtifactId = classSequence.id;
    sequence.content.flowArtifactId = flow.id;
    const nodeByName = new Map(model.content.nodes.map((node) => [node.data.name, node]));
    sequence.content.participants.forEach((participant) => {
      participant.classifierNodeId = nodeByName.get(participant.classifierName)?.id;
    });
    const participantById = new Map(sequence.content.participants.map((participant) => [participant.id, participant]));
    const flowReferences: Record<string, string> = {
      'msg-crear-pedido': 'paso-1', 'msg-construir-pedido': 'paso-2', 'msg-confirmar': 'paso-4', 'msg-cancelar': 'ca1-paso-3',
    };
    const linkItems = (items: SequenceTimelineItem[]): void => items.forEach((item) => {
      if (item.kind === 'fragment') { item.operands.forEach((operand) => linkItems(operand.items)); return; }
      const receiver = participantById.get(item.targetId)!;
      item.operationMethodId = nodeByName.get(receiver.classifierName)?.data.methods.find((method) => method.name === item.name)?.id;
      item.flowReference = flowReferences[item.id] ?? '';
    });
    linkItems(sequence.content.items);
    const linkedProject = normalizeDiagramProject({ id: 'proyecto-pedidos', name: 'Pedidos', activeArtifactId: model.id, artifacts });
    expect(extractImportableProjects(linkedProject)).toHaveLength(1);
    expect(normalizeDiagramProject(JSON.parse(JSON.stringify(linkedProject)))).toEqual(linkedProject);
    expect(sequence.content.problems).toEqual([]);
    expect(reviewUseCaseFlow(flow.content, buildProjectSymbolIndex(model)).filter((issue) => issue.kind === 'error')).toEqual([]);
    const validFlowReferences = new Set(getSequenceFlowOptions([flow], flow.id).map((option) => option.value));
    const validateItems = (items: SequenceTimelineItem[]): void => items.forEach((item) => {
      if (item.kind === 'fragment') { item.operands.forEach((operand) => validateItems(operand.items)); return; }
      if (item.flowReference) expect(validFlowReferences.has(item.flowReference)).toBe(true);
      if (item.operationMethodId) {
        const receiver = participantById.get(item.targetId)!;
        expect(nodeByName.get(receiver.classifierName)?.data.methods.find((method) => method.id === item.operationMethodId)?.name).toBe(item.name);
      }
    });
    validateItems(sequence.content.items);
    const layout = buildSequenceLayout(sequence.content);
    expect(layout.messageLayouts.size).toBe(7);
    expect(layout.fragmentLayouts.size).toBe(1);
    expect(layout.noteLayouts.size).toBe(1);
    const ordered = sequence.content.participants.map((participant) => layout.participantLayouts.get(participant.id)!);
    ordered.slice(1).forEach((participant, index) => {
      expect(participant.x - participant.headerWidth / 2 - (ordered[index].x + ordered[index].headerWidth / 2)).toBeGreaterThanOrEqual(100);
    });
  });

  it('imports the complete example distributed to users without losing classes, relations, positions or navigability', () => {
    const [artifact] = extractImportableArtifacts(example)!;
    expect(artifact.type).toBe('class-diagram');
    if (artifact.type !== 'class-diagram') throw new Error('Expected class diagram');
    expect(artifact.content.nodes).toHaveLength(8);
    expect(artifact.content.edges).toHaveLength(7);
    artifact.content.nodes.forEach((node, index) => {
      expect(node.position).toEqual(example.content.nodes[index].position);
      expect(node.data.attributes).toEqual(example.content.nodes[index].data.attributes);
      expect(node.data.methods).toEqual(example.content.nodes[index].data.methods);
    });
    expect(artifact.content.edges.find((edge) => edge.id === 'rel-cliente-pedido')?.data?.navigability).toBe('source-to-target');
    expect(artifact.content.edges.find((edge) => edge.id === 'rel-pedido-linea')?.data?.diamondEnd).toBe('source');
  });

  it('lays out the guide example as the guide teaches: measured sizes, corridors, straight neighbours', () => {
    type Member = { name: string; type?: string; parameters?: string; returnType?: string };
    const rectangles = example.content.nodes.map((node: typeof example.content.nodes[number]) => {
      const data = node.data;
      const lines = [
        data.name,
        ...data.attributes.map((attribute: Member) => `${attribute.name}: ${attribute.type}`),
        ...data.methods.map((method: Member) => `${method.name}(${method.parameters}): ${method.returnType}`),
      ];
      const longest = Math.max(...lines.map((line: string) => line.length));
      const attributes = Math.max(1, data.attributes.length);
      const height = data.methods.length === 0 ? 56 + 21 * attributes : 71 + 21 * (attributes + data.methods.length);
      return { id: node.id, ...node.position, width: Math.max(220, 65 + 6 * longest), height };
    });
    rectangles.forEach((a: { x: number; y: number; width: number; height: number }, index: number) => {
      rectangles.slice(index + 1).forEach((b: typeof a) => {
        expect(a.x + a.width + 160 <= b.x || b.x + b.width + 160 <= a.x || a.y + a.height + 110 <= b.y || b.y + b.height + 110 <= a.y).toBe(true);
      });
    });
    const byId = new Map(rectangles.map((rectangle: { id: string }) => [rectangle.id, rectangle]));
    const usedPorts = new Set<string>();
    for (const edge of example.content.edges) {
      const source = byId.get(edge.source) as typeof rectangles[number];
      const target = byId.get(edge.target) as typeof rectangles[number];
      if (edge.data.sourceSide === 'automatic') {
        expect(edge.data.lineStyle).toBe('orthogonal');
        continue;
      }
      expect(edge.data.lineStyle).toBe('straight');
      for (const port of [`${edge.source}:${edge.sourceHandle}`, `${edge.target}:${edge.targetHandle}`]) {
        expect(usedPorts.has(port)).toBe(false);
        usedPorts.add(port);
      }
      const horizontal = edge.data.sourceSide === 'left' || edge.data.sourceSide === 'right';
      if (horizontal) expect(Math.abs(source.y + source.height / 2 - (target.y + target.height / 2))).toBeLessThanOrEqual(1);
      else expect(Math.abs(source.x + source.width / 2 - (target.x + target.width / 2))).toBeLessThanOrEqual(1);
    }
  });

  it.each(project.artifacts.map((artifact) => [artifact.type, artifact] as const))('round trips an exported %s artifact', (_, artifact) => {
    const parsed = JSON.parse(serializeArtifact(artifact));
    expect(extractImportableArtifacts(parsed)).toEqual([artifact]);
    expect(extractImportableProjects(parsed)).toBeNull();
  });

  it('offers every artifact in an exported project for selection', () => {
    expect(extractImportableArtifacts(project)).toEqual(project.artifacts);
  });

  it.each([null, [], 'text', {}, { ...example, type: 'unknown' }, { ...example, content: {} }, { ...example, name: ' ' }])('rejects unsupported or incomplete envelopes: %j', (value) => {
    expect(extractImportableArtifacts(value)).toBeNull();
  });

  it('rejects duplicate class IDs or missing edge endpoints instead of silently dropping content', () => {
    const duplicate = structuredClone(example);
    duplicate.content.nodes[1].id = duplicate.content.nodes[0].id;
    expect(extractImportableArtifacts(duplicate)).toBeNull();
    const dangling = structuredClone(example);
    dangling.content.edges[0].target = 'missing';
    expect(extractImportableArtifacts(dangling)).toBeNull();
  });

  it('rejects nonnumeric positions and malformed member arrays', () => {
    const position = structuredClone(example);
    position.content.nodes[0].position.x = '100';
    expect(extractImportableArtifacts(position)).toBeNull();
    const members = structuredClone(example);
    members.content.nodes[0].data.methods = [null];
    expect(extractImportableArtifacts(members)).toBeNull();
  });

  it('rejects padded IDs whose normalization would break their references', () => {
    const padded = structuredClone(example);
    padded.content.nodes[0].id = ' clase-entidad ';
    padded.content.edges[0].target = ' clase-entidad ';
    expect(extractImportableArtifacts(padded)).toBeNull();
  });

  it('rejects a malformed project without presenting a partial import as complete', () => {
    expect(extractImportableArtifacts({ artifacts: [example, { name: 'Broken', type: 'class-diagram', content: {} }] })).toBeNull();
  });
});
