import { describe, expect, it } from 'vitest';
import type { ClassDiagramArtifact, SequenceMessage, SequenceParticipant, UseCaseFlowArtifact } from '../types/diagram';
import {
  createSequenceMessageEditModel,
  createSequenceSignatureDraft,
  buildSequenceMessageFromEditModel,
  getSequenceFlowOptions,
  getSequenceMessageReferenceStatus,
  getSequenceMethodOptions,
  getSequenceSignatureInputValue,
  formatArgumentList,
  formatMessageSignature,
  parseMessageSignature,
  reconcileMessageLifecycleMarkers,
  sequenceMessageEditModelFromMessage,
  sequenceMessageEditModelToPatch,
  swapSequenceMessageEditModel,
  updateSequenceMessageEditModel,
  withReadableArguments,
} from './sequenceMessageEditing';
import { applySequenceDiagramMutation, createEmptySequenceDiagramContent, formatSequenceMessageLabel, normalizeSequenceDiagramContent, updateSequenceItem } from './sequenceDiagram';

const participants: SequenceParticipant[] = [
  { id: 'caller', kind: 'object', name: 'caller', classifierName: 'Caller', classifierNodeId: 'class-caller', x: 120 },
  { id: 'receiver', kind: 'object', name: 'receiver', classifierName: 'Receiver', classifierNodeId: 'class-receiver', x: 400 },
];

