import { describe, expect, it } from 'vitest';
import type { ProjectSymbolIndex } from './projectSymbolIndex';
import { buildFlowLineSuggestions } from './useCaseFlowCompletion';
import { createEmptyUseCaseFlowContent, createFlowMainStep, parseInputParametersText } from './useCaseFlowModel';

const symbols: ProjectSymbolIndex = {
  classes: [
    {
      name: 'Pedido',
      attributes: [{ name: 'estado', type: 'String' }],
      methods: [],
      parametricValues: ['Pendiente', 'Entregado'],
      relatedClasses: ['LineaPedido'],
      relations: [
        {
          edgeId: 'e1',
          targetClass: 'LineaPedido',
          relationType: 'composition',
          navigable: true,
          isReverseOnly: false,
          isUnspecifiedNavigability: false,
          targetMultiplicity: '1..*',
          targetRole: '',
          relationName: '',
        },
      ],
    },
    {
      name: 'LineaPedido',
      attributes: [{ name: 'cantidad', type: 'int' }],
      methods: [],
      parametricValues: [],
      relatedClasses: ['Pedido'],
      relations: [
        {
          edgeId: 'e1',
          targetClass: 'Pedido',
          relationType: 'composition',
          navigable: false,
          isReverseOnly: true,
          isUnspecifiedNavigability: false,
          targetMultiplicity: '1',
          targetRole: '',
          relationName: '',
        },
      ],
    },
  ],
};

const baseContent = {
  ...createEmptyUseCaseFlowContent(),
  description: {
    ...createEmptyUseCaseFlowContent().description,
    inputParameters: parseInputParametersText('pNumeroPedido, respuesta (Sí - No)'),
  },
  basicFlow: [createFlowMainStep('actor', 'Iniciar CU', { id: 's1', primitive: 'iniciar-cu' })],
};

describe('flow v2 line completion', () => {
  it('opens slash command menu with official System primitives', () => {
    const suggestions = buildFlowLineSuggestions('system', '/por', 4, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
    });
    expect(suggestions.map((s) => s.id)).toContain('slash-sys:loop-por-cada');
  });

  it('completes Actor primitives and input parameters inside parentheses', () => {
    const actorSugs = buildFlowLineSuggestions('actor', 'Sele', 4, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
    });
    expect(actorSugs.map((s) => s.label)).toEqual(['Seleccionar']);

    const paramSugs = buildFlowLineSuggestions('actor', 'Ingresar número (pNum', 21, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
    });
    expect(paramSugs[0]?.label).toBe('pNumeroPedido');
  });

  it('suggests DC classes after Buscar and parametric values after igual a', () => {
    const clsSugs = buildFlowLineSuggestions('system', 'Buscar instancia de Pe', 22, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
    });
    expect(clsSugs[0]?.label).toBe('Pedido');

    const valSugs = buildFlowLineSuggestions('system', 'Con estado igual a Pe', 21, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
      ownerClassName: 'Pedido',
    });
    expect(valSugs[0]?.label).toBe("'Pendiente'");
  });

  it('prioritizes navigable source classes in Leer', () => {
    const leerSugs = buildFlowLineSuggestions('system', 'Leer instancia de LineaPedido relacionada a ', 44, {
      content: baseContent,
      flowId: 'basic',
      symbolIndex: symbols,
    });
    expect(leerSugs[0]?.label).toBe('Pedido');
    expect(leerSugs[0]?.badge).toBe('✓ Leer');
  });
});
