import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipant,
  SequenceTimelineItem,
} from '../types/diagram';
import {
  type SequenceDiagramSemanticAnalysis,
  buildDerivedActivations,
  buildSequenceMessageNumbers,
  formatSequenceMessageLabel,
  formatSequenceParticipantName,
} from './sequenceDiagram';
import {
  calculateSequenceBounds,
  getSequenceParticipantHeaderWidth,
  getSequenceNoteMinimumHeight,
  measureSequenceText,
  wrapSequenceNoteText,
  resolveSequenceNoteRect,
  type SequenceDiagramBounds,
  type SequenceRect,
} from './sequenceDiagramGeometry';
import { withReadableArguments } from './sequenceMessageEditing';

export const SEQUENCE_HEADER_Y = 34;
export const SEQUENCE_HEADER_HEIGHT = 48;
export const SEQUENCE_TIMELINE_START = 134;
export const SEQUENCE_PARTICIPANT_GAP = 230;
export const SEQUENCE_MARGIN_X = 110;
export const SEQUENCE_ROW_HEIGHT = 58;
/** Row of a one-line message in compact spacing, like Enterprise Architect. */
export const SEQUENCE_COMPACT_ROW_HEIGHT = 32;
/** A label may run past a short arrow before it wraps (about 200 px). */
const MESSAGE_LABEL_MIN_CHARACTERS = 32;
/** Widest the fragment tab grows before its text wraps. */
const FRAGMENT_TAB_MAX_WIDTH = 360;
const FRAGMENT_TAB_MIN_WIDTH = 94;

const FRAGMENT_INSET = 12;
const FRAGMENT_MIN_WIDTH = 270;
const FRAGMENT_EMPTY_OPERAND_HEIGHT = 42;
const FRAGMENT_BOTTOM_GAP = 20;
const MESSAGE_LINE_HEIGHT = 14;

export type SequenceMessageLayout = {
  id: string;
  y: number;
  /** Top of the message's row. Compact rows hold the arrow near the top, so it is not `y - height / 2`. */
  top: number;
  height: number;
  depth: number;
  parentFragmentId?: string;
  operandId?: string;
  labelLines: string[];
  labelWidth: number;
  labelTop: number;
  labelBottom: number;
  labelBaselineY: number;
  labelCenterX: number;
  flowLines: string[];
  flowTop?: number;
  flowBottom?: number;
  flowBaselineY?: number;
};

export type SequenceOperandLayout = {
  id: string;
  guard: string;
  guardLines: string[];
  guardHeight: number;
  top: number;
  contentTop: number;
  bottom: number;
};

export type SequenceFragmentLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  depth: number;
  headerHeight: number;
  nameLines: string[];
  /** The tab reads "operator name", as in Enterprise Architect; it grows with the name. */
  tabLines: string[];
  tabWidth: number;
  operands: SequenceOperandLayout[];
};

export type SequenceActivationLayout = {
  id: string;
  participantId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
};

export type SequenceParticipantLayout = {
  id: string;
  x: number;
  headerY: number;
  headerWidth: number;
  headerHeight: number;
  nameLines: string[];
  nameBaselineY: number;
  kindBaselineY: number;
  isTerminated?: boolean;
};

export type SequenceNoteLayout = SequenceRect & {
  id: string;
  minimumHeight: number;
  lines: string[];
};

export type SequenceLayout = {
  width: number;
  height: number;
  /** Union of every rendered sequence element; canvas padding is excluded. */
  bounds: SequenceDiagramBounds;
  /** First timeline coordinate after dynamically-sized participant headers. */
  timelineStart: number;
  maxParticipantHeaderHeight: number;
  participantX: Map<string, number>;
  participantLayouts: Map<string, SequenceParticipantLayout>;
  messageLayouts: Map<string, SequenceMessageLayout>;
  fragmentLayouts: Map<string, SequenceFragmentLayout>;
  noteLayouts: Map<string, SequenceNoteLayout>;
  activationLayouts: SequenceActivationLayout[];
  orderedMessages: SequenceMessage[];
  participantStartY: Map<string, number>;
  participantEndY: Map<string, number>;
  terminatedParticipantIds: Set<string>;
};

type HorizontalFrame = Pick<SequenceRect, 'x' | 'width'>;

const participantPosition = (participant: SequenceParticipant, index: number): number =>
  Number.isFinite(participant.x) ? participant.x : SEQUENCE_MARGIN_X + index * SEQUENCE_PARTICIPANT_GAP;

const containedMessages = (fragment: SequenceFragment): SequenceMessage[] => fragment.operands.flatMap((operand) =>
  operand.items.flatMap((item) => item.kind === 'message' ? [item] : containedMessages(item)));

