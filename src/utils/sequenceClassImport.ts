import type {
  ClassAttribute,
  ClassDiagramContent,
  ClassDiagramNode,
  ClassMethod,
  SequenceDiagramContent,
  SequenceMessage,
  SequenceParticipant,
  SequenceTimelineItem,
} from '../types/diagram';
import { estimateClassSize, findFreeClassPosition } from './classPlacement';
import { createId } from './id';
import { flattenSequenceItems } from './sequenceDiagram';

export type SequenceClassImportSummary = {
  createdClasses: number;
  addedAttributes: number;
  addedMethods: number;
  updatedMethods: number;
  updatedClasses: number;
};

type ImportedOperation = Pick<ClassMethod, 'name' | 'parameters' | 'returnType'>;

const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase();

/** `:Tramite` and `Tramite` name the same class. */
export const participantClassName = (classifierName: string, name: string): string =>
  classifierName.replace(/^:+/, '').trim() || name.trim();

/**
 * Splits at the commas that are not inside `<…>`, `(…)` or `[…]` nor inside a
 * quoted string (`\` escapes the next character): `Map<K, V>` and `"a, b"` stay whole.
 */
const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      current += char;
      if (char === '\\' && index + 1 < text.length) {
        index += 1;
        current += text[index];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    if ('<(['.includes(char)) depth += 1;
    if ('>)]'.includes(char)) depth = Math.max(0, depth - 1);
    current += char;
  }
  return [...parts, current];
};

const literalWords = new Set(['true', 'false', 'null', 'undefined']);

const declaredParameter = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)\s*(?::\s*(.*))?$/;

/**
 * The parameters a call declares, in the form the class model keeps for a
 * method: `producto: Producto, cantidad: Integer`, or a bare name when no type
 * is written. Concrete values such as `42` or `'activo'` are not declarations,
 * so they are left out.
 */
