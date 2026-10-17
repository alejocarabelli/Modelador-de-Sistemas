import type {
  SequenceActivation,
  SequenceDiagramContent,
  SequenceDiagramProblem,
  SequenceDiagramProblemCode,
  SequenceFragment,
  SequenceFragmentOperand,
  SequenceFragmentOperator,
  SequenceMessage,
  SequenceMessageType,
  SequenceNote,
  SequenceNoteColor,
  SequenceNumberingMode,
  SequenceParticipant,
  SequenceParticipantKind,
  SequenceTimelineItem,
} from '../types/diagram';
import { createId } from './id';
import { formatArgumentList } from './sequenceMessageEditing';
import { resolveSequenceParticipantX, SEQUENCE_MIN_PARTICIPANT_GAP } from './sequenceDiagramGeometry';
// Runtime cycle with the layout module, used only inside the normalizer (never at load time).
import { placeUnpositionedSequenceNotes, type SequenceLayout } from './sequenceDiagramLayout';

export { SEQUENCE_MIN_PARTICIPANT_GAP };

const participantKinds: SequenceParticipantKind[] = ['actor', 'boundary', 'control', 'entity', 'object'];
const messageTypes: SequenceMessageType[] = ['synchronous', 'asynchronous', 'return', 'create', 'destroy'];
const fragmentOperators: SequenceFragmentOperator[] = ['alt', 'loop', 'opt', 'par', 'break', 'critical', 'ref'];
const numberingModes: SequenceNumberingMode[] = ['sequential', 'hierarchical', 'none'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asOptionalString = (value: unknown): string | undefined => {
  const normalized = asString(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};
const asOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

type DeterministicIdAllocation = {
  id: string;
  originalId?: string;
  repair?: 'missing' | 'duplicate';
};

const createDeterministicIdFactory = (prefix: string) => {
  const usedIds = new Set<string>();

  return (candidate: unknown, ordinal: number): DeterministicIdAllocation => {
    const normalized = asString(candidate).trim();
    const base = normalized.length > 0 ? normalized : `${prefix}-${ordinal + 1}`;
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return {
        id: base,
        ...(normalized.length > 0 ? { originalId: normalized } : {}),
        ...(normalized.length === 0 ? { repair: 'missing' as const } : {}),
      };
    }

    let suffix = 2;
    let id = `${base}~${suffix}`;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `${base}~${suffix}`;
    }
    usedIds.add(id);
    return {
      id,
      ...(normalized.length > 0 ? { originalId: normalized } : {}),
      repair: normalized.length > 0 ? 'duplicate' : 'missing',
    };
  };
};

