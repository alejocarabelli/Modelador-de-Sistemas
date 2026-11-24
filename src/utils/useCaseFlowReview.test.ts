import { describe, expect, it } from 'vitest';
import type { ClassDiagramArtifact, ClassDiagramNode, UseCaseFlowContent } from '../types/diagram';
import { buildProjectSymbolIndex, checkClassNavigability } from './projectSymbolIndex';
import {
  createAlternativeFlow,
  createEmptyUseCaseFlowContent,
  createFlowActionNode,
  createFlowDetailItem,
  createFlowLoopNode,
  createFlowMainStep,
} from './useCaseFlowModel';
import { reviewUseCaseFlow } from './useCaseFlowReview';

const makeNode = (id: string, name: string, attrs: string[] = []): ClassDiagramNode => ({
  id,
  type: 'classNode',
  position: { x: 0, y: 0 },
  data: {
    name,
    attributes: attrs.map((a, i) => ({ id: `${id}-a${i}`, name: a, type: 'String' })),
    methods: [],
  },
});

const makeDiagram = (): ClassDiagramArtifact => ({
  id: 'dc',
  type: 'class-diagram',
  name: 'Dominio',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  content: {
    nodes: [
      makeNode('persona', 'Persona', ['nombre']),
      makeNode('socio', 'Socio', ['numeroSocio']),
      makeNode('socioEstado', 'SocioEstado', ['fechaFinalSocioEstado']),
      makeNode('estadoSocio', 'EstadoSocio', ['nombreEstadoSocio']),
      makeNode('cuota', 'Cuota', ['monto']),
    ],
    edges: [
      { id: 'g1', source: 'socio', target: 'persona', type: 'association', data: { relationType: 'generalization', name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceRole: '', targetRole: '', navigability: 'none' } },
      { id: 'e1', source: 'socio', target: 'socioEstado', type: 'association', data: { relationType: 'association', name: '', sourceMultiplicity: '1', targetMultiplicity: '1..*', sourceRole: '', targetRole: '', navigability: 'source-to-target' } },
      { id: 'e2', source: 'socioEstado', target: 'estadoSocio', type: 'association', data: { relationType: 'association', name: '', sourceMultiplicity: '*', targetMultiplicity: '1', sourceRole: '', targetRole: '', navigability: 'source-to-target' } },
      { id: 'e3', source: 'socio', target: 'cuota', type: 'association', data: { relationType: 'association', name: '', sourceMultiplicity: '1', targetMultiplicity: '*', sourceRole: '', targetRole: '', navigability: 'none' } },
    ],
  },
});

describe('projectSymbolIndex navigability & inheritance', () => {
  it('computes directed navigability and inherits superclass attributes', () => {
    const idx = buildProjectSymbolIndex(makeDiagram());
    const socio = idx.classes.find((c) => c.name === 'Socio');
    expect(socio?.attributes.map((a) => a.name)).toEqual(['numeroSocio', 'nombre']);

    expect(checkClassNavigability(idx, 'Socio', 'SocioEstado')).toBe('navigable');
    expect(checkClassNavigability(idx, 'SocioEstado', 'Socio')).toBe('reverse-only');
    expect(checkClassNavigability(idx, 'Socio', 'Cuota')).toBe('unspecified');
    expect(checkClassNavigability(idx, 'Socio', 'EstadoSocio')).toBe('no-relation');
  });

  it('does not loop on an inheritance cycle', () => {
    const diagram: ClassDiagramArtifact = {
      id: 'd',
      type: 'class-diagram',
      name: 'Ciclo',
      createdAt: 'now',
      updatedAt: 'now',
      content: {
        nodes: [makeNode('a', 'A'), makeNode('b', 'B')],
        edges: [
          { id: 'g1', source: 'a', target: 'b', type: 'association', data: { relationType: 'generalization', name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceRole: '', targetRole: '', navigability: 'none' } },
          { id: 'g2', source: 'b', target: 'a', type: 'association', data: { relationType: 'generalization', name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceRole: '', targetRole: '', navigability: 'none' } },
        ],
      },
    };
    expect(buildProjectSymbolIndex(diagram).classes).toHaveLength(2);
  });
});

