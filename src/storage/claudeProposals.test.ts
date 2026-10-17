import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import type { DiagramProject } from '../types/diagram';
import { normalizeDiagramProject } from '../utils/diagramNormalization';
import { isInvalidProposal, parseClaudeProposal, resolveProposalTarget, type ClaudeProposal } from './claudeProposals';
// La extensión de Claude Desktop escribe las propuestas: la app tiene que aceptar exactamente eso.
// @ts-expect-error módulo JavaScript sin tipos, fuera de src/
import { armarPropuesta } from '../../claude-mcp/server/propuestas.js';

const project = normalizeDiagramProject(demo as unknown as DiagramProject);
const flow = project.artifacts.find((artifact) => artifact.type === 'use-case-flow')!;

const writeWithExtension = (proposal: Record<string, unknown>): { file: string; text: string } => {
  const { nombre, texto } = armarPropuesta(proposal) as { nombre: string; texto: string };
  return { file: nombre, text: texto };
};

describe('Claude proposals', () => {
  it('accepts a proposal written by the extension and normalizes its content', () => {
    const content = { ...flow.content, alternativeFlows: [] };
    const { file, text } = writeWithExtension({
      projectId: project.id, artifactId: flow.id, type: flow.type, name: flow.name,
      basedOnUpdatedAt: flow.updatedAt, description: 'Sin alternativas.', content,
    });
    const proposal = parseClaudeProposal(file, text);
    expect(isInvalidProposal(proposal)).toBe(false);
    const valid = proposal as ClaudeProposal;
    expect(valid.artifactId).toBe(flow.id);
    expect(valid.description).toBe('Sin alternativas.');
    expect(valid.artifact.type).toBe('use-case-flow');
    expect((valid.artifact.content as typeof flow.content).alternativeFlows).toEqual([]);

    const target = resolveProposalTarget(proposal, [project]);
    expect(target).toMatchObject({ kind: 'replace', changedSinceRead: false });
    const edited = { ...project, artifacts: project.artifacts.map((a) => (a.id === flow.id ? { ...a, updatedAt: '2030-01-01T00:00:00.000Z' } : a)) };
    expect(resolveProposalTarget(proposal, [edited])).toMatchObject({ kind: 'replace', changedSinceRead: true });
  });

  it('places a new artifact in its project', () => {
    const { file, text } = writeWithExtension({
      projectId: project.id, artifactId: null, type: 'use-case-model', name: 'Casos de uso v2',
      basedOnUpdatedAt: null, description: 'Uno nuevo.', content: { nodes: [], edges: [] },
    });
    expect(resolveProposalTarget(parseClaudeProposal(file, text), [project])).toMatchObject({ kind: 'new' });
  });

  it('turns anything unusable into an explained, discardable proposal', () => {
    const base = { format: 'modelador-propuesta', version: 1, projectId: project.id, artifactId: flow.id, type: flow.type, name: flow.name, content: flow.content };
    expect(parseClaudeProposal('a.json', '{')).toEqual({ file: 'a.json', error: 'El archivo no es un JSON válido.' });
    expect(parseClaudeProposal('a.json', JSON.stringify({ ...base, format: 'otro' }))).toMatchObject({ error: /no es una propuesta/ });
    expect(parseClaudeProposal('a.json', JSON.stringify({ ...base, content: { basicFlow: 'x' } }))).toMatchObject({ error: /no tiene la forma/ });
    const valid = parseClaudeProposal('a.json', JSON.stringify(base));
    expect(resolveProposalTarget(valid, [])).toEqual({ kind: 'invalid', error: 'El proyecto de esta propuesta ya no existe.' });
    const withoutFlow = { ...project, artifacts: project.artifacts.filter((a) => a.id !== flow.id) };
    expect(resolveProposalTarget(valid, [withoutFlow])).toMatchObject({ kind: 'invalid', error: /artefacto .* ya no existe/ });
    const wrongType = parseClaudeProposal('a.json', JSON.stringify({ ...base, type: 'use-case-model', content: { nodes: [], edges: [] } }));
    expect(resolveProposalTarget(wrongType, [project])).toMatchObject({ kind: 'invalid', error: /otro tipo/ });
  });
});