const normalizationValueLabel = (value: unknown): string => {
  if (value === undefined) return 'ausente';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const createEmptySequenceDiagramContent = (): SequenceDiagramContent => ({
  version: 1,
  classDiagramArtifactId: undefined,
  flowArtifactId: undefined,
  numbering: 'sequential',
  showActivations: true,
  participants: [],
  items: [],
  activations: [],
  problems: [],
  notes: [],
  canvas: { width: 2400, height: 1800 },
});

export const normalizeSequenceDiagramContent = (value: unknown): SequenceDiagramContent => {
  const content = isRecord(value) ? value : {};
  const persistedRepairs: SequenceDiagramProblem[] = Array.isArray(content.problems)
    ? content.problems.filter(isRecord).flatMap((problem): SequenceDiagramProblem[] => {
        if (problem.code !== 'normalization-repair') return [];
        return [{
          id: asString(problem.id),
          code: 'normalization-repair',
          severity: 'warning',
          message: asString(problem.message),
          ...(asOptionalString(problem.messageId) ? { messageId: asOptionalString(problem.messageId) } : {}),
          ...(asOptionalString(problem.participantId) ? { participantId: asOptionalString(problem.participantId) } : {}),
          ...(asOptionalString(problem.fragmentId) ? { fragmentId: asOptionalString(problem.fragmentId) } : {}),
          ...(asOptionalString(problem.operandId) ? { operandId: asOptionalString(problem.operandId) } : {}),
        }];
      })
    : [];
  const normalizationRepairs: SequenceDiagramProblem[] = [];
  const repairIds = new Set(persistedRepairs.map((problem) => problem.id));
  const addRepair = (
    id: string,
    message: string,
    details: Pick<SequenceDiagramProblem, 'messageId' | 'participantId' | 'fragmentId' | 'operandId'> = {},
  ): void => {
    if (repairIds.has(id)) return;
    repairIds.add(id);
    normalizationRepairs.push({ id, code: 'normalization-repair', severity: 'warning', message, ...details });
  };
  const reportIdRepair = (
    domain: string,
    location: string,
    allocation: DeterministicIdAllocation,
    details: Pick<SequenceDiagramProblem, 'messageId' | 'participantId' | 'fragmentId' | 'operandId'> = {},
  ): void => {
    if (allocation.repair === undefined) return;
    const reason = allocation.repair === 'duplicate'
      ? `El ID duplicado ${normalizationValueLabel(allocation.originalId)} se remapeó a ${normalizationValueLabel(allocation.id)}.`
      : `Se asignó el ID determinista ${normalizationValueLabel(allocation.id)} porque faltaba el ID.`;
    addRepair(`normalization-repair:${domain}:${location}:id`, reason, details);
  };

  const participantId = createDeterministicIdFactory('participant');
  const participantIdRemap = new Map<string, string>();
  const participants: SequenceParticipant[] = Array.isArray(content.participants)
    ? content.participants.filter(isRecord).map((participant, index) => {
        const allocation = participantId(participant.id, index);
        if (allocation.originalId !== undefined && !participantIdRemap.has(allocation.originalId)) {
          participantIdRemap.set(allocation.originalId, allocation.id);
        }
        reportIdRepair('participant', String(index), allocation, { participantId: allocation.id });
        const kindIsValid = participantKinds.includes(participant.kind as SequenceParticipantKind);
        if (!kindIsValid) {
          addRepair(
            `normalization-repair:participant:${allocation.id}:kind`,
            `El kind de participante ${normalizationValueLabel(participant.kind)} se reemplazó por "object".`,
            { participantId: allocation.id },
          );
        }
        return {
          id: allocation.id,
          kind: kindIsValid ? (participant.kind as SequenceParticipantKind) : 'object',
          name: asString(participant.name),
          classifierName: asString(participant.classifierName),
          classifierNodeId: asOptionalString(participant.classifierNodeId),
          x: clamp(asNumber(participant.x, 170 + index * 230), 90, 100_000),
          createdByMessageId: asOptionalString(participant.createdByMessageId),
          destroyedByMessageId: asOptionalString(participant.destroyedByMessageId),
          terminateLifeline: asOptionalBoolean(participant.terminateLifeline),
        };
      })
    : [];
  const participantIds = new Set(participants.map((participant) => participant.id));
  const remapParticipantId = (candidate: unknown): string => {
    const normalized = asString(candidate).trim();
    return participantIdRemap.get(normalized) ?? normalized;
  };
  const itemId = createDeterministicIdFactory('item');
  const operandId = createDeterministicIdFactory('operand');
  const messageIdRemap = new Map<string, string>();
  const fragmentIdRemap = new Map<string, string>();
  const operandIdRemap = new Map<string, string>();
  const normalizedOperandIds = new Set<string>();
  let itemOrdinal = 0;
  let operandOrdinal = 0;

  const normalizeMessage = (message: Record<string, unknown>, location: string): SequenceMessage => {
    const allocation = itemId(message.id, itemOrdinal);
    itemOrdinal += 1;
    if (allocation.originalId !== undefined && !messageIdRemap.has(allocation.originalId)) {
      messageIdRemap.set(allocation.originalId, allocation.id);
    }
    reportIdRepair('message', location, allocation, { messageId: allocation.id });
    const typeIsValid = messageTypes.includes(message.type as SequenceMessageType);
    const type = typeIsValid ? (message.type as SequenceMessageType) : 'synchronous';
    if (!typeIsValid) {
      addRepair(
        `normalization-repair:message:${allocation.id}:type`,
        `El type de mensaje ${normalizationValueLabel(message.type)} se reemplazó por "synchronous".`,
        { messageId: allocation.id },
      );
    }

    return {
      id: allocation.id,
      kind: 'message',
      type,
      sourceId: remapParticipantId(message.sourceId),
      targetId: remapParticipantId(message.targetId),
      name: type === 'return' ? '' : asString(message.name),
      arguments: type === 'return' ? '' : asString(message.arguments),
      parameterValues: type === 'return' ? '' : asString(message.parameterValues),
      returnType: type === 'return' ? '' : asString(message.returnType),
      operationMethodId: asOptionalString(message.operationMethodId),
      replyToMessageId: asOptionalString(message.replyToMessageId),
      flowReference: asString(message.flowReference),
    };
  };

  const normalizeItems = (items: unknown, parentLocation = 'root'): SequenceTimelineItem[] => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.flatMap((item, index): SequenceTimelineItem[] => {
      const location = `${parentLocation}.${index}`;
      if (!isRecord(item)) {
        addRepair(
          `normalization-repair:item:${location}:invalid`,
          `Se omitió un elemento de timeline inválido en ${location}; su valor era ${normalizationValueLabel(item)}.`,
        );
        return [];
      }

      if (item.kind === 'message') {
        return [normalizeMessage(item, location)];
      }

      if (item.kind !== 'fragment') {
        addRepair(
          `normalization-repair:item:${location}:kind`,
          `Se omitió un elemento con kind inválido ${normalizationValueLabel(item.kind)} en ${location}.`,
        );
        return [];
      }

      const allocation = itemId(item.id, itemOrdinal);
      itemOrdinal += 1;
      if (allocation.originalId !== undefined && !fragmentIdRemap.has(allocation.originalId)) {
        fragmentIdRemap.set(allocation.originalId, allocation.id);
      }
      reportIdRepair('fragment', location, allocation, { fragmentId: allocation.id });
      const operatorIsValid = fragmentOperators.includes(item.operator as SequenceFragmentOperator);
      const operator = operatorIsValid ? (item.operator as SequenceFragmentOperator) : 'alt';
      if (!operatorIsValid) {
        addRepair(
          `normalization-repair:fragment:${allocation.id}:operator`,
          `El operador ${normalizationValueLabel(item.operator)} se reemplazó por "alt".`,
          { fragmentId: allocation.id },
        );
      }
      const rawOperands = Array.isArray(item.operands) ? item.operands : [];
      if (!Array.isArray(item.operands)) {
        addRepair(
          `normalization-repair:fragment:${allocation.id}:operands-shape`,
          'El fragmento no tenía una lista de operandos válida; se conservó sin operandos.',
          { fragmentId: allocation.id },
        );
      }
      const operands: SequenceFragmentOperand[] = rawOperands.flatMap((operand, operandIndex): SequenceFragmentOperand[] => {
        const operandLocation = `${location}.operand.${operandIndex}`;
        if (!isRecord(operand)) {
          addRepair(
            `normalization-repair:operand:${operandLocation}:invalid`,
            `Se omitió un operando inválido en ${operandLocation}; su valor era ${normalizationValueLabel(operand)}.`,
            { fragmentId: allocation.id },
          );
          return [];
        }
        const operandAllocation = operandId(operand.id, operandOrdinal);
        operandOrdinal += 1;
        normalizedOperandIds.add(operandAllocation.id);
        if (operandAllocation.originalId !== undefined && !operandIdRemap.has(operandAllocation.originalId)) {
          operandIdRemap.set(operandAllocation.originalId, operandAllocation.id);
        }
        reportIdRepair('operand', operandLocation, operandAllocation, {
          fragmentId: allocation.id,
          operandId: operandAllocation.id,
        });
        return [{
          id: operandAllocation.id,
          guard: asString(operand.guard),
          items: normalizeItems(operand.items, operandLocation),
        }];
      });
      const minimumOperands = operator === 'alt' || operator === 'par' ? 2 : 1;
      if (operands.length < minimumOperands) {
        addRepair(
          `normalization-repair:fragment:${allocation.id}:operand-count`,
          `El fragmento ${operator} conserva ${operands.length} ${operands.length === 1 ? 'operando' : 'operandos'}; no se inventaron operandos de relleno.`,
          { fragmentId: allocation.id },
        );
      }

      const rawX = (item as { x?: unknown }).x;
      const rawY = (item as { y?: unknown }).y;
      const rawWidth = (item as { width?: unknown }).width;
      const rawHeight = (item as { height?: unknown }).height;
      const x = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : undefined;
      const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : undefined;
      const width = typeof rawWidth === 'number' && Number.isFinite(rawWidth) ? Math.max(140, rawWidth) : undefined;
      const height = typeof rawHeight === 'number' && Number.isFinite(rawHeight) ? Math.max(60, rawHeight) : undefined;

      const interactionArtifactId = asOptionalString((item as { interactionArtifactId?: unknown }).interactionArtifactId);
      const startParticipantId = asOptionalString(item.startParticipantId) === undefined
        ? undefined
        : remapParticipantId(item.startParticipantId);
      const endParticipantId = asOptionalString(item.endParticipantId) === undefined
        ? undefined
        : remapParticipantId(item.endParticipantId);
      if (startParticipantId !== undefined && !participantIds.has(startParticipantId)) {
        addRepair(
          `normalization-repair:fragment:${allocation.id}:start-participant`,
          `El fragmento conserva startParticipantId ${normalizationValueLabel(startParticipantId)}, aunque la referencia no existe.`,
          { fragmentId: allocation.id, participantId: startParticipantId },
        );
      }
      if (endParticipantId !== undefined && !participantIds.has(endParticipantId)) {
        addRepair(
          `normalization-repair:fragment:${allocation.id}:end-participant`,
          `El fragmento conserva endParticipantId ${normalizationValueLabel(endParticipantId)}, aunque la referencia no existe.`,
          { fragmentId: allocation.id, participantId: endParticipantId },
        );
      }

      return [{
        id: allocation.id,
        kind: 'fragment',
        operator,
        name: asString(item.name),
        startParticipantId,
        endParticipantId,
        operands,
        ...(interactionArtifactId !== undefined ? { interactionArtifactId } : {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      }];
    });
  };

  const items = normalizeItems(content.items);
  const remapMessageId = (candidate: unknown): string | undefined => {
    const normalized = asOptionalString(candidate);
    return normalized === undefined ? undefined : (messageIdRemap.get(normalized) ?? normalized);
  };
  const remapFragmentId = (candidate: unknown): string | undefined => {
    const normalized = asOptionalString(candidate);
    return normalized === undefined ? undefined : (fragmentIdRemap.get(normalized) ?? normalized);
  };
  const remapOperandId = (candidate: unknown): string | undefined => {
    const normalized = asOptionalString(candidate);
    return normalized === undefined ? undefined : (operandIdRemap.get(normalized) ?? normalized);
  };
  const remapTimelineReferences = (timeline: SequenceTimelineItem[]): SequenceTimelineItem[] => timeline.map((item) => {
    if (item.kind === 'message') {
      return { ...item, replyToMessageId: remapMessageId(item.replyToMessageId) };
    }
    return {
      ...item,
      operands: item.operands.map((operand) => ({
        ...operand,
        items: remapTimelineReferences(operand.items),
      })),
    };
  });
  const remappedItems = remapTimelineReferences(items);
  const messageIds = new Set(flattenSequenceItems(remappedItems)
    .filter((entry): entry is SequenceFlatEntry & { item: SequenceMessage } => entry.item.kind === 'message')
    .map((entry) => entry.item.id));
  const fragmentIds = new Set(flattenSequenceItems(remappedItems)
    .filter((entry): entry is SequenceFlatEntry & { item: SequenceFragment } => entry.item.kind === 'fragment')
    .map((entry) => entry.item.id));

  const uniqueActivationId = createDeterministicIdFactory('activation');
  const activations: SequenceActivation[] = Array.isArray(content.activations)
    ? content.activations.filter(isRecord).flatMap((activation, index): SequenceActivation[] => {
        const allocation = uniqueActivationId(activation.id, index);
        reportIdRepair('activation', String(index), allocation);
        const participantId = remapParticipantId(activation.participantId);
        const startMessageId = remapMessageId(activation.startMessageId) ?? '';
        const endMessageId = remapMessageId(activation.endMessageId);
        const rawEndScope = isRecord(activation.endScope) ? activation.endScope : undefined;
        const endScopeFragmentId = remapFragmentId(rawEndScope?.fragmentId);
        const endScopeOperandId = remapOperandId(rawEndScope?.operandId);
        const brokenReferences = [
          !participantIds.has(participantId) ? `participantId ${normalizationValueLabel(participantId)}` : undefined,
          !messageIds.has(startMessageId) ? `startMessageId ${normalizationValueLabel(startMessageId)}` : undefined,
          endMessageId !== undefined && !messageIds.has(endMessageId)
            ? `endMessageId ${normalizationValueLabel(endMessageId)}`
            : undefined,
          endScopeFragmentId !== undefined && !fragmentIds.has(endScopeFragmentId)
            ? `endScope.fragmentId ${normalizationValueLabel(endScopeFragmentId)}`
            : undefined,
          endScopeOperandId !== undefined && !normalizedOperandIds.has(endScopeOperandId)
            ? `endScope.operandId ${normalizationValueLabel(endScopeOperandId)}`
            : undefined,
        ].filter((reference): reference is string => reference !== undefined);
        if (brokenReferences.length > 0) {
          addRepair(
            `normalization-repair:activation:${allocation.id}:references`,
            `La activación conserva referencias inválidas: ${brokenReferences.join(', ')}.`,
            { participantId, messageId: startMessageId },
          );
        }
        return [{
          id: allocation.id,
          participantId,
          startMessageId,
          endMessageId,
          ...(endScopeFragmentId !== undefined && endScopeOperandId !== undefined
            ? { endScope: { fragmentId: endScopeFragmentId, operandId: endScopeOperandId } }
            : {}),
          level: clamp(Math.round(asNumber(activation.level, 0)), 0, 12),
          manual: activation.manual === true,
        }];
      })
    : [];

  const uniqueNoteId = createDeterministicIdFactory('note');
  const unpositionedNoteIds = new Set<string>();
  const notes: SequenceNote[] = Array.isArray(content.notes)
    ? content.notes.filter(isRecord).map((note, index) => {
        const allocation = uniqueNoteId(note.id, index);
        reportIdRepair('note', String(index), allocation);
        const anchorKindIsValid = note.anchorKind === 'free' || note.anchorKind === 'message'
          || note.anchorKind === 'fragment' || note.anchorKind === 'participant';
        const anchorKind = note.anchorKind === 'message' || note.anchorKind === 'fragment' || note.anchorKind === 'participant'
          ? note.anchorKind
          : 'free';
        if (!anchorKindIsValid) {
          addRepair(
            `normalization-repair:note:${allocation.id}:anchor-kind`,
            `El anchorKind ${normalizationValueLabel(note.anchorKind)} se reemplazó por "free" sin eliminar anchorId.`,
          );
        }
        const rawAnchorId = asOptionalString(note.anchorId);
        const anchorId = anchorKind === 'message'
          ? remapMessageId(rawAnchorId)
          : anchorKind === 'fragment'
            ? remapFragmentId(rawAnchorId)
            : anchorKind === 'participant'
              ? (rawAnchorId === undefined ? undefined : remapParticipantId(rawAnchorId))
              : rawAnchorId;
        const anchorExists = anchorKind === 'message'
          ? anchorId !== undefined && messageIds.has(anchorId)
          : anchorKind === 'fragment'
            ? anchorId !== undefined && fragmentIds.has(anchorId)
            : anchorKind === 'participant'
              ? anchorId !== undefined && participantIds.has(anchorId)
              : false;

        const color: SequenceNoteColor | undefined =
          note.color === 'yellow' || note.color === 'red' || note.color === 'green' || note.color === 'blue'
            ? note.color
            : undefined;

        if (anchorKind !== 'free' && !anchorExists) {
          addRepair(
            `normalization-repair:note:${allocation.id}:broken-anchor`,
            `La nota conserva su anchor ${anchorKind} a ${normalizationValueLabel(anchorId)}, aunque la referencia no existe.`,
          );
        }

        if (!isFiniteNumber(note.x) || !isFiniteNumber(note.y)) unpositionedNoteIds.add(allocation.id);
        return {
          id: allocation.id,
          text: asString(note.text),
          x: clamp(asNumber(note.x, 100), 0, 100_000),
          y: clamp(asNumber(note.y, 180), 0, 200_000),
          width: clamp(asNumber(note.width, 220), 120, 100_000),
          height: clamp(asNumber(note.height, 110), 70, 200_000),
          anchorKind,
          anchorId,
          color,
        };
      })
    : [];

  const canvas = isRecord(content.canvas) ? content.canvas : {};

  const normalized: SequenceDiagramContent = {
    version: 1,
    classDiagramArtifactId: (content as { classDiagramArtifactId?: unknown }).classDiagramArtifactId === null
      ? null
      : asOptionalString(content.classDiagramArtifactId),
    flowArtifactId: asOptionalString(content.flowArtifactId),
    numbering: numberingModes.includes(content.numbering as SequenceNumberingMode)
      ? (content.numbering as SequenceNumberingMode)
      : 'sequential',
    showActivations: content.showActivations !== false,
    participantColors: (content as { participantColors?: unknown }).participantColors === 'disabled' ? 'disabled' : 'automatic',
    ...((content as { spacing?: unknown }).spacing === 'compact' ? { spacing: 'compact' as const } : {}),
    participants,
    items: remappedItems,
    activations,
    problems: [...persistedRepairs, ...normalizationRepairs],
    notes,
    canvas: {
      width: clamp(asNumber(canvas.width, 2400), 1200, 100_000),
      height: clamp(asNumber(canvas.height, 1800), 900, 200_000),
    },
  };

  const semantics = analyzeSequenceDiagramSemantics(normalized);
  const createdByParticipant = semantics.lifecycle.createdByParticipant;
  const destroyedByParticipant = semantics.lifecycle.destroyedByParticipant;

  const withLifecycle: SequenceDiagramContent = {
    ...normalized,
    participants: normalized.participants.map((participant) => ({
      ...participant,
      createdByMessageId: createdByParticipant.get(participant.id),
      destroyedByMessageId: destroyedByParticipant.get(participant.id),
    })),
    problems: [...persistedRepairs, ...normalizationRepairs, ...semantics.problems],
  };
  // A note written without x/y is placed beside what it annotates instead of
  // piling up in the top-left corner.
  return unpositionedNoteIds.size === 0
    ? withLifecycle
    : { ...withLifecycle, notes: placeUnpositionedSequenceNotes(withLifecycle, unpositionedNoteIds) };
};

export type SequenceDiagramMutationResult = {
  content: SequenceDiagramContent;
  accepted: boolean;
  newProblems: SequenceDiagramProblem[];
  newWarnings: SequenceDiagramProblem[];
};

/**
 * Single gate for editor mutations. Imports call the normalizer directly so
 * malformed projects remain recoverable; interactive changes may not add a
 * new error. Temporal warnings (a return left outside its call's fragment,
 * an ambiguous activation across branches...) are accepted and listed in the
 * review panel, so fragments can be placed wherever the author wants.
 */
export const applySequenceDiagramMutation = (
  current: SequenceDiagramContent,
  candidate: SequenceDiagramContent,
): SequenceDiagramMutationResult => {
  const currentProblems = new Set(current.problems.map((problem) => problem.id));
  const content = normalizeSequenceDiagramContent(candidate);
  const added = content.problems.filter((problem) => !currentProblems.has(problem.id));
  const newProblems = added.filter((problem) => problem.severity === 'error');
  return {
    content,
    accepted: newProblems.length === 0,
    newProblems,
    newWarnings: added.filter((problem) => problem.severity !== 'error'),
  };
};

export type SequenceFlatEntry = {
  item: SequenceTimelineItem;
  depth: number;
  parentFragmentId?: string;
  operandId?: string;
  index: number;
};

/**
 * Describes the timeline slot selected by a canvas Y coordinate.
 * `relativeToId` can be passed to insertSequenceItem as `afterItemId`, while
 * `placement: 'before'` is handled with insertSequenceItemBefore. When there
 * is no relative item, `parentFragmentId` + `operandId` are directly
 * compatible with insertSequenceItem's operand options.
 */
export type SequenceInsertionTarget = {
  placement: 'before' | 'after' | 'end';
  relativeToId?: string;
  parentFragmentId?: string;
  operandId?: string;
};

/**
 * Optional context for an insertion chosen from a message gesture.  A plain
 * Y coordinate is still supported for legacy/keyboard fragment insertion,
 * while message insertion can require both endpoints to be inside the
 * candidate operand's horizontal frame.
 */
export type SequenceInsertionContext = {
  sourceId?: string;
  targetId?: string;
};

type SequenceLayoutBounds = { top: number; bottom: number };

const layoutBounds = (layout: SequenceLayout, item: SequenceTimelineItem): SequenceLayoutBounds => {
  if (item.kind === 'message') {
    const message = layout.messageLayouts.get(item.id);
    if (message !== undefined) return { top: message.top, bottom: message.top + message.height };
  } else {
    const fragment = layout.fragmentLayouts.get(item.id);
    if (fragment !== undefined) return { top: fragment.y, bottom: fragment.y + fragment.height };
  }
  return { top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY };
};

type SequenceScope = {
  items: SequenceTimelineItem[];
  parentFragmentId?: string;
  operandId?: string;
  top: number;
  bottom: number;
};

const findOperandScope = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  y: number,
  context?: SequenceInsertionContext,
): SequenceScope | undefined => {
  const endpointIds = [context?.sourceId, context?.targetId]
    .filter((id): id is string => id !== undefined && id.length > 0);
  const horizontalEnvelopeForItems = (candidateItems: SequenceTimelineItem[]): { left: number; right: number } | undefined => {
    const xs: number[] = [];
    const collect = (nestedItems: SequenceTimelineItem[]): void => {
      nestedItems.forEach((nestedItem) => {
        if (nestedItem.kind === 'message') {
          const sourceX = layout.participantX.get(nestedItem.sourceId);
          const targetX = layout.participantX.get(nestedItem.targetId);
          if (sourceX !== undefined) xs.push(sourceX);
          if (targetX !== undefined) xs.push(targetX);
          return;
        }
        nestedItem.operands.forEach((nestedOperand) => collect(nestedOperand.items));
      });
    };
    collect(candidateItems);
    if (xs.length === 0) return undefined;
    return { left: Math.min(...xs), right: Math.max(...xs) };
  };
  const frameContainsEndpoints = (
    frame: { x: number; width: number },
    candidateItems: SequenceTimelineItem[],
  ): boolean => {
    if (endpointIds.length === 0) return true;
    const contentEnvelope = horizontalEnvelopeForItems(candidateItems);
    const left = Math.max(frame.x, contentEnvelope?.left ?? Number.NEGATIVE_INFINITY);
    const right = Math.min(frame.x + frame.width, contentEnvelope?.right ?? Number.POSITIVE_INFINITY);
    return endpointIds.every((id) => {
      const x = layout.participantX.get(id);
      return x !== undefined && x >= left && x <= right;
    });
  };

  let best: SequenceScope | undefined;
  items.forEach((item) => {
    if (item.kind !== 'fragment') return;
    const fragmentLayout = layout.fragmentLayouts.get(item.id);
    item.operands.forEach((operand) => {
      const operandLayout = fragmentLayout?.operands.find((candidate) => candidate.id === operand.id);
      const frame = fragmentLayout ?? { x: Number.NEGATIVE_INFINITY, width: Number.POSITIVE_INFINITY };
      const canEnterOperand = frameContainsEndpoints(frame, operand.items);
      if (operandLayout !== undefined && y >= operandLayout.top && y <= operandLayout.bottom && canEnterOperand) {
        const candidate: SequenceScope = {
          items: operand.items,
          parentFragmentId: item.id,
          operandId: operand.id,
          top: operandLayout.top,
          bottom: operandLayout.bottom,
        };
        if (best === undefined || candidate.bottom - candidate.top <= best.bottom - best.top) best = candidate;
      }
      const nested = canEnterOperand ? findOperandScope(operand.items, layout, y, context) : undefined;
      if (nested !== undefined && (best === undefined || nested.bottom - nested.top <= best.bottom - best.top)) best = nested;
    });
  });
  return best;
};

/** Resolve a canvas Y coordinate to the insertion slot in the visible timeline. */
export const resolveSequenceInsertionTarget = (
  items: SequenceTimelineItem[],
  layout: SequenceLayout,
  canvasY: number,
  _context?: SequenceInsertionContext,
): SequenceInsertionTarget => {
  const y = Number.isFinite(canvasY) ? canvasY : 0;
  const scope = findOperandScope(items, layout, y, _context);
  const scopeItems = scope?.items ?? items;
  const children = scopeItems.map((item) => ({ item, bounds: layoutBounds(layout, item) }));

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const center = child.bounds.top + (child.bounds.bottom - child.bounds.top) / 2;
    if (y < center) {
      return {
        placement: 'before',
        relativeToId: child.item.id,
        ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
        ...(scope?.operandId ? { operandId: scope.operandId } : {}),
      };
    }
    const next = children[index + 1];
    if (next === undefined || y < next.bounds.top + (next.bounds.bottom - next.bounds.top) / 2) {
      return {
        placement: 'after',
        relativeToId: child.item.id,
        ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
        ...(scope?.operandId ? { operandId: scope.operandId } : {}),
      };
    }
  }
  return {
    placement: 'end',
    ...(scope?.parentFragmentId ? { parentFragmentId: scope.parentFragmentId } : {}),
    ...(scope?.operandId ? { operandId: scope.operandId } : {}),
  };
};

