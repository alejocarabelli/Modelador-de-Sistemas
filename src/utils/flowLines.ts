import type {
  FlowActionNode,
  FlowConditionalNode,
  FlowDetailItem,
  FlowLoopNode,
  FlowMainStep,
  FlowRef,
  FlowSubNode,
  StepAnchorRef,
  UseCaseFlowContent,
} from '../types/diagram';
import { createId } from './id';
import {
  detectActorPrimitive,
  detectSystemPrimitive,
  formatFlowNameShort,
  inferActionSemantic,
  type FlowNumberingIndex,
} from './useCaseFlowModel';

/**
 * The flow editor shows a path as a list of lines, the way it is written on
 * paper, and stores it as the v2 tree. Every edit turns the lines back into a
 * tree; `treeToLines(linesToTree(lines))` must give the same lines back, or the
 * text would change under the caret.
 *
 * - `step`: a numbered line. Depth 0 is a main step (`4.`), depth 1 a sub-step
 *   (`4.1.`), deeper ones live inside a POR CADA / MIENTRAS / SI.
 * - `bullet`: a `•` line under the step above it (filters, attributes, fields).
 * - `end`: the FINSI after an SI block. Drawn, never edited or stored.
 */
export type FlowLineKind = 'step' | 'bullet' | 'end';

export type FlowEditLine = {
  id: string;
  kind: FlowLineKind;
  side: 'actor' | 'system';
  depth: number;
  text: string;
  refs: FlowRef[];
};

export const ELSE_SUFFIX = '#sino';
export const END_SUFFIX = '#finsi';

// `SI` in capitals, or `Si`/`si` once a space follows: «Sin», «Simular» are not conditions.
const conditionalPattern = /^(?:SI(?![\wÁÉÍÓÚÜÑáéíóúüñ])|[Ss]i\s)/;
const elsePattern = /^SINO\s*$/i;
const loopPattern = /^(?:por\s+cada|mientras)\b/i;
const anchorPattern =
  /\s*\(\s*paso\s+(\d+(?:\.\d+)*)\.?(?:\s+de(?:l)?\s+(camino\s+(?:principal|b[aá]sico)|CA\s*N?°?\s*\d+))?\s*\)\s*$/i;
const jumpPattern =
  /^(?:ir|retornar|volver)\s+a(?:l)?\s+paso\s+(\d+(?:\.\d+)*)\.?\s+de(?:l)?\s+(camino\s+(?:principal|b[aá]sico)|CA\s*N?°?\s*\d+)\s*$/i;

export type FlowLineContext = {
  content: UseCaseFlowContent;
  flowId: 'basic' | string;
  numbering: FlowNumberingIndex;
};

// ---------------------------------------------------------------------------
// Step anchors: `(paso 4.1)` in the text is stored as a link to that step, so
// it follows the step when the flow is renumbered.

const flowIdForLabel = (label: string | undefined, ctx: FlowLineContext): 'basic' | string | undefined => {
  if (label === undefined) return ctx.flowId;
  if (/^camino/i.test(label)) return 'basic';
  const digits = Number(/(\d+)\s*$/.exec(label)?.[1]);
  return ctx.content.alternativeFlows.find((flow) => flow.number === digits)?.id;
};

const resolveAnchor = (number: string, label: string | undefined, ctx: FlowLineContext): StepAnchorRef | undefined => {
  const flowId = flowIdForLabel(label, ctx);
  if (flowId === undefined) return undefined;
  const entry = ctx.numbering.entriesByFlowId.get(flowId)?.find((candidate) => candidate.number === number);
  return entry ? { flowId, stepId: entry.stepId } : undefined;
};

const anchorText = (anchor: StepAnchorRef, ctx: FlowLineContext): string | undefined => {
  const number = ctx.numbering.stepNumberById.get(anchor.stepId);
  if (number === undefined) return undefined;
  return anchor.flowId === ctx.flowId
    ? `(paso ${number})`
    : `(paso ${number} de ${formatFlowNameShort(anchor.flowId, ctx.content)})`;
};

const splitAnchor = (text: string, ctx: FlowLineContext): { stepRef?: StepAnchorRef; text: string } => {
  const match = anchorPattern.exec(text);
  if (!match) return { text };
  const stepRef = resolveAnchor(match[1], match[2], ctx);
  return stepRef ? { stepRef, text: text.slice(0, match.index) } : { text };
};

