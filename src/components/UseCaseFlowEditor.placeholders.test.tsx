import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DialogProvider } from './ConfirmDialog';
import { UseCaseFlowEditor } from './UseCaseFlowEditor';
import { themes } from '../theme/themes';
import type { DesignProject, UseCaseFlowArtifact } from '../types/diagram';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import {
  createAlternativeFlow,
  createEmptyUseCaseFlowContent,
  createFlowActionNode,
  createFlowConditionalNode,
  createFlowLoopNode,
  createFlowMainStep,
} from '../utils/useCaseFlowModel';

describe('UseCaseFlowEditor v2 rendering', () => {
  it('renders the 9 official Lista Descriptiva fields, 3-column table, loop frames and SI/SINO/FINSI', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const loop = createFlowLoopNode('por-cada', 'Por cada instancia de SocioEstado:');
    const cond = createFlowConditionalNode('estado igual a activo');
    cond.elseChildren = [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “Inactivo”')];

    const content = createEmptyUseCaseFlowContent();
    content.description.useCaseNumber = '16';
    content.description.useCaseName = 'Asentar Resultado';
    content.basicFlow = [
      createFlowMainStep('actor', 'Iniciar CU', {
        id: 's1',
        primitive: 'iniciar-cu',
        refs: [{ id: 'g1', kind: 'gui', label: 'GUI-1' }],
      }),
      createFlowMainStep('system', 'Verificar socio', {
        id: 's2',
        children: [
          createFlowActionNode('controlar-consistencia', 'Controlar consistencia de datos ingresados', {
            id: 's2-1',
            refs: [{ id: 'r1', kind: 'ca', flowId: 'ca-1' }],
          }),
          loop,
          cond,
        ],
      }),
    ];
    content.alternativeFlows = [{ ...createAlternativeFlow(1, 'Datos inconsistentes'), id: 'ca-1' }];

    const flowArtifact: UseCaseFlowArtifact = {
      id: 'flow-1',
      type: 'use-case-flow',
      name: 'Asentar Resultado',
      createdAt: now,
      updatedAt: now,
      content: normalizeUseCaseFlowContent(content),
    };
    const project: DesignProject = {
      id: 'project-1',
      name: 'Proyecto',
      createdAt: now,
      updatedAt: now,
      activeArtifactId: flowArtifact.id,
      artifacts: [flowArtifact],
    };

    const html = renderToString(
      <DialogProvider>
        <UseCaseFlowEditor
          artifact={flowArtifact}
          canRedo={false}
          canUndo={false}
          project={project}
          theme={themes[0]}
          onChangeContent={vi.fn()}
          onRedo={vi.fn()}
          onUndo={vi.fn()}
        />
      </DialogProvider>,
    );

    // 9 official Lista Descriptiva labels
    for (const label of [
      'Número',
      'Nombre del Caso de Uso',
      'Actor',
      'Descripción',
      'Prioridad',
      'Parámetros de Entrada',
      'Precondición',
      'Estado Inicial',
      'Estado Final',
    ]) {
      expect(html).toContain(label);
    }

    // Aligned Ref. chips, loop frame, SI / SINO / FINSI, and CA N°1 banner
    expect(html).toContain('GUI-1');
    expect(html).toContain('CA N°1');
    // One line per row: the loop draws its frame row by row, SI/SINO are editable lines, FINSI is drawn.
    expect(html).toContain('fl-loop-box');
    expect(html).toMatch(/>SI\b/);
    expect(html).toContain('>SINO<');
    expect(html).toContain('>FINSI<');
    expect(html).toContain('Camino alternativo N°');
    expect(html).toContain('desde paso 2.1');
  });

  it('surfaces legacy postcondition migration banner only when present', () => {
    const now = '2026-01-01T00:00:00.000Z';
    const migrated = normalizeUseCaseFlowContent({
      description: {
        useCaseNumber: '1',
        useCaseName: 'Test',
        actor: 'Usuario',
        description: '',
        priority: 'A',
        inputParameters: '',
        precondition: '',
        postcondition: 'Texto heredado v1',
        initialState: '',
        finalState: '',
      },
      basicFlow: [],
      alternativeFlows: [],
    });
    const flowArtifact: UseCaseFlowArtifact = {
      id: 'flow-legacy',
      type: 'use-case-flow',
      name: 'Test',
      createdAt: now,
      updatedAt: now,
      content: migrated,
    };
    const project: DesignProject = {
      id: 'project-1',
      name: 'Proyecto',
      createdAt: now,
      updatedAt: now,
      activeArtifactId: flowArtifact.id,
      artifacts: [flowArtifact],
    };

    const html = renderToString(
      <DialogProvider>
        <UseCaseFlowEditor
          artifact={flowArtifact}
          canRedo={false}
          canUndo={false}
          project={project}
          theme={themes[0]}
          onChangeContent={vi.fn()}
          onRedo={vi.fn()}
          onUndo={vi.fn()}
        />
      </DialogProvider>,
    );

    expect(html).toContain('Postcondición (v1)');
    expect(html).toContain('Texto heredado v1');
    expect(html).toContain('Mover a Estado Final');
  });
});