/** Insert an item in the slot selected by a canvas Y coordinate. */
export const insertSequenceItemAtY = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  layout: SequenceLayout,
  canvasY: number,
  context?: SequenceInsertionContext,
): SequenceTimelineItem[] => {
  const target = resolveSequenceInsertionTarget(
    items,
    layout,
    canvasY,
    context ?? (item.kind === 'message'
      ? { sourceId: item.sourceId, targetId: item.targetId }
      : undefined),
  );
  if (target.placement === 'before' && target.relativeToId !== undefined) {
    return insertSequenceItemBefore(items, item, target.relativeToId);
  }
  if (target.relativeToId !== undefined) {
    return insertSequenceItem(items, item, { afterItemId: target.relativeToId });
  }
  if (target.parentFragmentId !== undefined && target.operandId !== undefined) {
    return insertSequenceItem(items, item, {
      fragmentId: target.parentFragmentId,
      operandId: target.operandId,
    });
  }
  return insertSequenceItem(items, item);
};

export const flattenSequenceItems = (
  items: SequenceTimelineItem[],
  depth = 0,
  parentFragmentId?: string,
  operandId?: string,
): SequenceFlatEntry[] => items.flatMap((item, index) => {
  const entry: SequenceFlatEntry = { item, depth, parentFragmentId, operandId, index };
  if (item.kind === 'message') {
    return [entry];
  }
  return [
    entry,
    ...item.operands.flatMap((operand) =>
      flattenSequenceItems(operand.items, depth + 1, item.id, operand.id)),
  ];
});