const containedFragments = (fragment: SequenceFragment): SequenceFragment[] => fragment.operands.flatMap((operand) =>
  operand.items.flatMap((item) => item.kind === 'fragment' ? [item] : []));

/** A label never leaves its number alone on the first line ("1." / "buscar()"). */
const keepNumberWithName = (text: { lines: string[]; width: number; height: number }) => {
  if (text.lines.length < 2 || !/^\d+(\.\d+)*\.$/.test(text.lines[0])) return text;
  const [number, first, ...rest] = text.lines;
  const lines = [`${number} ${first}`, ...rest];
  return {
    lines,
    width: Math.max(...lines.map((line) => line.length * 6.3)),
    height: lines.length * MESSAGE_LINE_HEIGHT,
  };
};

const getHorizontalEnvelope = (
  fragment: SequenceFragment,
  participantX: Map<string, number>,
): { left: number; right: number } | undefined => {
  const xs = containedMessages(fragment).flatMap((message) => [
    participantX.get(message.sourceId),
    participantX.get(message.targetId),
  ]).filter((x): x is number => x !== undefined);
  if (xs.length === 0) return undefined;
  return { left: Math.min(...xs) - 86, right: Math.max(...xs) + 86 };
};

/** The condition of a single-branch fragment lives in the tab, not in brackets. */
export const isSingleOperandFragment = (fragment: SequenceFragment): boolean => fragment.operands.length === 1;

const stripGuardBrackets = (text: string): string => text.trim().replace(/^\[/, '').replace(/\]$/, '').trim();

/**
 * What the tab shows after the operator. A single-branch fragment (loop, opt,
 * break...) shows its name; stored data may hold the text in the branch guard
 * instead, or in both, so the tab shows whichever exists without repeating it.
 * `field` is where an edit from the tab is saved.
 */
export const getFragmentTabLabel = (fragment: SequenceFragment): { text: string; field: 'name' | 'guard' } => {
  const name = fragment.name.trim();
  if (!isSingleOperandFragment(fragment)) return { text: name, field: 'name' };
  const guard = stripGuardBrackets(fragment.operands[0].guard);
  const parts = [name, guard].filter((part, index, all) => part.length > 0
    && all.findIndex((other) => other.toLocaleLowerCase() === part.toLocaleLowerCase()) === index);
  return { text: parts.join(' · '), field: name ? 'name' : 'guard' };
};

const measureFragmentTab = (fragment: SequenceFragment): { lines: string[]; width: number; height: number } => {
  const label = getFragmentTabLabel(fragment).text;
  const text = label ? `${fragment.operator} ${label}` : fragment.operator;
  const capacity = Math.floor((FRAGMENT_TAB_MAX_WIDTH - 30) / 6.6);
  const measured = measureSequenceText(text, capacity, 6.6, MESSAGE_LINE_HEIGHT);
  return {
    lines: measured.lines,
    width: Math.max(FRAGMENT_TAB_MIN_WIDTH, Math.ceil(measured.width + 30)),
    height: measured.height,
  };
};

const getFragmentMinimumWidth = (
  fragment: SequenceFragment,
  participantX: Map<string, number>,
): number => {
  const envelope = getHorizontalEnvelope(fragment, participantX);
  const nameWidth = getFragmentTabLabel(fragment).text ? measureFragmentTab(fragment).width + 24 : 0;
  const guardWidth = isSingleOperandFragment(fragment) ? 0 : Math.max(...fragment.operands.map((operand) =>
    measureSequenceText(operand.guard || 'condición', 44, 6.1, MESSAGE_LINE_HEIGHT).width + 28), 0);
  const nestedWidth = Math.max(...containedFragments(fragment).map((nested) =>
    getFragmentMinimumWidth(nested, participantX) + FRAGMENT_INSET * 2), 0);
  return Math.max(
    FRAGMENT_MIN_WIDTH,
    envelope === undefined ? 0 : envelope.right - envelope.left,
    nameWidth,
    guardWidth,
    nestedWidth,
  );
};

