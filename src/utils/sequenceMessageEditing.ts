import type {
  ClassModelArtifact,
  LegacyUseCaseFlowStep,
  SequenceMessage,
  SequenceMessageType,
  SequenceParticipant,
  SequenceParticipantKind,
  UseCaseFlowArtifact,
} from '../types/diagram';
import { createId } from './id';
import { computeFlowNumbering, formatAlternativeRef, isUseCaseFlowV2 } from './useCaseFlowModel';

/**
 * The one editing contract shared by the toolbar composer, the canvas dialog
 * and the inspector.  Optional fields deliberately keep old callers and old
 * projects source-compatible while the editor fills them with explicit
 * defaults.
 */
export type SequenceMessageEditModel = {
  editId?: string;
  sourceId: string;
  targetId: string;
  y: number;
  type: SequenceMessageType;
  name: string;
  arguments: string;
  parameterValues: string;
  returnType: string;
  operationMethodId?: string;
  replyToMessageId?: string;
  flowReference?: string;
  placement?: 'before' | 'after' | 'end';
  /** A new message from the toolbar goes right after this item (else at the end). */
  anchorItemId?: string;
  newParticipantKind?: SequenceParticipantKind;
  newParticipantName?: string;
};

export type SequenceMessageEditPatch = Pick<
  SequenceMessage,
  | 'sourceId'
  | 'targetId'
  | 'type'
  | 'name'
  | 'arguments'
  | 'parameterValues'
  | 'returnType'
  | 'operationMethodId'
  | 'replyToMessageId'
  | 'flowReference'
>;

export type SequenceMethodOption = {
  id: string;
  label: string;
  name: string;
  parameters: string;
  returnType: string;
  participantId: string;
  classNodeId?: string;
};

export type SequenceFlowOption = {
  value: string;
  label: string;
  flowId: string;
  stepId: string;
};

export type SequenceReferenceState = 'none' | 'available' | 'missing' | 'unavailable';

export type SequenceMessageReferenceStatus = {
  method: SequenceReferenceState;
  flow: SequenceReferenceState;
};

export const createSequenceMessageEditModel = (
  initial: Partial<SequenceMessageEditModel> = {},
): SequenceMessageEditModel => ({
  sourceId: '',
  targetId: '',
  y: 150,
  type: 'synchronous',
  name: '',
  arguments: '',
  parameterValues: '',
  returnType: '',
  flowReference: '',
  placement: 'end',
  newParticipantKind: 'object',
  newParticipantName: '',
  ...initial,
});

export const sequenceMessageEditModelFromMessage = (
  message: SequenceMessage,
  y = 150,
): SequenceMessageEditModel => createSequenceMessageEditModel({
  editId: message.id,
  sourceId: message.sourceId,
  targetId: message.targetId,
  y,
  type: message.type,
  name: message.name,
  arguments: message.arguments,
  parameterValues: message.parameterValues,
  returnType: message.returnType,
  operationMethodId: message.operationMethodId,
  replyToMessageId: message.replyToMessageId,
  flowReference: message.flowReference,
});

/**
 * Field changes that edit the textual signature invalidate a method ID.  The
 * text remains intact, so an unavailable or deliberately detached reference
 * never causes silent data loss.
 */
export const updateSequenceMessageEditModel = (
  draft: SequenceMessageEditModel,
  changes: Partial<SequenceMessageEditModel>,
): SequenceMessageEditModel => {
  const next = { ...draft, ...changes };
  // The arguments are the values this call passes, so filling them in keeps
  // the linked method; only naming a different operation drops the link.
  const renamesOperation = changes.name !== undefined && changes.name.trim() !== draft.name.trim();
  if (renamesOperation && !('operationMethodId' in changes)) {
    next.operationMethodId = undefined;
  }
  return next;
};

/**
 * Convert all three UI forms to the same persisted patch.  Temporal rules are
 * intentionally not duplicated here; callers pass the resulting content to
 * applySequenceDiagramMutation, the semantic gate in sequenceDiagram.ts.
 */