/**
 * Repairs only references whose targets existed before an interactive edit
 * and were removed by that edit. Preexisting dangling references are kept so
 * importing a recoverable legacy document does not silently erase evidence.
 */
export const reconcileRemovedSequenceReferences = (
  before: SequenceDiagramContent,
  after: SequenceDiagramContent,
): SequenceDiagramContent => {
  const collectTargets = (content: SequenceDiagramContent) => {
    const entries = flattenSequenceItems(content.items);
    const messageIds = new Set(entries.filter((entry) => entry.item.kind === 'message').map((entry) => entry.item.id));
    const fragmentIds = new Set(entries.filter((entry) => entry.item.kind === 'fragment').map((entry) => entry.item.id));
    const scopeKeys = new Set(entries.flatMap((entry) => entry.item.kind === 'fragment'
      ? entry.item.operands.map((operand) => `${entry.item.id}\u0000${operand.id}`)
      : []));
    return {
      messageIds,
      fragmentIds,
      scopeKeys,
      participantIds: new Set(content.participants.map((participant) => participant.id)),
    };
  };
  const oldTargets = collectTargets(before);
  const newTargets = collectTargets(after);
  const targetWasRemoved = (kind: SequenceNote['anchorKind'], id: string): boolean => {
    if (kind === 'message') return oldTargets.messageIds.has(id) && !newTargets.messageIds.has(id);
    if (kind === 'fragment') return oldTargets.fragmentIds.has(id) && !newTargets.fragmentIds.has(id);
    if (kind === 'participant') return oldTargets.participantIds.has(id) && !newTargets.participantIds.has(id);
    return false;
  };

  return {
    ...after,
    activations: after.activations.flatMap((activation) => {
      const participantRemoved = oldTargets.participantIds.has(activation.participantId)
        && !newTargets.participantIds.has(activation.participantId);
      const startRemoved = oldTargets.messageIds.has(activation.startMessageId)
        && !newTargets.messageIds.has(activation.startMessageId);
      const endRemoved = activation.endMessageId !== undefined
        && oldTargets.messageIds.has(activation.endMessageId)
        && !newTargets.messageIds.has(activation.endMessageId);
      if (participantRemoved || startRemoved || endRemoved) return [];
      if (activation.endScope === undefined) return [activation];
      const scopeKey = `${activation.endScope.fragmentId}\u0000${activation.endScope.operandId}`;
      return oldTargets.scopeKeys.has(scopeKey) && !newTargets.scopeKeys.has(scopeKey)
        ? [{ ...activation, endScope: undefined }]
        : [activation];
    }),
    notes: after.notes.map((note) => note.anchorId !== undefined && targetWasRemoved(note.anchorKind, note.anchorId)
      ? { ...note, anchorKind: 'free', anchorId: undefined }
      : note),
  };
};

type ParticipantLifecycleState = 'alive' | 'not-created' | 'destroyed' | 'conditional';

type SemanticScope = {
  fragmentId?: string;
  operandId?: string;
};

type MessageExecutionPosition = {
  order: number;
  scopePath: Required<SemanticScope>[];
};

type RuntimeActivation = {
  key: string;
  participantId: string;
  startMessageId: string;
  level: number;
  syntheticCaller?: boolean;
  endScope?: Required<SemanticScope>;
};

type SemanticState = {
  lifecycle: Map<string, ParticipantLifecycleState>;
  openByParticipant: Map<string, RuntimeActivation[]>;
};

type ActivationRecord = {
  participantId: string;
  startMessageId: string;
  level: number;
  endMessageIds: Set<string>;
  endScope?: Required<SemanticScope>;
  remainsOpenAtRoot: boolean;
  /** A bar already open before a branch closes only on some paths. */
  hasDivergentTermination: boolean;
};

export type SequenceDiagramSemanticAnalysis = {
  activations: SequenceActivation[];
  problems: SequenceDiagramProblem[];
  validMessageIds: Set<string>;
  lifecycle: {
    createdByParticipant: Map<string, string>;
    destroyedByParticipant: Map<string, string>;
  };
};

const startsExecution = (message: SequenceMessage): boolean =>
  message.type === 'synchronous' || message.type === 'asynchronous';

const cloneSemanticState = (state: SemanticState): SemanticState => ({
  lifecycle: new Map(state.lifecycle),
  openByParticipant: new Map(Array.from(state.openByParticipant, ([participantId, stack]) => [
    participantId,
    stack.map((activation) => ({ ...activation })),
  ])),
});

const mergeSemanticStates = (
  states: SemanticState[],
  participantIds: string[],
): SemanticState => {
  if (states.length === 0) {
    return {
      lifecycle: new Map(),
      openByParticipant: new Map(),
    };
  }

  const lifecycle = new Map<string, ParticipantLifecycleState>();
  const openByParticipant = new Map<string, RuntimeActivation[]>();
  participantIds.forEach((participantId) => {
    const values = states.map((state) => state.lifecycle.get(participantId) ?? 'conditional');
    lifecycle.set(participantId, values.every((value) => value === values[0]) ? values[0] : 'conditional');

    const firstStack = states[0].openByParticipant.get(participantId) ?? [];
    const common = firstStack.filter((activation) => states.every((state) =>
      (state.openByParticipant.get(participantId) ?? []).some((candidate) => candidate.key === activation.key)));
    if (common.length > 0) {
      openByParticipant.set(participantId, common.map((activation) => ({ ...activation })));
    }
  });

  return { lifecycle, openByParticipant };
};

/**
 * Computes the temporal meaning of a sequence diagram without discarding any
 * imported item. Invalid items stay in the document and are exposed as
 * structured problems, but they cannot open/close derived activations or
 * alter participant lifetime.
 */
export type AnalyzeSequenceDiagramSemanticsOptions = {
  existingArtifactIds?: Set<string> | string[] | readonly string[];
};