const withAnchor = (text: string, anchor: StepAnchorRef | undefined, ctx: FlowLineContext): string => {
  if (!anchor) return text;
  const suffix = anchorText(anchor, ctx);
  return suffix === undefined ? text : `${text} ${suffix}`;
};

const resolveJump = (text: string, ctx: FlowLineContext): StepAnchorRef | undefined => {
  const match = jumpPattern.exec(text.trim());
  return match ? resolveAnchor(match[1], match[2], ctx) : undefined;
};

/** The jump is stored as typed; only the number follows the target step. */
const jumpText = (text: string, target: StepAnchorRef | undefined, ctx: FlowLineContext): string => {
  if (!target) return text;
  const number = ctx.numbering.stepNumberById.get(target.stepId);
  if (number === undefined) return text;
  const match = jumpPattern.exec(text.trim());
  // Older data kept the link and a stale text («Ir a paso »): write it out from the link.
  if (!match) return `Ir a paso ${number} de ${formatFlowNameShort(target.flowId, ctx.content)}`;
  const start = text.indexOf(match[1]);
  return `${text.slice(0, start)}${number}${text.slice(start + match[1].length)}`;
};

// ---------------------------------------------------------------------------
// Tree → lines

/** `SI` and its condition. A space being typed right after SI must survive the round trip. */
const conditionText = (condition: string): string =>
  /^\s/.test(condition) ? `SI${condition}` : condition.length > 0 ? `SI ${condition}` : 'SI';

const conditionOf = (text: string): string => {
  const rest = text.slice(2);
  return /^ \S/.test(rest) ? rest.slice(1) : rest;
};

const detailLines = (details: FlowDetailItem[] | undefined, side: FlowEditLine['side'], depth: number, ctx: FlowLineContext): FlowEditLine[] =>
  (details ?? []).flatMap((detail) => [
    { id: detail.id, kind: 'bullet' as const, side, depth, text: withAnchor(detail.text, detail.stepRef, ctx), refs: [] },
    ...detailLines(detail.children, side, depth + 1, ctx),
  ]);

const subNodeLines = (nodes: FlowSubNode[], depth: number, ctx: FlowLineContext): FlowEditLine[] =>
  nodes.flatMap((node): FlowEditLine[] => {
    if (node.kind === 'action') {
      const side = node.speaker ?? 'system';
      const text = node.primitive === 'ir-a-paso' ? jumpText(node.text, node.jumpTarget, ctx) : withAnchor(node.text, node.stepRef, ctx);
      return [{ id: node.id, kind: 'step', side, depth, text, refs: node.refs }, ...detailLines(node.details, side, depth + 1, ctx)];
    }
    if (node.kind === 'loop') {
      return [
        { id: node.id, kind: 'step', side: 'system', depth, text: withAnchor(node.header, node.stepRef, ctx), refs: node.refs },
        ...detailLines(node.details, 'system', depth + 1, ctx),
        ...subNodeLines(node.children, depth + 1, ctx),
      ];
    }
    return [
      { id: node.id, kind: 'step', side: 'system', depth, text: conditionText(node.condition), refs: node.refs },
      ...subNodeLines(node.thenChildren, depth + 1, ctx),
      ...(node.elseChildren === undefined
        ? []
        : [
            { id: `${node.id}${ELSE_SUFFIX}`, kind: 'step' as const, side: 'system' as const, depth, text: 'SINO', refs: [] },
            ...subNodeLines(node.elseChildren, depth + 1, ctx),
          ]),
      { id: `${node.id}${END_SUFFIX}`, kind: 'end', side: 'system', depth, text: 'FINSI', refs: [] },
    ];
  });

export const treeToLines = (steps: FlowMainStep[], ctx: FlowLineContext): FlowEditLine[] =>
  steps.flatMap((step) => [
    {
      id: step.id,
      kind: 'step' as const,
      side: step.speaker,
      depth: 0,
      text: step.jumpTarget ? jumpText(step.title, step.jumpTarget, ctx) : withAnchor(step.title, step.stepRef, ctx),
      refs: step.refs,
    },
    ...detailLines(step.details, step.speaker, 1, ctx),
    ...subNodeLines(step.children, 1, ctx),
  ]);