const defaultFragmentFrame = (
  fragment: SequenceFragment,
  depth: number,
  participantX: Map<string, number>,
): HorizontalFrame => {
  const allParticipantXs = Array.from(participantX.values());
  const minDiagramX = allParticipantXs.length > 0 ? Math.min(...allParticipantXs) : SEQUENCE_MARGIN_X;
  const maxDiagramX = allParticipantXs.length > 0 ? Math.max(...allParticipantXs) : minDiagramX + 520;
  const startX = fragment.startParticipantId ? participantX.get(fragment.startParticipantId) : undefined;
  const endX = fragment.endParticipantId ? participantX.get(fragment.endParticipantId) : undefined;
  // With no lifelines chosen, the frame covers the lifelines its messages use
  // (as Enterprise Architect does); an empty fragment spans the diagram.
  const envelope = startX === undefined && endX === undefined ? getHorizontalEnvelope(fragment, participantX) : undefined;
  if (envelope !== undefined) {
    const width = Math.max(FRAGMENT_MIN_WIDTH, envelope.right - envelope.left - depth * 16);
    return { x: envelope.left + depth * 8, width };
  }
  const minBound = Math.min(startX ?? minDiagramX, endX ?? (startX !== undefined ? startX + 230 : maxDiagramX));
  const maxBound = Math.max(endX ?? maxDiagramX, startX ?? (endX !== undefined ? endX - 230 : minDiagramX));
  const left = minBound - 86;
  const right = Math.max(left + FRAGMENT_MIN_WIDTH, maxBound + 86);
  return {
    x: left + depth * 8,
    width: Math.max(FRAGMENT_MIN_WIDTH, right - left - depth * 16),
  };
};

const clampNestedFrame = (
  requestedX: number,
  requestedWidth: number,
  minimumWidth: number,
  parent: HorizontalFrame,
): HorizontalFrame => {
  const availableWidth = Math.max(minimumWidth, parent.width - FRAGMENT_INSET * 2);
  const width = Math.max(minimumWidth, Math.min(requestedWidth, availableWidth));
  const minimumX = parent.x + FRAGMENT_INSET;
  const maximumX = parent.x + parent.width - FRAGMENT_INSET - width;
  return { x: Math.min(Math.max(requestedX, minimumX), Math.max(minimumX, maximumX)), width };
};

const resolveRootFrame = (
  fragment: SequenceFragment,
  requested: HorizontalFrame,
  minimumWidth: number,
  participantX: Map<string, number>,
): HorizontalFrame => {
  const envelope = getHorizontalEnvelope(fragment, participantX);
  let x = requested.x;
  let width = Math.max(requested.width, minimumWidth);
  if (envelope === undefined) return { x, width };
  // A message does not have independent horizontal coordinates. Keep its
  // endpoints inside a root frame by clamping the rightward edge and growing
  // a frame dragged farther left instead of silently clipping its contents.
  x = Math.min(x, envelope.left);
  width = Math.max(width, envelope.right - x);
  return { x, width };
};

const buildParticipantHeader = (
  participant: SequenceParticipant,
  x: number,
  headerY: number,
): SequenceParticipantLayout => {
  const name = formatSequenceParticipantName(participant);
  const isActor = participant.kind === 'actor';
  const allWords = name.split(/\s+/).filter(Boolean);
  const maxWordLen = Math.max(0, ...allWords.map((w) => w.length));
  // Allow capacity to expand dynamically to fit words up to 38 characters without premature mid-word cuts,
  // while ensuring at least 26 characters capacity for natural whole-word line wrapping.
  const capacity = Math.min(38, Math.max(26, maxWordLen));
  const nameText = measureSequenceText(name, capacity, 6.3, MESSAGE_LINE_HEIGHT);
  const lineCount = nameText.lines.length;
  const headerWidth = getSequenceParticipantHeaderWidth(participant);
  const headerHeight = isActor
    ? Math.max(80, 64 + lineCount * 16)
    : Math.max(SEQUENCE_HEADER_HEIGHT, 28 + lineCount * 16);
  const nameBaselineY = isActor
    ? (lineCount === 1 ? headerY + 69 : headerY + 60)
    : headerY + headerHeight / 2 - ((lineCount - 1) * 7) + 4;
  const kindBaselineY = isActor
    ? headerY + 52
    : headerY + headerHeight - 9;
  return {
    id: participant.id,
    x,
    headerY,
    headerWidth,
    headerHeight,
    nameLines: nameText.lines,
    nameBaselineY,
    kindBaselineY,
  };
};