const classDiagram = {
  id: 'classes',
  type: 'class-diagram',
  name: 'Clases',
  createdAt: '',
  updatedAt: '',
  content: {
    nodes: [
      { id: 'class-caller', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Caller', attributes: [], methods: [{ id: 'caller-method', visibility: '+', name: 'emitir', parameters: '', returnType: 'void' }] } },
      { id: 'class-receiver', type: 'classNode', position: { x: 0, y: 0 }, data: { name: 'Receiver', attributes: [], methods: [{ id: 'receiver-method', visibility: '+', name: 'buscar', parameters: 'id', returnType: 'Caso' }] } },
    ],
    edges: [],
  },
} as ClassDiagramArtifact;

const flows = [
  {
    id: 'flow-selected',
    type: 'use-case-flow',
    name: 'Seleccionado',
    createdAt: '',
    updatedAt: '',
    content: {
      description: { useCaseNumber: '', useCaseName: '', actor: '', description: '', priority: 'A', inputParameters: '', precondition: '', postcondition: '', initialState: '', finalState: '' },
      basicFlow: [{ id: 'step-1', actor: 'Usuario', system: 'Sistema', ref: '1' }],
      alternativeFlows: [{ id: 'alt-1', code: 'A1', name: 'Alternativa', steps: [{ id: 'step-a1', actor: 'Usuario', system: 'Error', ref: 'A1.1' }] }],
    },
  },
  {
    id: 'flow-other',
    type: 'use-case-flow',
    name: 'Otro',
    createdAt: '',
    updatedAt: '',
    content: {
      description: { useCaseNumber: '', useCaseName: '', actor: '', description: '', priority: 'A', inputParameters: '', precondition: '', postcondition: '', initialState: '', finalState: '' },
      basicFlow: [{ id: 'other-step', actor: 'Otro actor', system: 'Otro sistema', ref: '9' }],
      alternativeFlows: [],
    },
  },
] as unknown as UseCaseFlowArtifact[];

const message = (overrides: Partial<SequenceMessage> = {}): SequenceMessage => ({
  id: 'message-1',
  kind: 'message',
  type: 'synchronous',
  sourceId: 'caller',
  targetId: 'receiver',
  name: 'buscar',
  arguments: 'id',
  parameterValues: '42',
  returnType: 'Caso',
  operationMethodId: 'receiver-method',
  flowReference: '1',
  ...overrides,
});

describe('shared sequence message editing contract', () => {
  it.each([
    'buscar(id): Pedido',
    'validar(calcular(a, b), c): boolean',
    'buscar(datos: Map<string, number>): List<Item>',
  ])('preserves every keystroke of the inspector signature %s', (signature) => {
    let edited = message();
    for (let length = 0; length <= signature.length; length += 1) {
      const text = signature.slice(0, length);
      const draft = createSequenceSignatureDraft(edited, text);
      const model = updateSequenceMessageEditModel(sequenceMessageEditModelFromMessage(edited), parseMessageSignature(text));
      edited = { ...edited, ...sequenceMessageEditModelToPatch(model) };

      expect(getSequenceSignatureInputValue(edited, draft)).toBe(text);
    }
    expect(edited).toMatchObject(parseMessageSignature(signature));
    expect(getSequenceSignatureInputValue(edited, null)).toBe(formatMessageSignature(edited));
  });

  it('discards a raw signature draft when another message or an external edit replaces its model', () => {
    const original = message({ name: 'antes', arguments: '', returnType: '' });
    const text = 'buscar(id): Pedido ';
    const draft = createSequenceSignatureDraft(original, text);
    const model = updateSequenceMessageEditModel(sequenceMessageEditModelFromMessage(original), parseMessageSignature(text));
    const edited = { ...original, ...sequenceMessageEditModelToPatch(model) };

    expect(getSequenceSignatureInputValue(edited, draft)).toBe(text);
    expect(getSequenceSignatureInputValue(original, draft)).toBe('antes()');
    expect(getSequenceSignatureInputValue({ ...edited, id: 'another' }, draft)).toBe('buscar(id): Pedido');
  });

  it('tolerates incomplete linked class and flow artifacts', () => {
    const incompleteClass = {
      ...classDiagram,
      content: { nodes: [{ id: 'class-receiver', data: { name: 'Receiver' } }] },
    } as unknown as ClassDiagramArtifact;
    const incompleteFlow = { ...flows[0], content: {} } as unknown as UseCaseFlowArtifact;
    const model = createSequenceMessageEditModel({ sourceId: 'caller', targetId: 'receiver' });

    expect(getSequenceMethodOptions({ model, participants, classDiagram: incompleteClass })).toEqual([]);
    expect(getSequenceFlowOptions([incompleteFlow], incompleteFlow.id)).toEqual([]);
  });

  it('persists the inverted route and keeps text while invalidating a receiver method ID', () => {
    const model = sequenceMessageEditModelFromMessage(message());
    const swapped = swapSequenceMessageEditModel({ ...model, sourceId: 'caller', targetId: 'receiver' }, getSequenceMethodOptions({
      model: { ...model, sourceId: 'receiver', targetId: 'caller' },
      participants,
      classDiagram,
    }));
    const patch = sequenceMessageEditModelToPatch(swapped);

    expect(patch).toMatchObject({ sourceId: 'receiver', targetId: 'caller', name: 'buscar', arguments: 'id', parameterValues: '42' });
    expect(patch.operationMethodId).toBeUndefined();
  });

  it('survives the central mutation gate and a save/reopen round trip after inversion', () => {
    const current = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(),
      participants,
      items: [message()],
    });
    const model = sequenceMessageEditModelFromMessage(message());
    const swapped = swapSequenceMessageEditModel(model);
    const candidate = { ...current, items: updateSequenceItem(current.items, 'message-1', (item) => ({ ...item, ...sequenceMessageEditModelToPatch(swapped) })) };
    const result = applySequenceDiagramMutation(current, candidate);
    const reopened = normalizeSequenceDiagramContent(JSON.parse(JSON.stringify(result.content)));
    const saved = reopened.items[0];

    expect(result.accepted).toBe(true);
    expect(saved).toMatchObject({ sourceId: 'receiver', targetId: 'caller', name: 'buscar', flowReference: '1' });
  });

  it('offers methods only from the receiver and persists the stable selected ID', () => {
    const model = createSequenceMessageEditModel({ sourceId: 'caller', targetId: 'receiver', name: 'buscar' });
    const options = getSequenceMethodOptions({ model, participants, classDiagram });
    expect(options.map((option) => option.id)).toEqual(['receiver-method']);
    expect(getSequenceMethodOptions({ model: { ...model, sourceId: 'receiver', targetId: 'caller' }, participants, classDiagram }).map((option) => option.id)).toEqual(['caller-method']);

    const patch = sequenceMessageEditModelToPatch({ ...model, operationMethodId: options[0].id, arguments: options[0].parameters, returnType: options[0].returnType });
    expect(patch.operationMethodId).toBe('receiver-method');
    expect(patch.name).toBe('buscar');
  });

  it('does not crash when a referenced class diagram has no nodes', () => {
    const malformedClassDiagram = {
      ...classDiagram,
      content: {},
    } as ClassDiagramArtifact;

    expect(() => getSequenceMethodOptions({
      model: createSequenceMessageEditModel({ sourceId: 'caller', targetId: 'receiver' }),
      participants,
      classDiagram: malformedClassDiagram,
    })).not.toThrow();
    expect(getSequenceMethodOptions({
      model: createSequenceMessageEditModel({ sourceId: 'caller', targetId: 'receiver' }),
      participants,
      classDiagram: malformedClassDiagram,
    })).toEqual([]);
  });

  it('resolves a legacy participant by classifier name when no class-node ID was saved', () => {
    const legacyParticipants = participants.map((participant) => ({ ...participant, classifierNodeId: undefined }));
    const options = getSequenceMethodOptions({
      model: createSequenceMessageEditModel({ sourceId: 'caller', targetId: 'receiver' }),
      participants: legacyParticipants,
      classDiagram,
    });
    expect(options.map((option) => option.id)).toEqual(['receiver-method']);
  });

  it('filters suggestions to the selected flow, including its own alternatives only', () => {
    const options = getSequenceFlowOptions(flows, 'flow-selected');
    expect(options.map((option) => option.value)).toEqual(['1', 'A1.1']);
    expect(options.some((option) => option.value === '9')).toBe(false);
    expect(getSequenceFlowOptions(flows, undefined)).toEqual([]);
  });

  it('keeps legacy free text and reports missing references without deleting it', () => {
    const legacy = sequenceMessageEditModelFromMessage(message({ operationMethodId: undefined, flowReference: 'old-step' }));
    const options = getSequenceMethodOptions({ model: legacy, participants, classDiagram });
    const status = getSequenceMessageReferenceStatus(legacy, [{ ...options[0], id: 'different-method' }], getSequenceFlowOptions(flows, 'flow-selected'), 'flow-selected');
    const patch = sequenceMessageEditModelToPatch(legacy);

    expect(status).toEqual({ method: 'none', flow: 'missing' });
    expect(patch).toMatchObject({ name: 'buscar', arguments: 'id', flowReference: 'old-step' });
    expect(patch.operationMethodId).toBeUndefined();
  });

  it('marks a saved method as missing after the linked class disappears', () => {
    const model = sequenceMessageEditModelFromMessage(message());
    const status = getSequenceMessageReferenceStatus(model, [], [], 'flow-selected');
    expect(status).toEqual({ method: 'missing', flow: 'missing' });
    expect(sequenceMessageEditModelToPatch(model).name).toBe('buscar');
  });

  it('parses multi-line and single-line message signatures cleanly', () => {
    const signature = `comprobarConsultorInstanciado(
      codCliente,
      fechaInicio,
      estadoVigente,
      tokenSesion
    ): ResultadoValidacion`;

    const parsed = parseMessageSignature(signature);
    expect(parsed.name).toBe('comprobarConsultorInstanciado');
    expect(parsed.arguments).toContain('codCliente,');
    expect(parsed.arguments).toContain('tokenSesion');
    expect(parsed.returnType).toBe('ResultadoValidacion');

    expect(parseMessageSignature('buscar(id): Caso')).toEqual({
      name: 'buscar',
      arguments: 'id',
      returnType: 'Caso',
    });

    expect(parseMessageSignature('obtener()')).toEqual({
      name: 'obtener',
      arguments: '',
      returnType: '',
    });

    expect(parseMessageSignature('texto libre sin parentesis')).toEqual({
      name: 'texto libre sin parentesis',
      arguments: '',
      returnType: '',
    });

    expect(parseMessageSignature('validar(calcular(a, b), c): boolean')).toEqual({
      name: 'validar',
      arguments: 'calcular(a, b), c',
      returnType: 'boolean',
    });

    expect(parseMessageSignature(': ResultadoRetorno')).toEqual({
      name: '',
      arguments: '',
      returnType: 'ResultadoRetorno',
    });

    expect(parseMessageSignature('consultar: Usuario')).toEqual({
      name: 'consultar',
      arguments: '',
      returnType: 'Usuario',
    });

    expect(parseMessageSignature('obtener(map: Map<string, number>): List<Item>')).toEqual({
      name: 'obtener',
      arguments: 'map: Map<string, number>',
      returnType: 'List<Item>',
    });

    expect(parseMessageSignature('incompleto(param1, param2')).toEqual({
      name: 'incompleto',
      arguments: 'param1, param2',
      returnType: '',
    });
  });

  it('preserves concrete parameter values while editing the formal signature', () => {
    const model = createSequenceMessageEditModel({
      name: 'validar',
      arguments: 'entrada',
      parameterValues: 'calcular(a,b), c',
      returnType: 'boolean',
    });
    const edited = updateSequenceMessageEditModel(model, parseMessageSignature('validar(otraEntrada):boolean'));

    expect(sequenceMessageEditModelToPatch(edited)).toMatchObject({
      arguments: 'otraEntrada',
      parameterValues: 'calcular(a,b), c',
    });
    expect(formatMessageSignature(edited)).toBe('validar(otraEntrada): boolean');
  });

  it('builds destroy consistently and restores its lifecycle marker after save/reopen', () => {
    const destroy = buildSequenceMessageFromEditModel(createSequenceMessageEditModel({
      type: 'destroy', sourceId: 'caller', targetId: 'receiver', name: 'ignored',
    }), 'destroy-1');
    const marked = reconcileMessageLifecycleMarkers(participants, destroy);
    const reopened = normalizeSequenceDiagramContent({
      ...createEmptySequenceDiagramContent(), participants: marked, items: [destroy],
    });

    expect(destroy).toMatchObject({ id: 'destroy-1', type: 'destroy', name: 'destroy', arguments: '', parameterValues: '' });
    expect(reopened.participants.find((participant) => participant.id === 'receiver')?.destroyedByMessageId).toBe('destroy-1');
  });
});