// ---------------------------------------------------------------------------
// Lines → tree

type Container =
  | { depth: number; kind: 'main'; node: FlowMainStep }
  | { depth: number; kind: 'loop'; node: FlowLoopNode }
  | { depth: number; kind: 'conditional'; node: FlowConditionalNode; inElse: boolean };

type DetailOwner = { depth: number; details: FlowDetailItem[] };

const childList = (container: Container): FlowSubNode[] => {
  if (container.kind === 'main') return container.node.children;
  if (container.kind === 'loop') return container.node.children;
  if (container.inElse) {
    container.node.elseChildren ??= [];
    return container.node.elseChildren;
  }
  return container.node.thenChildren;
};

const buildAction = (line: FlowEditLine, ctx: FlowLineContext): FlowActionNode => {
  const speaker = line.side;
  const primitive = speaker === 'actor' ? detectActorPrimitive(line.text) : detectSystemPrimitive(line.text);
  const jumpTarget = primitive === 'ir-a-paso' ? resolveJump(line.text, ctx) : undefined;
  const { stepRef, text } = jumpTarget ? { stepRef: undefined, text: line.text } : splitAnchor(line.text, ctx);
  const semantic = inferActionSemantic(primitive, text);
  return {
    id: line.id,
    kind: 'action',
    ...(speaker === 'actor' ? { speaker } : {}),
    primitive,
    text,
    ...(semantic ? { semantic } : {}),
    details: [],
    ...(stepRef ? { stepRef } : {}),
    ...(jumpTarget ? { jumpTarget } : {}),
    refs: line.refs,
  };
};

const loopTarget = (header: string): string | undefined =>
  /instancias?\s+(?:de\s+)?([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ]*)/.exec(header)?.[1];

export const linesToTree = (lines: FlowEditLine[], ctx: FlowLineContext): FlowMainStep[] => {
  const steps: FlowMainStep[] = [];
  let stack: Container[] = [];
  let owners: DetailOwner[] = [];

  for (const line of lines) {
    if (line.kind === 'end') continue;

    if (line.kind === 'bullet' && owners.length > 0) {
      const depth = Math.max(line.depth, owners[0].depth + 1);
      while (owners.length > 1 && owners[owners.length - 1].depth >= depth) owners.pop();
      const parent = owners[owners.length - 1];
      const { stepRef, text } = splitAnchor(line.text, ctx);
      const detail: FlowDetailItem = { id: line.id, text, ...(stepRef ? { stepRef } : {}) };
      parent.details.push(detail);
      detail.children = [];
      owners.push({ depth: parent.depth + 1, details: detail.children });
      continue;
    }

    const depth = steps.length === 0 ? 0 : line.depth;

    if (depth === 0) {
      const primitive = line.side === 'actor' ? detectActorPrimitive(line.text) : detectSystemPrimitive(line.text);
      const jumpTarget = primitive === 'ir-a-paso' ? resolveJump(line.text, ctx) : undefined;
      const { stepRef, text } = jumpTarget ? { stepRef: undefined, text: line.text } : splitAnchor(line.text, ctx);
      const semantic = inferActionSemantic(primitive, text);
      const step: FlowMainStep = {
        id: line.id,
        speaker: line.side,
        ...(primitive === 'custom' ? {} : { primitive }),
        title: text,
        ...(semantic ? { semantic } : {}),
        ...(jumpTarget ? { jumpTarget } : {}),
        ...(stepRef ? { stepRef } : {}),
        refs: line.refs,
        children: [],
      };
      steps.push(step);
      stack = [{ depth: 0, kind: 'main', node: step }];
      step.details = [];
      owners = [{ depth: 0, details: step.details }];
      continue;
    }

    // Close every block this line is not inside of. A line deeper than its
    // block allows is pulled back to the first depth that can hold it.
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const container = stack[stack.length - 1];
    const siblings = childList(container);
    const last = siblings[siblings.length - 1];

    if (elsePattern.test(line.text.trim()) && last?.kind === 'conditional' && last.elseChildren === undefined) {
      last.elseChildren = [];
      stack.push({ depth: container.depth + 1, kind: 'conditional', node: last, inElse: true });
      owners = [];
      continue;
    }

    const childDepth = container.depth + 1;
    const text = line.text;

    if (line.side === 'system' && conditionalPattern.test(text) && !elsePattern.test(text.trim())) {
      const node: FlowConditionalNode = { id: line.id, kind: 'conditional', condition: conditionOf(text), thenChildren: [], refs: line.refs };
      siblings.push(node);
      stack.push({ depth: childDepth, kind: 'conditional', node, inElse: false });
      owners = [];
      continue;
    }

    if (line.side === 'system' && loopPattern.test(text)) {
      const { stepRef, text: header } = splitAnchor(text, ctx);
      const target = loopTarget(header);
      const node: FlowLoopNode = {
        id: line.id,
        kind: 'loop',
        loopKind: /^mientras/i.test(header) ? 'mientras' : 'por-cada',
        header,
        ...(target ? { targetClass: target } : {}),
        ...(stepRef ? { stepRef } : {}),
        details: [],
        children: [],
        refs: line.refs,
      };
      siblings.push(node);
      stack.push({ depth: childDepth, kind: 'loop', node });
      owners = [{ depth: childDepth, details: node.details }];
      continue;
    }

    const node = buildAction(line, ctx);
    siblings.push(node);
    owners = [{ depth: childDepth, details: node.details }];
  }

  return steps.map(pruneEmpty);
};