export const analyzeSequenceDiagramSemantics = (
  content: SequenceDiagramContent,
  options?: AnalyzeSequenceDiagramSemanticsOptions,
): SequenceDiagramSemanticAnalysis => {
  const existingArtifactIdSet = options?.existingArtifactIds
    ? (options.existingArtifactIds instanceof Set
      ? options.existingArtifactIds
      : new Set(options.existingArtifactIds))
    : undefined;
  const problems: SequenceDiagramProblem[] = [];
  const problemIds = new Set<string>();
  const validMessageIds = new Set<string>();
  const participantIds = content.participants.map((participant) => participant.id);
  const participantIdSet = new Set(participantIds);
  const entries = flattenSequenceItems(content.items);
  const messages = entries
    .filter((entry): entry is SequenceFlatEntry & { item: SequenceMessage } => entry.item.kind === 'message')
    .map((entry) => entry.item);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const messagePositions = new Map<string, MessageExecutionPosition>();
  let messageOrder = 0;
  const indexMessagePositions = (
    items: SequenceTimelineItem[],
    scopePath: Required<SemanticScope>[] = [],
  ): void => {
    items.forEach((item) => {
      if (item.kind === 'message') {
        messagePositions.set(item.id, { order: messageOrder, scopePath });
        messageOrder += 1;
        return;
      }
      item.operands.forEach((operand) => indexMessagePositions(
        operand.items,
        [...scopePath, { fragmentId: item.id, operandId: operand.id }],
      ));
    });
  };
  indexMessagePositions(content.items);
  const explicitlyReturnedCallIds = new Set<string>();
  messages.forEach((message) => {
    if (message.type !== 'return' || message.replyToMessageId === undefined) return;
    const call = messagesById.get(message.replyToMessageId);
    const callPosition = call === undefined ? undefined : messagePositions.get(call.id);
    const returnPosition = messagePositions.get(message.id);
    const sameScope = callPosition !== undefined
      && returnPosition !== undefined
      && callPosition.scopePath.length === returnPosition.scopePath.length
      && callPosition.scopePath.every((scope, index) => {
        const other = returnPosition.scopePath[index];
        return scope.fragmentId === other.fragmentId && scope.operandId === other.operandId;
      });
    if (call !== undefined
      && startsExecution(call)
      && call.sourceId === message.targetId
      && call.targetId === message.sourceId
      && callPosition !== undefined
      && returnPosition !== undefined
      && callPosition.order < returnPosition.order
      && sameScope) {
      explicitlyReturnedCallIds.add(call.id);
    }
  });
  const participantsWithCreate = new Set(messages
    .filter((message) => message.type === 'create' && participantIdSet.has(message.targetId))
    .map((message) => message.targetId));
  const activationRecords = new Map<string, ActivationRecord>();
  const implicitCompletionMessageIds = new Set<string>();
  const validCreates = new Map<string, Set<string>>();
  const validDestroys = new Map<string, Set<string>>();

  const addProblem = (
    code: SequenceDiagramProblemCode,
    message: string,
    details: Omit<SequenceDiagramProblem, 'id' | 'code' | 'severity' | 'message'> = {},
    severity: SequenceDiagramProblem['severity'] = 'error',
    identity?: string,
  ): void => {
    const id = identity ?? [
      code,
      details.messageId ?? '',
      details.participantId ?? '',
      details.fragmentId ?? '',
      details.operandId ?? '',
      details.activationId ?? '',
    ].join(':');
    if (problemIds.has(id)) return;
    problemIds.add(id);
    problems.push({ id, code, severity, message, ...details });
  };

  const registerLifecycleEvent = (events: Map<string, Set<string>>, participantId: string, messageId: string): void => {
    const ids = events.get(participantId) ?? new Set<string>();
    ids.add(messageId);
    events.set(participantId, ids);
  };

  const initialState: SemanticState = {
    lifecycle: new Map(participantIds.map((participantId) => [
      participantId,
      participantsWithCreate.has(participantId) ? 'not-created' : 'alive',
    ])),
    openByParticipant: new Map(),
  };

  const requireAlive = (
    state: SemanticState,
    participantId: string,
    message: SequenceMessage,
    scope: SemanticScope,
  ): boolean => {
    if (!participantIdSet.has(participantId)) {
      addProblem(
        'missing-participant-reference',
        'El mensaje referencia un participante que no existe.',
        { messageId: message.id, participantId, ...scope },
      );
      return false;
    }

    const lifecycle = state.lifecycle.get(participantId) ?? 'conditional';
    if (lifecycle === 'alive') return true;
    if (lifecycle === 'not-created') {
      addProblem(
        'message-before-create',
        'El mensaje usa un participante antes de su create().',
        { messageId: message.id, participantId, ...scope },
      );
      return false;
    }
    if (lifecycle === 'destroyed') {
      addProblem(
        'message-after-destroy',
        'El mensaje usa un participante después de su destroy().',
        { messageId: message.id, participantId, ...scope },
      );
      return false;
    }

    // Created in only some paths (a create inside an opt, alt or loop): authors
    // commonly keep using it afterwards, so it is a review warning, not a block.
    addProblem(
      'conditional-participant-lifecycle',
      'El participante no está vivo en todos los caminos que llegan a este mensaje.',
      { messageId: message.id, participantId, ...scope },
      'warning',
    );
    state.lifecycle.set(participantId, 'alive');
    return true;
  };

  const openActivation = (
    state: SemanticState,
    participantId: string,
    messageId: string,
    scope: SemanticScope,
    syntheticCaller = false,
  ): void => {
    const stack = state.openByParticipant.get(participantId) ?? [];
    const level = stack.length;
    const key = `${participantId}:${messageId}:${level}`;
    const endScope = scope.fragmentId !== undefined && scope.operandId !== undefined
      ? { fragmentId: scope.fragmentId, operandId: scope.operandId }
      : undefined;
    const activation: RuntimeActivation = {
      key,
      participantId,
      startMessageId: messageId,
      level,
      ...(syntheticCaller ? { syntheticCaller: true } : {}),
      ...(endScope ? { endScope } : {}),
    };
    stack.push(activation);
    state.openByParticipant.set(participantId, stack);
    if (!activationRecords.has(key)) {
      activationRecords.set(key, {
        participantId,
        startMessageId: messageId,
        level,
        endMessageIds: new Set(),
        ...(endScope ? { endScope } : {}),
        remainsOpenAtRoot: false,
        hasDivergentTermination: false,
      });
    }
  };

  const closeActivation = (state: SemanticState, participantId: string, activationIndex: number, messageId: string): void => {
    const stack = state.openByParticipant.get(participantId) ?? [];
    const [activation] = stack.splice(activationIndex, 1);
    if (activation !== undefined) {
      activationRecords.get(activation.key)?.endMessageIds.add(messageId);
    }
    if (stack.length === 0) state.openByParticipant.delete(participantId);
    else state.openByParticipant.set(participantId, stack);
  };

  const processMessage = (
    state: SemanticState,
    message: SequenceMessage,
    scope: SemanticScope,
    messageIndex?: number,
    lastImplicitReturnIndexByRoute?: Map<string, number>,
  ): void => {
    if (!participantIdSet.has(message.sourceId) || !participantIdSet.has(message.targetId)) {
      if (!participantIdSet.has(message.sourceId)) {
        addProblem('missing-participant-reference', 'El mensaje referencia un participante de origen inexistente.', {
          messageId: message.id,
          participantId: message.sourceId,
          ...scope,
        });
      }
      if (!participantIdSet.has(message.targetId)) {
        addProblem('missing-participant-reference', 'El mensaje referencia un participante de destino inexistente.', {
          messageId: message.id,
          participantId: message.targetId,
          ...scope,
        });
      }
      return;
    }

    if (message.type === 'create') {
      const targetState = state.lifecycle.get(message.targetId) ?? 'conditional';
      const isInsideFragment = scope.fragmentId !== undefined;
      if (targetState !== 'not-created') {
        const code: SequenceDiagramProblemCode = targetState === 'alive'
          ? 'duplicate-create'
          : targetState === 'destroyed'
            ? 'create-after-destroy'
            : 'conditional-participant-lifecycle';
        const text = targetState === 'alive'
          ? 'El participante ya está vivo; create() no puede repetirse.'
          : targetState === 'destroyed'
            ? 'No se puede ejecutar create() después de destroy().'
            : 'El create() depende de un ciclo de vida diferente según la rama.';
        addProblem(
          code,
          text,
          { messageId: message.id, participantId: message.targetId, ...scope },
          isInsideFragment ? 'warning' : 'error',
        );
        return;
      }
      const sourceIsAlive = requireAlive(state, message.sourceId, message, scope);
      if (!sourceIsAlive) return;
      state.lifecycle.set(message.targetId, 'alive');
      registerLifecycleEvent(validCreates, message.targetId, message.id);
      validMessageIds.add(message.id);
      return;
    }

    if (message.type === 'destroy') {
      const targetState = state.lifecycle.get(message.targetId) ?? 'conditional';
      const isInsideFragment = scope.fragmentId !== undefined;
      if (targetState !== 'alive') {
        const code: SequenceDiagramProblemCode = targetState === 'not-created'
          ? 'destroy-before-create'
          : targetState === 'destroyed'
            ? 'duplicate-destroy'
            : 'conditional-participant-lifecycle';
        const text = targetState === 'not-created'
          ? 'No se puede destruir un participante antes de su create().'
          : targetState === 'destroyed'
            ? 'El participante ya fue destruido; destroy() no puede repetirse.'
            : 'El destroy() depende de un ciclo de vida diferente según la rama.';
        addProblem(
          code,
          text,
          { messageId: message.id, participantId: message.targetId, ...scope },
          isInsideFragment ? 'warning' : 'error',
        );
        return;
      }
      const sourceIsAlive = requireAlive(state, message.sourceId, message, scope);
      if (!sourceIsAlive) return;
      validMessageIds.add(message.id);
      const targetStack = state.openByParticipant.get(message.targetId) ?? [];
      for (let index = targetStack.length - 1; index >= 0; index -= 1) {
        closeActivation(state, message.targetId, index, message.id);
      }
      state.lifecycle.set(message.targetId, 'destroyed');
      registerLifecycleEvent(validDestroys, message.targetId, message.id);
      return;
    }

    const sourceIsAlive = requireAlive(state, message.sourceId, message, scope);
    const targetIsAlive = requireAlive(state, message.targetId, message, scope);
    if (!sourceIsAlive || !targetIsAlive) {
      return;
    }

    if (message.type === 'return') {
      const stack = state.openByParticipant.get(message.sourceId) ?? [];
      const topIndex = stack.length - 1;
      const activationIndex = message.replyToMessageId !== undefined
        ? stack[topIndex]?.startMessageId === message.replyToMessageId ? topIndex : -1
        : topIndex;
      const activation = activationIndex >= 0 ? stack[activationIndex] : undefined;
      const call = activation === undefined ? undefined : messagesById.get(activation.startMessageId);
      const routeMatches = call !== undefined
        && startsExecution(call)
        && call.sourceId === message.targetId
        && call.targetId === message.sourceId;
      const closesTopOfStack = activationIndex === topIndex;
      if (activation === undefined || !routeMatches || !closesTopOfStack) {
        addProblem(
          'unmatched-return',
          'El retorno no tiene una llamada abierta compatible en este camino.',
          { messageId: message.id, ...scope },
          'warning',
        );
        validMessageIds.add(message.id);
        return;
      }
      validMessageIds.add(message.id);
      closeActivation(state, message.sourceId, activationIndex, message.id);
      const callerStack = state.openByParticipant.get(message.targetId) ?? [];
      const callerIndex = callerStack.length - 1;
      const callerActivation = callerStack[callerIndex];
      if (callerActivation?.syntheticCaller === true
        && callerActivation.startMessageId === call.id) {
        closeActivation(state, message.targetId, callerIndex, message.id);
      }
      return;
    }

    validMessageIds.add(message.id);
    const targetStack = state.openByParticipant.get(message.targetId) ?? [];
    const opensReceiverActivation = message.type === 'synchronous'
      || (message.type === 'asynchronous' && (message.sourceId === message.targetId || targetStack.length === 0));
    if (opensReceiverActivation) {
      const isSync = message.type === 'synchronous';
      const hasExplicitReturn = isSync && explicitlyReturnedCallIds.has(message.id);
      const hasImplicitReturnInCurrentScope = isSync
        && messageIndex !== undefined
        && (lastImplicitReturnIndexByRoute?.get(`${message.targetId}\0${message.sourceId}`) ?? -1) > messageIndex;
      // A synchronous call stays open only when a compatible return exists in
      // this temporal scope. The signature (including returnType) and method
      // name are intentionally irrelevant; otherwise it is an implicit
      // completion and the receiver gets a compact activation.
      const hasCompatibleReturn = hasExplicitReturn || hasImplicitReturnInCurrentScope;
      if (isSync && hasCompatibleReturn
        && (state.openByParticipant.get(message.sourceId)?.length ?? 0) === 0) {
        openActivation(state, message.sourceId, message.id, scope, true);
      }
      openActivation(state, message.targetId, message.id, scope);
      if (isSync && !hasCompatibleReturn) {
        const updatedStack = state.openByParticipant.get(message.targetId) ?? [];
        const actIndex = updatedStack.length - 1;
        if (actIndex >= 0) {
          implicitCompletionMessageIds.add(message.id);
          closeActivation(state, message.targetId, actIndex, message.id);
        }
      }
    }
  };

  const markDivergentTerminations = (before: SemanticState, outcomes: SemanticState[]): void => {
    before.openByParticipant.forEach((stack, participantId) => {
      stack.forEach((activation) => {
        const remainsOpen = outcomes.map((outcome) =>
          (outcome.openByParticipant.get(participantId) ?? []).some((candidate) => candidate.key === activation.key));
        if (remainsOpen.some(Boolean) && !remainsOpen.every(Boolean)) {
          const record = activationRecords.get(activation.key);
          if (record !== undefined) record.hasDivergentTermination = true;
        }
      });
    });
  };

  const processItems = (items: SequenceTimelineItem[], initial: SemanticState, scope: SemanticScope = {}): SemanticState => {
    let state = initial;
    const lastImplicitReturnIndexByRoute = new Map<string, number>();
    items.forEach((item, itemIndex) => {
      if (item.kind === 'message' && item.type === 'return' && item.replyToMessageId === undefined) {
        lastImplicitReturnIndexByRoute.set(`${item.sourceId}\0${item.targetId}`, itemIndex);
      }
    });
    items.forEach((item, itemIndex) => {
      if (item.kind === 'message') {
        processMessage(
          state,
          item,
          scope,
          itemIndex,
          lastImplicitReturnIndexByRoute,
        );
        return;
      }

      if (item.operator === 'ref') {
        if (!item.interactionArtifactId) {
          addProblem(
            'unlinked-interaction-reference',
            'El fragmento de referencia (ref) no tiene asignada una interacción referenciada.',
            { fragmentId: item.id },
            'warning',
            `unlinked-ref:${item.id}`,
          );
        } else if (existingArtifactIdSet && !existingArtifactIdSet.has(item.interactionArtifactId)) {
          addProblem(
            'broken-interaction-reference',
            'La interacción referenciada en el fragmento ref ya no existe en el proyecto.',
            { fragmentId: item.id },
            'error',
            `broken-ref:${item.id}`,
          );
        }
      }

      const branchScoped = item.operator === 'alt'
        || item.operator === 'par'
        || item.operator === 'opt'
        || item.operator === 'break';
      if (!branchScoped) {
        item.operands.forEach((operand) => {
          const operandState = processItems(operand.items, state, { fragmentId: item.id, operandId: operand.id });
          const nextLifecycle = new Map(operandState.lifecycle);
          if (item.operator === 'loop') {
            participantIds.forEach((participantId) => {
              const before = state.lifecycle.get(participantId);
              const after = operandState.lifecycle.get(participantId);
              if (before === 'not-created' && after === 'conditional') {
                nextLifecycle.set(participantId, 'alive');
              }
            });
          }
          const cleanedOpenByParticipant = new Map<string, RuntimeActivation[]>();
          operandState.openByParticipant.forEach((stack, participantId) => {
            const preserved = stack.filter((act) => act.endScope?.operandId !== operand.id && act.endScope?.fragmentId !== item.id);
            if (preserved.length > 0) {
              cleanedOpenByParticipant.set(participantId, preserved);
            }
          });
          state = {
            lifecycle: nextLifecycle,
            openByParticipant: cleanedOpenByParticipant,
          };
        });
        return;
      }

      const outcomes = item.operands.map((operand) => processItems(
        operand.items,
        cloneSemanticState(state),
        { fragmentId: item.id, operandId: operand.id },
      ));
      if (item.operator === 'opt' || item.operator === 'break') {
        outcomes.push(cloneSemanticState(state));
      }
      markDivergentTerminations(state, outcomes);
      const merged = mergeSemanticStates(outcomes, participantIds);
      const cleanedMergedOpen = new Map<string, RuntimeActivation[]>();
      merged.openByParticipant.forEach((stack, participantId) => {
        const preserved = stack.filter((act) => act.endScope?.fragmentId !== item.id);
        if (preserved.length > 0) {
          cleanedMergedOpen.set(participantId, preserved);
        }
      });
      state = {
        lifecycle: merged.lifecycle,
        openByParticipant: cleanedMergedOpen,
      };
    });
    return state;
  };

  const finalState = processItems(content.items, cloneSemanticState(initialState));
  finalState.openByParticipant.forEach((stack) => {
    stack.forEach((activation) => {
      const record = activationRecords.get(activation.key);
      if (record !== undefined && record.endScope === undefined) {
        record.remainsOpenAtRoot = true;
      }
    });
  });

  const createdByParticipant = new Map<string, string>();
  const destroyedByParticipant = new Map<string, string>();
  const selectLifecycleMarker = (
    events: Map<string, Set<string>>,
    target: Map<string, string>,
    kind: 'create' | 'destroy',
  ): void => {
    events.forEach((ids, participantId) => {
      if (ids.size === 1) {
        target.set(participantId, Array.from(ids)[0]);
        return;
      }
      addProblem(
        'ambiguous-lifecycle-marker',
        `El participante tiene más de un ${kind} válido en caminos independientes.`,
        { messageId: Array.from(ids)[0], participantId },
        'warning',
        `ambiguous-lifecycle-marker:${kind}:${participantId}`,
      );
    });
  };
  selectLifecycleMarker(validCreates, createdByParticipant, 'create');
  selectLifecycleMarker(validDestroys, destroyedByParticipant, 'destroy');

  const allDerivedActivations = Array.from(activationRecords.values()).flatMap((record): SequenceActivation[] => {
    if (record.hasDivergentTermination || record.endMessageIds.size > 1) {
      addProblem(
        'ambiguous-activation',
        record.hasDivergentTermination
          ? 'La activación se cierra sólo en algunos caminos de una rama.'
          : 'La misma activación se cierra de formas distintas según la rama.',
        {
          messageId: record.startMessageId,
          participantId: record.participantId,
          ...(record.endScope ?? {}),
        },
        'warning',
      );
      return [];
    }
    const endMessageId = Array.from(record.endMessageIds)[0];
    if (endMessageId === undefined && !record.remainsOpenAtRoot && record.endScope === undefined) return [];
    return [{
      id: `derived:${record.participantId}:${record.startMessageId}:${record.level}`,
      participantId: record.participantId,
      startMessageId: record.startMessageId,
      ...(endMessageId !== undefined ? { endMessageId } : {}),
      ...(endMessageId === undefined && !record.remainsOpenAtRoot && record.endScope !== undefined ? { endScope: record.endScope } : {}),
      level: record.level,
      manual: false,
    }];
  });

  // The actor starts the use case and waits for it: like Enterprise Architect,
  // its round trips draw one bar, from its first activation to its last.
  // Bars inside a fragment (even when explicitly closed) and nested callbacks
  // stay as they are: alternative paths cannot become one execution.
  const actorIds = new Set(content.participants.filter((participant) => participant.kind === 'actor').map((participant) => participant.id));
  const messageOrderOf = (messageId: string | undefined): number => messageId === undefined
    ? Number.POSITIVE_INFINITY
    : messagePositions.get(messageId)?.order ?? -1;
  const mergeActorActivations = (activations: SequenceActivation[]): SequenceActivation[] => {
    if (actorIds.size === 0) return activations;
    const byActor = new Map<string, SequenceActivation[]>();
    const rest: SequenceActivation[] = [];
    activations.forEach((activation) => {
      const startScope = messagePositions.get(activation.startMessageId)?.scopePath;
      if (!actorIds.has(activation.participantId) || activation.level !== 0
        || activation.endScope !== undefined || (startScope?.length ?? 0) > 0) {
        rest.push(activation);
        return;
      }
      byActor.set(activation.participantId, [...(byActor.get(activation.participantId) ?? []), activation]);
    });
    const merged = Array.from(byActor, ([participantId, bars]): SequenceActivation[] => {
      if (bars.length < 2) return bars;
      const first = bars.reduce((earliest, bar) => messageOrderOf(bar.startMessageId) < messageOrderOf(earliest.startMessageId) ? bar : earliest);
      const last = bars.reduce((latest, bar) => messageOrderOf(bar.endMessageId) > messageOrderOf(latest.endMessageId) ? bar : latest);
      return [{
        id: `derived:${participantId}:actor`,
        participantId,
        startMessageId: first.startMessageId,
        ...(last.endMessageId !== undefined ? { endMessageId: last.endMessageId } : {}),
        level: 0,
        manual: false,
      }];
    }).flat();
    return [...rest, ...merged];
  };

  const sameScopePath = (
    left: Required<SemanticScope>[],
    right: Required<SemanticScope>[],
  ): boolean => left.length === right.length && left.every((scope, index) =>
    scope.fragmentId === right[index].fragmentId && scope.operandId === right[index].operandId);
  const sameEndScope = (
    left: SequenceActivation['endScope'],
    right: SequenceActivation['endScope'],
  ): boolean => left?.fragmentId === right?.fragmentId && left?.operandId === right?.operandId;
  const invalidManualActivation = (activation: SequenceActivation, reason: string): void => {
    addProblem(
      'invalid-manual-activation',
      reason,
      {
        activationId: activation.id,
        messageId: activation.startMessageId,
        participantId: activation.participantId,
      },
      'error',
      `invalid-manual-activation:${activation.id}`,
    );
  };

  const derivedActivationByKey = new Map(allDerivedActivations.map((activation) => [
    `${activation.participantId}:${activation.startMessageId}:${activation.level}`,
    activation,
  ]));

  const manualActivations = content.activations.filter((activation) => activation.manual).flatMap((activation) => {
    const startMessage = messagesById.get(activation.startMessageId);
    const endMessage = activation.endMessageId === undefined
      ? undefined
      : messagesById.get(activation.endMessageId);
    const startPosition = messagePositions.get(activation.startMessageId);
    const endPosition = activation.endMessageId === undefined
      ? undefined
      : messagePositions.get(activation.endMessageId);
    const matchingDerived = derivedActivationByKey.get(
      `${activation.participantId}:${activation.startMessageId}:${activation.level}`,
    );
    // A legacy manual bar may have been left open on a call that is now
    // interpreted as an implicit completion. Keep the stored activation
    // untouched, but make its visual projection follow the compact derived
    // interval even if the stale end reference is no longer valid.
    if (matchingDerived !== undefined
      && implicitCompletionMessageIds.has(activation.startMessageId)
      && matchingDerived.endMessageId === activation.startMessageId) {
      const { endScope, ...activationWithoutEndScope } = activation;
      void endScope;
      return [{
        ...activationWithoutEndScope,
        endMessageId: matchingDerived.endMessageId,
        ...(matchingDerived.endScope !== undefined ? { endScope: matchingDerived.endScope } : {}),
      }];
    }
    const referencesAreValid = participantIdSet.has(activation.participantId)
      && startMessage !== undefined
      && startPosition !== undefined
      && validMessageIds.has(activation.startMessageId)
      && (activation.endMessageId === undefined
        || (endMessage !== undefined && endPosition !== undefined && validMessageIds.has(activation.endMessageId)));
    if (!referencesAreValid) {
      invalidManualActivation(
        activation,
        'La activación manual referencia un participante o mensaje temporalmente inválido.',
      );
      return [];
    }

    const startIncludesParticipant = startMessage.sourceId === activation.participantId
      || startMessage.targetId === activation.participantId;
    const endIncludesParticipant = endMessage === undefined
      || endMessage.sourceId === activation.participantId
      || endMessage.targetId === activation.participantId;
    if (!startIncludesParticipant || !endIncludesParticipant) {
      invalidManualActivation(
        activation,
        'La activación manual comienza o termina en un mensaje ajeno al participante.',
      );
      return [];
    }

    if (endPosition !== undefined && endPosition.order < startPosition.order) {
      invalidManualActivation(
        activation,
        'La activación manual termina antes de su mensaje de inicio.',
      );
      return [];
    }

    if (endPosition !== undefined && !sameScopePath(startPosition.scopePath, endPosition.scopePath)) {
      invalidManualActivation(
        activation,
        'La activación manual cruza ramas o scopes temporales incompatibles.',
      );
      return [];
    }

    const expectedScope = startPosition.scopePath.at(-1);
    if (activation.endScope !== undefined && !sameEndScope(activation.endScope, expectedScope)) {
      invalidManualActivation(
        activation,
        'El scope de cierre manual no coincide con el scope de inicio.',
      );
      return [];
    }

    if (matchingDerived !== undefined) {
      const hasExplicitDifferentEnd = activation.endMessageId !== undefined
        && activation.endMessageId !== matchingDerived.endMessageId;
      const hasExplicitDifferentScope = activation.endScope !== undefined
        && !sameEndScope(activation.endScope, matchingDerived.endScope);
      if (hasExplicitDifferentEnd || hasExplicitDifferentScope) {
        invalidManualActivation(
          activation,
          'La activación manual intenta reemplazar una activación derivada con otro cierre.',
        );
        return [];
      }
      return [{
        ...activation,
        ...(activation.endMessageId === undefined && matchingDerived.endMessageId !== undefined
          ? { endMessageId: matchingDerived.endMessageId }
          : {}),
        ...(activation.endScope === undefined && matchingDerived.endScope !== undefined
          ? { endScope: matchingDerived.endScope }
          : {}),
      }];
    }

    return [activation];
  });
  const manualKeys = new Set(manualActivations.map((activation) =>
    `${activation.participantId}:${activation.startMessageId}:${activation.level}`));
  const derivedActivations = mergeActorActivations(allDerivedActivations.filter((activation) =>
    !manualKeys.has(`${activation.participantId}:${activation.startMessageId}:${activation.level}`)));

  return {
    activations: [...derivedActivations, ...manualActivations],
    problems,
    validMessageIds,
    lifecycle: { createdByParticipant, destroyedByParticipant },
  };
};

