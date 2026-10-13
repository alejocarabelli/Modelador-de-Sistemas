import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  SequenceDiagramContent,
  SequenceFragment,
  SequenceMessage,
  SequenceMessageType,
  SequenceNote,
  SequenceParticipant,
  SequenceParticipantKind,
} from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';
import { findSequenceItem, formatSequenceParticipantName } from '../utils/sequenceDiagram';
import { findMarqueeHits } from '../utils/sequenceDiagramSelection';
import type { SequenceLayout } from '../utils/sequenceDiagramLayout';
import { isNotebookEvent } from '../utils/notebookKeyboard';
import { shouldIgnoreEditorShortcut } from '../utils/editorShortcutGuards';
import { getFragmentTabLabel, getSequenceMessageEndpoints, isSingleOperandFragment, SEQUENCE_HEADER_HEIGHT, SEQUENCE_HEADER_Y } from '../utils/sequenceDiagramLayout';
import {
  SEQUENCE_NOTE_FONT_FAMILY,
  SEQUENCE_NOTE_FONT_SIZE,
  SEQUENCE_NOTE_LINE_HEIGHT,
  SEQUENCE_NOTE_PADDING_X,
} from '../utils/sequenceDiagramGeometry';
import { resolveParticipantVisualIdentity, resolveSequenceNoteScheme, type ParticipantVisualIdentity } from '../utils/sequenceParticipantColors';

type Selection = { kind: 'participant' | 'message' | 'fragment' | 'note'; id: string } | null;

type SequenceDiagramCanvasProps = {
  content: SequenceDiagramContent;
  layout: SequenceLayout;
  selected: Selection;
  highlighted?: Selection;
  theme: DiagramTheme;
  missingInModel?: { messageIds: Set<string>; participantIds: Set<string> };
  classNodesById?: Map<string, { name: string }> | Record<string, { name: string }>;
  participantColorsEnabled?: boolean;
  /**
   * Participante tal como estaba antes de empezar a editar su nombre: mientras
   * se tipea, el color se sigue calculando a partir de este para que la caja
   * no cambie de tono con cada letra.
   */
  colorReferenceParticipant?: SequenceParticipant | null;
  onSelect: (selection: Selection) => void;
  onParticipantPointerDown: (participant: SequenceParticipant, event: ReactPointerEvent<SVGGElement>) => void;
  onNotePointerDown: (note: SequenceNote, event: ReactPointerEvent<SVGGElement>) => void;
  onNoteResizePointerDown: (
    note: SequenceNote,
    handle: 'corner' | 'right' | 'bottom',
    event: ReactPointerEvent<SVGElement>,
  ) => void;
  onEditNote?: (noteId: string) => void;
  /** During inline editing the HTML textarea is the note's single visual body. */
  editingNoteId?: string | null;
  onFragmentPointerDown?: (fragment: SequenceFragment, event: ReactPointerEvent<SVGGElement>) => void;
  onFragmentResizePointerDown?: (
    fragment: SequenceFragment,
    handle: 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'w' | 'n',
    event: ReactPointerEvent<SVGElement>,
  ) => void;
  onEditFragmentGuard?: (fragmentId: string, operandId: string, currentGuard: string, rect: { x: number; y: number; width: number }) => void;
  onEditFragmentName?: (fragmentId: string, currentName: string, rect: { x: number; y: number; width: number }) => void;
  onAddFragmentOperand?: (fragmentId: string) => void;
  onAddMessageToOperand?: (fragmentId: string, operandId: string) => void;
  onAddFragmentToOperand?: (fragmentId: string, operandId: string) => void;
  onConnect?: (sourceId: string, targetId: string, y: number) => void;
  onEditMessage?: (id: string) => void;
  selectedTimelineIds?: string[];
  onTimelineItemSelect?: (id: string, multiSelect: boolean) => void;
  onReorderMessagePointerDown?: (message: SequenceMessage, event: ReactPointerEvent<SVGGElement>) => void;
  insertionGuide?: {
    y: number;
    isValid: boolean;
    reason?: string;
    containerName?: string;
    bounds?: { x: number; width: number };
    containerBounds?: { x: number; width: number; top: number; bottom: number };
  } | null;
  boundaryResizePreview?: {
    fragmentId: string;
    absorbedIds: string[];
    ejectedIds: string[];
    isValid: boolean;
    reason?: string;
    edge?: 'top' | 'bottom' | 'move';
    isReallocated?: boolean;
  } | null;
  keyboardPreview?: {
    stage: 'navigate' | 'aim' | 'typing' | 'fragment' | 'guard' | 'participant';
    y: number;
    sourceId: string;
    targetId?: string;
    targetX?: number;
    type: SequenceMessageType;
    label?: string;
    valid?: boolean;
    ghost?: { kind: Exclude<SequenceParticipantKind, 'actor'>; label: string };
  } | null;
  /** Keyboard mode: the digit each lifeline answers to, shown on its header. */
  keyboardParticipantNumbers?: Map<string, string>;
  /** Keyboard mode: a click on the empty canvas, in diagram coordinates. */
  onBackgroundPoint?: (point: { x: number; y: number }) => void;
  onNavigateToArtifact?: (artifactId: string) => void;
  onMarqueeSelect?: (timelineIds: string[], noteIds: string[]) => void;
  /** Export renders are deliberately non-interactive and hidden from AT. */
  interactive?: boolean;
  ariaDescriptionId?: string;
  svgRef?: (element: SVGSVGElement | null) => void;
};

const ParticipantGlyph = ({ participant, x, y, stroke }: { participant: SequenceParticipant; x: number; y: number; stroke: string }) => {
  if (participant.kind === 'actor') {
    return (
      <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.6">
        <circle cx={x} cy={y + 13} r="8" />
        <line x1={x} y1={y + 21} x2={x} y2={y + 39} />
        <line x1={x - 13} y1={y + 27} x2={x + 13} y2={y + 27} />
        <line x1={x} y1={y + 39} x2={x - 11} y2={y + 54} />
        <line x1={x} y1={y + 39} x2={x + 11} y2={y + 54} />
      </g>
    );
  }
  const iconX = x;
  const iconY = y + 10;
  if (participant.kind === 'boundary') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><circle cx={iconX - 4} cy={iconY} r="5" /><line x1={iconX + 1} y1={iconY} x2={iconX + 9} y2={iconY} /><line x1={iconX + 9} y1={iconY - 7} x2={iconX + 9} y2={iconY + 7} /></g>;
  }
  if (participant.kind === 'control') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><circle cx={iconX} cy={iconY} r="6" /><path d={`M ${iconX - 2} ${iconY - 8} L ${iconX + 3} ${iconY - 8} L ${iconX + 1} ${iconY - 4}`} /></g>;
  }
  if (participant.kind === 'entity') {
    return <g aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.2"><rect x={iconX - 6} y={iconY - 6} width="12" height="12" /><line x1={iconX - 6} y1={iconY - 2} x2={iconX + 6} y2={iconY - 2} /><line x1={iconX - 6} y1={iconY + 2} x2={iconX + 6} y2={iconY + 2} /></g>;
  }
  return null;
};