const parametersFromText = (text: string): string =>
  splitTopLevel(text)
    .map((part) => declaredParameter.exec(part.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    // `true` or `null` alone are values; `nombre: Tipo` always declares.
    .filter(([, name, type]) => type !== undefined || !literalWords.has(name.toLocaleLowerCase()))
    .map(([, name, type]) => (type?.trim() ? `${name}: ${type.trim()}` : name))
    .join(', ');

/** A call's parameters are the ones its name carries (`buscar(id)`), else the ones its arguments list. */
const parametersOf = (message: SequenceMessage): string => {
  const inName = /\(([^()]*)\)\s*$/.exec(message.name.trim())?.[1] ?? '';
  return parametersFromText(inName.trim().length > 0 ? inName : message.arguments);
};

/**
 * Only calls (synchronous or asynchronous) become operations. The operation
 * takes the parameters the message declares; the name is cut at the parenthesis.
 */
const operationFromMessage = (message: SequenceMessage): ImportedOperation | null => {
  if (message.type !== 'synchronous' && message.type !== 'asynchronous') return null;

  const name = message.name.replace(/\(.*$/, '').trim();
  if (name.length === 0) return null;

  return { name, parameters: parametersOf(message), returnType: message.returnType.trim() };
};

/**
 * `getNombre` and `setNombre` read and write an attribute, so the class has to
 * hold `nombre`. A getter's result is the attribute's type; a setter's
 * argument is only a value, so it says nothing about the type.
 */
export const accessorAttribute = (operation: Pick<ImportedOperation, 'name' | 'returnType'>): Omit<ClassAttribute, 'id'> | null => {
  const match = /^(get|set)([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)$/.exec(operation.name.trim());
  if (match === null) return null;
  const rest = match[2];
  // `getURL` keeps its capitals; `getNombre` becomes `nombre`.
  const name = /^[A-ZÁÉÍÓÚÜÑ]{2}/.test(rest) ? rest : `${rest[0].toLocaleLowerCase()}${rest.slice(1)}`;
  const type = match[1] === 'get' ? operation.returnType.trim() : '';
  return { name, type: type.toLocaleLowerCase() === 'void' ? '' : type };
};

/** True when `type` names one of `classNames`, alone or inside `List<…>`. */
const mentionsClass = (type: string, classNames: ReadonlySet<string>): boolean =>
  type.split(/[^\wÁÉÍÓÚÜÑáéíóúüñ]+/).some((token) => token.length > 0 && classNames.has(normalizeKey(token)));

/**
 * Attributes the accessors among `operations` need and `existing` lacks. A
 * getter that returns another class (`getEstado(): Estado`, `getLista():
 * List<Item>`) navigates a relation, so it does not become an attribute.
 */
const accessorAttributes = (
  operations: Pick<ImportedOperation, 'name' | 'returnType'>[],
  existing: Pick<ClassAttribute, 'name'>[],
  classNames: ReadonlySet<string> = new Set(),
): Omit<ClassAttribute, 'id'>[] => {
  const taken = new Set(existing.map((attribute) => normalizeKey(attribute.name)));
  const added = new Map<string, Omit<ClassAttribute, 'id'>>();
  for (const operation of operations) {
    const attribute = accessorAttribute(operation);
    if (attribute === null || mentionsClass(attribute.type, classNames)) continue;
    const key = normalizeKey(attribute.name);
    if (taken.has(key)) continue;
    const pending = added.get(key);
    if (pending === undefined) added.set(key, attribute);
    // A setter seen first leaves the type empty; the getter can still fill it.
    else if (pending.type === '') pending.type = attribute.type;
  }
  return [...added.values()];
};

/** One operation per name: `buscar(id)` and `buscar(nro)` are the same method. */
const sameOperation = (a: Pick<ImportedOperation, 'name'>, b: Pick<ImportedOperation, 'name'>): boolean =>
  normalizeKey(a.name.replace(/\(.*$/, '')) === normalizeKey(b.name.replace(/\(.*$/, ''));

/** Existing parameters belong to the student; only empty declarations can be completed. */
const needsParameters = (method: ClassMethod, operation: ImportedOperation): boolean =>
  method.parameters.trim() === '' && operation.parameters.trim() !== '';

const operationIsPending = (methods: ClassMethod[], operation: ImportedOperation): boolean => {
  const existing = methods.filter((method) => sameOperation(method, operation));
  return existing.length === 0 || (existing.every((method) => method.parameters.trim() === '') && operation.parameters.trim() !== '');
};

/**
 * What a selected call means for the methods of its class: the operation it
 * declares, the method that already has its name, and the parameters that
 * method can still take (only when none of its homonyms has any).
 */
export const resolveMessageOperation = (
  methods: ClassMethod[],
  message: SequenceMessage,
): { operation: ImportedOperation; existing: ClassMethod | undefined; parametersToAdd: string | undefined } | null => {
  const operation = operationFromMessage(message);
  if (operation === null) return null;
  const homonyms = methods.filter((method) => sameOperation(method, operation));
  const existing = homonyms[0];
  const complete = existing !== undefined && homonyms.every((method) => needsParameters(method, operation));
  return { operation, existing, parametersToAdd: complete ? operation.parameters : undefined };
};

/** True when an import changed the model: new elements or parameters completed. */
export const importChangesModel = (summary: SequenceClassImportSummary): boolean =>
  summary.createdClasses + summary.addedMethods + summary.addedAttributes + summary.updatedMethods > 0;

/**
 * The class a participant stands for: the one it is linked to, or else the
 * one with its class name. A link to a class that no longer exists falls back
 * to the name, so deleting and re-importing a class never strands it.
 */
export const resolveParticipantClassNode = (
  participant: Pick<SequenceParticipant, 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  classContent: Pick<ClassDiagramContent, 'nodes'>,
): ClassDiagramNode | undefined => {
  if (participant.kind === 'actor') return undefined;
  const linked = participant.classifierNodeId
    ? classContent.nodes.find((node) => node.id === participant.classifierNodeId)
    : undefined;
  if (linked) return linked;
  const key = normalizeKey(participantClassName(participant.classifierName ?? '', participant.name ?? ''));
  return key.length === 0 ? undefined : classContent.nodes.find((node) => normalizeKey(node.data.name) === key);
};

const knownClassNames = (classContent: ClassDiagramContent, displayNames: Map<string, string>): Set<string> =>
  new Set([...classContent.nodes.map((node) => normalizeKey(node.data.name)), ...displayNames.keys()]);

/**
 * Ties a sequence to its model by name: each participant to the class it
 * names and each call to the method of that class with its name. Existing
 * links that still resolve are kept (a participant may be linked to a class
 * with another name on purpose); links to deleted elements are re-resolved
 * or dropped. With these links, renaming in the model reaches the sequence.
 * Returns the same content when nothing changes.
 */
export const bindSequenceToModel = (
  sequence: SequenceDiagramContent,
  classContent: Pick<ClassDiagramContent, 'nodes'>,
): SequenceDiagramContent => {
  let changed = false;
  const nodeByParticipant = new Map<string, ClassDiagramNode>();
  const participants = sequence.participants.map((participant) => {
    const node = resolveParticipantClassNode(participant, classContent);
    if (node) nodeByParticipant.set(participant.id, node);
    const nextId = node?.id;
    if (participant.classifierNodeId === nextId) return participant;
    changed = true;
    return { ...participant, classifierNodeId: nextId };
  });

  const bindItems = (items: SequenceTimelineItem[]): SequenceTimelineItem[] => items.map((item) => {
    if (item.kind === 'fragment') {
      let operandsChanged = false;
      const operands = item.operands.map((operand) => {
        const nextItems = bindItems(operand.items);
        if (nextItems === operand.items) return operand;
        operandsChanged = true;
        return { ...operand, items: nextItems };
      });
      return operandsChanged ? { ...item, operands } : item;
    }
    if (item.type !== 'synchronous' && item.type !== 'asynchronous') return item;
    const methods = nodeByParticipant.get(item.targetId)?.data.methods ?? [];
    const current = item.operationMethodId ? methods.find((method) => method.id === item.operationMethodId) : undefined;
    const operation = operationFromMessage(item);
    const next = current ?? (operation ? methods.find((method) => sameOperation(method, operation)) : undefined);
    if (item.operationMethodId === next?.id) return item;
    changed = true;
    return { ...item, operationMethodId: next?.id };
  });
  const items = bindItems(sequence.items);

  return changed ? { ...sequence, participants, items } : sequence;
};

/**
 * Brings every non-actor participant of the given sequence diagrams into the
 * class model, each with the operations it receives. Existing classes (matched
 * by name) only gain the operations they are missing, so importing twice is a
 * no-op rather than a duplicate.
 */
export const importClassesFromSequences = (
  classContent: ClassDiagramContent,
  sequences: SequenceDiagramContent[],
  acceptedKeys?: ReadonlySet<string>,
): { content: ClassDiagramContent; summary: SequenceClassImportSummary } => {
  const { order, displayNames, operations } = collectSequenceOperations(classContent, sequences);
  const classNames = knownClassNames(classContent, displayNames);
  const accepts = (type: SequenceClassImportNovelty['type'], classKey: string, name: string) =>
    acceptedKeys === undefined || acceptedKeys.has(noveltyKey(type, classKey, name));

  const summary: SequenceClassImportSummary = { createdClasses: 0, addedAttributes: 0, addedMethods: 0, updatedMethods: 0, updatedClasses: 0 };
  const nodes: ClassDiagramNode[] = classContent.nodes.map((node) => {
    const key = normalizeKey(node.data.name);
    const incoming = operations.get(key);
    if (incoming === undefined) return node;

    const missing = incoming.filter((operation) =>
      !node.data.methods.some((method) => sameOperation(method, operation)) && accepts('method', key, operation.name));
    let updatedMethods = 0;
    const methods = node.data.methods.map((method) => {
      const operation = incoming.find((candidate) => sameOperation(method, candidate));
      if (!operation || !operationIsPending(node.data.methods, operation) || !needsParameters(method, operation) || !accepts('method', key, operation.name)) return method;
      updatedMethods += 1;
      return { ...method, parameters: operation.parameters };
    });
    const attributes = accessorAttributes(incoming, node.data.attributes, classNames)
      .filter((attribute) => accepts('attribute', key, attribute.name))
      .map((attribute) => ({ id: createId(), ...attribute }));
    operations.delete(key);
    if (missing.length === 0 && attributes.length === 0 && updatedMethods === 0) return node;

    summary.updatedClasses += 1;
    summary.addedMethods += missing.length;
    summary.updatedMethods += updatedMethods;
    summary.addedAttributes += attributes.length;
    return {
      ...node,
      data: {
        ...node.data,
        attributes: [...node.data.attributes, ...attributes],
        methods: [...methods, ...missing.map((operation) => ({ id: createId(), visibility: '+' as const, ...operation }))],
      },
    };
  });

  const existingRight = Math.max(0, ...classContent.nodes.map((node) =>
    node.position.x + (node.width ?? estimateClassSize(node.data).width)));
  const top = classContent.nodes.length === 0
    ? 120
    : Math.min(...classContent.nodes.map((node) => node.position.y));
  const start = { x: classContent.nodes.length === 0 ? 120 : existingRight + 120, y: top };
  // Rows of about four average classes, so a long sequence does not become one
  // endless line the person has to scroll sideways to read.
  const rowWidth = 1200;
  let cursor = { ...start };
  let rowHeight = 0;

  for (const key of order) {
    const pending = operations.get(key);
    if (pending === undefined || !accepts('class', key, key)) continue;
    const incoming = pending.filter((operation) => accepts('method', key, operation.name));

    const name = displayNames.get(key) ?? key;
    const attributes = accessorAttributes(pending, [], classNames)
      .filter((attribute) => accepts('attribute', key, attribute.name))
      .map((attribute) => ({ id: createId(), ...attribute }));
    const size = estimateClassSize({ name, attributes, methods: incoming });
    if (cursor.x > start.x && cursor.x + size.width > start.x + rowWidth) {
      cursor = { x: start.x, y: cursor.y + rowHeight + 60 };
      rowHeight = 0;
    }
    const position = findFreeClassPosition(nodes, cursor, size);
    cursor = { x: position.x + size.width + 60, y: cursor.y };
    rowHeight = Math.max(rowHeight, size.height);

    nodes.push({
      id: createId(),
      type: 'classNode',
      position,
      data: {
        name,
        attributes,
        methods: incoming.map((operation) => ({ id: createId(), visibility: '+', ...operation })),
        hasParametricValuesNote: false,
        parametricValuesNoteConnectionMode: 'automatic',
        parametricValuesNotePosition: undefined,
        parametricValues: [],
      },
    });
    summary.createdClasses += 1;
    summary.addedAttributes += attributes.length;
    summary.addedMethods += incoming.length;
  }

  return { content: { ...classContent, nodes }, summary };
};

export type SequenceClassImportNovelty = {
  key: string;
  type: 'class' | 'method' | 'attribute';
  className: string;
  elementName: string;
  parameters?: string;
  returnType?: string;
  attributeType?: string;
};

const noveltyKey = (type: SequenceClassImportNovelty['type'], classKey: string, name: string): string =>
  type === 'class' ? `class:${classKey}` : `${type}:${classKey}:${normalizeKey(name)}`;

const collectSequenceOperations = (classContent: ClassDiagramContent, sequences: SequenceDiagramContent[]) => {
  const order: string[] = [];
  const displayNames = new Map<string, string>();
  const operations = new Map<string, ImportedOperation[]>();

  for (const sequence of sequences) {
    const participantClass = new Map<string, string>();
    const participants = [...sequence.participants].sort((a, b) => a.x - b.x);

    for (const participant of participants) {
      if (participant.kind === 'actor') continue;
      const className = resolveParticipantClassNode(participant, classContent)?.data.name
        ?? participantClassName(participant.classifierName ?? '', participant.name ?? '');
      if (className.length === 0) continue;
      const key = normalizeKey(className);
      participantClass.set(participant.id, key);
      if (!displayNames.has(key)) {
        displayNames.set(key, className);
        order.push(key);
        operations.set(key, []);
      }
    }

    for (const { item } of flattenSequenceItems(sequence.items)) {
      if (item.kind !== 'message') continue;
      const key = participantClass.get(item.targetId);
      const operation = operationFromMessage(item);
      if (key === undefined || operation === null) continue;
      const known = operations.get(key) ?? [];
      const index = known.findIndex((candidate) => sameOperation(candidate, operation));
      if (index === -1) known.push(operation);
      // The first call may leave its parameters out; a later call of the same operation can name them.
      else if (known[index].parameters === '' && operation.parameters !== '') known[index] = { ...known[index], parameters: operation.parameters };
      operations.set(key, known);
    }
  }

  return { order, displayNames, operations };
};

/** A deterministic, read-only preview of everything an unfiltered import adds. */
export const planSequenceClassImport = (
  classContent: ClassDiagramContent,
  sequences: SequenceDiagramContent[],
): SequenceClassImportNovelty[] => {
  const { order, displayNames, operations } = collectSequenceOperations(classContent, sequences);
  const classNames = knownClassNames(classContent, displayNames);
  return order.flatMap((key) => {
    const node = classContent.nodes.find((candidate) => normalizeKey(candidate.data.name) === key);
    const className = node?.data.name ?? displayNames.get(key)!;
    const incoming = operations.get(key)!;
    const result: SequenceClassImportNovelty[] = node ? [] : [{ key: noveltyKey('class', key, className), type: 'class', className, elementName: className }];
    for (const operation of incoming) {
      if (operationIsPending(node?.data.methods ?? [], operation)) {
        result.push({ key: noveltyKey('method', key, operation.name), type: 'method', className, elementName: operation.name, parameters: operation.parameters, returnType: operation.returnType });
      }
    }
    for (const attribute of accessorAttributes(incoming, node?.data.attributes ?? [], classNames)) {
      result.push({ key: noveltyKey('attribute', key, attribute.name), type: 'attribute', className, elementName: attribute.name, attributeType: attribute.type });
    }
    return result;
  });
};

export const findSequenceMessagesMissingInModel = (sequence: SequenceDiagramContent, classContent: ClassDiagramContent): { messageIds: Set<string>; participantIds: Set<string> } => {
  const participantIds = new Set<string>();
  const messageIds = new Set<string>();
  const classes = new Map<string, ClassDiagramNode | undefined>();
  for (const participant of sequence.participants) {
    if (participant.kind === 'actor') continue;
    const node = resolveParticipantClassNode(participant, classContent);
    classes.set(participant.id, node);
    if (!node) participantIds.add(participant.id);
  }
  for (const { item } of flattenSequenceItems(sequence.items)) {
    if (item.kind !== 'message' || !classes.has(item.targetId)) continue;
    if (participantIds.has(item.targetId)) {
      messageIds.add(item.id);
      continue;
    }
    const operation = operationFromMessage(item);
    if (!operation) continue;
    if (operationIsPending(classes.get(item.targetId)?.data.methods ?? [], operation)) messageIds.add(item.id);
  }
  return { messageIds, participantIds };
};

/** A message between two classes that the model does not relate yet. */
export type SequenceRelationSuggestion = {
  key: string;
  sourceClassName: string;
  targetClassName: string;
  /** The first message that asks for it, as the sequence shows it: `getNroTramite()`. */
  message: string;
};

/**
 * One suggestion per pair of classes that exchange a call, a signal or a
 * creation in the sequences but have no relation of any kind in the model.
 * A message only proves that one class uses the other, so the pair is
 * suggested once (the first message decides the direction) and whether it
 * is a dependency or something stronger is left to the person.
 */
export const planSequenceRelationSuggestions = (
  classContent: ClassDiagramContent,
  sequences: SequenceDiagramContent[],
): SequenceRelationSuggestion[] => {
  const nodeNames = new Map(classContent.nodes.map((node) => [node.id, normalizeKey(node.data.name)]));
  const pairKey = (a: string, b: string): string => [a, b].sort().join('\u0000');
  const related = new Set(classContent.edges.flatMap((edge) => {
    const source = nodeNames.get(edge.source);
    const target = nodeNames.get(edge.target);
    return source && target ? [pairKey(source, target)] : [];
  }));
  const seen = new Set<string>();
  const suggestions: SequenceRelationSuggestion[] = [];

  for (const sequence of sequences) {
    const participantClass = new Map<string, string>();
    for (const participant of sequence.participants) {
      if (participant.kind === 'actor') continue;
      const className = resolveParticipantClassNode(participant, classContent)?.data.name
        ?? participantClassName(participant.classifierName ?? '', participant.name ?? '');
      if (className.length > 0) participantClass.set(participant.id, className);
    }
    for (const { item } of flattenSequenceItems(sequence.items)) {
      if (item.kind !== 'message' || item.type === 'return' || item.type === 'destroy') continue;
      const source = participantClass.get(item.sourceId);
      const target = participantClass.get(item.targetId);
      if (source === undefined || target === undefined) continue;
      const sourceKey = normalizeKey(source);
      const targetKey = normalizeKey(target);
      const pair = pairKey(sourceKey, targetKey);
      if (sourceKey === targetKey || related.has(pair) || seen.has(pair)) continue;
      seen.add(pair);
      const name = item.name.trim();
      suggestions.push({
        key: `relation:${sourceKey}:${targetKey}`,
        sourceClassName: source,
        targetClassName: target,
        message: name.length === 0 ? 'un mensaje' : `${name}(${item.arguments.trim()})`,
      });
    }
  }

  return suggestions;
};