/**
 * Everything "Revisar" lists: the repairs kept from reading the file, the
 * temporal problems, and authoring gaps a student usually wants to fix before
 * handing the diagram in (a call without a name, a fragment left empty, an
 * alt or par with a single branch). Duplicates are listed once.
 */
export const collectSequenceReviewProblems = (
  content: SequenceDiagramContent,
  semanticProblems: SequenceDiagramProblem[],
): SequenceDiagramProblem[] => {
  const authoring: SequenceDiagramProblem[] = [];
  const visit = (items: SequenceTimelineItem[]): void => items.forEach((item) => {
    if (item.kind === 'message') {
      if ((item.type === 'synchronous' || item.type === 'asynchronous') && item.name.replace(/\(.*$/, '').trim().length === 0) {
        authoring.push({ id: `unnamed-message:${item.id}`, code: 'unnamed-message', severity: 'warning', message: 'El mensaje no tiene nombre.', messageId: item.id });
      }
      return;
    }
    if (item.operator !== 'ref' && item.operands.every((operand) => operand.items.length === 0)) {
      authoring.push({ id: `empty-fragment:${item.id}`, code: 'incomplete-fragment', severity: 'warning', message: `El fragmento ${item.operator} está vacío.`, fragmentId: item.id });
    } else if ((item.operator === 'alt' || item.operator === 'par') && item.operands.length < 2) {
      authoring.push({ id: `single-branch:${item.id}`, code: 'incomplete-fragment', severity: 'warning', message: `El fragmento ${item.operator} tiene una sola rama; agregá otra o cambiá el operador.`, fragmentId: item.id });
    }
    item.operands.forEach((operand) => visit(operand.items));
  });
  visit(content.items);
  const repairs = content.problems.filter((problem) => problem.code === 'normalization-repair');
  const seen = new Set<string>();
  return [...semanticProblems, ...repairs, ...authoring].filter((problem) => {
    if (seen.has(problem.id)) return false;
    seen.add(problem.id);
    return true;
  });
};

export const findSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): SequenceTimelineItem | null => {
  for (const item of items) {
    if (item.id === itemId) {
      return item;
    }
    if (item.kind === 'fragment') {
      for (const operand of item.operands) {
        const nested = findSequenceItem(operand.items, itemId);
        if (nested !== null) {
          return nested;
        }
      }
    }
  }
  return null;
};