describe('method link while editing a message', () => {
  it('keeps the linked method when only the passed values change, and drops it on rename', () => {
    const linked = createSequenceMessageEditModel({ name: 'buscarPrestamos', operationMethodId: 'm1' });

    expect(updateSequenceMessageEditModel(linked, { name: 'buscarPrestamos', arguments: '5001' }).operationMethodId).toBe('m1');
    expect(updateSequenceMessageEditModel(linked, { returnType: 'Prestamo[]' }).operationMethodId).toBe('m1');
    expect(updateSequenceMessageEditModel(linked, { name: 'buscarSocios' }).operationMethodId).toBeUndefined();
  });
});

describe('message arguments shown with ", "', () => {
  it('writes the signature with a comma and a space between arguments', () => {
    expect(formatMessageSignature({ type: 'synchronous', name: 'f', arguments: 'a,b' })).toBe('f(a, b)');
    expect(formatMessageSignature({ type: 'synchronous', name: 'f(a,b)' })).toBe('f(a, b)');
    expect(formatMessageSignature({ type: 'synchronous', name: 'validar', arguments: 'calcular(a,b),c' })).toBe('validar(calcular(a, b), c)');
  });

  it('does not touch commas inside types or quotes', () => {
    expect(formatMessageSignature({ type: 'synchronous', name: 'f', arguments: 'Map<String,Integer> m,"x,y"' })).toBe('f(Map<String,Integer> m, "x,y")');
  });

  it('keeps the saved message and only changes the shown label', () => {
    // The label itself now always shows "a, b"; the saved arguments keep what was typed.
    const message: SequenceMessage = {
      id: 'msg-1',
      type: 'synchronous',
      sourceId: 'p1',
      targetId: 'p2',
      name: 'f',
      arguments: 'a,b',
    } as SequenceMessage;

    expect(formatSequenceMessageLabel(withReadableArguments(message))).toBe('f(a, b)');
    expect(formatSequenceMessageLabel(message)).toBe('f(a, b)');
    expect(message.arguments).toBe('a,b');
  });
});


describe('escaped quotes in displayed arguments', () => {
  it.each([
    [String.raw`"a\",b,c",d`, String.raw`f("a\",b,c", d)`],
    [String.raw`'a\',b,c',d`, String.raw`f('a\',b,c', d)`],
    [String.raw`"a\\",d`, String.raw`f("a\\", d)`],
    [String.raw`g("a\",b,c",d),e`, String.raw`f(g("a\",b,c", d), e)`],
  ])('preserves quoted contents of %s', (args, expected) => {
    expect(formatMessageSignature({ name: 'f', arguments: args })).toBe(expected);
  });
});

describe('deeply nested arguments do not overflow the stack', () => {
  it('formatArgumentList returns text containing the innermost argument instead of throwing', () => {
    const args = 'f('.repeat(3200) + 'id' + ')'.repeat(3200);

    let result = '';
    expect(() => {
      result = formatArgumentList(args);
    }).not.toThrow();
    expect(result).toContain('id');
  });
});