const pruneDetails = (details: FlowDetailItem[]): FlowDetailItem[] =>
  details.map((detail) => {
    const children = pruneDetails(detail.children ?? []);
    const rest: FlowDetailItem = { id: detail.id, text: detail.text, ...(detail.stepRef ? { stepRef: detail.stepRef } : {}) };
    return children.length > 0 ? { ...rest, children } : rest;
  });

const pruneNode = (node: FlowSubNode): FlowSubNode => {
  if (node.kind === 'action') return { ...node, details: pruneDetails(node.details) };
  if (node.kind === 'loop') return { ...node, details: pruneDetails(node.details), children: node.children.map(pruneNode) };
  return {
    ...node,
    thenChildren: node.thenChildren.map(pruneNode),
    ...(node.elseChildren === undefined ? {} : { elseChildren: node.elseChildren.map(pruneNode) }),
  };
};

const pruneEmpty = (step: FlowMainStep): FlowMainStep => {
  const details = pruneDetails(step.details ?? []);
  const rest = { ...step };
  delete rest.details;
  return { ...rest, ...(details.length > 0 ? { details } : {}), children: step.children.map(pruneNode) };
};

// ---------------------------------------------------------------------------
// Editing helpers

export const newLine = (patch: Partial<FlowEditLine> & Pick<FlowEditLine, 'side' | 'depth'>): FlowEditLine => ({
  id: createId(),
  kind: 'step',
  text: '',
  refs: [],
  ...patch,
});

/** A line plus everything indented under it, which moves and deletes with it. */
export const blockEnd = (lines: FlowEditLine[], index: number): number => {
  const line = lines[index];
  let end = index + 1;
  const owns = (candidate: FlowEditLine): boolean =>
    candidate.depth > line.depth
    || (candidate.kind === 'bullet' && line.kind === 'step' && candidate.depth > line.depth)
    || (candidate.kind === 'end' && candidate.id === `${line.id}${END_SUFFIX}`)
    || (candidate.id === `${line.id}${ELSE_SUFFIX}`);
  while (end < lines.length && owns(lines[end])) end += 1;
  return end;
};

/** Whether a step line may sit one level deeper: only inside POR CADA, MIENTRAS or SI. */
export const canNestStep = (lines: FlowEditLine[], index: number, depth: number): boolean => {
  if (depth <= 1) return depth === 1 && index > 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = lines[cursor];
    if (candidate.kind !== 'step') continue;
    if (candidate.depth === depth - 1) {
      return loopPattern.test(candidate.text) || conditionalPattern.test(candidate.text) || elsePattern.test(candidate.text.trim());
    }
    if (candidate.depth < depth - 1) return false;
  }
  return false;
};

export const isBlockHeader = (text: string): boolean =>
  loopPattern.test(text) || (conditionalPattern.test(text) && !elsePattern.test(text.trim())) || elsePattern.test(text.trim());

export const isLoopHeader = (text: string): boolean => loopPattern.test(text);