export const updateSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  updater: (item: SequenceTimelineItem) => SequenceTimelineItem,
): SequenceTimelineItem[] => items.map((item) => {
  if (item.id === itemId) {
    return updater(item);
  }
  if (item.kind === 'fragment') {
    return {
      ...item,
      operands: item.operands.map((operand) => ({
        ...operand,
        items: updateSequenceItem(operand.items, itemId, updater),
      })),
    };
  }
  return item;
});

export const removeSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): { items: SequenceTimelineItem[]; removed: SequenceTimelineItem | null } => {
  let removed: SequenceTimelineItem | null = null;
  const nextItems: SequenceTimelineItem[] = [];

  for (const item of items) {
    if (item.id === itemId) {
      removed = item;
      continue;
    }
    if (item.kind === 'fragment') {
      const nextOperands = item.operands.map((operand) => {
        const result = removeSequenceItem(operand.items, itemId);
        removed ??= result.removed;
        return { ...operand, items: result.items };
      });
      nextItems.push({ ...item, operands: nextOperands });
    } else {
      nextItems.push(item);
    }
  }

  return { items: nextItems, removed };
};

const appendToOperand = (
  items: SequenceTimelineItem[],
  fragmentId: string,
  operandId: string,
  item: SequenceTimelineItem,
): { items: SequenceTimelineItem[]; inserted: boolean } => {
  let inserted = false;
  const nextItems = items.map((currentItem) => {
    if (currentItem.kind !== 'fragment') {
      return currentItem;
    }
    if (currentItem.id === fragmentId) {
      return {
        ...currentItem,
        operands: currentItem.operands.map((operand) => {
          if (operand.id !== operandId) {
            return operand;
          }
          inserted = true;
          return { ...operand, items: [...operand.items, item] };
        }),
      };
    }
    return {
      ...currentItem,
      operands: currentItem.operands.map((operand) => {
        const result = appendToOperand(operand.items, fragmentId, operandId, item);
        inserted ||= result.inserted;
        return { ...operand, items: result.items };
      }),
    };
  });
  return { items: nextItems, inserted };
};

export const insertSequenceItem = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  options?: { afterItemId?: string; fragmentId?: string; operandId?: string },
): SequenceTimelineItem[] => {
  if (options?.fragmentId !== undefined && options.operandId !== undefined) {
    const result = appendToOperand(items, options.fragmentId, options.operandId, item);
    if (result.inserted) {
      return result.items;
    }
  }

  if (options?.afterItemId === undefined) {
    return [...items, item];
  }

  let inserted = false;
  const insertAfter = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const nextItems: SequenceTimelineItem[] = [];
    currentItems.forEach((currentItem) => {
      nextItems.push(currentItem);
      if (currentItem.id === options.afterItemId) {
        nextItems.push(item);
        inserted = true;
      } else if (currentItem.kind === 'fragment') {
        nextItems[nextItems.length - 1] = {
          ...currentItem,
          operands: currentItem.operands.map((operand) => ({
            ...operand,
            items: insertAfter(operand.items),
          })),
        };
      }
    });
    return nextItems;
  };

  const nextItems = insertAfter(items);
  return inserted ? nextItems : [...items, item];
};

export const insertSequenceItemBefore = (
  items: SequenceTimelineItem[],
  item: SequenceTimelineItem,
  beforeItemId: string,
): SequenceTimelineItem[] => {
  let inserted = false;
  const insertBefore = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const nextItems: SequenceTimelineItem[] = [];
    currentItems.forEach((currentItem) => {
      if (currentItem.id === beforeItemId) {
        nextItems.push(item);
        inserted = true;
      }
      nextItems.push(currentItem.kind === 'fragment'
        ? {
            ...currentItem,
            operands: currentItem.operands.map((operand) => ({
              ...operand,
              items: insertBefore(operand.items),
            })),
          }
        : currentItem);
    });
    return nextItems;
  };
  const nextItems = insertBefore(items);
  return inserted ? nextItems : [...items, item];
};

export const moveSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  direction: -1 | 1,
): SequenceTimelineItem[] => {
  const moveWithin = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    const index = currentItems.findIndex((item) => item.id === itemId);
    if (index >= 0) {
      const target = index + direction;
      if (target < 0 || target >= currentItems.length) {
        return currentItems;
      }
      const next = [...currentItems];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    }
    return currentItems.map((item) => item.kind === 'fragment'
      ? {
          ...item,
          operands: item.operands.map((operand) => ({ ...operand, items: moveWithin(operand.items) })),
        }
      : item);
  };
  return moveWithin(items);
};

export const reparentSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
  destination?: { fragmentId: string; operandId: string },
): SequenceTimelineItem[] => {
  const result = removeSequenceItem(items, itemId);
  if (result.removed === null) {
    return items;
  }
  if (result.removed.kind === 'fragment' && destination !== undefined) {
    const descendants = new Set(flattenSequenceItems(result.removed.operands.flatMap((operand) => operand.items))
      .filter((entry) => entry.item.kind === 'fragment')
      .map((entry) => entry.item.id));
    if (destination.fragmentId === itemId || descendants.has(destination.fragmentId)) {
      return items;
    }
  }
  return destination === undefined
    ? [...result.items, result.removed]
    : insertSequenceItem(result.items, result.removed, destination);
};

const cloneTimelineItemsWithReferences = (
  items: SequenceTimelineItem[],
  itemIdRemap = new Map<string, string>(),
): SequenceTimelineItem[] => {
  const collectIds = (currentItems: SequenceTimelineItem[]): void => {
    currentItems.forEach((item) => {
      itemIdRemap.set(item.id, createId());
      if (item.kind === 'fragment') {
        item.operands.forEach((operand) => collectIds(operand.items));
      }
    });
  };
  collectIds(items);

  const cloneItem = (item: SequenceTimelineItem): SequenceTimelineItem => {
    const id = itemIdRemap.get(item.id) ?? createId();
    if (item.kind === 'message') {
      const replyToMessageId = item.replyToMessageId === undefined
        ? undefined
        : itemIdRemap.get(item.replyToMessageId);
      return { ...item, id, replyToMessageId };
    }
    return {
      ...item,
      id,
      ...(item.x !== undefined ? { x: item.x + 30 } : {}),
      ...(item.y !== undefined ? { y: item.y + 30 } : {}),
      operands: item.operands.map((operand) => ({
        ...operand,
        id: createId(),
        items: operand.items.map(cloneItem),
      })),
    };
  };

  return items.map(cloneItem);
};