export const sequenceMessageEditModelToPatch = (
  draft: SequenceMessageEditModel,
): SequenceMessageEditPatch => {
  const noArgsOrReturn = draft.type === 'return' || draft.type === 'destroy';
  const noMethodReference = noArgsOrReturn || draft.type === 'create';
  const isReturn = draft.type === 'return';
  const name = isReturn
    ? ''
    : draft.type === 'destroy'
      ? 'destroy'
      : draft.name.trim() || (draft.type === 'create' ? 'create' : '');
  return {
    sourceId: draft.sourceId,
    targetId: draft.targetId,
    type: draft.type,
    name,
    arguments: noArgsOrReturn ? '' : draft.arguments,
    parameterValues: noArgsOrReturn ? '' : draft.parameterValues,
    returnType: noArgsOrReturn ? '' : draft.returnType.trim(),
    operationMethodId: noMethodReference ? undefined : draft.operationMethodId?.trim() || undefined,
    replyToMessageId: draft.replyToMessageId?.trim() || undefined,
    flowReference: draft.flowReference?.trim() ?? '',
  };
};

export const buildSequenceMessageFromEditModel = (
  draft: SequenceMessageEditModel,
  id = createId(),
): SequenceMessage => ({
  id,
  kind: 'message',
  ...sequenceMessageEditModelToPatch(draft),
});

export const reconcileMessageLifecycleMarkers = (
  participants: SequenceParticipant[],
  message: SequenceMessage,
  previous?: SequenceMessage,
): SequenceParticipant[] => participants.map((participant) => {
  let next = participant;
  if (previous?.type === 'create' && previous.targetId === participant.id && participant.createdByMessageId === previous.id) {
    next = { ...next, createdByMessageId: undefined };
  }
  if (previous?.type === 'destroy' && previous.targetId === participant.id && participant.destroyedByMessageId === previous.id) {
    next = { ...next, destroyedByMessageId: undefined };
  }
  if (message.type === 'create' && message.targetId === participant.id) {
    next = { ...next, createdByMessageId: message.id };
  }
  if (message.type === 'destroy' && message.targetId === participant.id) {
    next = { ...next, destroyedByMessageId: message.id };
  }
  return next;
});

/**
 * A call is owned by its receiver.  Returns, create and destroy carry no
 * operation method reference in the shared editor contract.
 */
export const getSequenceMethodOwnerId = (
  type: SequenceMessageType,
  targetId: string,
): string | undefined => {
  if (type === 'synchronous' || type === 'asynchronous') return targetId;
  return undefined;
};

const resolveParticipantClassNode = (
  participant: SequenceParticipant | undefined,
  classDiagram: ClassModelArtifact | undefined,
) => {
  if (!participant || !classDiagram) return undefined;
  const nodes = Array.isArray(classDiagram.content?.nodes) ? classDiagram.content.nodes : [];
  if (participant.classifierNodeId) {
    const linkedNode = nodes.find((node) => node.id === participant.classifierNodeId);
    if (linkedNode) return linkedNode;
  }
  const classifierName = participant.classifierName.trim().toLocaleLowerCase();
  if (!classifierName) return undefined;
  return nodes.find((node) => node.data.name.trim().toLocaleLowerCase() === classifierName);
};

export const getSequenceMethodOptions = ({
  model,
  participants,
  classDiagram,
}: {
  model: Pick<SequenceMessageEditModel, 'type' | 'sourceId' | 'targetId'>;
  participants: SequenceParticipant[];
  classDiagram?: ClassModelArtifact;
}): SequenceMethodOption[] => {
  const participantId = getSequenceMethodOwnerId(model.type, model.targetId);
  if (!participantId) return [];
  const participant = participants.find((candidate) => candidate.id === participantId);
  const classNode = resolveParticipantClassNode(participant, classDiagram);
  if (!participant || !classNode) return [];
  const methods = Array.isArray(classNode.data?.methods) ? classNode.data.methods : [];
  return methods.map((method) => ({
    id: method.id,
    label: `${classNode.data?.name || participant.classifierName || 'Clase'}.${method.name || 'método'}`,
    name: method.name,
    parameters: method.parameters,
    returnType: method.returnType,
    participantId,
    classNodeId: classNode.id,
  }));
};

export const swapSequenceMessageEditModel = (
  draft: SequenceMessageEditModel,
  methodsForNewTarget: SequenceMethodOption[] = [],
): SequenceMessageEditModel => {
  const methodStillBelongsToTarget = draft.operationMethodId === undefined
    || methodsForNewTarget.some((method) => method.id === draft.operationMethodId);
  return {
    ...draft,
    sourceId: draft.targetId,
    targetId: draft.sourceId,
    operationMethodId: methodStillBelongsToTarget ? draft.operationMethodId : undefined,
  };
};

