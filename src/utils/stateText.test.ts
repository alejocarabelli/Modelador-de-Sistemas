import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import v1Demo from './__fixtures__/demo-v1-flow.json';
import type { StateBlock, UseCaseFlowContent } from '../types/diagram';
import { normalizeUseCaseFlowContent } from './diagramNormalization';
import { parseStateTextToBlocks } from './useCaseFlowModel';
import { stateBlocksToEditorText } from './stateText';

const findFlows = (value: unknown): UseCaseFlowContent[] => {
  if (Array.isArray(value)) return value.flatMap(findFlows);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if ('basicFlow' in record && 'description' in record) return [normalizeUseCaseFlowContent(record as Partial<UseCaseFlowContent>)];
  return Object.values(record).flatMap(findFlows);
};

const withoutIds = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, child]) => [key, withoutIds(child)]));
};

const states = findFlows([demo, v1Demo]).flatMap((content) => [
  ['initial', content.description.initialState],
  ['final', content.description.finalState],
] as Array<['initial' | 'final', StateBlock[]]>).filter(([, blocks]) => blocks.length > 0);

const catedra = `Instancias principales

Instancia de Especialista existente:
• Con fechaHoraBaja igual a vacío
• Relacionada a instancia de Caso:
    ◦ Con numeroCaso igual a pnumeroCaso
    ◦ Relacionada a instancia de EstadoCaso:
        ▪ Con fechaHoraFin distinto de vacío

Instancias secundarias

Instancia/s de TipoCaso existente/s:
• Con fechaInicio <= fecha_actual()

Si se resuelve el Caso:
Instancia de EstadoCaso existente:
• Con nombre igual a Resuelto

Instancia de Caso existente:
• Con prioridad mayor o igual a 2`;

describe('Estado as text', () => {
  it('has states to check', () => {
    expect(states.length).toBeGreaterThan(1);
  });

  it.each(states.map(([mode, blocks], index) => [index, mode, blocks] as const))('keeps state %i (%s) when written and read back', (_index, mode, blocks) => {
    expect(withoutIds(parseStateTextToBlocks(stateBlocksToEditorText(blocks), mode))).toEqual(withoutIds(blocks));
  });

  it('writes back the cátedra layout exactly', () => {
    expect(stateBlocksToEditorText(parseStateTextToBlocks(catedra, 'initial'))).toBe(catedra);
  });

  it('ends a «Si …:» block at the blank line', () => {
    const blocks = parseStateTextToBlocks(catedra, 'initial');
    const condition = blocks.find((block) => block.kind === 'condition');
    expect(condition?.kind === 'condition' && condition.blocks.map((block) => block.className)).toEqual(['EstadoCaso']);
    expect(blocks.at(-1)).toMatchObject({ kind: 'instance', className: 'Caso' });
  });
});
