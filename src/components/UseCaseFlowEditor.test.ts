import { describe, expect, it } from 'vitest';
import type { UseCaseFlowContent } from '../types/diagram';
import {
  computeFlowNumbering,
  createEmptyUseCaseFlowContent,
  createFlowActionNode,
  createFlowMainStep,
} from '../utils/useCaseFlowModel';

describe('use case flow v2 numbering', () => {
  it('numbers alternating actor and system turns sequentially', () => {
    const content: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { id: 's1' }),
        createFlowMainStep('system', 'Solicitar datos', { id: 's2' }),
        createFlowMainStep('actor', 'Ingresar datos', { id: 's3' }),
        createFlowMainStep('system', 'Verificar datos', { id: 's4' }),
      ],
    };

    const numbering = computeFlowNumbering(content);
    expect(numbering.stepNumberById.get('s1')).toBe('1');
    expect(numbering.stepNumberById.get('s2')).toBe('2');
    expect(numbering.stepNumberById.get('s3')).toBe('3');
    expect(numbering.stepNumberById.get('s4')).toBe('4');
  });

  it('numbers nested sub-steps under their parent main step', () => {
    const content: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { id: 's1' }),
        createFlowMainStep('system', 'Verificar existencia', {
          id: 's2',
          children: [
            createFlowActionNode('controlar-consistencia', 'Controlar consistencia', { id: 's2-1' }),
            createFlowActionNode('buscar', 'Buscar instancia de Caso:', { id: 's2-2' }),
          ],
        }),
      ],
    };

    const numbering = computeFlowNumbering(content);
    expect(numbering.stepNumberById.get('s2')).toBe('2');
    expect(numbering.stepNumberById.get('s2-1')).toBe('2.1');
    expect(numbering.stepNumberById.get('s2-2')).toBe('2.2');
  });

  it('starts an unreferenced alternative flow at 1 unless overridden', () => {
    const content: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [createFlowMainStep('actor', 'Iniciar CU', { id: 'b1' })],
      alternativeFlows: [
        {
          id: 'alt-1',
          number: 1,
          title: 'Caso especial',
          steps: [createFlowMainStep('system', 'Informar error', { id: 'a1' })],
        },
        {
          id: 'alt-2',
          number: 2,
          title: 'Con inicio manual',
          firstStepNumberOverride: 9,
          steps: [createFlowMainStep('system', 'Informar error', { id: 'a2' })],
        },
      ],
    };

    const numbering = computeFlowNumbering(content);
    expect(numbering.stepNumberById.get('a1')).toBe('1');
    expect(numbering.stepNumberById.get('a2')).toBe('9');
  });
});
