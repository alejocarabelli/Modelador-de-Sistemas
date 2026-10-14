import { describe, expect, it } from 'vitest';
import type {
  ClassDiagramNode,
  SequenceDiagramContent,
  SequenceMessage,
  SequenceParticipant,
  SequenceParticipantKind,
} from '../types/diagram';
import { findFreeClassPosition } from './classPlacement';
import { createEmptySequenceDiagramContent, createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { importChangesModel, importClassesFromSequences, planSequenceRelationSuggestions, resolveMessageOperation } from './sequenceClassImport';

const participant = (id: string, kind: SequenceParticipantKind, name: string, classifierName: string, x: number): SequenceParticipant => ({
  id, kind, name, classifierName, x,
});

const call = (
  source: string,
  target: string,
  name: string,
  extra: Partial<SequenceMessage> = {},
): SequenceMessage => ({ ...createSequenceMessage('synchronous', source, target), name, ...extra });

const classNode = (id: string, name: string, x: number, y: number, methods: ClassDiagramNode['data']['methods'] = []): ClassDiagramNode => ({
  id, type: 'classNode', position: { x, y }, data: { name, attributes: [], methods },
});

const sequence = (patch: Partial<SequenceDiagramContent>): SequenceDiagramContent => ({
  ...createEmptySequenceDiagramContent(),
  ...patch,
});

describe('importClassesFromSequences', () => {
  it('creates one class per non-actor participant with the operations it receives', () => {
    const fragment = createSequenceFragment('alt');
    fragment.operands[0].items = [call('p', 'r', 'buscarPermiso', { arguments: 'rolId', returnType: 'Permiso' })];
    const content = sequence({
      participants: [
        participant('u', 'actor', 'Usuario', '', 0),
        participant('p', 'boundary', 'Portal Web', 'Portal', 200),
        participant('r', 'entity', 'repo', ':Repositorio', 400),
      ],
      items: [
        call('u', 'p', 'iniciarSesion', { arguments: 'usuario, clave', returnType: 'void' }),
        { ...createSequenceMessage('return', 'p', 'u'), name: 'ok' },
        createSequenceMessage('create', 'p', 'r'),
        fragment,
      ],
    });

    const { content: result, summary } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);

    expect(result.nodes.map((node) => node.data.name)).toEqual(['Portal', 'Repositorio']);
    expect(result.nodes[0].data.methods).toMatchObject([
      { name: 'iniciarSesion', parameters: 'usuario, clave', returnType: 'void', visibility: '+' },
    ]);
    expect(result.nodes[1].data.methods).toMatchObject([
      { name: 'buscarPermiso', parameters: 'rolId', returnType: 'Permiso' },
    ]);
    expect(summary).toEqual({ createdClasses: 2, addedAttributes: 0, addedMethods: 2, updatedMethods: 0, updatedClasses: 0 });
  });

  it('merges into existing classes by name and is idempotent', () => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0)],
      items: [call('p', 'p', 'validar'), call('p', 'p', 'guardar(dato)')],
    });
    const existing = classNode('g', 'gestor', 0, 0, [
      { id: 'm1', visibility: '+', name: 'validar', parameters: '', returnType: '' },
    ]);

    const first = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(first.content.nodes).toHaveLength(1);
    expect(first.content.nodes[0].data.methods.map((method) => [method.name, method.parameters]))
      .toEqual([['validar', ''], ['guardar', 'dato']]);
    expect(first.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 1, updatedMethods: 0, updatedClasses: 1 });

    const second = importClassesFromSequences(first.content, [content]);
    expect(second.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedMethods: 0, updatedClasses: 0 });
    expect(second.content.nodes[0]).toBe(first.content.nodes[0]);
  });

  it('brings the parameters a call declares, in the model format, and leaves out concrete test values', () => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [
        call('p', 't', 'ingresarDni', { arguments: 'dni' }),
        call('p', 't', 'buscar', { arguments: 'producto: Producto,cantidad:Integer' }),
        call('p', 't', 'guardar', { arguments: "mapa: Map<String, Integer>, 42, 'activo'" }),
        call('p', 't', 'setNombre(valor)'),
        call('p', 't', 'ingresarClave', { arguments: '' }),
        call('p', 't', 'ingresarClave', { arguments: 'clave' }),
      ],
    });

    const { content: result } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);
    const tramite = result.nodes.find((node) => node.data.name === 'Tramite');
    expect(tramite?.data.methods.map((method) => [method.name, method.parameters])).toEqual([
      ['ingresarDni', 'dni'],
      ['buscar', 'producto: Producto, cantidad: Integer'],
      ['guardar', 'mapa: Map<String, Integer>'],
      ['setNombre', 'valor'],
      ['ingresarClave', 'clave'],
    ]);
  });

  it('brings each method once, with the parameters that a call names', () => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [
        call('p', 't', 'buscar', { arguments: 'nroTramite' }),
        call('p', 't', 'buscar(codConsultor)'),
        call('p', 't', 'getEstado', { arguments: 'fechaActual' }),
      ],
    });
    const existing = classNode('t', 'Tramite', 0, 0, [
      { id: 'm1', visibility: '+', name: 'getEstado', parameters: 'fecha: Date', returnType: '' },
    ]);

    const { content: result, summary } = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(result.nodes[0].data.methods.map((method) => [method.name, method.parameters]))
      .toEqual([['getEstado', 'fecha: Date'], ['buscar', 'nroTramite']]);
    expect(summary.addedMethods).toBe(1);
  });

  it('places new classes beside the existing diagram without overlapping it', () => {
    const content = sequence({ participants: [participant('a', 'object', 'a', 'Nueva', 0)] });
    const existing = classNode('x', 'Existente', 100, 100);
    const { content: result } = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(result.nodes[1].position.x).toBeGreaterThan(100 + 240);
  });
});