describe('reviewUseCaseFlow (reglas de cátedra UTN FRM)', () => {
  const symbols = buildProjectSymbolIndex(makeDiagram());

  it('flags Leer without navigability (reverse, unspecified, or no relation)', () => {
    const flow: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { primitive: 'iniciar-cu' }),
        createFlowMainStep('system', 'Verificar', {
          children: [
            createFlowActionNode('leer', 'Leer instancia de Socio relacionada a SocioEstado', { id: 'rev' }),
            createFlowActionNode('leer', 'Leer instancias de Cuota relacionadas a Socio', { id: 'unspec' }),
            createFlowActionNode('leer', 'Leer instancia de EstadoSocio relacionada a Socio', { id: 'norel' }),
          ],
        }),
        createFlowMainStep('system', 'Fin CU', { primitive: 'fin-cu' }),
      ],
    };

    const issues = reviewUseCaseFlow(flow, symbols);
    expect(issues.find((i) => i.id === 'nav-reverse:rev')?.kind).toBe('error');
    expect(issues.find((i) => i.id === 'nav-none:unspec')?.kind).toBe('review');
    expect(issues.find((i) => i.id === 'nav-missing:norel')?.kind).toBe('error');
  });

  it('requires Guardar Cambios for Crear/Modificar on DC entities but NOT on pseudoentities', () => {
    const withDomainCreate: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { primitive: 'iniciar-cu' }),
        createFlowMainStep('system', 'Crear estado', {
          children: [createFlowActionNode('crear', 'Crear instancia de SocioEstado:', { semantic: { targetClass: 'SocioEstado' } })],
        }),
        createFlowMainStep('system', 'Fin CU', { primitive: 'fin-cu' }),
      ],
    };
    expect(reviewUseCaseFlow(withDomainCreate, symbols).some((i) => i.id === 'missing-save:basic')).toBe(true);

    const withPseudoOnly: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { primitive: 'iniciar-cu' }),
        createFlowMainStep('system', 'Armar DTO', {
          children: [
            createFlowActionNode('definir-pseudoentidad', 'Definir pseudoentidad DTOResumen (nro, nombre)'),
            createFlowActionNode('crear', 'Crear instancia de DTOResumen:', {
              details: [createFlowDetailItem('Con nro igual a 1')],
            }),
          ],
        }),
        createFlowMainStep('system', 'Fin CU', { primitive: 'fin-cu' }),
      ],
    };
    const pseudoIssues = reviewUseCaseFlow(withPseudoOnly, symbols);
    expect(pseudoIssues.some((i) => i.id === 'missing-save:basic')).toBe(false);
    expect(pseudoIssues.some((i) => i.id === 'class:DTOResumen')).toBe(false);
  });

  it('checks missing/orphan CAs, CA endings, unknown classes/attributes, and ignores GUI-N refs', () => {
    const flow: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', {
          primitive: 'iniciar-cu',
          refs: [{ id: 'g1', kind: 'gui', label: 'GUI-1' }],
        }),
        createFlowMainStep('system', 'Buscar', {
          children: [
            createFlowActionNode('buscar', 'Buscar instancia de Socioo con:', {
              id: 'b1',
              refs: [{ id: 'm1', kind: 'ca-missing', code: 'CA 9' }],
            }),
            createFlowActionNode('buscar', 'Buscar instancia de Socio con:', {
              id: 'b2',
              details: [createFlowDetailItem('Con atributoInventado igual a 1')],
            }),
          ],
        }),
        createFlowMainStep('system', 'Fin CU', { primitive: 'fin-cu' }),
      ],
      alternativeFlows: [
        {
          ...createAlternativeFlow(1, ''),
          id: 'orphan-ca',
          steps: [createFlowMainStep('system', 'Mostrar mensaje sin cierre')],
        },
      ],
    };

    const issues = reviewUseCaseFlow(flow, symbols);
    const ids = issues.map((i) => i.id);
    expect(ids).toContain('ref-ca-missing:b1:m1');
    expect(ids).toContain('class:Socioo');
    expect(ids).toContain('orphan:orphan-ca');
    expect(ids).toContain('unnamed:orphan-ca');
    expect(ids).toContain('alt-end:orphan-ca');
    expect(issues.some((i) => i.message.includes('GUI-1'))).toBe(false);
    expect(issues.some((i) => i.message.includes('atributoInventado'))).toBe(true);
  });

  it('passes cleanly with zero issues for a well-formed UTN FRM flow', () => {
    const loop = createFlowLoopNode('por-cada', 'Por cada instancia de SocioEstado:');
    loop.targetClass = 'SocioEstado';
    loop.children = [];
    loop.details = [createFlowDetailItem('Leer fechaFinalSocioEstado')];

    const flow: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', {
          id: 's1',
          primitive: 'iniciar-cu',
          refs: [{ id: 'r-gui', kind: 'gui', label: 'GUI-1' }],
        }),
        createFlowMainStep('system', 'Solicitar socio', {
          id: 's2',
          children: [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “Ingrese número de socio”')],
        }),
        createFlowMainStep('actor', 'Ingresar número de socio (nsocio)', { id: 's3', primitive: 'ingresar' }),
        createFlowMainStep('system', 'Verificar socio', {
          id: 's4',
          children: [
            createFlowActionNode('controlar-consistencia', 'Controlar consistencia de datos ingresados', {
              refs: [{ id: 'rc1', kind: 'ca', flowId: 'ca1' }],
            }),
            createFlowActionNode('buscar', 'Buscar instancia de Socio:', {
              details: [createFlowDetailItem('Con numeroSocio igual a nsocio')],
              refs: [{ id: 'rc2', kind: 'ca', flowId: 'ca2' }],
            }),
            createFlowActionNode('leer', 'Leer instancias de SocioEstado relacionadas a Socio'),
            loop,
            createFlowActionNode('leer', 'Leer instancia de EstadoSocio relacionada a SocioEstado'),
            createFlowActionNode('leer', 'Leer nombreEstadoSocio de EstadoSocio'),
          ],
        }),
        createFlowMainStep('system', 'Fin CU', { id: 's5', primitive: 'fin-cu' }),
      ],
      alternativeFlows: [
        {
          id: 'ca1',
          number: 1,
          title: 'Datos inconsistentes',
          steps: [createFlowMainStep('system', 'Ir a paso 2 de camino principal', { primitive: 'ir-a-paso', jumpTarget: { flowId: 'basic', stepId: 's2' } })],
        },
        {
          id: 'ca2',
          number: 2,
          title: 'Socio inexistente',
          steps: [createFlowMainStep('system', 'Fin CU', { primitive: 'fin-cu' })],
        },
      ],
    };

    expect(reviewUseCaseFlow(flow, symbols)).toEqual([]);
  });
});