export const buildSequenceLayout = (
  content: SequenceDiagramContent,
  semanticAnalysis?: Pick<SequenceDiagramSemanticAnalysis, 'activations'>,
): SequenceLayout => {
  const participantX = new Map(content.participants.map((participant, index) => [
    participant.id,
    participantPosition(participant, index),
  ]));
  const topHeaders = content.participants.map((participant) =>
    buildParticipantHeader(participant, participantX.get(participant.id) ?? SEQUENCE_MARGIN_X, SEQUENCE_HEADER_Y));
  const headerByParticipantId = new Map(topHeaders.map((header) => [header.id, header]));
  const maxParticipantHeaderHeight = Math.max(SEQUENCE_HEADER_HEIGHT, ...topHeaders.map((header) => header.headerHeight));
  const timelineStart = Math.max(SEQUENCE_TIMELINE_START, SEQUENCE_HEADER_Y + maxParticipantHeaderHeight + 42);
  const messageNumbers = buildSequenceMessageNumbers(content);
  const compact = content.spacing === 'compact';
  const messageLayouts = new Map<string, SequenceMessageLayout>();
  const fragmentLayouts = new Map<string, SequenceFragmentLayout>();
  const orderedMessages: SequenceMessage[] = [];
  let cursorY = timelineStart;

  const layoutMessage = (
    message: SequenceMessage,
    depth: number,
    parentFragmentId?: string,
    operandId?: string,
  ): void => {
    const sourceX = participantX.get(message.sourceId) ?? 0;
    const targetX = participantX.get(message.targetId) ?? sourceX;
    const direction = targetX >= sourceX ? 1 : -1;
    const targetHeader = headerByParticipantId.get(message.targetId);
    const targetHalfWidth = (targetHeader?.headerWidth ?? 160) / 2;
    const effectiveTargetX = message.type === 'create'
      ? targetX - direction * targetHalfWidth
      : targetX;
    const span = Math.max(MESSAGE_LABEL_MIN_CHARACTERS, Math.floor(Math.abs(effectiveTargetX - sourceX) / 7.6));
    const label = message.type === 'return' ? '' : formatSequenceMessageLabel(withReadableArguments(message), messageNumbers.get(message.id));
    const labelText = label.length > 0 ? keepNumberWithName(measureSequenceText(label, span, 6.3, MESSAGE_LINE_HEIGHT)) : undefined;
    const flowReference = message.flowReference ?? '';
    const flowText = flowReference.length > 0
      ? measureSequenceText(`Ref. ${flowReference}`, Math.max(18, span), 5.3, 12)
      : undefined;
    const labelHeight = labelText?.height ?? 0;
    const flowHeight = flowText?.height ?? 0;
    const isSelf = message.sourceId === message.targetId;
    const createdHeaderHalfHeight = message.type === 'create' ? (targetHeader?.headerHeight ?? SEQUENCE_HEADER_HEIGHT) / 2 : 0;
    // Normal spacing centers the arrow in a fixed row; compact spacing puts it
    // right under its label and keeps only what the row really needs below.
    const compactArrowOffset = Math.max(labelHeight > 0 ? labelHeight + 14 : 10, createdHeaderHalfHeight + 10);
    const height = compact
      ? Math.max(
        SEQUENCE_COMPACT_ROW_HEIGHT,
        compactArrowOffset + (isSelf ? 40 : 10),
        compactArrowOffset + createdHeaderHalfHeight + 10,
        flowHeight > 0 ? compactArrowOffset + 9 + flowHeight + 6 : 0,
      )
      : Math.max(
        SEQUENCE_ROW_HEIGHT,
        labelHeight > 0 ? 2 * (labelHeight + 14) : 0,
        flowHeight > 0 ? 2 * (flowHeight + 20) : 0,
        isSelf ? 84 : 0,
        createdHeaderHalfHeight * 2 + 20,
      );
    const y = compact ? cursorY + compactArrowOffset : cursorY + height / 2;
    const labelCenterX = message.sourceId === message.targetId
      ? sourceX + 38 * direction
      : (sourceX + effectiveTargetX) / 2;
    const labelTop = labelText === undefined ? y : y - 12 - labelText.height;
    const labelBottom = labelText === undefined ? y : y - 12;
    const flowTop = flowText === undefined ? undefined : y + 9;
    const flowBottom = flowText === undefined ? undefined : y + 9 + flowText.height;
    messageLayouts.set(message.id, {
      id: message.id,
      y,
      top: cursorY,
      height,
      depth,
      parentFragmentId,
      operandId,
      labelLines: labelText?.lines ?? [],
      labelWidth: labelText === undefined ? 0 : Math.max(70, Math.ceil(labelText.width + 12)),
      labelTop,
      labelBottom,
      labelBaselineY: labelTop + 11,
      labelCenterX,
      flowLines: flowText?.lines ?? [],
      flowTop,
      flowBottom,
      flowBaselineY: flowTop === undefined ? undefined : flowTop + 10,
    });
    orderedMessages.push(message);
    cursorY += height;
  };

  const layoutItems = (
    items: SequenceTimelineItem[],
    depth: number,
    parentFragmentId?: string,
    operandId?: string,
    parentFrame?: HorizontalFrame,
  ): void => {
    items.forEach((item) => {
      if (item.kind === 'message') {
        layoutMessage(item, depth, parentFragmentId, operandId);
        return;
      }

      const minimumWidth = getFragmentMinimumWidth(item, participantX);
      const defaultFrame = defaultFragmentFrame(item, depth, participantX);
      const requestedFrame = {
        x: item.x !== undefined && Number.isFinite(item.x) ? item.x : defaultFrame.x,
        width: item.width !== undefined && Number.isFinite(item.width) ? item.width : defaultFrame.width,
      };
      const horizontal = parentFrame === undefined
        ? resolveRootFrame(item, requestedFrame, minimumWidth, participantX)
        : clampNestedFrame(requestedFrame.x, requestedFrame.width, minimumWidth, parentFrame);
      const y = Math.max(cursorY, item.y !== undefined && Number.isFinite(item.y) ? item.y : cursorY);
      const nameText = item.name
        ? measureSequenceText(item.name, Math.max(12, Math.floor((horizontal.width - 114) / 6.3)), 6.3, MESSAGE_LINE_HEIGHT)
        : { lines: [] as string[], width: 0, height: 0 };
      const tab = measureFragmentTab(item);
      const tabWidth = Math.min(tab.width, Math.max(FRAGMENT_TAB_MIN_WIDTH, horizontal.width - 24));
      const headerHeight = Math.max(26, tab.height + 10);
      cursorY = y + headerHeight;
      const operands: SequenceOperandLayout[] = [];
      item.operands.forEach((operand) => {
        const top = cursorY;
        // An operand without a guard draws none (as in Enterprise Architect)
        // and keeps only a small gap under the tab or the separator.
        const hasGuard = !isSingleOperandFragment(item) && operand.guard.trim().length > 0;
        const guardText = hasGuard
          ? measureSequenceText(
            operand.guard,
            Math.max(12, Math.floor((horizontal.width - 24) / 6.1)),
            6.1,
            MESSAGE_LINE_HEIGHT,
          )
          : { lines: [] as string[], width: 0, height: 0 };
        const guardHeight = hasGuard ? Math.max(24, guardText.height + 10) : 12;
        const contentTop = top + guardHeight;
        cursorY = contentTop;
        layoutItems(operand.items, depth + 1, item.id, operand.id, horizontal);
        if (operand.items.length === 0) cursorY += FRAGMENT_EMPTY_OPERAND_HEIGHT;
        operands.push({
          id: operand.id,
          guard: operand.guard,
          guardLines: guardText.lines,
          guardHeight,
          top,
          contentTop,
          bottom: cursorY,
        });
      });
      const contentBottom = cursorY;
      const minimumHeight = contentBottom - y + FRAGMENT_BOTTOM_GAP;
      const height = Math.max(
        minimumHeight,
        item.height !== undefined && Number.isFinite(item.height) ? item.height : 0,
      );
      if (operands.length > 0) {
        // The final operand owns the bottom padding as well, so its usable
        // visual branch always reaches the frame edge after a manual resize.
        operands[operands.length - 1].bottom = y + height;
      }
      fragmentLayouts.set(item.id, {
        id: item.id,
        x: horizontal.x,
        y,
        width: horizontal.width,
        height,
        minWidth: minimumWidth,
        minHeight: minimumHeight,
        depth,
        headerHeight,
        nameLines: nameText.lines,
        tabLines: tab.lines,
        tabWidth,
        operands,
      });
      cursorY = y + height + FRAGMENT_BOTTOM_GAP;
    });
  };

  layoutItems(content.items, 0);

  const messageY = new Map(Array.from(messageLayouts.values()).map((layout) => [layout.id, layout.y]));
  // Open activations stop at the temporal content, never in empty canvas space.
  const timelineBottom = cursorY;
  const activations = semanticAnalysis?.activations ?? buildDerivedActivations(content);
  const activationLayouts = activations.flatMap((activation): SequenceActivationLayout[] => {
    const x = participantX.get(activation.participantId);
    const startY = messageY.get(activation.startMessageId);
    if (x === undefined || startY === undefined) return [];
    if (activation.startMessageId === activation.endMessageId) {
      return [{
        id: activation.id,
        participantId: activation.participantId,
        x: x - 6,
        y: startY - 8,
        width: 12,
        height: 16,
        level: activation.level,
      }];
    }
    const scopeBottom = activation.endScope === undefined
      ? undefined
      : fragmentLayouts.get(activation.endScope.fragmentId)?.operands
        .find((operand) => operand.id === activation.endScope?.operandId)?.bottom;
    const endY = activation.endMessageId === undefined
      ? scopeBottom ?? timelineBottom
      : messageY.get(activation.endMessageId) ?? timelineBottom;
    return [{
      id: activation.id,
      participantId: activation.participantId,
      // Nested executions sit beside their parent bar instead of painting over it.
      // Keeping the 12 px rhythm also makes deep call stacks readable at a glance.
      x: x + activation.level * 12 - 6,
      y: startY - 3,
      width: 12,
      height: Math.max(18, endY - startY + 6),
      level: activation.level,
    }];
  });

  const participantLayouts = new Map<string, SequenceParticipantLayout>();
  const participantStartY = new Map<string, number>();
  const participantEndY = new Map<string, number>();
  const terminatedParticipantIds = new Set<string>();
  const lastMessageByParticipant = new Map<string, SequenceMessage>();
  orderedMessages.forEach((message) => {
    lastMessageByParticipant.set(message.sourceId, message);
    lastMessageByParticipant.set(message.targetId, message);
  });
  const activationById = new Map(activations.map((activation) => [activation.id, activation]));
  const activationLayoutsByParticipant = new Map<string, SequenceActivationLayout[]>();
  activationLayouts.forEach((activation) => {
    const layouts = activationLayoutsByParticipant.get(activation.participantId) ?? [];
    layouts.push(activation);
    activationLayoutsByParticipant.set(activation.participantId, layouts);
  });

  content.participants.forEach((participant) => {
    const x = participantX.get(participant.id) ?? SEQUENCE_MARGIN_X;
    const prototype = headerByParticipantId.get(participant.id)
      ?? buildParticipantHeader(participant, x, SEQUENCE_HEADER_Y);
    const createdAt = participant.createdByMessageId ? messageY.get(participant.createdByMessageId) : undefined;
    const destroyedAt = participant.destroyedByMessageId ? messageY.get(participant.destroyedByMessageId) : undefined;
    const headerY = createdAt === undefined ? SEQUENCE_HEADER_Y : createdAt - prototype.headerHeight / 2;
    const startY = headerY + prototype.headerHeight;

    let endY = Math.max(timelineBottom + 40, startY + 60);
    let isTerminated = false;

    if (participant.destroyedByMessageId && destroyedAt !== undefined) {
      endY = destroyedAt;
      isTerminated = true;
    } else {
      const shouldTerminate = participant.terminateLifeline === true ||
        (participant.createdByMessageId !== undefined && participant.terminateLifeline !== false);
      if (shouldTerminate) {
        const lastMessage = lastMessageByParticipant.get(participant.id);
        if (lastMessage) {
          const lastMessageY = messageY.get(lastMessage.id) ?? timelineBottom;
          const matchingActivations = (activationLayoutsByParticipant.get(participant.id) ?? []).filter((actLayout) => {
            const act = activationById.get(actLayout.id);
            if (act && (act.startMessageId === lastMessage.id || act.endMessageId === lastMessage.id)) {
              return true;
            }
            return lastMessageY >= actLayout.y - 4 && lastMessageY <= actLayout.y + actLayout.height + 4;
          });
          const maxActivationBottom = matchingActivations.length > 0
            ? Math.max(...matchingActivations.map((a) => a.y + a.height))
            : undefined;
          const terminationY = maxActivationBottom !== undefined
            ? Math.max(lastMessageY + 28, maxActivationBottom + 12)
            : lastMessageY + 28;

          endY = Math.max(terminationY, startY + 20);
          isTerminated = true;
        }
      }
    }

    if (isTerminated) {
      terminatedParticipantIds.add(participant.id);
    }

    const header: SequenceParticipantLayout = {
      ...prototype,
      x,
      headerY,
      nameBaselineY: prototype.nameBaselineY - SEQUENCE_HEADER_Y + headerY,
      kindBaselineY: prototype.kindBaselineY - SEQUENCE_HEADER_Y + headerY,
      isTerminated,
    };
    participantLayouts.set(participant.id, header);
    participantStartY.set(participant.id, startY);
    participantEndY.set(participant.id, endY);
  });

  const noteLayouts = new Map<string, SequenceNoteLayout>();
  content.notes.forEach((note) => {
    const rect = resolveSequenceNoteRect(note);
    noteLayouts.set(note.id, {
      id: note.id,
      ...rect,
      minimumHeight: getSequenceNoteMinimumHeight({ text: note.text, width: rect.width }),
      lines: wrapSequenceNoteText(note.text || 'Nota', rect.width),
    });
  });

  const rectangles: SequenceRect[] = [
    ...Array.from(participantLayouts.values()).map((header) => ({
      x: header.x - header.headerWidth / 2,
      y: header.headerY,
      width: header.headerWidth,
      height: header.headerHeight,
    })),
    ...content.participants.flatMap((participant): SequenceRect[] => {
      const x = participantX.get(participant.id);
      const startY = participantStartY.get(participant.id);
      const endY = participantEndY.get(participant.id);
      if (x === undefined || startY === undefined || endY === undefined) return [];
      const lineRect: SequenceRect = { x, y: startY, width: 0, height: Math.max(0, endY - startY) };
      return terminatedParticipantIds.has(participant.id)
        ? [lineRect, { x: x - 8, y: endY - 8, width: 16, height: 16 }]
        : [lineRect];
    }),
    ...Array.from(fragmentLayouts.values()).map((fragment) => ({
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      height: fragment.height,
    })),
    ...Array.from(activationLayouts).map((activation) => ({
      x: activation.x,
      y: activation.y,
      width: activation.width,
      height: activation.height,
    })),
    ...Array.from(noteLayouts.values()).map(({ x, y, width, height }) => ({ x, y, width, height })),
    ...orderedMessages.flatMap((message): SequenceRect[] => {
      const box = messageLayouts.get(message.id);
      const sourceX = participantX.get(message.sourceId);
      const targetX = participantX.get(message.targetId);
      if (box === undefined || sourceX === undefined || targetX === undefined) return [];
      const targetHeader = participantLayouts.get(message.targetId);
      const targetHalfWidth = (targetHeader?.headerWidth ?? 160) / 2;
      const effectiveTargetX = message.type === 'create'
        ? targetX - (targetX >= sourceX ? targetHalfWidth : -targetHalfWidth)
        : targetX;
      const arrowLeft = Math.min(sourceX, effectiveTargetX);
      const arrowRight = message.sourceId === message.targetId
        ? Math.max(sourceX, effectiveTargetX) + 52
        : Math.max(sourceX, effectiveTargetX);
      const label = box.labelLines.length > 0
        ? [{
            x: box.labelCenterX - box.labelWidth / 2,
            y: box.labelTop - 2,
            width: box.labelWidth,
            height: box.labelBottom - box.labelTop + 4,
          }]
        : [];
      const flow = box.flowTop === undefined || box.flowBottom === undefined
        ? []
        : [{
            x: box.labelCenterX - Math.max(40, ...box.flowLines.map((line) => line.length * 5.3)) / 2,
            y: box.flowTop,
            width: Math.max(40, ...box.flowLines.map((line) => line.length * 5.3)),
            height: box.flowBottom - box.flowTop,
          }];
      return [
        { x: arrowLeft, y: box.y - 2, width: arrowRight - arrowLeft, height: message.sourceId === message.targetId ? 34 : 4 },
        ...label,
        ...flow,
      ];
    }),
  ];
  const bounds = calculateSequenceBounds(rectangles);

  return {
    width: Math.max(1200, content.canvas.width, bounds.right + 80),
    height: Math.max(900, content.canvas.height, bounds.bottom + 80),
    bounds,
    timelineStart,
    maxParticipantHeaderHeight,
    participantX,
    participantLayouts,
    messageLayouts,
    fragmentLayouts,
    noteLayouts,
    activationLayouts,
    orderedMessages,
    participantStartY,
    participantEndY,
    terminatedParticipantIds,
  };
};

