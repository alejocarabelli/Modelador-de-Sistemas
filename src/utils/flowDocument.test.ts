import { describe, expect, it } from 'vitest';
import type { LegacyUseCaseFlowContent, UseCaseFlowContent } from '../types/diagram';
import { buildFlowDocument, renderFlowPlainText, tokenizeFlowInline } from './flowDocument';
import { buildFlowDocumentXml } from './flowExportDocx';
import { createFlowPdf } from './flowExportPdf';
import {
  computeFlowNumbering,
  createAlternativeFlow,
  createEmptyUseCaseFlowContent,
  createFlowActionNode,
  createFlowConditionalNode,
  createFlowDetailItem,
  createFlowLoopNode,
  createFlowMainStep,
  formatInputParameters,
  formatJumpTargetText,
  formatStepAnchorSuffix,
  migrateUseCaseFlowV1ToV2,
  parseInputParametersText,
  parseStateTextToBlocks,
} from './useCaseFlowModel';

const socioSymbols = {
  classes: [
    { name: 'Socio', attributes: [{ name: 'numeroSocio', type: 'int' }], methods: [], parametricValues: [], relatedClasses: ['SocioEstado'] },
    { name: 'SocioEstado', attributes: [{ name: 'fechaFinalSocioEstado', type: 'Date' }], methods: [], parametricValues: [], relatedClasses: ['Socio', 'EstadoSocio'] },
    { name: 'EstadoSocio', attributes: [{ name: 'nombreEstadoSocio', type: 'String' }], methods: [], parametricValues: ['activo', 'asignado'], relatedClasses: ['SocioEstado'] },
  ],
};