const legacyFlowStepOption = (
  flowId: string,
  step: Partial<LegacyUseCaseFlowStep> & { id: string },
): SequenceFlowOption => {
  const value = (step.ref ?? '').trim() || step.id;
  const actor = (step.actor ?? '').trim();
  const system = (step.system ?? '').trim();
  const detail = [actor, system].filter(Boolean).join(' → ');
  return {
    value,
    label: detail ? `${value} · ${detail}` : value,
    flowId,
    stepId: step.id,
  };
};

export const getSequenceFlowOptions = (
  flows: UseCaseFlowArtifact[],
  selectedFlowId?: string,
): SequenceFlowOption[] => {
  if (!selectedFlowId) return [];
  const flow = flows.find((candidate) => candidate.id === selectedFlowId);
  if (!flow || !flow.content) return [];

  if (isUseCaseFlowV2(flow.content)) {
    const content = flow.content;
    const numbering = computeFlowNumbering(content);
    const altNumberById = new Map(content.alternativeFlows.map((alt) => [alt.id, alt.number]));
    const seen = new Set<string>();
    return numbering.entries.flatMap((entry) => {
      const value = entry.stepId;
      if (seen.has(value)) return [];
      seen.add(value);
      const prefix = entry.flowId === 'basic'
        ? `Paso ${entry.number}`
        : `${formatAlternativeRef(altNumberById.get(entry.flowId) ?? 1)} · Paso ${entry.number}`;
      return [{
        value,
        label: entry.label ? `${prefix} · ${entry.label}` : prefix,
        flowId: flow.id,
        stepId: entry.stepId,
      }];
    });
  }

  // Legacy v1 shape support for callers passing unnormalized fixtures directly.
  const raw = flow.content as unknown as {
    basicFlow?: Array<Partial<LegacyUseCaseFlowStep> & { id: string }>;
    alternativeFlows?: Array<{ steps?: Array<Partial<LegacyUseCaseFlowStep> & { id: string }> }>;
  };
  const basicFlow = Array.isArray(raw.basicFlow) ? raw.basicFlow : [];
  const alternativeFlows = Array.isArray(raw.alternativeFlows) ? raw.alternativeFlows : [];
  const steps = [
    ...basicFlow,
    ...alternativeFlows.flatMap((alternative) => (Array.isArray(alternative.steps) ? alternative.steps : [])),
  ];
  const seen = new Set<string>();
  return steps.flatMap((step) => {
    const option = legacyFlowStepOption(flow.id, step);
    if (seen.has(option.value)) return [];
    seen.add(option.value);
    return [option];
  });
};

export const getSequenceMessageReferenceStatus = (
  model: Pick<SequenceMessageEditModel, 'operationMethodId' | 'flowReference'>,
  methodOptions: SequenceMethodOption[],
  flowOptions: SequenceFlowOption[],
  selectedFlowId?: string,
): SequenceMessageReferenceStatus => {
  const flowReference = model.flowReference?.trim() ?? '';
  return {
    method: model.operationMethodId
      ? methodOptions.some((method) => method.id === model.operationMethodId) ? 'available' : 'missing'
      : 'none',
    flow: flowReference
      ? !selectedFlowId ? 'unavailable' : flowOptions.some((option) => option.value === flowReference) ? 'available' : 'missing'
      : 'none',
  };
};