describe('findFreeClassPosition', () => {
  it('returns the preferred slot when it is free and moves off an occupied one', () => {
    expect(findFreeClassPosition([], { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    const next = findFreeClassPosition([classNode('a', 'A', 50, 50)], { x: 50, y: 50 });
    expect(next).not.toEqual({ x: 50, y: 50 });
    expect(Math.abs(next.x - 50) >= 240 || Math.abs(next.y - 50) >= 150).toBe(true);
  });
});

describe('accessor attributes', () => {
  it('adds the attribute behind each get or set, typed by the getter', () => {
    const content = sequence({
      participants: [participant('c', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [
        call('c', 't', 'setEstado', { arguments: 'estadoNuevo' }),
        call('c', 't', 'getEstado', { returnType: 'TramiteEstado' }),
        call('c', 't', 'getNroTramite', { returnType: 'int' }),
        call('c', 't', 'getURL'),
        call('c', 't', 'buscarDocumentos'),
        call('c', 't', 'getter'),
      ],
    });

    const { content: result, summary } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);
    const tramite = result.nodes.find((node) => node.data.name === 'Tramite');
    expect(tramite?.data.attributes.map((attribute) => [attribute.name, attribute.type])).toEqual([
      ['estado', 'TramiteEstado'],
      ['nroTramite', 'int'],
      ['URL', ''],
    ]);
    expect(summary.addedAttributes).toBe(3);
  });

  it('does not repeat attributes the class already has', () => {
    const content = sequence({
      participants: [participant('c', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [call('c', 't', 'getEstado'), call('c', 't', 'getFechaAlta')],
    });
    const existing = classNode('t', 'Tramite', 0, 0);
    existing.data.attributes = [{ id: 'a1', name: 'estado', type: 'String' }];

    const first = importClassesFromSequences({ nodes: [existing], edges: [] }, [content]);
    expect(first.content.nodes[0].data.attributes.map((attribute) => attribute.name)).toEqual(['estado', 'fechaAlta']);
    expect(first.summary.addedAttributes).toBe(1);

    const second = importClassesFromSequences(first.content, [content]);
    expect(second.summary).toEqual({ createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedMethods: 0, updatedClasses: 0 });
  });
});

describe('literal values are not parameters', () => {
  const importedParameters = (args: string) => {
    const content = sequence({
      participants: [participant('p', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Tramite', 200)],
      items: [call('p', 't', 'op', { arguments: args })],
    });
    const { content: result } = importClassesFromSequences({ nodes: [], edges: [] }, [content]);
    return result.nodes.find((node) => node.data.name === 'Tramite')?.data.methods[0].parameters;
  };

  it('keeps commas and words inside quotes out of the parameter list', () => {
    expect(importedParameters('"hola, id, mundo"')).toBe('');
    expect(importedParameters("'a, b', cantidad")).toBe('cantidad');
    expect(importedParameters('"dijo \\"x, y\\" ya", total: Integer')).toBe('total: Integer');
  });

  it('omits true, false, null, undefined and numbers', () => {
    expect(importedParameters('true, null')).toBe('');
    expect(importedParameters('false, undefined, 3.5, id')).toBe('id');
  });
});

describe('completing parameters of an existing method', () => {
  const model = (): ClassDiagramNode => classNode('c', 'Cliente', 0, 0, [{ id: 'm', visibility: '+', name: 'buscar', parameters: '', returnType: '' }]);
  const seq = () => sequence({
    participants: [participant('p', 'control', '', 'Gestor', 0), participant('t', 'entity', '', 'Cliente', 200)],
    items: [call('p', 't', 'buscar', { arguments: 'id: Integer' })],
  });

  it('counts a parameter completion as a change of the model', () => {
    const { content, summary } = importClassesFromSequences({ nodes: [model()], edges: [] }, [seq()]);
    expect(summary.updatedMethods).toBe(1);
    expect(importChangesModel(summary)).toBe(true);
    expect(content.nodes[0].data.methods[0].parameters).toBe('id: Integer');
    const again = importClassesFromSequences(content, [seq()]);
    expect(importChangesModel(again.summary)).toBe(false);
  });

  it('resolves the declared parameters of a selected call for an existing method without them', () => {
    const message = seq().items[0] as SequenceMessage;
    expect(resolveMessageOperation(model().data.methods, message)).toMatchObject({ existing: { id: 'm' }, parametersToAdd: 'id: Integer' });
  });

  it('never touches parameters the method already has, and proposes a new method when absent', () => {
    const message = seq().items[0] as SequenceMessage;
    const withParams = [{ id: 'm', visibility: '+' as const, name: 'buscar', parameters: 'nro', returnType: '' }];
    expect(resolveMessageOperation(withParams, message)).toMatchObject({ existing: { id: 'm' }, parametersToAdd: undefined });
    expect(resolveMessageOperation([], message)).toMatchObject({ existing: undefined, operation: { name: 'buscar', parameters: 'id: Integer' } });
  });
});

describe('planSequenceRelationSuggestions', () => {
  const participants = [
    participant('u', 'actor', 'Consultor', '', 0),
    participant('p', 'boundary', '', ':PantallaCambioEstado', 200),
    participant('g', 'control', '', ':GestorCambioEstado', 400),
    participant('t', 'entity', 'actual', 'Tramite', 600),
    participant('e', 'entity', '', ':EstadoTramite', 800),
  ];
  const loop = createSequenceFragment('loop');
  loop.operands[0].items = [call('g', 't', 'getNroTramite'), call('t', 'e', 'esActual')];
  const cambioEstado = sequence({
    participants,
    items: [
      call('u', 'p', 'opcionCambiarEstado'),
      call('p', 'g', 'nuevoCambioEstado'),
      loop,
      { ...createSequenceMessage('return', 't', 'g'), name: 'nro' },
      call('g', 'p', 'mostrarTramites', { arguments: 'tramites' }),
    ],
  });

  it('suggests each pair of classes that exchange a message and the model does not relate, once', () => {
    const model = {
      nodes: [classNode('n-t', 'Tramite', 0, 0), classNode('n-e', 'EstadoTramite', 400, 0)],
      edges: [{ id: 'r', source: 'n-t', target: 'n-e', type: 'association' }],
    };

    expect(planSequenceRelationSuggestions(model, [cambioEstado])).toEqual([
      { key: 'relation:pantallacambioestado:gestorcambioestado', sourceClassName: 'PantallaCambioEstado', targetClassName: 'GestorCambioEstado', message: 'nuevoCambioEstado()' },
      { key: 'relation:gestorcambioestado:tramite', sourceClassName: 'GestorCambioEstado', targetClassName: 'Tramite', message: 'getNroTramite()' },
    ]);
  });

  it('leaves out a pair the model already relates in either direction, actors and returns', () => {
    const model = {
      nodes: [classNode('n-p', 'PantallaCambioEstado', 0, 0), classNode('n-g', 'GestorCambioEstado', 400, 0), classNode('n-t', 'Tramite', 800, 0), classNode('n-e', 'EstadoTramite', 0, 400)],
      edges: [
        { id: 'a', source: 'n-g', target: 'n-p', type: 'association' },
        { id: 'b', source: 'n-t', target: 'n-g', type: 'association' },
        { id: 'c', source: 'n-e', target: 'n-t', type: 'association' },
      ],
    };

    expect(planSequenceRelationSuggestions(model, [cambioEstado])).toEqual([]);
  });
});