const buildSocioExample = (): UseCaseFlowContent => {
  const step1 = createFlowMainStep('actor', 'Iniciar CU', {
    id: 's1',
    primitive: 'iniciar-cu',
    refs: [{ id: 'r-gui1', kind: 'gui', label: 'GUI-1' }],
  });
  const step2 = createFlowMainStep('system', 'Solicitar ingreso de datos de un socio', {
    id: 's2',
    children: [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “Ingrese número de socio”', { id: 's2-1' })],
  });
  const step3 = createFlowMainStep('actor', 'Ingresar número de socio (nsocio)', {
    id: 's3',
    primitive: 'ingresar',
  });
  const step4 = createFlowMainStep('system', 'Verificar existencia de socio', {
    id: 's4',
    children: [
      createFlowActionNode('controlar-consistencia', 'Controlar consistencia de datos ingresados', {
        id: 's4-1',
        refs: [{ id: 'r-ca1', kind: 'ca', flowId: 'ca1' }],
      }),
      createFlowActionNode('buscar', 'Buscar instancia de Socio:', {
        id: 's4-2',
        semantic: { targetClass: 'Socio' },
        details: [createFlowDetailItem('Con numeroSocio igual a nsocio')],
        refs: [{ id: 'r-ca2', kind: 'ca', flowId: 'ca2' }],
      }),
    ],
  });
  const loop52 = createFlowLoopNode('por-cada', 'Por cada instancia de SocioEstado:');
  loop52.id = 's5-2';
  loop52.targetClass = 'SocioEstado';
  loop52.children = [];
  loop52.details = [createFlowDetailItem('Leer fechaFinalSocioEstado')];

  const step5 = createFlowMainStep('system', 'Verificar estado de socio', {
    id: 's5',
    children: [
      createFlowActionNode('leer', 'Leer instancias de SocioEstado relacionadas a Socio', { id: 's5-1', semantic: { sourceClass: 'Socio', targetClass: 'SocioEstado' } }),
      loop52,
      createFlowActionNode('seleccionar', 'Seleccionar instancia que tenga fechaFinalSocioEstado vacía', {
        id: 's5-3',
        refs: [{ id: 'r-ca3', kind: 'ca', flowId: 'ca3' }],
      }),
      createFlowActionNode('leer', 'Leer instancia de EstadoSocio relacionada a SocioEstado seleccionada', { id: 's5-4', semantic: { sourceClass: 'SocioEstado', targetClass: 'EstadoSocio' } }),
      createFlowActionNode('leer', 'Leer nombreEstadoSocio de EstadoSocio', { id: 's5-5', semantic: { sourceClass: 'EstadoSocio', attribute: 'nombreEstadoSocio' } }),
      createFlowActionNode('comprobar', 'Comprobar que nombreEstadoSocio es igual a ‘activo’ o ‘asignado’', {
        id: 's5-6',
        refs: [{ id: 'r-ca4', kind: 'ca', flowId: 'ca4' }],
      }),
    ],
  });
  const step6 = createFlowMainStep('system', 'Guardar Cambios', { id: 's6', primitive: 'guardar-cambios' });
  const step7 = createFlowMainStep('system', 'Fin CU', { id: 's7', primitive: 'fin-cu' });

  const ca1 = { ...createAlternativeFlow(1, 'Datos inconsistentes'), id: 'ca1', steps: [createFlowMainStep('system', 'Fin CU', { id: 'ca1-1', primitive: 'fin-cu' })] };
  const ca2 = {
    ...createAlternativeFlow(2, 'No existe socio con número de socio ingresado'),
    id: 'ca2',
    steps: [
      createFlowMainStep('system', 'Informar que el socio no existe', {
        id: 'ca2-1',
        children: [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “El número de socio ingresado no existe”', { id: 'ca2-1-1' })],
      }),
      createFlowMainStep('system', 'Ir a paso 2 de camino principal', {
        id: 'ca2-2',
        primitive: 'ir-a-paso',
        jumpTarget: { flowId: 'basic', stepId: 's2' },
      }),
    ],
  };
  const ca3 = { ...createAlternativeFlow(3, 'Sin estado vigente'), id: 'ca3', steps: [createFlowMainStep('system', 'Fin CU', { id: 'ca3-1', primitive: 'fin-cu' })] };
  const ca4 = { ...createAlternativeFlow(4, 'Estado no habilitado'), id: 'ca4', steps: [createFlowMainStep('system', 'Fin CU', { id: 'ca4-1', primitive: 'fin-cu' })] };

  return {
    version: 2,
    description: {
      useCaseNumber: '16',
      useCaseName: 'Asentar Resultado',
      actor: 'Especialista',
      description: 'Permite registrar el resultado sobre un socio habilitado.',
      priority: 'A',
      inputParameters: parseInputParametersText('nsocio, [pcodigoTipoCaso], respuesta (Resuelto - NoResuelto)'),
      precondition: 'Especialista instanciado (CU Loguear Usuario)',
      initialState: parseStateTextToBlocks(
        'Instancias principales\nInstancia de Socio existente:\n  • Con numeroSocio igual a nsocio\n  • Relacionada a instancia de SocioEstado:\n      ◦ Con fechaFinalSocioEstado igual a vacío',
        'initial',
      ),
      finalState: [],
    },
    basicFlow: [step1, step2, step3, step4, step5, step6, step7],
    alternativeFlows: [ca1, ca2, ca3, ca4],
  };
};

describe('input parameters parsing & formatting', () => {
  it('round-trips optional parameters and discrete options', () => {
    const raw = 'pnumeroCaso, [pcodigoTipoCaso], respuesta (Resuelto - NoResuelto)';
    const parsed = parseInputParametersText(raw);
    expect(parsed).toMatchObject([
      { name: 'pnumeroCaso' },
      { name: 'pcodigoTipoCaso', optional: true },
      { name: 'respuesta', options: ['Resuelto', 'NoResuelto'] },
    ]);
    expect(formatInputParameters(parsed)).toBe(raw);
  });
});

describe('computeFlowNumbering', () => {
  it('computes hierarchical numbering, CA automatic starting numbers, and dynamic jumps', () => {
    const flow = buildSocioExample();
    const numbering = computeFlowNumbering(flow);

    expect(numbering.stepNumberById.get('s1')).toBe('1');
    expect(numbering.stepNumberById.get('s4-1')).toBe('4.1');
    expect(numbering.stepNumberById.get('s4-2')).toBe('4.2');
    expect(numbering.stepNumberById.get('s5-2')).toBe('5.2');
    expect(numbering.stepNumberById.get('s5-6')).toBe('5.6');

    // CA N°2 branches at 4.2 → starts at 5; CA N°4 branches at 5.6 → starts at 6
    expect(numbering.firstStepNumberByFlowId.get('ca2')).toBe(5);
    expect(numbering.stepNumberById.get('ca2-1')).toBe('5');
    expect(numbering.stepNumberById.get('ca2-1-1')).toBe('5.1');
    expect(numbering.stepNumberById.get('ca2-2')).toBe('6');
    expect(numbering.firstStepNumberByFlowId.get('ca4')).toBe(6);

    // Inserting a new main step before step 2 automatically shifts s2 → 3, s4 → 5, CA N°2 → 6 and Ir a paso 3!
    const inserted: UseCaseFlowContent = {
      ...flow,
      basicFlow: [flow.basicFlow[0], createFlowMainStep('system', 'Paso intermedio', { id: 's-mid' }), ...flow.basicFlow.slice(1)],
    };
    const nextNumbering = computeFlowNumbering(inserted);
    expect(nextNumbering.stepNumberById.get('s2')).toBe('3');
    expect(nextNumbering.firstStepNumberByFlowId.get('ca2')).toBe(6);
    expect(formatJumpTargetText(inserted.alternativeFlows[1].steps[1].jumpTarget, inserted, nextNumbering)).toBe(
      'Ir a paso 3 de camino principal',
    );
    expect(formatStepAnchorSuffix({ flowId: 'basic', stepId: 's4-2' }, inserted, nextNumbering, 'basic')).toBe(
      '(paso 5.2)',
    );
  });

  it('leaves SINO and FINSI unnumbered while keeping sub-step numbers globally unique', () => {
    const cond = createFlowConditionalNode('estado igual a activo');
    cond.id = 'cond';
    cond.thenChildren = [createFlowActionNode('custom', 'Acción A', { id: 'a1' }), createFlowActionNode('custom', 'Acción B', { id: 'a2' })];
    cond.elseChildren = [createFlowActionNode('custom', 'Acción C', { id: 'a3' })];

    const flow: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('system', 'Evaluar condición', {
          id: 'm1',
          children: [cond, createFlowActionNode('custom', 'Siguiente', { id: 'after' })],
        }),
      ],
    };

    const numbering = computeFlowNumbering(flow);
    expect(numbering.stepNumberById.get('cond')).toBe('1.1');
    expect(numbering.stepNumberById.get('a1')).toBe('1.1.1');
    expect(numbering.stepNumberById.get('a2')).toBe('1.1.2');
    expect(numbering.stepNumberById.get('a3')).toBe('1.1.3');
    expect(numbering.stepNumberById.get('after')).toBe('1.2');
  });

  it('supports CA chaining (Basic → CA N°5 → CA N°6)', () => {
    const flow: UseCaseFlowContent = {
      ...createEmptyUseCaseFlowContent(),
      basicFlow: [
        createFlowMainStep('actor', 'Iniciar CU', { id: 'b1' }),
        createFlowMainStep('system', 'Validar', {
          id: 'b2',
          children: [createFlowActionNode('comprobar', 'Comprobar X', { id: 'b2-1', refs: [{ id: 'r5', kind: 'ca', flowId: 'ca5' }] })],
        }),
      ],
      alternativeFlows: [
        {
          id: 'ca5',
          number: 5,
          title: 'Falla X',
          steps: [
            createFlowMainStep('system', 'Reintentar', {
              id: 'c5-1',
              children: [createFlowActionNode('comprobar', 'Comprobar Y', { id: 'c5-1-1', refs: [{ id: 'r6', kind: 'ca', flowId: 'ca6' }] })],
            }),
            createFlowMainStep('system', 'Fin CU', { id: 'c5-2', primitive: 'fin-cu' }),
          ],
        },
        {
          id: 'ca6',
          number: 6,
          title: 'Falla Y',
          steps: [createFlowMainStep('system', 'Fin CU', { id: 'c6-1', primitive: 'fin-cu' })],
        },
      ],
    };

    const numbering = computeFlowNumbering(flow);
    expect(numbering.firstStepNumberByFlowId.get('ca5')).toBe(3); // b2 (2) + 1
    expect(numbering.firstStepNumberByFlowId.get('ca6')).toBe(4); // c5-1 (3) + 1
  });
});