const cloneTimelineItem = (item: SequenceTimelineItem): SequenceTimelineItem =>
  cloneTimelineItemsWithReferences([item])[0];

export const duplicateSequenceItem = (
  items: SequenceTimelineItem[],
  itemId: string,
): { items: SequenceTimelineItem[]; duplicateId?: string } => {
  const source = findSequenceItem(items, itemId);
  if (source === null) {
    return { items };
  }
  const duplicate = cloneTimelineItem(source);
  return { items: insertSequenceItem(items, duplicate, { afterItemId: itemId }), duplicateId: duplicate.id };
};

/**
 * Devuelve los ids de primer nivel de un bloque (en orden de documento),
 * descartando ids inexistentes y los anidados dentro de otro fragmento del bloque.
 */
export const getTopLevelBlockIds = (
  items: SequenceTimelineItem[],
  ids: string[],
): string[] => {
  const entries = flattenSequenceItems(items);
  const order = new Map(entries.map((entry, index) => [entry.item.id, index] as const));
  const parentOf = new Map(entries.map((entry) => [entry.item.id, entry.parentFragmentId] as const));
  const selected = new Set(ids);
  return [...new Set(ids)]
    .filter((id) => order.has(id))
    .filter((id) => {
      let parent = parentOf.get(id);
      while (parent !== undefined) {
        if (selected.has(parent)) return false;
        parent = parentOf.get(parent);
      }
      return true;
    })
    .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
};

/**
 * Elimina varios elementos del árbol en una sola pasada.
 */
export const removeSequenceItemsBlock = (
  items: SequenceTimelineItem[],
  ids: string[],
): { items: SequenceTimelineItem[]; removed: SequenceTimelineItem[] } => {
  const topIds = getTopLevelBlockIds(items, ids);
  let working = items;
  const removed: SequenceTimelineItem[] = [];
  for (const id of topIds) {
    const result = removeSequenceItem(working, id);
    if (result.removed !== null) {
      removed.push(result.removed);
      working = result.items;
    }
  }
  return { items: working, removed };
};

/**
 * Mueve un bloque contiguo del mismo contenedor una posición hacia arriba o abajo.
 * Si el bloque no es contiguo, cruza contenedores o ya está en el borde,
 * devuelve el árbol sin cambios.
 */
export const moveSequenceItemsBlock = (
  items: SequenceTimelineItem[],
  ids: string[],
  direction: -1 | 1,
): SequenceTimelineItem[] => {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return items;

  const moveWithin = (currentItems: SequenceTimelineItem[]): SequenceTimelineItem[] => {
    if (uniqueIds.every((id) => currentItems.some((item) => item.id === id))) {
      const sortedIndices = uniqueIds
        .map((id) => currentItems.findIndex((item) => item.id === id))
        .sort((left, right) => left - right);
      for (let i = 1; i < sortedIndices.length; i += 1) {
        if (sortedIndices[i] !== sortedIndices[0] + i) return currentItems;
      }
      const min = sortedIndices[0];
      const max = sortedIndices[sortedIndices.length - 1];
      if (direction === -1 && min === 0) return currentItems;
      if (direction === 1 && max === currentItems.length - 1) return currentItems;
      const indexSet = new Set(sortedIndices);
      const block = sortedIndices.map((index) => currentItems[index]);
      const rest = currentItems.filter((_, index) => !indexSet.has(index));
      const insertAt = direction === -1 ? min - 1 : min + 1;
      return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
    }
    let changed = false;
    const nextItems = currentItems.map((item) => {
      if (item.kind !== 'fragment') return item;
      let operandsChanged = false;
      const nextOperands = item.operands.map((operand) => {
        const nextOperandItems = moveWithin(operand.items);
        if (nextOperandItems !== operand.items) operandsChanged = true;
        return nextOperandItems === operand.items ? operand : { ...operand, items: nextOperandItems };
      });
      if (!operandsChanged) return item;
      changed = true;
      return { ...item, operands: nextOperands };
    });
    return changed ? nextItems : currentItems;
  };
  return moveWithin(items);
};

/**
 * Clona elementos con identificadores nuevos (para copiar/pegar bloques).
 */
export const cloneSequenceTimelineItems = (
  items: SequenceTimelineItem[],
): SequenceTimelineItem[] => cloneTimelineItemsWithReferences(items);

/** Clone one clipboard block, remapping notes to copied messages and fragments. */
export const cloneSequenceBlock = (
  items: SequenceTimelineItem[],
  notes: SequenceNote[],
): { items: SequenceTimelineItem[]; notes: SequenceNote[] } => {
  const itemIdRemap = new Map<string, string>();
  const clonedItems = cloneTimelineItemsWithReferences(items, itemIdRemap);
  const clonedNotes = notes.map((note) => ({
    ...note,
    id: createId(),
    x: note.x + 24,
    y: note.y + 24,
    anchorId: (note.anchorKind === 'message' || note.anchorKind === 'fragment') && note.anchorId
      ? itemIdRemap.get(note.anchorId) ?? note.anchorId
      : note.anchorId,
  }));
  return { items: clonedItems, notes: clonedNotes };
};

export const createSequenceMessage = (
  type: SequenceMessageType,
  sourceId: string,
  targetId: string,
): SequenceMessage => ({
  id: createId(),
  kind: 'message',
  type,
  sourceId,
  targetId,
  name: type === 'create' ? 'create' : type === 'destroy' ? 'destroy' : '',
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
});

export const createSequenceFragment = (operator: SequenceFragmentOperator): SequenceFragment => ({
  id: createId(),
  kind: 'fragment',
  operator,
  name: '',
  operands: Array.from({ length: operator === 'alt' || operator === 'par' ? 2 : 1 }, (_, index) => ({
    id: createId(),
    guard: operator === 'alt' ? (index === 0 ? 'condición' : 'else') : '',
    items: [],
  })),
});

/** Clamp a dragged participant X so headers cannot overlap each other. */
export const clampParticipantX = (
  participants: SequenceParticipant[],
  participantId: string,
  x: number,
): number => resolveSequenceParticipantX(participants, participantId, x);

/**
 * Adjust operands when a fragment operator changes. Multi-section operators
 * (alt/par) get at least two operands; single-section operators merge the
 * content of extra operands into the first one so nothing is lost.
 */
export const adjustOperandsForOperator = (
  operator: SequenceFragmentOperator,
  operands: SequenceFragmentOperand[],
): SequenceFragmentOperand[] => {
  if (operator === 'alt' || operator === 'par') {
    const next = [...operands];
    while (next.length < 2) {
      next.push({ id: createId(), guard: '', items: [] });
    }
    return next;
  }
  if (operands.length <= 1) {
    return operands.length === 0 ? [{ id: createId(), guard: '', items: [] }] : operands;
  }
  const [first, ...rest] = operands;
  return [{
    ...first,
    items: [...first.items, ...rest.flatMap((operand) => operand.items)],
  }];
};

export const buildSequenceMessageNumbers = (content: SequenceDiagramContent): Map<string, string> => {
  const messages = flattenSequenceItems(content.items)
    .map((entry) => entry.item)
    .filter((item): item is SequenceMessage => item.kind === 'message');
  const numbers = new Map<string, string>();
  if (content.numbering === 'none') {
    return numbers;
  }

  if (content.numbering === 'sequential') {
    let counter = 0;
    messages.forEach((message) => {
      if (message.type !== 'return') {
        counter += 1;
        numbers.set(message.id, String(counter));
      }
    });
    return numbers;
  }

  let rootCounter = 0;
  const stack: Array<{ message: SequenceMessage; label: string; children: number }> = [];
  messages.forEach((message) => {
    if (message.type === 'return') {
      let replyIndex = stack.length - 1;
      if (message.replyToMessageId !== undefined) {
        replyIndex = -1;
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index].message.id === message.replyToMessageId) {
            replyIndex = index;
            break;
          }
        }
      }
      if (replyIndex >= 0) {
        stack.splice(replyIndex);
      }
      return;
    }

    let label: string;
    if (stack.length === 0) {
      rootCounter += 1;
      label = String(rootCounter);
    } else {
      const parent = stack[stack.length - 1];
      parent.children += 1;
      label = `${parent.label}.${parent.children}`;
    }
    numbers.set(message.id, label);
    if (message.type === 'synchronous' || message.type === 'create') {
      stack.push({ message, label, children: 0 });
    }
  });
  return numbers;
};

export const buildDerivedActivations = (content: SequenceDiagramContent): SequenceActivation[] =>
  analyzeSequenceDiagramSemantics(content).activations;

export const formatSequenceParticipantName = (participant: SequenceParticipant): string => {
  const rawName = participant.name ?? '';
  const rawClassifier = participant.classifierName ?? '';
  const name = rawName.trim();
  const cleanClassifier = rawClassifier.replace(/^:+/, '').trim();

  if (participant.kind === 'actor') {
    return name || 'Actor';
  }

  if (name.length > 0 && cleanClassifier.length > 0) {
    if (rawName.endsWith('\n') || rawClassifier.startsWith('\n')) {
      return `${name}\n:${cleanClassifier}`;
    }
    return `${name} : ${cleanClassifier}`;
  }
  if (cleanClassifier.length > 0) {
    return `:${cleanClassifier}`;
  }
  return name || ':Objeto';
};

export const formatSequenceMessageLabel = (message: SequenceMessage, number?: string): string => {
  if (message.type === 'return') {
    return '';
  }
  const parameterValues = (message.parameterValues ?? '').trim();
  const args = (message.arguments ?? '').trim();
  const values = parameterValues || args;
  const rawName = (message.name ?? '').trim();
  const name = rawName || (message.type === 'create' ? 'create' : message.type === 'destroy' ? 'destroy' : 'mensaje');
  const cleanName = name.endsWith('()') ? name.slice(0, -2).trim() : name;
  const call = cleanName.endsWith(')') ? cleanName : `${cleanName}(${formatArgumentList(values)})`;
  const returnType = (message.returnType ?? '').trim();
  const result = returnType.length > 0 ? `${call}: ${returnType}` : call;
  return number === undefined ? result : `${number}. ${result}`;
};