/** Public single-source bounds contract for navigation and future export. */
export const calculateSequenceDiagramBounds = (
  content: SequenceDiagramContent,
  layout: SequenceLayout = buildSequenceLayout(content),
): SequenceDiagramBounds => layout.bounds;

export type SequenceMessageEndpoints = {
  sourceX: number;
  targetX: number;
  y: number;
};

/** Return arrow endpoints, touching active bars when they are present. */
export const getSequenceMessageEndpoints = (
  content: SequenceDiagramContent,
  layout: SequenceLayout,
  message: SequenceMessage,
): SequenceMessageEndpoints | undefined => {
  const messageLayout = layout.messageLayouts.get(message.id);
  const sourceCenter = layout.participantX.get(message.sourceId)
    ?? content.participants.find((participant) => participant.id === message.sourceId)?.x;
  const targetCenter = layout.participantX.get(message.targetId)
    ?? content.participants.find((participant) => participant.id === message.targetId)?.x;
  if (messageLayout === undefined || sourceCenter === undefined || targetCenter === undefined) return undefined;
  const barAt = (participantId: string) => layout.activationLayouts
    .filter((activation) => activation.participantId === participantId
      && messageLayout.y >= activation.y && messageLayout.y <= activation.y + activation.height)
    .sort((a, b) => b.level - a.level)[0];
  const sourceBar = barAt(message.sourceId);
  const targetBar = barAt(message.targetId);
  const direction = targetCenter >= sourceCenter ? 1 : -1;
  const showBars = content.showActivations;
  const edge = (center: number, bar: SequenceActivationLayout | undefined, side: number): number => {
    if (bar === undefined) return center;
    return side > 0 ? bar.x + bar.width : bar.x;
  };
  if (message.sourceId === message.targetId) {
    if (!showBars) return { sourceX: sourceCenter, targetX: targetCenter, y: messageLayout.y };
    // The penultimate bar is the caller and the innermost bar is the recursive callee.
    const bars = layout.activationLayouts
      .filter((activation) => activation.participantId === message.sourceId
        && messageLayout.y >= activation.y && messageLayout.y <= activation.y + activation.height)
      .sort((a, b) => a.level - b.level);
    return {
      sourceX: edge(sourceCenter, message.type === 'return' ? bars.at(-1) : bars.at(-2) ?? bars[0], direction),
      targetX: edge(targetCenter, message.type === 'return' ? bars.at(-2) ?? bars[0] : bars.at(-1), direction),
      y: messageLayout.y,
    };
  }
  const targetHeader = layout.participantLayouts.get(message.targetId);
  const targetHalfWidth = (targetHeader?.headerWidth ?? 160) / 2;
  if (!showBars) return {
    sourceX: sourceCenter,
    targetX: message.type === 'create' ? targetCenter - direction * targetHalfWidth : targetCenter,
    y: messageLayout.y,
  };
  return {
    sourceX: edge(sourceCenter, sourceBar, direction),
    targetX: message.type === 'create'
      ? targetCenter - direction * targetHalfWidth
      : edge(targetCenter, targetBar, -direction),
    y: messageLayout.y,
  };
};