describe('migrateUseCaseFlowV1ToV2', () => {
  it('migrates legacy v1 flows without losing steps, blocks, refs, states, or postcondition', () => {
    const legacy: LegacyUseCaseFlowContent = {
      classDiagramArtifactId: 'cd-1',
      description: {
        useCaseNumber: '3',
        useCaseName: 'Actualizar Estado Trámite',
        actor: 'Consultor',
        description: 'Actualiza el estado del trámite.',
        priority: 'B',
        inputParameters: 'pNroTramite, [pObs], accion (Confirmar - Rechazar)',
        precondition: 'Consultor instanciado',
        postcondition: 'Trámite actualizado.',
        initialState: 'Instancias principales\nInstancia de Consultor existente:\n  • Con fechaHoraBaja igual a vacío',
        finalState: 'Si confirma:\nInstancia de Tramite modificada:\n  • Con estado igual a activo',
      },
      basicFlow: [
        { id: 'r1', actor: '1. Iniciar CU', system: '2. Buscar instancia de Tramite con: [CA 1]\n    - nroTramite igual a pNroTramite', ref: '' },
        {
          id: 'r2',
          actor: '',
          system: [
            '3. Procesar',
            '    3.1. POR CADA instancia de Tramite',
            '        3.1.1. Leer nroTramite de Tramite',
            '    3.2. SI accion igual a Confirmar',
            '        3.2.1. Guardar Cambios',
            '    3.3. SINO',
            '        3.3.1. Mostrar mensaje "Rechazado"',
            '    3.4. FIN SI',
          ].join('\n'),
          ref: '',
        },
      ],
      alternativeFlows: [
        { id: 'ca1', code: 'CA 1', name: 'No existe trámite', steps: [{ id: 'a1', actor: '', system: '3. Informar error\n4. Retornar a paso 1 del camino básico', ref: '' }] },
      ],
    };

    const v2 = migrateUseCaseFlowV1ToV2(legacy);

    expect(v2.version).toBe(2);
    expect(v2.classDiagramArtifactId).toBe('cd-1');
    expect(v2.description.legacyPostcondition).toBe('Trámite actualizado.');
    expect(v2.description.inputParameters).toHaveLength(3);
    expect(v2.description.initialState).toHaveLength(2);
    expect(v2.description.finalState[0]).toMatchObject({ kind: 'condition', condition: 'confirma' });
    // Mixed row r1 split into separate Actor and System main steps
    expect(v2.basicFlow[0]).toMatchObject({ id: 'r1', speaker: 'actor', title: 'Iniciar CU' });
    expect(v2.basicFlow[1]).toMatchObject({ speaker: 'system', primitive: 'buscar' });
    expect(v2.basicFlow[1].refs).toMatchObject([{ kind: 'ca', flowId: 'ca1' }]);
    // Loop & conditional reconstructed in step 3
    expect(v2.basicFlow[2].children[0]).toMatchObject({ kind: 'loop', loopKind: 'por-cada' });
    expect(v2.basicFlow[2].children[1]).toMatchObject({ kind: 'conditional' });
    // Alternative jump resolved to step r1
    expect(v2.alternativeFlows[0].number).toBe(1);
    expect(v2.alternativeFlows[0].steps[1].jumpTarget).toEqual({ flowId: 'basic', stepId: 'r1' });
  });
});