function SequenceDiagramCanvasImpl({
  content,
  layout,
  selected,
  highlighted = null,
  theme,
  onSelect,
  onParticipantPointerDown,
  onNotePointerDown,
  onNoteResizePointerDown,
  onEditNote,
  editingNoteId = null,
  onFragmentPointerDown,
  onFragmentResizePointerDown,
  onEditFragmentGuard,
  onEditFragmentName,
  onAddFragmentOperand,
  onAddMessageToOperand,
  onAddFragmentToOperand,
  onConnect,
  onEditMessage,
  selectedTimelineIds,
  onTimelineItemSelect,
  onReorderMessagePointerDown,
  insertionGuide,
  boundaryResizePreview,
  keyboardPreview,
  keyboardParticipantNumbers,
  onBackgroundPoint,
  onNavigateToArtifact,
  onMarqueeSelect,
  interactive = true,
  ariaDescriptionId,
  svgRef,
  classNodesById,
  missingInModel,
  participantColorsEnabled,
  colorReferenceParticipant,
}: SequenceDiagramCanvasProps) {
  const ink = theme.sequence;
  const stroke = ink.stroke;
  const selectedStroke = ink.strokeSelected;
  const participantFill = ink.participantFill;
  const participantBorder = ink.participantBorder;
  const textColor = ink.text;
  const muted = ink.mutedText;
  const canvasBackground = ink.canvasBackground;
  const canvasGrid = ink.canvasGrid;
  const lifelineNeutral = ink.lifeline;
  const fragmentStrokeBase = ink.fragmentStroke;
  const fragmentFill = ink.fragmentFill;
  const nestedFragmentFill = ink.nestedFragmentFill;
  const fragmentTabFill = ink.fragmentTabFill;
  const guardFill = ink.guardFill;
  const guardText = ink.guardText;
  const handleFill = theme.ui.panelBackground;

  const participantIdentities = useMemo(() => {
    const map = new Map<string, ParticipantVisualIdentity>();
    const enabled = participantColorsEnabled ?? (content.participantColors !== 'disabled');
    content.participants.forEach((participant) => {
      map.set(
        participant.id,
        resolveParticipantVisualIdentity(
          colorReferenceParticipant && colorReferenceParticipant.id === participant.id
            ? colorReferenceParticipant
            : participant,
          { enabled, classNodesById, theme },
        ),
      );
    });
    return map;
  }, [classNodesById, colorReferenceParticipant, content.participantColors, content.participants, participantColorsEnabled, theme]);

  const svgElementRef = useRef<SVGSVGElement | null>(null);
  type ConnectionState = {
    sourceId: string;
    targetId: string | null;
    pointerId: number | null;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    fromPendingClick: boolean;
  };
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const connectionRef = useRef<ConnectionState | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number; pointerId: number; moved: boolean } | null>(null);
  const suppressClickAfterMarqueeRef = useRef(false);

  const handleItemKeyDown = (
    event: ReactKeyboardEvent<SVGGElement>,
    itemSelection: Exclude<Selection, null>,
    edit?: () => void,
  ): void => {
    if (!interactive || shouldIgnoreEditorShortcut(event, document)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(itemSelection);
    if (event.key === 'Enter') edit?.();
  };

  const updateConnection = (next: ConnectionState | null): void => {
    connectionRef.current = next;
    setConnection(next);
  };

  const pointInSvg = (svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } => {
    const transform = svg.getScreenCTM?.();
    if (transform !== null && transform !== undefined) {
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const transformed = point.matrixTransform(transform.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const bounds = svg.getBoundingClientRect();
    return {
      x: bounds.width > 0 ? ((clientX - bounds.left) / bounds.width) * layout.width : clientX,
      y: bounds.height > 0 ? ((clientY - bounds.top) / bounds.height) * layout.height : clientY,
    };
  };

  const participantAtPoint = (point: { x: number; y: number }): SequenceParticipant | undefined => {
    let nearest: SequenceParticipant | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    content.participants.forEach((participant) => {
      const x = layout.participantX.get(participant.id);
      const startY = layout.participantStartY.get(participant.id);
      const endY = layout.participantEndY.get(participant.id);
      if (x === undefined || startY === undefined || endY === undefined || point.y < startY || point.y > endY) return;
      const distance = Math.abs(point.x - x);
      if (distance <= 22 && distance < nearestDistance) {
        nearest = participant;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const releasePointer = (svg: SVGSVGElement, pointerId: number): void => {
    if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
  };

  const marqueeHits = (rect: { x: number; y: number; width: number; height: number }): { timelineIds: string[]; noteIds: string[] } =>
    findMarqueeHits(content, layout, rect);

  const cancelConnection = (): void => {
    const current = connectionRef.current;
    const svg = svgElementRef.current;
    if (current?.pointerId !== null && current?.pointerId !== undefined && svg) releasePointer(svg, current.pointerId);
    updateConnection(null);
  };

  useEffect(() => {
    if (connection === null) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreEditorShortcut(event, document) || event.key !== 'Escape' || isNotebookEvent(event)) return;
      event.preventDefault();
      const current = connectionRef.current;
      const svg = svgElementRef.current;
      if (current?.pointerId !== null && current?.pointerId !== undefined && svg && svg.hasPointerCapture?.(current.pointerId)) {
        svg.releasePointerCapture(current.pointerId);
      }
      connectionRef.current = null;
      setConnection(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connection]);

  const handleLifelinePointerDown = (participantId: string, event: ReactPointerEvent<SVGRectElement>): void => {
    if (!onConnect || event.button !== 0) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement ?? svgElementRef.current;
    if (!svg) return;
    const point = pointInSvg(svg, event.clientX, event.clientY);
    const pending = connectionRef.current?.pointerId === null ? connectionRef.current : null;
    const next: ConnectionState = {
      sourceId: pending?.sourceId ?? participantId,
      targetId: pending ? participantId : participantId,
      pointerId: event.pointerId,
      x: point.x,
      y: pending?.startY ?? point.y,
      startX: point.x,
      startY: pending?.startY ?? point.y,
      moved: false,
      fromPendingClick: pending !== null,
    };
    updateConnection(next);
    svg.setPointerCapture?.(event.pointerId);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || (current.pointerId !== null && current.pointerId !== event.pointerId)) return;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    const target = participantAtPoint({ x: point.x, y: current.startY });
    if (current.pointerId === null) {
      updateConnection({ ...current, x: point.x, y: current.startY, targetId: target?.id ?? null });
      return;
    }
    const moved = current.moved || Math.hypot(point.x - current.startX, point.y - current.startY) > 4;
    updateConnection({ ...current, x: point.x, y: current.startY, targetId: target?.id ?? null, moved });
  };

  const handleCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    const target = participantAtPoint({ x: point.x, y: current.startY });
    releasePointer(event.currentTarget, event.pointerId);
    if (current.fromPendingClick || current.moved) {
      if (target) onConnect?.(current.sourceId, target.id, current.startY);
      updateConnection(null);
      return;
    }
    updateConnection({ ...current, pointerId: null, targetId: null, x: point.x, y: current.startY });
  };

  const handleCanvasPointerCancel = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const current = connectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    releasePointer(event.currentTarget, event.pointerId);
    updateConnection(null);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    suppressClickAfterMarqueeRef.current = false;
    const point = pointInSvg(event.currentTarget, event.clientX, event.clientY);
    if (onConnect && event.button === 0 && connectionRef.current?.pointerId === null) {
      if (!participantAtPoint(point)) cancelConnection();
    }
    if (interactive && onMarqueeSelect && event.button === 0 && connectionRef.current === null && marqueeRef.current === null) {
      const target = event.target instanceof Element ? event.target : null;
      const hitsItem = target?.closest('g') !== null && target?.closest('g') !== undefined;
      const hitsLifeline = target?.hasAttribute('data-sequence-lifeline-hit') ?? false;
      // Mayús+arrastrar dibuja el marquee incluso sobre elementos (p. ej. para
      // seleccionar lo que está dentro de un fragmento sin moverlo).
      if ((event.shiftKey && !hitsLifeline) || (!hitsItem && !hitsLifeline)) {
        const pointerId = event.pointerId;
        const startX = point.x;
        const startY = point.y;
        marqueeRef.current = { startX, startY, pointerId, moved: false };

        // Listeners de ventana (como el resto de los arrastres): no dependen
        // de la captura de puntero y funcionan aunque el puntero salga del SVG.
        const move = (pointerEvent: PointerEvent): void => {
          const state = marqueeRef.current;
          if (!state || state.pointerId !== pointerEvent.pointerId) return;
          const svg = svgElementRef.current;
          if (!svg) return;
          const current = pointInSvg(svg, pointerEvent.clientX, pointerEvent.clientY);
          if (!state.moved && Math.hypot(current.x - state.startX, current.y - state.startY) > 4) {
            state.moved = true;
          }
          if (state.moved) {
            setMarquee({
              x: Math.min(state.startX, current.x),
              y: Math.min(state.startY, current.y),
              width: Math.abs(current.x - state.startX),
              height: Math.abs(current.y - state.startY),
            });
          }
        };
        const finish = (pointerEvent: PointerEvent, cancelled: boolean): void => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', finishUp);
          window.removeEventListener('pointercancel', finishCancel);
          const state = marqueeRef.current;
          if (!state || state.pointerId !== pointerEvent.pointerId) return;
          marqueeRef.current = null;
          setMarquee(null);
          if (cancelled || !state.moved) return;
          const svg = svgElementRef.current;
          if (!svg) return;
          const current = pointInSvg(svg, pointerEvent.clientX, pointerEvent.clientY);
          const hits = marqueeHits({
            x: Math.min(state.startX, current.x),
            y: Math.min(state.startY, current.y),
            width: Math.abs(current.x - state.startX),
            height: Math.abs(current.y - state.startY),
          });
          suppressClickAfterMarqueeRef.current = true;
          onMarqueeSelect?.(hits.timelineIds, hits.noteIds);
        };
        const finishUp = (pointerEvent: PointerEvent): void => finish(pointerEvent, false);
        const finishCancel = (pointerEvent: PointerEvent): void => finish(pointerEvent, true);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finishUp);
        window.addEventListener('pointercancel', finishCancel);
      }
    }
  };

  const renderFragment = (fragment: SequenceFragment) => {
    const box = layout.fragmentLayouts.get(fragment.id);
    if (box === undefined) return null;
    const isMultiSelected = Boolean(selectedTimelineIds?.includes(fragment.id));
    const isPrimarySelected = selected?.kind === 'fragment' && selected.id === fragment.id;
    const isSelected = isPrimarySelected || isMultiSelected;
    const isHighlighted = highlighted?.kind === 'fragment' && highlighted.id === fragment.id;
    const isInvalidResize = boundaryResizePreview?.fragmentId === fragment.id && !boundaryResizePreview.isValid;
    const tabLabel = getFragmentTabLabel(fragment);
    const singleBranch = isSingleOperandFragment(fragment);
    const fragmentStroke = isInvalidResize ? '#ef4444' : isSelected || isHighlighted ? selectedStroke : fragmentStrokeBase;
    const surfaceFill = box.depth % 2 === 1 ? nestedFragmentFill : fragmentFill;
    return (
      <g
        key={fragment.id}
        aria-label={`Fragmento ${fragment.operator}${tabLabel.text ? `: ${tabLabel.text}` : ''}`}
        className={`sequence-fragment ${isHighlighted ? 'sequence-highlighted' : ''} ${isMultiSelected ? 'sequence-multi-selected' : ''}`}
        data-selected={isSelected || undefined}
        data-multi-selected={isMultiSelected || undefined}
        data-highlighted={isHighlighted || undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (onTimelineItemSelect && (event.shiftKey || event.metaKey || event.ctrlKey)) {
            onTimelineItemSelect(fragment.id, true);
          } else {
            onSelect({ kind: 'fragment', id: fragment.id });
          }
        }}
        onKeyDown={(event) => handleItemKeyDown(event, { kind: 'fragment', id: fragment.id })}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
          onFragmentPointerDown?.(fragment, event);
        }}
      >
        <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" stroke={fragmentStroke} strokeWidth={isInvalidResize ? 2.4 : isSelected ? 1.8 : isHighlighted ? 2.2 : 1.1} cursor="move" />
        {(() => {
          // The tab reads "operator name" like Enterprise Architect and grows with the name.
          const tabHeight = Math.max(22, box.headerHeight - 4);
          const tabWidth = box.tabWidth ?? 94;
          const firstLine = box.tabLines?.[0] ?? fragment.operator;
          const editName = (event: ReactMouseEvent<SVGElement>): void => {
            event.stopPropagation();
            onEditFragmentName?.(fragment.id, tabLabel.text, {
              x: box.x + 4,
              y: box.y + 2,
              width: Math.max(180, Math.min(box.width - 8, tabWidth + 80)),
            });
          };
          return (
            <>
              <path d={`M ${box.x} ${box.y} H ${box.x + tabWidth - 12} L ${box.x + tabWidth} ${box.y + tabHeight} H ${box.x} Z`} fill={fragmentTabFill} stroke={fragmentStroke} cursor="move" />
              <text
                x={box.x + 9}
                y={box.y + 16}
                fill={textColor}
                fontSize="12"
                cursor="move"
                aria-label={tabLabel.text ? 'Doble clic para editar el nombre' : undefined}
                onDoubleClick={editName}
              >
                <tspan fontWeight="bold">{fragment.operator}</tspan>
                {firstLine.length > fragment.operator.length ? <tspan>{firstLine.slice(fragment.operator.length)}</tspan> : null}
                {(box.tabLines ?? []).slice(1).map((line, index) => <tspan key={`${fragment.id}:tab:${index}`} x={box.x + 9} dy={14}>{line}</tspan>)}
              </text>
              {!tabLabel.text && isPrimarySelected ? (
                <text
                  data-export-control="true"
                  x={box.x + tabWidth + 10}
                  y={box.y + 16}
                  fill={muted}
                  fontSize="11"
                  fontStyle="italic"
                  cursor="pointer"
                  opacity="0.65"
                  aria-label="Doble clic para nombrar fragmento"
                  onDoubleClick={editName}
                >
                  + nombre
                </text>
              ) : null}
            </>
          );
        })()}
        {isInvalidResize && boundaryResizePreview?.reason ? (() => {
          const showErrorBelow = boundaryResizePreview.edge === 'bottom' || box.y < 24;
          return (
            <g transform={`translate(${box.x + box.width / 2}, ${showErrorBelow ? box.y + box.height + 14 : box.y - 16})`}>
              <rect x="-130" y="-10" width="260" height="20" rx="4" fill="#ef4444" opacity="0.95" />
              <text x="0" y="4" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">
                {boundaryResizePreview.reason.length > 40 ? `${boundaryResizePreview.reason.slice(0, 37)}...` : boundaryResizePreview.reason}
              </text>
            </g>
          );
        })() : null}
        {fragment.operator === 'ref' && fragment.interactionArtifactId && onNavigateToArtifact ? (
          <g
            data-export-control="true"
            className="sequence-ref-nav-btn"
            cursor="pointer"
            onClick={(event) => {
              event.stopPropagation();
              onNavigateToArtifact(fragment.interactionArtifactId!);
            }}
          >
            <rect
              x={box.x + box.width - 116}
              y={box.y + 3}
              width="110"
              height="20"
              rx="4"
              fill={participantFill}
              stroke={fragmentStroke}
              strokeWidth="1"
            />
            <text
              x={box.x + box.width - 61}
              y={box.y + 16}
              fill={selectedStroke}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
            >
              Abrir ref ↗
            </text>
          </g>
        ) : null}
        {box.operands.map((operand, index) => {
          const contentOperand = fragment.operands.find((candidate) => candidate.id === operand.id);
          const isEmpty = (contentOperand?.items.length ?? 0) === 0;
          const showEmptyCta = interactive && isEmpty && (onAddMessageToOperand || onAddFragmentToOperand);
          const ctaY = operand.contentTop + 11;
          const longestGuardLine = operand.guardLines.reduce((longest, line) => Math.max(longest, line.length), 0);
          const guardSurfaceWidth = Math.min(Math.max(48, (longestGuardLine + 2) * 6.3 + 12), Math.max(48, box.width - 24));
          const guardSurfaceHeight = Math.max(19, operand.guardLines.length * 14 + 6);
          return (
          <g key={operand.id}>
            {index > 0 ? <line x1={box.x} y1={operand.top} x2={box.x + box.width} y2={operand.top} stroke={fragmentStrokeBase} strokeDasharray="5 5" opacity="0.78" /> : null}
            {singleBranch ? null : <g
              cursor="pointer"
              className="sequence-operand-guard-group"
              aria-label="Doble clic para editar condición de guarda"
              onDoubleClick={(event) => {
                event.stopPropagation();
                onEditFragmentGuard?.(fragment.id, operand.id, operand.guard || '', {
                  x: box.x + 8,
                  y: operand.top + 2,
                  width: Math.min(260, Math.max(140, box.width - 30)),
                });
              }}
            >
              {operand.guardLines.length > 0 ? (
                <>
                  <rect x={box.x + 8} y={operand.top + 3} width={guardSurfaceWidth} height={guardSurfaceHeight} rx="2" fill={surfaceFill} />
                  <rect x={box.x + 8} y={operand.top + 3} width={guardSurfaceWidth} height={guardSurfaceHeight} rx="2" fill={guardFill} opacity="0.82" />
                  <text x={box.x + 12} y={operand.top + 17} fill={guardText} fontSize="11" fontWeight={650} fontStyle="italic">
                    {operand.guardLines.map((line, lineIndex) => <tspan key={`${operand.id}:guard:${lineIndex}`} x={box.x + 12} dy={lineIndex === 0 ? 0 : 14}>{lineIndex === 0 ? `[${line}` : line}</tspan>)}
                    <tspan>]</tspan>
                  </text>
                </>
              ) : interactive && isPrimarySelected ? (
                // Without a guard nothing is drawn; while the fragment is selected a
                // hint offers to write one (never exported).
                <text data-export-control="true" x={box.x + box.width - 12} y={operand.top + 11} fill={muted} fontSize="10" fontStyle="italic" opacity="0.75" textAnchor="end">
                  doble clic: [condición]
                </text>
              ) : (
                <rect data-export-control="true" x={box.x + 8} y={operand.top} width={Math.min(140, box.width - 16)} height={12} fill="transparent" />
              )}
            </g>}
            {showEmptyCta ? (
              <g data-export-control="true" opacity={isSelected ? 1 : 0.85}>
                <rect
                  x={box.x + box.width / 2 - 102}
                  y={ctaY}
                  width="98"
                  height="20"
                  rx="10"
                  fill={participantFill}
                  stroke={fragmentStroke}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  cursor="pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({ kind: 'fragment', id: fragment.id });
                    onAddMessageToOperand?.(fragment.id, operand.id);
                  }}
                />
                <text
                  x={box.x + box.width / 2 - 53}
                  y={ctaY + 14}
                  fill={selectedStroke}
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  cursor="pointer"
                  pointerEvents="none"
                >
                  + mensaje
                </text>
                <rect
                  x={box.x + box.width / 2 + 4}
                  y={ctaY}
                  width="98"
                  height="20"
                  rx="10"
                  fill={participantFill}
                  stroke={fragmentStroke}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  cursor="pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect({ kind: 'fragment', id: fragment.id });
                    onAddFragmentToOperand?.(fragment.id, operand.id);
                  }}
                />
                <text
                  x={box.x + box.width / 2 + 53}
                  y={ctaY + 14}
                  fill={selectedStroke}
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  cursor="pointer"
                  pointerEvents="none"
                >
                  + opt
                </text>
              </g>
            ) : null}
          </g>
          );
        })}
        {isPrimarySelected && (fragment.operator === 'alt' || fragment.operator === 'par') ? (
          <g
            data-export-control="true"
            className="sequence-fragment-add-operand-btn"
            cursor="pointer"
            onClick={(event) => {
              event.stopPropagation();
              onAddFragmentOperand?.(fragment.id);
            }}
          >
            <rect
              x={box.x + box.width - 96}
              y={box.y + box.height - 24}
              width="90"
              height="20"
              rx="4"
              fill={participantFill}
              stroke={fragmentStroke}
              strokeWidth="1"
            />
            <text
              x={box.x + box.width - 51}
              y={box.y + box.height - 10}
              fill={selectedStroke}
              fontSize="10"
              fontWeight="bold"
              textAnchor="middle"
            >
              {fragment.operator === 'alt' ? '+ else / rama' : '+ rama'}
            </text>
          </g>
        ) : null}
        {isPrimarySelected ? (
          <g data-export-control="true" className="sequence-fragment-resize-controls">
            {/* Zonas de agarre extendidas invisibles para bordes (N, S, W, E) */}
            <line
              x1={box.x + 8}
              y1={box.y}
              x2={box.x + box.width - 8}
              y2={box.y}
              stroke="transparent"
              strokeWidth="16"
              cursor="ns-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'n', event);
              }}
            />
            <line
              x1={box.x + 8}
              y1={box.y + box.height}
              x2={box.x + box.width - 8}
              y2={box.y + box.height}
              stroke="transparent"
              strokeWidth="16"
              cursor="ns-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 's', event);
              }}
            />
            <line
              x1={box.x}
              y1={box.y + 8}
              x2={box.x}
              y2={box.y + box.height - 8}
              stroke="transparent"
              strokeWidth="14"
              cursor="ew-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'w', event);
              }}
            />
            <line
              x1={box.x + box.width}
              y1={box.y + 8}
              x2={box.x + box.width}
              y2={box.y + box.height - 8}
              stroke="transparent"
              strokeWidth="14"
              cursor="ew-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'e', event);
              }}
            />

            {/* Tirador superior visible (N) */}
            <g
              cursor="ns-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'n', event);
              }}
            >
              <rect
                x={box.x + box.width / 2 - 22}
                y={box.y - 5}
                width="44"
                height="10"
                rx="5"
                fill={handleFill}
                stroke={selectedStroke}
                strokeWidth="1.5"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.18))"
              />
              <line
                x1={box.x + box.width / 2 - 8}
                y1={box.y}
                x2={box.x + box.width / 2 + 8}
                y2={box.y}
                stroke={selectedStroke}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>

            {/* Tirador inferior visible (S) */}
            <g
              cursor="ns-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 's', event);
              }}
            >
              <rect
                x={box.x + box.width / 2 - 22}
                y={box.y + box.height - 5}
                width="44"
                height="10"
                rx="5"
                fill={handleFill}
                stroke={selectedStroke}
                strokeWidth="1.5"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.18))"
              />
              <line
                x1={box.x + box.width / 2 - 8}
                y1={box.y + box.height}
                x2={box.x + box.width / 2 + 8}
                y2={box.y + box.height}
                stroke={selectedStroke}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>

            {/* Tirador lateral izquierdo (W) */}
            <g
              cursor="ew-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'w', event);
              }}
            >
              <rect
                x={box.x - 5}
                y={box.y + box.height / 2 - 16}
                width="10"
                height="32"
                rx="5"
                fill={handleFill}
                stroke={selectedStroke}
                strokeWidth="1.5"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.18))"
              />
              <line
                x1={box.x}
                y1={box.y + box.height / 2 - 6}
                x2={box.x}
                y2={box.y + box.height / 2 + 6}
                stroke={selectedStroke}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>

            {/* Tirador lateral derecho (E) */}
            <g
              cursor="ew-resize"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'e', event);
              }}
            >
              <rect
                x={box.x + box.width - 5}
                y={box.y + box.height / 2 - 16}
                width="10"
                height="32"
                rx="5"
                fill={handleFill}
                stroke={selectedStroke}
                strokeWidth="1.5"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.18))"
              />
              <line
                x1={box.x + box.width}
                y1={box.y + box.height / 2 - 6}
                x2={box.x + box.width}
                y2={box.y + box.height / 2 + 6}
                stroke={selectedStroke}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>

            {/* Esquinas (NW, NE, SE, SW) */}
            <rect
              x={box.x - 5}
              y={box.y - 5}
              width="10"
              height="10"
              rx="2.5"
              fill={handleFill}
              stroke={selectedStroke}
              strokeWidth="1.5"
              cursor="nwse-resize"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'nw', event);
              }}
            />
            <rect
              x={box.x + box.width - 5}
              y={box.y - 5}
              width="10"
              height="10"
              rx="2.5"
              fill={handleFill}
              stroke={selectedStroke}
              strokeWidth="1.5"
              cursor="nesw-resize"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'ne', event);
              }}
            />
            <rect
              x={box.x + box.width - 5}
              y={box.y + box.height - 5}
              width="10"
              height="10"
              rx="2.5"
              fill={handleFill}
              stroke={selectedStroke}
              strokeWidth="1.5"
              cursor="nwse-resize"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'se', event);
              }}
            />
            <rect
              x={box.x - 5}
              y={box.y + box.height - 5}
              width="10"
              height="10"
              rx="2.5"
              fill={handleFill}
              stroke={selectedStroke}
              strokeWidth="1.5"
              cursor="nesw-resize"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.15))"
              onPointerDown={(event) => {
                event.stopPropagation();
                onFragmentResizePointerDown?.(fragment, 'sw', event);
              }}
            />

            {/* Badge interactivo de absorción o expulsión en tiempo real */}
            {boundaryResizePreview?.fragmentId === fragment.id && boundaryResizePreview.isValid && (boundaryResizePreview.absorbedIds.length > 0 || boundaryResizePreview.ejectedIds.length > 0 || boundaryResizePreview.isReallocated) ? (() => {
              const numAbs = boundaryResizePreview.absorbedIds.length;
              const numEj = boundaryResizePreview.ejectedIds.length;
              const badgeText = numAbs > 0 && numEj > 0
                ? `+ ${numAbs} / - ${numEj} mensajes`
                : numAbs > 0
                  ? `+ ${numAbs} mensaje${numAbs > 1 ? 's' : ''}`
                  : numEj > 0
                    ? `- ${numEj} mensaje${numEj > 1 ? 's' : ''}`
                    : 'reubicado entre ramas';
              const badgeWidth = Math.max(128, badgeText.length * 8 + 24);
              const isTopOrMove = boundaryResizePreview.edge === 'top' || boundaryResizePreview.edge === 'move';
              const showBadgeBelow = !isTopOrMove || box.y < 32;
              const badgeY = showBadgeBelow ? box.y + box.height + 10 : box.y - 28;
              const textY = showBadgeBelow ? box.y + box.height + 25 : box.y - 13;
              const badgeFill = numAbs > 0 && numEj > 0 ? selectedStroke : numAbs > 0 ? selectedStroke : numEj > 0 ? '#ea580c' : selectedStroke;
              return (
                <g pointerEvents="none">
                  <rect
                    x={box.x + box.width / 2 - badgeWidth / 2}
                    y={badgeY}
                    width={badgeWidth}
                    height="22"
                    rx="11"
                    fill={badgeFill}
                    filter="drop-shadow(0 2px 5px rgba(0,0,0,0.25))"
                  />
                  <text
                    x={box.x + box.width / 2}
                    y={textY}
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {badgeText}
                  </text>
                </g>
              );
            })() : null}
          </g>
        ) : null}
      </g>
    );
  };

  const renderMessage = (message: SequenceMessage) => {
    const box = layout.messageLayouts.get(message.id);
    const endpoints = getSequenceMessageEndpoints(content, layout, message);
    const sourceX = endpoints?.sourceX;
    const targetX = endpoints?.targetX;
    if (box === undefined || sourceX === undefined || targetX === undefined) return null;
    const isMultiSelected = Boolean(selectedTimelineIds?.includes(message.id));
    const isSelected = (selected?.kind === 'message' && selected.id === message.id) || isMultiSelected;
    const isHighlighted = highlighted?.kind === 'message' && highlighted.id === message.id;
    const isBeingAbsorbed = boundaryResizePreview?.absorbedIds.includes(message.id) ?? false;
    const isBeingEjected = boundaryResizePreview?.ejectedIds.includes(message.id) ?? false;
    const lineStroke = isBeingAbsorbed
      ? (boundaryResizePreview?.isValid ? selectedStroke : '#ef4444')
      : isBeingEjected
        ? (boundaryResizePreview?.isValid ? '#ea580c' : '#ef4444')
        : isSelected || isHighlighted ? selectedStroke : stroke;
    const sourceName = content.participants.find((participant) => participant.id === message.sourceId);
    const targetName = content.participants.find((participant) => participant.id === message.targetId);
    const isSelf = message.sourceId === message.targetId;
    const dashed = message.type === 'return' || message.type === 'create';
    const marker = message.type === 'synchronous'
      ? (isSelected || isHighlighted ? 'url(#sequence-arrow-filled-preview)' : 'url(#sequence-arrow-filled)')
      : (isSelected || isHighlighted ? 'url(#sequence-arrow-preview)' : 'url(#sequence-arrow-open)');
    const path = isSelf
      ? `M ${sourceX} ${box.y} H ${Math.max(sourceX, targetX) + 52} v 30 H ${targetX}`
      : `M ${sourceX} ${box.y} L ${targetX} ${box.y}`;

    return (
      <g
        key={message.id}
        aria-label={`Mensaje ${message.type === 'return' ? 'de retorno' : message.name || message.type} de ${sourceName ? formatSequenceParticipantName(sourceName) : 'participante no disponible'} a ${targetName ? formatSequenceParticipantName(targetName) : 'participante no disponible'}`}
        className={`sequence-message ${isHighlighted ? 'sequence-highlighted' : ''} ${isMultiSelected ? 'sequence-multi-selected' : ''} ${isBeingAbsorbed ? 'sequence-message-being-absorbed' : ''} ${isBeingEjected ? 'sequence-message-being-ejected' : ''}`}
        data-sequence-message-bottom={box.y + box.height / 2}
        data-sequence-message-top={box.y - box.height / 2}
        data-selected={isSelected || undefined}
        data-multi-selected={isMultiSelected || undefined}
        data-highlighted={isHighlighted || undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target instanceof Element && event.target.hasAttribute('data-export-control'))) return;
          onReorderMessagePointerDown?.(message, event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (onTimelineItemSelect && (event.shiftKey || event.metaKey || event.ctrlKey)) {
            onTimelineItemSelect(message.id, true);
          } else {
            onSelect({ kind: 'message', id: message.id });
          }
        }}
        onKeyDown={(event) => handleItemKeyDown(event, { kind: 'message', id: message.id }, () => onEditMessage?.(message.id))}
        onDoubleClick={(event) => {
          if (!onEditMessage) return;
          event.stopPropagation();
          onEditMessage(message.id);
        }}
      >
        <path d={path} fill="none" stroke={lineStroke} strokeWidth={isSelected ? 2.1 : isHighlighted ? 2.2 : 1.35} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? '7 5' : undefined} markerEnd={message.type === 'destroy' ? undefined : marker} />
        <path d={path} fill="none" stroke="transparent" strokeWidth="16" cursor={interactive ? 'grab' : undefined} />
        {message.type === 'destroy' && !layout.terminatedParticipantIds?.has(message.targetId) ? (
          <g stroke={lineStroke} strokeWidth="2">
            <line x1={targetX - 8} y1={box.y - 8} x2={targetX + 8} y2={box.y + 8} />
            <line x1={targetX + 8} y1={box.y - 8} x2={targetX - 8} y2={box.y + 8} />
          </g>
        ) : null}
        {box.labelLines.length > 0 ? (
          <g>
            {/* Hit area only: a filled box showed as a white patch inside fragments. */}
            <rect x={box.labelCenterX - box.labelWidth / 2} y={box.labelTop - 2} width={box.labelWidth} height={box.labelBottom - box.labelTop + 4} fill="transparent" />
            {/* A halo the shape of the letters keeps lifelines from crossing the text. */}
            <text x={box.labelCenterX} y={box.labelBaselineY} fill={textColor} fontSize="11.5" fontWeight={540} textAnchor="middle" paintOrder="stroke" stroke={canvasBackground} strokeWidth={3.5} strokeLinejoin="round">
              {missingInModel?.messageIds.has(message.id) ? <title>No está en el modelo de clases</title> : null}
              {box.labelLines.map((line, index) => <tspan key={`${message.id}:${index}`} x={box.labelCenterX} dy={index === 0 ? 0 : 14}>{line}</tspan>)}
            </text>
          </g>
        ) : null}
        {box.flowLines.length > 0 && box.flowBaselineY !== undefined ? (
          <text x={box.labelCenterX} y={box.flowBaselineY} fill={muted} fontSize="9.5" textAnchor="middle">
            {box.flowLines.map((line, index) => <tspan key={`${message.id}:flow:${index}`} x={box.labelCenterX} dy={index === 0 ? 0 : 12}>{line}</tspan>)}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <svg
      aria-describedby={interactive ? ariaDescriptionId : undefined}
      aria-hidden={interactive ? undefined : true}
      aria-label="Diagrama de secuencia"
      className="sequence-diagram-svg"
      data-sequence-export-root="true"
      height={layout.height}
      onClick={(event) => {
        if (suppressClickAfterMarqueeRef.current) {
          suppressClickAfterMarqueeRef.current = false;
          return;
        }
        onSelect(null);
        const box = svgElementRef.current?.getBoundingClientRect();
        if (onBackgroundPoint && box && box.width > 0 && box.height > 0) {
          onBackgroundPoint({
            x: (event.clientX - box.left) * (layout.width / box.width),
            y: (event.clientY - box.top) * (layout.height / box.height),
          });
        }
      }}
      onClickCapture={(event) => {
        // El clic que cierra un marquee no debe cambiar la selección.
        if (suppressClickAfterMarqueeRef.current) {
          suppressClickAfterMarqueeRef.current = false;
          event.stopPropagation();
        }
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerCancel}
      role={interactive ? 'group' : 'img'}
      tabIndex={interactive ? -1 : undefined}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="Arial, sans-serif"
      ref={(element) => {
        svgElementRef.current = element;
        svgRef?.(element);
      }}
    >
      <defs>
        <filter id="sequence-note-shadow" x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.7" floodColor="#344149" floodOpacity="0.09" />
        </filter>
        <marker id="sequence-arrow-filled" markerHeight="8" markerUnits="strokeWidth" markerWidth="10" orient="auto" refX="10" refY="4" viewBox="0 0 10 8">
          <path d="M 0 0 L 10 4 L 0 8 Z" fill={stroke} />
        </marker>
        <marker id="sequence-arrow-open" markerHeight="9" markerUnits="strokeWidth" markerWidth="11" orient="auto" refX="10" refY="4.5" viewBox="0 0 11 9">
          <path d="M 1 1 L 10 4.5 L 1 8" fill="none" stroke={stroke} strokeWidth="1.3" />
        </marker>
        <marker id="sequence-arrow-preview" markerHeight="9" markerUnits="strokeWidth" markerWidth="11" orient="auto" refX="10" refY="4.5" viewBox="0 0 11 9">
          <path d="M 1 1 L 10 4.5 L 1 8" fill="none" stroke={selectedStroke} strokeWidth="1.5" />
        </marker>
        <marker id="sequence-arrow-filled-preview" markerHeight="8" markerUnits="strokeWidth" markerWidth="10" orient="auto" refX="10" refY="4" viewBox="0 0 10 8">
          <path d="M 0 0 L 10 4 L 0 8 Z" fill={selectedStroke} />
        </marker>
        <pattern id="sequence-paper-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.62" fill={canvasGrid} opacity={0.72} />
        </pattern>
      </defs>
      <rect width={layout.width} height={layout.height} fill={canvasBackground} />
      <rect data-export-control="true" width={layout.width} height={layout.height} fill="url(#sequence-paper-grid)" />

      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const startY = layout.participantStartY.get(participant.id) ?? SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT;
        const endY = layout.participantEndY.get(participant.id) ?? layout.height - 50;
        const identity = participantIdentities.get(participant.id);
        const lifelineStroke = lifelineNeutral ?? identity?.lifelineStroke ?? stroke;
        return (
          <g key={`life:${participant.id}`}>
            <line x1={x} y1={startY} x2={x} y2={endY} stroke={lifelineStroke} strokeDasharray="4 5" strokeWidth={1.05} opacity={0.86} />
          </g>
        );
      })}
      {/* Layers, bottom to top: lifelines, opaque fragment tints (so nesting never
          stacks translucency), the same lifelines again but faint (the fragment
          "covers" them), end-of-life crosses and activations (always crisp),
          then fragment borders, tabs and guards. */}
      {Array.from(layout.fragmentLayouts.entries())
        .sort(([, a], [, b]) => a.depth - b.depth)
        .map(([id, box]) => (
          <rect key={`fragment-tint:${id}`} data-sequence-fragment-tint={id} x={box.x} y={box.y} width={box.width} height={box.height} fill={box.depth % 2 === 1 ? nestedFragmentFill : fragmentFill} pointerEvents="none" />
        ))}
      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const startY = layout.participantStartY.get(participant.id) ?? SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT;
        const endY = layout.participantEndY.get(participant.id) ?? layout.height - 50;
        const identity = participantIdentities.get(participant.id);
        const lifelineStroke = lifelineNeutral ?? identity?.lifelineStroke ?? stroke;
        return (
          <line key={`life-faint:${participant.id}`} x1={x} y1={startY} x2={x} y2={endY} stroke={lifelineStroke} strokeDasharray="4 5" strokeWidth={1.05} opacity={0.6} pointerEvents="none" />
        );
      })}
      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const endY = layout.participantEndY.get(participant.id) ?? layout.height - 50;
        const identity = participantIdentities.get(participant.id);
        const lifelineStroke = lifelineNeutral ?? identity?.lifelineStroke ?? stroke;
        const isTerminated = layout.terminatedParticipantIds?.has(participant.id) || layout.participantLayouts.get(participant.id)?.isTerminated;
        return isTerminated ? (
          <g key={`cross:${participant.id}`} data-sequence-lifeline-cross="true" stroke={lifelineStroke} strokeWidth="2">
            <line x1={x - 8} y1={endY - 8} x2={x + 8} y2={endY + 8} />
            <line x1={x + 8} y1={endY - 8} x2={x - 8} y2={endY + 8} />
          </g>
        ) : null;
      })}

      {content.showActivations ? layout.activationLayouts.map((activation) => {
        const identity = participantIdentities.get(activation.participantId);
        const baseFill = identity?.activationFill ?? participantFill;
        const border = identity?.activationBorder ?? stroke;
        return <rect key={activation.id} x={activation.x} y={activation.y} width={activation.width} height={activation.height} rx="1.5" fill={baseFill} fillOpacity={activation.level > 0 ? 0.68 : 0.88} stroke={border} strokeWidth="1" />;
      }) : null}

      {Array.from(layout.fragmentLayouts.entries())
        .sort(([, a], [, b]) => a.depth - b.depth)
        .map(([id]) => {
          const item = findSequenceItem(content.items, id);
          return item && item.kind === 'fragment' ? renderFragment(item) : null;
        })}

      {onConnect ? content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id);
        const startY = layout.participantStartY.get(participant.id);
        const endY = layout.participantEndY.get(participant.id);
        if (x === undefined || startY === undefined || endY === undefined) return null;
        return (
          <rect
            key={`lifeline-hit:${participant.id}`}
            data-export-control="true"
            data-sequence-lifeline-hit={participant.id}
            x={x - 22}
            y={startY}
            width="44"
            height={Math.max(1, endY - startY)}
            fill="transparent"
            pointerEvents="all"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => handleLifelinePointerDown(participant.id, event)}
          />
        );
      }) : null}

      {layout.orderedMessages.map(renderMessage)}

      {insertionGuide ? (() => {
        const x1 = insertionGuide.bounds
          ? Math.max(24, insertionGuide.bounds.x + 8)
          : 30;
        const x2 = insertionGuide.bounds
          ? Math.min(layout.width - 24, insertionGuide.bounds.x + insertionGuide.bounds.width - 8)
          : layout.width - 30;
        const centerX = (x1 + x2) / 2;
        const labelText = insertionGuide.isValid
          ? (insertionGuide.containerName ? `Insertar en ${insertionGuide.containerName}` : 'Insertar aquí')
          : (insertionGuide.reason || 'Posición no válida');
        const pillWidth = Math.min(340, Math.max(160, labelText.length * 7.5 + 24));
        return (
          <g data-export-control="true" className="sequence-insertion-guide" pointerEvents="none">
            {insertionGuide.containerBounds ? (
              <rect
                className="sequence-drop-zone-overlay"
                x={insertionGuide.containerBounds.x}
                y={insertionGuide.containerBounds.top}
                width={insertionGuide.containerBounds.width}
                height={Math.max(24, insertionGuide.containerBounds.bottom - insertionGuide.containerBounds.top)}
                rx="6"
                fill={insertionGuide.isValid ? selectedStroke : '#ef4444'}
                fillOpacity="0.08"
                stroke={insertionGuide.isValid ? selectedStroke : '#ef4444'}
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            ) : null}
            <line
              x1={x1}
              y1={insertionGuide.y}
              x2={x2}
              y2={insertionGuide.y}
              stroke={insertionGuide.isValid ? selectedStroke : '#ef4444'}
              strokeWidth="2.5"
              strokeDasharray={insertionGuide.isValid ? '6 3' : '4 2'}
            />
            <circle
              cx={x1 + 6}
              cy={insertionGuide.y}
              r="4"
              fill={insertionGuide.isValid ? selectedStroke : '#ef4444'}
            />
            <circle
              cx={x2 - 6}
              cy={insertionGuide.y}
              r="4"
              fill={insertionGuide.isValid ? selectedStroke : '#ef4444'}
            />
            <g transform={`translate(${centerX}, ${insertionGuide.y - 12})`}>
              <rect
                x={-pillWidth / 2}
                y="-12"
                width={pillWidth}
                height="22"
                rx="11"
                fill={insertionGuide.isValid ? selectedStroke : '#ef4444'}
                opacity="0.95"
              />
              <text
                x="0"
                y="3"
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
              >
                {labelText}
              </text>
            </g>
          </g>
        );
      })() : null}

      {keyboardPreview ? (() => {
        const sourceX = layout.participantX.get(keyboardPreview.sourceId);
        if (sourceX === undefined) return null;
        const targetX = keyboardPreview.targetId
          ? layout.participantX.get(keyboardPreview.targetId) ?? sourceX
          : keyboardPreview.targetX ?? sourceX;
        const sourceStart = layout.participantStartY.get(keyboardPreview.sourceId) ?? layout.timelineStart;
        const sourceEnd = layout.participantEndY.get(keyboardPreview.sourceId) ?? layout.height - 40;
        const targetStart = keyboardPreview.targetId
          ? layout.participantStartY.get(keyboardPreview.targetId) ?? layout.timelineStart
          : layout.timelineStart;
        const targetEnd = keyboardPreview.targetId
          ? layout.participantEndY.get(keyboardPreview.targetId) ?? layout.height - 40
          : layout.height - 40;
        const showArrow = keyboardPreview.stage === 'aim' || keyboardPreview.stage === 'typing';
        const isSelf = keyboardPreview.targetId === keyboardPreview.sourceId && !keyboardPreview.ghost;
        const direction = targetX >= sourceX ? 1 : -1;
        const targetHalfWidth = keyboardPreview.ghost
          ? 70
          : ((layout.participantLayouts.get(keyboardPreview.targetId ?? '')?.headerWidth ?? 160) / 2);
        const effectiveTargetX = keyboardPreview.type === 'create'
          ? targetX - direction * targetHalfWidth
          : targetX;
        const path = isSelf
          ? `M ${sourceX} ${keyboardPreview.y} h ${52 * direction} v 26 h ${-52 * direction}`
          : `M ${sourceX} ${keyboardPreview.y} L ${effectiveTargetX} ${keyboardPreview.y}`;
        const dashed = keyboardPreview.type === 'return' || keyboardPreview.type === 'create';
        const marker = keyboardPreview.type === 'synchronous'
          ? 'url(#sequence-arrow-filled-preview)'
          : 'url(#sequence-arrow-preview)';
        const previewStroke = keyboardPreview.valid === false ? '#ef4444' : selectedStroke;
        return (
          <g data-export-control="true" className="sequence-keyboard-svg-preview" pointerEvents="none">
            <rect
              x={sourceX - 27}
              y={Math.max(sourceStart, keyboardPreview.y - 34)}
              width="54"
              height={Math.max(68, Math.min(sourceEnd, keyboardPreview.y + 34) - Math.max(sourceStart, keyboardPreview.y - 34))}
              rx="12"
              fill={selectedStroke}
              opacity="0.1"
              stroke={selectedStroke}
              strokeWidth="2"
            />
            {keyboardPreview.targetId && keyboardPreview.targetId !== keyboardPreview.sourceId ? (
              <rect
                x={targetX - 27}
                y={Math.max(targetStart, keyboardPreview.y - 34)}
                width="54"
                height={Math.max(68, Math.min(targetEnd, keyboardPreview.y + 34) - Math.max(targetStart, keyboardPreview.y - 34))}
                rx="12"
                fill={selectedStroke}
                opacity="0.07"
                stroke={selectedStroke}
                strokeDasharray="4 3"
              />
            ) : null}
            {showArrow ? (
              <>
                <path
                  d={path}
                  fill="none"
                  stroke={previewStroke}
                  strokeDasharray={dashed ? '7 5' : undefined}
                  strokeWidth="2.5"
                  markerEnd={marker}
                />
                {keyboardPreview.type === 'destroy' ? (
                  <g stroke={previewStroke} strokeWidth="2.4">
                    <line x1={targetX - 7} y1={keyboardPreview.y + 13} x2={targetX + 7} y2={keyboardPreview.y + 27} />
                    <line x1={targetX + 7} y1={keyboardPreview.y + 13} x2={targetX - 7} y2={keyboardPreview.y + 27} />
                  </g>
                ) : null}
                {keyboardPreview.label ? (
                  <text
                    x={isSelf ? sourceX + 58 * direction : (sourceX + effectiveTargetX) / 2}
                    y={keyboardPreview.y - 10}
                    fill={previewStroke}
                    fontSize="11"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {keyboardPreview.label.slice(0, 64)}
                  </text>
                ) : null}
              </>
            ) : null}
            {keyboardPreview.ghost ? (
              <g opacity="0.82">
                <rect
                  x={targetX - 75}
                  y={keyboardPreview.y - 24}
                  width="150"
                  height="48"
                  rx="5"
                  fill={participantFill}
                  stroke={previewStroke}
                  strokeDasharray="6 4"
                  strokeWidth="2"
                />
                <text x={targetX} y={keyboardPreview.y + 4} fill={textColor} fontSize="11" fontWeight="bold" textAnchor="middle">
                  {keyboardPreview.ghost.label || ':Nuevo objeto'}
                </text>
                <line x1={targetX} y1={keyboardPreview.y + 24} x2={targetX} y2={layout.height - 40} stroke={previewStroke} strokeDasharray="6 5" />
              </g>
            ) : null}
          </g>
        );
      })() : null}

      {onConnect && connection?.targetId ? (() => {
        const target = content.participants.find((participant) => participant.id === connection.targetId);
        const targetX = target ? layout.participantX.get(target.id) : undefined;
        const targetStartY = target ? layout.participantStartY.get(target.id) : undefined;
        const targetEndY = target ? layout.participantEndY.get(target.id) : undefined;
        if (!target || targetX === undefined || targetStartY === undefined || targetEndY === undefined) return null;
        return <rect data-export-control="true" data-sequence-lifeline-target={target.id} x={targetX - 25} y={targetStartY} width="50" height={Math.max(1, targetEndY - targetStartY)} fill={selectedStroke} opacity="0.1" stroke={selectedStroke} strokeDasharray="4 4" pointerEvents="none" />;
      })() : null}

      {onConnect && connection ? (() => {
        const sourceX = layout.participantX.get(connection.sourceId);
        if (sourceX === undefined) return null;
        const targetX = connection.targetId
          ? layout.participantX.get(connection.targetId) ?? connection.x
          : connection.x;
        const direction = targetX >= sourceX ? 1 : -1;
        const isRightToLeft = targetX < sourceX;
        const self = connection.targetId === connection.sourceId;
        const path = self
          ? `M ${sourceX} ${connection.y} h ${52 * direction} v 24 h ${-52 * direction}`
          : `M ${sourceX} ${connection.y} L ${targetX} ${connection.y}`;
        return (
          <path
            data-export-control="true"
            data-sequence-connection-preview="true"
            d={path}
            fill="none"
            stroke={selectedStroke}
            strokeWidth="2"
            strokeDasharray={isRightToLeft ? '6 4' : undefined}
            markerEnd={isRightToLeft ? 'url(#sequence-arrow-preview)' : 'url(#sequence-arrow-filled-preview)'}
            pointerEvents="none"
          />
        );
      })() : null}

      {content.participants.map((participant) => {
        const x = layout.participantX.get(participant.id) ?? 0;
        const createY = participant.createdByMessageId ? layout.messageLayouts.get(participant.createdByMessageId)?.y : undefined;
        const header = layout.participantLayouts.get(participant.id);
        const headerY = header?.headerY ?? (createY === undefined ? SEQUENCE_HEADER_Y : createY - SEQUENCE_HEADER_HEIGHT / 2);
        const headerWidth = header?.headerWidth ?? 160;
        const headerHeight = header?.headerHeight ?? SEQUENCE_HEADER_HEIGHT;
        const isActor = participant.kind === 'actor';
        const isSelected = selected?.kind === 'participant' && selected.id === participant.id;
        const isHighlighted = highlighted?.kind === 'participant' && highlighted.id === participant.id;
        const name = formatSequenceParticipantName(participant);
        const nameLines = header?.nameLines ?? [name];
        const nameBaselineY = header?.nameBaselineY ?? headerY + (isActor ? 72 : 29);
        const identity = participantIdentities.get(participant.id);
        const headerFill = identity?.headerFill ?? participantFill;
        const headerBorder = identity?.headerBorder ?? participantBorder;
        const glyphStroke = isSelected || isHighlighted ? selectedStroke : (isActor ? stroke : (identity?.glyphStroke ?? stroke));
        return (
          <g
            key={participant.id}
            aria-label={`Participante ${name}`}
            className={`sequence-participant ${isHighlighted ? 'sequence-highlighted' : ''}`}
            data-selected={isSelected || undefined}
            data-highlighted={isHighlighted || undefined}
            data-sequence-top-header={createY === undefined ? 'true' : undefined}
            data-participant-id={participant.id}
            data-sequence-participant-id={participant.id}
            data-sequence-label={name}
            data-sequence-x={x}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'participant', id: participant.id }); }}
            onDoubleClick={(event) => { event.stopPropagation(); onSelect({ kind: 'participant', id: participant.id }); }}
            onKeyDown={(event) => handleItemKeyDown(event, { kind: 'participant', id: participant.id })}
          >
            <g
              data-sequence-participant-header="true"
              onPointerDown={(event) => onParticipantPointerDown(participant, event)}
            >
              {isActor ? (
                <>
                  <ParticipantGlyph participant={participant} x={x} y={headerY} stroke={glyphStroke} />
                  <text x={x} y={nameBaselineY} fill={textColor} fontSize="11" fontWeight="bold" textAnchor="middle">
                    {missingInModel?.participantIds.has(participant.id) ? <title>No está en el modelo de clases</title> : null}
                    {nameLines.map((line, index) => <tspan key={`${participant.id}:name:${index}`} x={x} dy={index === 0 ? 0 : 14} fill={index === 0 ? textColor : muted} fontWeight={index === 0 ? 720 : 580}>{line}</tspan>)}
                  </text>
                  <rect data-export-control="true" x={x - headerWidth / 2} y={headerY} width={headerWidth} height={headerHeight} fill="transparent" stroke={isSelected || isHighlighted ? selectedStroke : 'transparent'} strokeWidth={isSelected ? 2 : isHighlighted ? 2.4 : 2} />
                </>
              ) : (
                <>
                  <rect x={x - headerWidth / 2} y={headerY} width={headerWidth} height={headerHeight} rx="3" fill={headerFill} stroke={isSelected || isHighlighted ? selectedStroke : headerBorder} strokeWidth={isSelected ? 2 : isHighlighted ? 2.4 : 1.2} />
                  <text x={x} y={nameBaselineY} fill={textColor} fontSize="11" fontWeight="bold" textAnchor="middle">
                    {missingInModel?.participantIds.has(participant.id) ? <title>No está en el modelo de clases</title> : null}
                    {nameLines.map((line, index) => <tspan key={`${participant.id}:name:${index}`} x={x} dy={index === 0 ? 0 : 14} fill={index === 0 ? textColor : muted} fontWeight={index === 0 ? 720 : 580}>{line}</tspan>)}
                  </text>
                </>
              )}
            </g>
            {keyboardParticipantNumbers?.has(participant.id) ? (
              <g data-export-control="true" className="sequence-keyboard-number" aria-hidden="true" pointerEvents="none">
                <rect x={x + headerWidth / 2 - 9} y={headerY - 9} width="18" height="18" rx="4" fill={selectedStroke} />
                <text x={x + headerWidth / 2} y={headerY + 4} fill={participantFill} fontSize="11" fontWeight="bold" textAnchor="middle">
                  {keyboardParticipantNumbers.get(participant.id)}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

      {content.notes.map((note) => {
        const isMultiSelected = Boolean(selectedTimelineIds?.includes(note.id));
        const isSelected = (selected?.kind === 'note' && selected.id === note.id) || isMultiSelected;
        const isHighlighted = highlighted?.kind === 'note' && highlighted.id === note.id;
        const isEditing = editingNoteId === note.id;
        const noteBox = layout.noteLayouts.get(note.id);
        if (noteBox === undefined) return null;
        const noteScheme = resolveSequenceNoteScheme(theme, note.color);
        // Matches the inline textarea: its 1px border plus the shared padding.
        const noteTextX = noteBox.x + SEQUENCE_NOTE_PADDING_X + 1;
        const anchorPoint = note.anchorKind === 'message' && note.anchorId
          ? (() => {
              const message = layout.orderedMessages.find((candidate) => candidate.id === note.anchorId);
              const messageLayout = layout.messageLayouts.get(note.anchorId);
              if (!message || !messageLayout) return undefined;
              const sourceX = layout.participantX.get(message.sourceId) ?? 0;
              const targetX = layout.participantX.get(message.targetId) ?? sourceX;
              return { x: (sourceX + targetX) / 2, y: messageLayout.y };
            })()
          : note.anchorKind === 'fragment' && note.anchorId
            ? (() => {
                const fragment = layout.fragmentLayouts.get(note.anchorId);
                return fragment ? { x: fragment.x + fragment.width, y: fragment.y + fragment.headerHeight } : undefined;
              })()
            : note.anchorKind === 'participant' && note.anchorId
              ? (() => {
                  const x = layout.participantX.get(note.anchorId);
                  if (x === undefined) return undefined;
                  return { x, y: layout.participantStartY.get(note.anchorId) ?? SEQUENCE_HEADER_Y + SEQUENCE_HEADER_HEIGHT };
                })()
              : undefined;
        return (
          <g
            key={note.id}
            aria-label={`Nota: ${note.text || 'sin texto'}`}
            className={`sequence-note ${isHighlighted ? 'sequence-highlighted' : ''} ${isMultiSelected ? 'sequence-multi-selected' : ''}`}
            data-selected={isSelected || undefined}
            data-multi-selected={isMultiSelected || undefined}
            data-highlighted={isHighlighted || undefined}
            data-editing={isEditing || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={(event) => { event.stopPropagation(); onSelect({ kind: 'note', id: note.id }); }}
            onKeyDown={(event) => handleItemKeyDown(event, { kind: 'note', id: note.id }, () => onEditNote?.(note.id))}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onSelect({ kind: 'note', id: note.id });
              onEditNote?.(note.id);
            }}
            onPointerDown={(event) => onNotePointerDown(note, event)}
          >
            {anchorPoint ? (
              <g>
                <circle cx={anchorPoint.x} cy={anchorPoint.y} r="3" fill={noteScheme.connectionLine} />
                <line
                  x1={anchorPoint.x}
                  y1={anchorPoint.y}
                  x2={noteBox.x + noteBox.width / 2}
                  y2={noteBox.y + noteBox.height / 2}
                  stroke={noteScheme.connectionLine}
                  strokeWidth="1.4"
                  strokeDasharray="4 4"
                />
              </g>
            ) : null}
            {!isEditing ? (
              <>
                <g filter="url(#sequence-note-shadow)">
                  <path
                    d={`M ${noteBox.x} ${noteBox.y} H ${noteBox.x + noteBox.width - 16} L ${noteBox.x + noteBox.width} ${noteBox.y + 16} V ${noteBox.y + noteBox.height} H ${noteBox.x} Z`}
                    fill={noteScheme.background}
                    stroke={isSelected || isHighlighted ? selectedStroke : noteScheme.border}
                    strokeWidth={isSelected ? 1.8 : isHighlighted ? 2.2 : 1.1}
                    strokeLinejoin="round"
                  />
                  <path
                    d={`M ${noteBox.x + noteBox.width - 16} ${noteBox.y} V ${noteBox.y + 16} H ${noteBox.x + noteBox.width} Z`}
                    fill={noteScheme.fold}
                    stroke={isSelected || isHighlighted ? selectedStroke : noteScheme.border}
                    strokeWidth={isSelected ? 1.8 : isHighlighted ? 2.2 : 1.1}
                    strokeLinejoin="round"
                  />
                </g>
                {note.text ? (
                  <text x={noteTextX} y={noteBox.y + 22} fill={noteScheme.text} fontSize={SEQUENCE_NOTE_FONT_SIZE} fontFamily={SEQUENCE_NOTE_FONT_FAMILY} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    {noteBox.lines.map((line, index) => <tspan key={`${note.id}:${index}`} x={noteTextX} dy={index === 0 ? 0 : SEQUENCE_NOTE_LINE_HEIGHT}>{line}</tspan>)}
                  </text>
                ) : (
                  <text x={noteTextX} y={noteBox.y + 22} fill={noteScheme.text} opacity={0.45} fontStyle="italic" fontSize={SEQUENCE_NOTE_FONT_SIZE} fontFamily={SEQUENCE_NOTE_FONT_FAMILY} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    Doble clic o Enter para escribir
                  </text>
                )}
              </>
            ) : null}

            {isSelected && !isEditing ? (
              <g data-export-control="true">
                {/* Tirador lateral derecho (solo ancho) */}
                <rect
                  x={noteBox.x + noteBox.width - 7}
                  y={noteBox.y + noteBox.height / 2 - 16}
                  width="14"
                  height="32"
                  fill="transparent"
                  cursor="ew-resize"
                  onPointerDown={(event) => onNoteResizePointerDown(note, 'right', event)}
                />
                <rect
                  x={noteBox.x + noteBox.width - 4}
                  y={noteBox.y + noteBox.height / 2 - 8}
                  width="3"
                  height="16"
                  rx="2"
                  fill={selectedStroke}
                  stroke="#ffffff"
                  strokeWidth="0.9"
                  style={{ pointerEvents: 'none' }}
                />

                {/* Tirador inferior (solo alto) */}
                <rect
                  x={noteBox.x + noteBox.width / 2 - 16}
                  y={noteBox.y + noteBox.height - 7}
                  width="32"
                  height="14"
                  fill="transparent"
                  cursor="ns-resize"
                  onPointerDown={(event) => onNoteResizePointerDown(note, 'bottom', event)}
                />
                <rect
                  x={noteBox.x + noteBox.width / 2 - 8}
                  y={noteBox.y + noteBox.height - 4}
                  width="16"
                  height="4"
                  rx="2"
                  fill={selectedStroke}
                  stroke="#ffffff"
                  strokeWidth="0.9"
                  style={{ pointerEvents: 'none' }}
                />

                {/* Tirador de esquina (ancho y alto simultáneo) */}
                <rect
                  x={noteBox.x + noteBox.width - 12}
                  y={noteBox.y + noteBox.height - 12}
                  width="24"
                  height="24"
                  fill="transparent"
                  cursor="nwse-resize"
                  onPointerDown={(event) => onNoteResizePointerDown(note, 'corner', event)}
                />
                <rect
                  x={noteBox.x + noteBox.width - 8}
                  y={noteBox.y + noteBox.height - 8}
                  width="8"
                  height="8"
                  rx="2"
                  fill={selectedStroke}
                  stroke="#ffffff"
                  strokeWidth="0.9"
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            ) : null}
          </g>
        );
      })}
      {marquee ? (
        <g data-export-control="true" className="sequence-marquee" pointerEvents="none">
          <rect
            x={marquee.x}
            y={marquee.y}
            width={Math.max(1, marquee.width)}
            height={Math.max(1, marquee.height)}
            fill={selectedStroke}
            fillOpacity={0.12}
            stroke={selectedStroke}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            rx={2}
          />
        </g>
      ) : null}
    </svg>
  );
}

/* The canvas re-renders the whole diagram SVG. The editor above it holds 33
   pieces of state — panel toggles, dialogs, search text — most of which do not
   touch geometry, so memoising here keeps those out of the diagram's path. */
export const SequenceDiagramCanvas = memo(SequenceDiagramCanvasImpl);
SequenceDiagramCanvas.displayName = 'SequenceDiagramCanvas';