export const findContainingFragment = (
  items: SequenceTimelineItem[],
  itemId: string,
): SequenceFragment | undefined => {
  for (const item of items) {
    if (item.kind !== 'fragment') continue;
    if (item.operands.some((operand) => operand.items.some((child) => child.id === itemId))) return item;
    for (const operand of item.operands) {
      const nested = findContainingFragment(operand.items, itemId);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};

const NOTE_GAP = 16;
const NOTE_BESIDE_ELEMENT = 44;

const rectanglesOverlap = (a: SequenceRect, b: SequenceRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Places the notes listed in `noteIds`, which arrived without coordinates
 * (typically written by an AI, which cannot know where a message lands): a
 * note anchored to a message goes just right of the message's rightmost end,
 * at its height; one anchored to a fragment, right of the frame; to a
 * participant, beside its lifeline under the headers; a free one, right of
 * the whole diagram. A note never covers another note: it moves down instead.
 */
export const placeUnpositionedSequenceNotes = (
  content: SequenceDiagramContent,
  noteIds: ReadonlySet<string>,
): SequenceDiagramContent['notes'] => {
  if (noteIds.size === 0) return content.notes;
  const placedContent = { ...content, notes: content.notes.filter((note) => !noteIds.has(note.id)) };
  const layout = buildSequenceLayout(placedContent);
  const occupied: SequenceRect[] = placedContent.notes.map(resolveSequenceNoteRect);
  const diagramRight = layout.bounds.right;
  const frames: SequenceRect[] = Array.from(layout.fragmentLayouts.values());
  return content.notes.map((note) => {
    if (!noteIds.has(note.id)) return note;
    const width = Math.max(note.width, 120);
    const height = Math.max(note.height, getSequenceNoteMinimumHeight({ text: note.text, width }));
    let x = diagramRight + 60;
    let y = layout.timelineStart;
    if (note.anchorKind === 'message' && note.anchorId !== undefined) {
      const messageLayout = layout.messageLayouts.get(note.anchorId);
      const message = layout.orderedMessages.find((candidate) => candidate.id === note.anchorId);
      if (messageLayout !== undefined && message !== undefined) {
        const sourceX = layout.participantX.get(message.sourceId) ?? 0;
        const targetX = layout.participantX.get(message.targetId) ?? sourceX;
        const selfLoop = message.sourceId === message.targetId ? 60 : 0;
        x = Math.max(sourceX, targetX) + selfLoop + NOTE_BESIDE_ELEMENT;
        y = messageLayout.y - 22;
      }
    } else if (note.anchorKind === 'fragment' && note.anchorId !== undefined) {
      const fragmentLayout = layout.fragmentLayouts.get(note.anchorId);
      if (fragmentLayout !== undefined) {
        x = fragmentLayout.x + fragmentLayout.width + 30;
        y = fragmentLayout.y;
      }
    } else if (note.anchorKind === 'participant' && note.anchorId !== undefined) {
      const participantX = layout.participantX.get(note.anchorId);
      if (participantX !== undefined) {
        x = participantX + NOTE_BESIDE_ELEMENT;
        y = layout.timelineStart - 30;
      }
    }
    const rect = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), width, height };
    // Step right past fragment frames, then down past other notes, until clear.
    for (let guard = 0; guard < 200; guard += 1) {
      const frame = frames.find((other) => rectanglesOverlap(rect, other));
      if (frame !== undefined) {
        rect.x = frame.x + frame.width + 24;
        continue;
      }
      const blocker = occupied.find((other) => rectanglesOverlap(rect, other));
      if (blocker === undefined) break;
      rect.y = blocker.y + blocker.height + NOTE_GAP;
    }
    occupied.push(rect);
    return { ...note, x: rect.x, y: rect.y, width, height };
  });
};