describe('buildFlowDocument, PDF and DOCX exports', () => {
  it('aligns per-substep Ref., underlines classes, italicizes attributes, and frames loops', () => {
    const flow = buildSocioExample();
    const doc = buildFlowDocument(flow, 'Asentar Resultado', socioSymbols);

    // 9 official fields in order
    expect(doc.fields.map((f) => f.label)).toEqual([
      'Número',
      'Nombre del Caso de Uso',
      'Actor',
      'Descripción',
      'Prioridad',
      'Parámetros de Entrada',
      'Precondición',
      'Estado Inicial',
      'Estado Final',
    ]);

    // Step 4 sub-rows align CA N°1 with 4.1 and CA N°2 with 4.2
    const step4Row = doc.basic.rows[3];
    expect(step4Row.subRows[0].ref).toBe('');
    expect(step4Row.subRows[1].ref).toBe('CA N°1');
    expect(step4Row.subRows[2].ref).toBe('CA N°2');
    // Class underlined & attribute italicized inside flow cell
    expect(step4Row.subRows[2].system[0].segments).toContainEqual(expect.objectContaining({ text: 'Socio', underline: true }));
    expect(step4Row.subRows[2].system[1].segments).toContainEqual(expect.objectContaining({ text: 'numeroSocio', italic: true }));

    // Step 5 loop carries box framing flags
    const loopSubRow = doc.basic.rows[4].subRows[2];
    expect(loopSubRow.system[0].loopStarts).toBe(1);
    expect(loopSubRow.system[0].loopDepth).toBe(1);
    expect(loopSubRow.system[loopSubRow.system.length - 1].loopEnds).toBe(1);

    // Word XML defaults to portrait, includes dark header, CA N°2, loop box border and official title
    const xml = buildFlowDocumentXml(doc);
    expect(xml).toContain('26303D');
    expect(xml).toContain('Camino alternativo N°2: No existe socio con número de socio ingresado');
    expect(xml).toContain('CA N°2');
    expect(xml).toContain('GUI-1');
    expect(xml).toContain('<w:pBdr>');
    expect(xml).not.toContain('w:orient="landscape"');

    // Landscape option works
    expect(buildFlowDocumentXml(doc, { orientation: 'landscape' })).toContain('w:orient="landscape"');

    // Selective export (brief-and-initial only)
    const partialDoc = buildFlowDocument(flow, 'Asentar Resultado', socioSymbols, {
      includeDescription: true,
      descriptionMode: 'brief-and-initial',
      includeBasicFlow: false,
      includeAlternatives: false,
    });
    expect(partialDoc.fields.map((f) => f.label)).toEqual([
      'Número',
      'Nombre del Caso de Uso',
      'Actor',
      'Descripción',
      'Estado Inicial',
    ]);
    expect(renderFlowPlainText(partialDoc)).toContain('Estado Inicial');
    expect(renderFlowPlainText(partialDoc)).not.toContain('CAMINO BÁSICO');

    // PDF export produces non-empty Blob
    const pdfBlob = createFlowPdf(doc, { orientation: 'portrait' });
    expect(pdfBlob.size).toBeGreaterThan(500);
  });

  it('tokenizes classes, attributes, keywords, literals and step refs inline', () => {
    const vocab = { classes: new Set(['Socio']), attributes: new Set(['numeroSocio']) };
    const tokens = tokenizeFlowInline('Por cada instancia de Socio (paso 4.2) numeroSocio “activo”', vocab);
    expect(tokens.map((t) => t.kind)).toEqual(['keyword', 'plain', 'class', 'plain', 'stepRef', 'plain', 'attribute', 'plain', 'literal']);
  });
});