export const parseMessageSignature = (text: string): {
  name: string;
  arguments: string;
  returnType: string;
} => {
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  if (!clean) return { name: '', arguments: '', returnType: '' };

  if (clean.startsWith(':')) {
    return {
      name: '',
      arguments: '',
      returnType: clean.slice(1).trim(),
    };
  }

  const firstParenIndex = clean.indexOf('(');
  if (firstParenIndex !== -1) {
    const rawName = clean.slice(0, firstParenIndex).trim();
    let depth = 0;
    let matchingParenIndex = -1;
    for (let i = firstParenIndex; i < clean.length; i++) {
      if (clean[i] === '(') {
        depth++;
      } else if (clean[i] === ')') {
        depth--;
        if (depth === 0) {
          matchingParenIndex = i;
          break;
        }
      }
    }

    if (matchingParenIndex !== -1) {
      const args = clean.slice(firstParenIndex + 1, matchingParenIndex).trim();
      const afterParen = clean.slice(matchingParenIndex + 1).trim();
      let returnType = '';
      if (afterParen.startsWith(':')) {
        returnType = afterParen.slice(1).trim();
      } else if (afterParen) {
        const colonIdx = afterParen.indexOf(':');
        returnType = colonIdx !== -1 ? afterParen.slice(colonIdx + 1).trim() : afterParen;
      }
      return {
        name: rawName,
        arguments: args,
        returnType,
      };
    }

    return {
      name: rawName,
      arguments: clean.slice(firstParenIndex + 1).trim(),
      returnType: '',
    };
  }

  const colonIndex = clean.indexOf(':');
  if (colonIndex !== -1) {
    return {
      name: clean.slice(0, colonIndex).trim(),
      arguments: '',
      returnType: clean.slice(colonIndex + 1).trim(),
    };
  }

  return {
    name: clean,
    arguments: '',
    returnType: '',
  };
};

/** Splits at the commas that separate arguments: not those inside parentheses, brackets, generics or quotes. */
const splitTopLevelCommas = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote !== null) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[' || char === '{' || char === '<') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}' || char === '>') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
};

/** Nesting deeper than this is shown as typed, so pathological input cannot overflow the stack. */
const MAX_CALL_NESTING_DEPTH = 32;

/** `a,b` → `a, b`, also inside nested calls. Commas that are not argument separators stay as they are. */
export const formatArgumentList = (args: string, depth = 0): string => {
  const parts = splitTopLevelCommas(args);

  if (parts.length > 1 && parts.some((part) => part.trim().length === 0)) {
    return args;
  }

  return parts.map((part) => formatCallText(part.trim(), depth)).join(', ');
};

/** Shows a call as `nombre(a, b)`; text that is not a call comes back as is. */
export const formatCallText = (text: string, depth = 0): string => {
  if (depth >= MAX_CALL_NESTING_DEPTH) return text;

  const match = /^([^(]*)\(([\s\S]*)\)$/.exec(text);
  return match === null ? text : `${match[1]}(${formatArgumentList(match[2], depth + 1)})`;
};

/**
 * A copy of the message with the arguments written as `a, b`, for showing it
 * (canvas, labels). The saved message is not changed.
 */
export const withReadableArguments = (message: SequenceMessage): SequenceMessage => ({
  ...message,
  name: formatCallText((message.name ?? '').trim()),
  arguments: formatArgumentList((message.arguments ?? '').trim()),
  parameterValues: formatArgumentList((message.parameterValues ?? '').trim()),
});

export const formatMessageSignature = (d: {
  type?: SequenceMessageType;
  name?: string;
  arguments?: string;
  parameterValues?: string;
  returnType?: string;
}): string => {
  if (d.type === 'return') return d.returnType || d.name || '';
  if (d.type === 'destroy') return d.name || 'destroy';
  if (!d.name && !d.arguments && !d.parameterValues && !d.returnType) {
    return d.type === 'create' ? 'create' : '';
  }
  if (d.name && d.name.includes('(')) {
    const name = formatCallText(d.name);
    return d.returnType ? `${name}: ${d.returnType}` : name;
  }
  const args = formatArgumentList((d.arguments || '').trim());
  const base = d.name ? (args ? `${d.name}(${args})` : `${d.name}()`) : (d.type === 'create' ? 'create' : '');
  return d.returnType ? `${base}: ${d.returnType}` : base;
};

export type SequenceSignatureDraft = {
  messageId: string;
  text: string;
  modelSignature: string;
};

/** Preserve incomplete text while typing, but let external edits and undo win. */
export const createSequenceSignatureDraft = (message: SequenceMessage, text: string): SequenceSignatureDraft => {
  const edited = updateSequenceMessageEditModel(sequenceMessageEditModelFromMessage(message), parseMessageSignature(text));
  return {
    messageId: message.id,
    text,
    modelSignature: formatMessageSignature(sequenceMessageEditModelToPatch(edited)),
  };
};

export const getSequenceSignatureInputValue = (message: SequenceMessage, draft: SequenceSignatureDraft | null): string => {
  const signature = formatMessageSignature(message);
  return draft?.messageId === message.id && draft.modelSignature === signature ? draft.text : signature;
};
