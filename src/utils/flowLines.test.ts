import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import v1Demo from './__fixtures__/demo-v1-flow.json';
import type { FlowMainStep, UseCaseFlowContent } from '../types/diagram';
import { normalizeUseCaseFlowContent } from './diagramNormalization';
import { computeFlowNumbering } from './useCaseFlowModel';
import { linesToTree, newLine, treeToLines, type FlowEditLine, type FlowLineContext } from './flowLines';

const findFlows = (value: unknown): UseCaseFlowContent[] => {
  if (Array.isArray(value)) return value.flatMap(findFlows);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if ('basicFlow' in record && 'description' in record) {
    return [normalizeUseCaseFlowContent(record as Partial<UseCaseFlowContent>)];
  }
  return Object.values(record).flatMap(findFlows);
};

const contextFor = (content: UseCaseFlowContent, flowId: 'basic' | string): FlowLineContext => ({
  content,
  flowId,
  numbering: computeFlowNumbering(content),
});

const paths = (content: UseCaseFlowContent): Array<{ flowId: string; steps: FlowMainStep[] }> => [
  { flowId: 'basic', steps: content.basicFlow },
  ...content.alternativeFlows.map((flow) => ({ flowId: flow.id, steps: flow.steps })),
];

// Older data spells a plain main step as `primitive: 'custom'`, newer data leaves it out.
const withoutCustomPrimitive = (steps: FlowMainStep[]): FlowMainStep[] =>
  steps.map(({ primitive, ...step }) => (primitive === undefined || primitive === 'custom' ? step : { ...step, primitive }));

const flows = [...findFlows(demo), ...findFlows(v1Demo)];

describe('flow lines', () => {
  it('has flows to check', () => {
    expect(flows.length).toBeGreaterThan(1);
  });

  it.each(flows.map((content, index) => [index, content] as const))('round-trips flow %i without changing the tree', (_index, content) => {
    for (const { flowId, steps } of paths(content)) {
      const ctx = contextFor(content, flowId);
      const back = linesToTree(treeToLines(steps, ctx), ctx);
      const normalized = withoutCustomPrimitive(normalizeUseCaseFlowContent({ ...content, basicFlow: back, alternativeFlows: [] }).basicFlow);
      const expected = withoutCustomPrimitive(normalizeUseCaseFlowContent({ ...content, basicFlow: steps, alternativeFlows: [] }).basicFlow);
      expect(normalized).toEqual(expected);
    }
  });

  it.each(flows.map((content, index) => [index, content] as const))('gives the same lines back for flow %i', (_index, content) => {
    for (const { flowId, steps } of paths(content)) {
      const ctx = contextFor(content, flowId);
      const lines = treeToLines(steps, ctx);
      expect(treeToLines(linesToTree(lines, ctx), ctx)).toEqual(lines);
    }
  });

  it('keeps typed text intact while a block keyword is half written', () => {
    const content = normalizeUseCaseFlowContent({});
    const ctx = contextFor(content, 'basic');
    const typed = ['S', 'Si', 'Sin', 'Simular', 'SI', 'SI ', 'SI x', 'SIN', 'SINO', 'Po', 'Por cada', 'Por cada instancia de ', 'SINO', 'Ir a paso 1 de camino principal'];
    for (const text of typed) {
      const lines: FlowEditLine[] = [
        newLine({ side: 'system', depth: 0, text: 'Verificar' }),
        newLine({ side: 'system', depth: 1, text }),
      ];
      expect(treeToLines(linesToTree(lines, ctx), ctx).map((line) => line.text)).toContain(text);
    }
  });

  it('shows an SI written without a leading space and stores it the same way', () => {
    const content = normalizeUseCaseFlowContent({});
    const ctx = contextFor(content, 'basic');
    const steps: FlowMainStep[] = [{
      id: 'm', speaker: 'system', title: 'Verificar', refs: [],
      children: [{
        id: 'c', kind: 'conditional', condition: 'estado igual a activo', refs: [],
        thenChildren: [{ id: 'a', kind: 'action', primitive: 'custom', text: 'Seguir', details: [], refs: [] }],
        elseChildren: [{ id: 'b', kind: 'action', primitive: 'fin-cu', text: 'Fin CU', details: [], refs: [] }],
      }],
    }];
    const lines = treeToLines(steps, ctx);
    expect(lines.map((line) => line.text)).toEqual(['Verificar', 'SI estado igual a activo', 'Seguir', 'SINO', 'Fin CU', 'FINSI']);
    expect(linesToTree(lines, ctx)).toEqual(steps);
  });

  it('writes out a jump whose stored text went stale, and keeps the link', () => {
    const content = normalizeUseCaseFlowContent({});
    const basic: FlowMainStep[] = [{ id: 'm1', speaker: 'actor', title: 'Iniciar CU', refs: [], children: [] }, { id: 'm2', speaker: 'system', title: 'Pedir datos', refs: [], children: [] }];
    const withBasic = { ...content, basicFlow: basic };
    const ctx = contextFor(withBasic, 'alt');
    const steps: FlowMainStep[] = [{ id: 'j', speaker: 'system', primitive: 'ir-a-paso', title: 'Ir a paso ', jumpTarget: { flowId: 'basic', stepId: 'm2' }, refs: [], children: [] }];
    const lines = treeToLines(steps, ctx);
    expect(lines[0].text).toBe('Ir a paso 2 de camino principal');
    expect(linesToTree(lines, ctx)[0].jumpTarget).toEqual({ flowId: 'basic', stepId: 'm2' });
  });

  it('turns (paso N) into a link that follows renumbering', () => {
    const content = normalizeUseCaseFlowContent({});
    const lines: FlowEditLine[] = [
      newLine({ side: 'actor', depth: 0, text: 'Iniciar CU' }),
      newLine({ side: 'system', depth: 0, text: 'Buscar' }),
      newLine({ side: 'system', depth: 1, text: 'Crear instancia de Socio' }),
      newLine({ side: 'system', depth: 2, kind: 'bullet', text: 'Relacionada a instancia de Estado (paso 2.1)' }),
    ];
    const draft = { ...content, basicFlow: linesToTree(lines, contextFor(content, 'basic')) };
    const first = { ...content, basicFlow: linesToTree(lines, contextFor(draft, 'basic')) };
    const step = first.basicFlow[1].children[0];
    expect(step.kind === 'action' && step.details[0].stepRef?.stepId).toBe(lines[2].id);

    const shifted = { ...first, basicFlow: [first.basicFlow[0], { ...first.basicFlow[0], id: 'extra' }, first.basicFlow[1]] };
    const shiftedLines = treeToLines(shifted.basicFlow, contextFor(shifted, 'basic'));
    expect(shiftedLines.at(-1)?.text).toBe('Relacionada a instancia de Estado (paso 3.1)');
  });

  it('never puts an actor line and a system line in the same tree node', () => {
    const content = normalizeUseCaseFlowContent({});
    const ctx = contextFor(content, 'basic');
    const lines: FlowEditLine[] = [
      newLine({ side: 'actor', depth: 0, text: 'Iniciar CU' }),
      newLine({ side: 'system', depth: 0, text: 'Mostrar' }),
    ];
    const tree = linesToTree(lines, ctx);
    expect(tree.map((step) => step.speaker)).toEqual(['actor', 'system']);
  });
});
