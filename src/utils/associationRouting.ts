import { routeAroundObstacles, segmentCrossesObstacle, type RoutingObstacle } from './obstacleRouting';
import {
  getSmoothStepPath,
  getStraightPath,
  Position,
  type Node,
  type XYPosition,
} from 'reactflow';
import type {
  AssociationConnectionSide,
  AssociationLineStyle,
  ClassDiagramEdge,
  ConnectionSide,
  ParametricValuesNoteHandle,
} from '../types/diagram';
import { resolveAssociationLineStyle, type ResolvedAssociationLineStyle } from './association';

type NodeGeometry = Pick<Node, 'position' | 'width' | 'height'>;

export type AssociationHandleResolution = {
  sourceHandle: string;
  sourceSide: ConnectionSide;
  targetHandle: string;
  targetSide: ConnectionSide;
};

export type AssociationPathInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  lineStyle?: AssociationLineStyle;
  obstacles?: RoutingObstacle[];
};

export type AssociationPathResolution = {
  path: string;
  style: ResolvedAssociationLineStyle;
  labelX: number;
  labelY: number;
  source: XYPosition;
  target: XYPosition;
};

export type AssociationLabelPosition = {
  x: number;
  y: number;
};

const SIDE_TO_POSITION: Record<ConnectionSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const OPPOSITE_SIDE: Record<ConnectionSide, ConnectionSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

const getDimensions = (node: NodeGeometry): { width: number; height: number } => ({
  width: typeof node.width === 'number' && node.width > 0 ? node.width : 220,
  height: typeof node.height === 'number' && node.height > 0 ? node.height : 100,
});

export const getNodeCenter = (node: NodeGeometry): XYPosition => {
  const { width, height } = getDimensions(node);
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
};

const getAutomaticSides = (
  source: NodeGeometry,
  target: NodeGeometry,
): { sourceSide: ConnectionSide; targetSide: ConnectionSide } => {
  const sourceCenter = getNodeCenter(source);
  const targetCenter = getNodeCenter(target);
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const sourceSide: ConnectionSide = deltaX >= 0 ? 'right' : 'left';
    return { sourceSide, targetSide: OPPOSITE_SIDE[sourceSide] };
  }

  const sourceSide: ConnectionSide = deltaY >= 0 ? 'bottom' : 'top';
  return { sourceSide, targetSide: OPPOSITE_SIDE[sourceSide] };
};

const getHandleSlot = (
  side: ConnectionSide,
  node: NodeGeometry,
  oppositeCenter: XYPosition,
): 'start' | 'center' | 'end' => {
  const center = getNodeCenter(node);
  const { width, height } = getDimensions(node);
  const isHorizontalSide = side === 'top' || side === 'bottom';
  const delta = isHorizontalSide ? oppositeCenter.x - center.x : oppositeCenter.y - center.y;
  const threshold = (isHorizontalSide ? width : height) * 0.18;

  if (delta < -threshold) {
    return 'start';
  }

  if (delta > threshold) {
    return 'end';
  }

  return 'center';
};

const toHandleId = (side: ConnectionSide, slot: 'start' | 'center' | 'end'): string =>
  slot === 'center' ? side : `${side}-${slot}`;

const normalizeManualSide = (side: AssociationConnectionSide | undefined): ConnectionSide | null =>
  side !== undefined && side !== 'automatic' ? side : null;

export const resolveAssociationHandles = (
  edge: ClassDiagramEdge,
  source: NodeGeometry,
  target: NodeGeometry,
): AssociationHandleResolution => {
  const sourceManualSide = normalizeManualSide(edge.data?.sourceSide);
  const targetManualSide = normalizeManualSide(edge.data?.targetSide);
  const automaticSides = getAutomaticSides(source, target);
  const sourceSide =
    sourceManualSide ?? (targetManualSide !== null ? OPPOSITE_SIDE[targetManualSide] : automaticSides.sourceSide);
  const targetSide =
    targetManualSide ?? (sourceManualSide !== null ? OPPOSITE_SIDE[sourceManualSide] : automaticSides.targetSide);
  const sourceSlot = sourceManualSide === null
    ? getHandleSlot(sourceSide, source, getNodeCenter(target))
    : 'center';
  const targetSlot = targetManualSide === null
    ? getHandleSlot(targetSide, target, getNodeCenter(source))
    : 'center';

  return {
    sourceHandle: toHandleId(sourceSide, sourceSlot),
    sourceSide,
    targetHandle: toHandleId(targetSide, targetSlot),
    targetSide,
  };
};

const CONNECTION_HANDLE_IDS = new Set(
  (['top', 'right', 'bottom', 'left'] as const).flatMap((side) => [side, `${side}-start`, `${side}-end`]),
);

export const isConnectionHandleId = (handleId: string | null | undefined): handleId is string =>
  typeof handleId === 'string' && CONNECTION_HANDLE_IDS.has(handleId);

/**
 * The handles an edge is drawn with. A stored port is kept; a missing or
 * unknown one (an imported or AI-written relation) is chosen from where the
 * classes sit, instead of letting React Flow fall back to the first port of
 * the class, which sent every such relation to the same top-left point.
 */
export const resolveRenderedAssociationHandles = (
  edge: ClassDiagramEdge,
  source: NodeGeometry,
  target: NodeGeometry,
): { sourceHandle: string; targetHandle: string } => {
  const storedSource = isConnectionHandleId(edge.sourceHandle) ? edge.sourceHandle : null;
  const storedTarget = isConnectionHandleId(edge.targetHandle) ? edge.targetHandle : null;
  if (storedSource !== null && storedTarget !== null) return { sourceHandle: storedSource, targetHandle: storedTarget };
  if (edge.source === edge.target) {
    // The same corner loop the editor draws for a new self-relation.
    return { sourceHandle: storedSource ?? 'right-start', targetHandle: storedTarget ?? 'top-end' };
  }
  const automatic = resolveAssociationHandles(edge, source, target);
  return {
    sourceHandle: storedSource ?? automatic.sourceHandle,
    targetHandle: storedTarget ?? automatic.targetHandle,
  };
};

export const resolveAutomaticNoteHandles = (
  classNode: NodeGeometry,
  noteNode: NodeGeometry,
): { sourceHandle: ParametricValuesNoteHandle; targetHandle: ParametricValuesNoteHandle } => {
  const { sourceSide, targetSide } = getAutomaticSides(classNode, noteNode);
  return { sourceHandle: sourceSide, targetHandle: targetSide };
};

export const getConnectionSideFromHandle = (handleId: string | null | undefined): ConnectionSide | null => {
  const side = handleId?.split('-')[0];
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left' ? side : null;
};

export const getPositionForConnectionSide = (side: ConnectionSide): Position => SIDE_TO_POSITION[side];

export const buildAssociationPath = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  lineStyle,
  obstacles = [],
}: AssociationPathInput): AssociationPathResolution => {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  let style = resolveAssociationLineStyle(lineStyle, deltaX, deltaY);
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };

  if (lineStyle !== 'straight' && style === 'straight') {
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    const facingSides = horizontal
      ? deltaX >= 0
        ? sourcePosition === Position.Right && targetPosition === Position.Left
        : sourcePosition === Position.Left && targetPosition === Position.Right
      : deltaY >= 0
        ? sourcePosition === Position.Bottom && targetPosition === Position.Top
        : sourcePosition === Position.Top && targetPosition === Position.Bottom;

    if (facingSides) {
      // Shift at most 6px along each class border; markers share these endpoints.
      if (horizontal) source.y = target.y = (sourceY + targetY) / 2;
      else source.x = target.x = (sourceX + targetX) / 2;
    } else {
      style = 'orthogonal';
    }
  }

  const pathParams = {
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition,
    targetPosition,
  };
  const [path, labelX, labelY] = style === 'straight'
    ? getStraightPath(pathParams)
    : getSmoothStepPath({ ...pathParams, borderRadius: 0, offset: 24 });

  if (lineStyle !== 'straight' && obstacles.length > 0) {
    const direction = (position: Position): XYPosition => ({
      x: position === Position.Right ? 1 : position === Position.Left ? -1 : 0,
      y: position === Position.Bottom ? 1 : position === Position.Top ? -1 : 0,
    });
    if (style !== 'straight' || obstacles.some(rect => segmentCrossesObstacle(source, target, rect))) {
      const points = routeAroundObstacles(source, target, direction(sourcePosition), direction(targetPosition), obstacles);
      if (points !== null) {
        let longest = 0;
        let center = { x: labelX, y: labelY };
        for (let index = 1; index < points.length; index += 1) {
          const a = points[index - 1];
          const b = points[index];
          const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          if (length > longest) { longest = length; center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
        }
        return {
          path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' '),
          style: 'orthogonal', labelX: center.x, labelY: center.y, source, target,
        };
      }
    }
  }
  return { path, style, labelX, labelY, source, target };
};

export type SelfAssociationPathInput = {
  /** Where the relation leaves and re-enters the class, on its border. */
  source: XYPosition;
  target: XYPosition;
  sourcePosition: Position;
  targetPosition: Position;
  /** The class box, needed only when the two ends sit on opposite sides. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** How far the line stops short of each border, to leave room for a triangle or diamond. */
  sourceInset?: number;
  targetInset?: number;
  clearance?: number;
};

const OUTWARD: Record<Position, XYPosition> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
};

/**
 * A relation from a class to itself (a Singleton, an Empleado that manages
 * Empleados): a loop that leaves one side, goes around the corner it shares
 * with the other side, and comes back in. Ends on the same side make a
 * bracket on that side; opposite sides go around over the class.
 */
export const buildSelfAssociationPath = ({
  source: sourcePoint,
  target: targetPoint,
  sourcePosition,
  targetPosition,
  bounds,
  sourceInset = 0,
  targetInset = 0,
  clearance = 64,
}: SelfAssociationPathInput): AssociationPathResolution => {
  let source = sourcePoint;
  let target = targetPoint;
  const sourceOut = OUTWARD[sourcePosition];
  const targetOut = OUTWARD[targetPosition];
  if (Math.hypot(source.x - target.x, source.y - target.y) < 1) {
    // Both ends on the same point (both sides fixed to the same one): spread
    // them along the side so the loop stays a loop and the labels part.
    const along = { x: -sourceOut.y, y: sourceOut.x };
    const spread = 20;
    source = { x: source.x - along.x * spread, y: source.y - along.y * spread };
    target = { x: target.x + along.x * spread, y: target.y + along.y * spread };
  }
  const start = { x: source.x + sourceOut.x * sourceInset, y: source.y + sourceOut.y * sourceInset };
  const end = { x: target.x + targetOut.x * targetInset, y: target.y + targetOut.y * targetInset };
  const sourceAway = { x: source.x + sourceOut.x * clearance, y: source.y + sourceOut.y * clearance };
  const targetAway = { x: target.x + targetOut.x * clearance, y: target.y + targetOut.y * clearance };
  const perpendicular = sourceOut.x * targetOut.x + sourceOut.y * targetOut.y === 0;
  const sameSide = sourceOut.x === targetOut.x && sourceOut.y === targetOut.y;
  let middle: XYPosition[];

  if (perpendicular) {
    middle = [sourceAway, sourceOut.x !== 0 ? { x: sourceAway.x, y: targetAway.y } : { x: targetAway.x, y: sourceAway.y }, targetAway];
  } else if (sameSide) {
    if (sourceOut.x !== 0) {
      const x = sourceOut.x > 0 ? Math.max(sourceAway.x, targetAway.x) : Math.min(sourceAway.x, targetAway.x);
      middle = [{ x, y: source.y }, { x, y: target.y }];
    } else {
      const y = sourceOut.y > 0 ? Math.max(sourceAway.y, targetAway.y) : Math.min(sourceAway.y, targetAway.y);
      middle = [{ x: source.x, y }, { x: target.x, y }];
    }
  } else if (sourceOut.x !== 0) {
    // Left and right: over the top of the class.
    const top = bounds !== undefined ? bounds.y : Math.min(source.y, target.y) - clearance;
    const y = top - clearance;
    middle = [sourceAway, { x: sourceAway.x, y }, { x: targetAway.x, y }, targetAway];
  } else {
    // Top and bottom: around the right side of the class.
    const right = bounds !== undefined ? bounds.x + bounds.width : Math.max(source.x, target.x) + clearance;
    const x = right + clearance;
    middle = [sourceAway, { x, y: sourceAway.y }, { x, y: targetAway.y }, targetAway];
  }

  const points = [start, ...middle, end];
  let longest = -1;
  let label = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (length > longest) { longest = length; label = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  }

  return {
    path: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' '),
    style: 'orthogonal',
    labelX: label.x,
    labelY: label.y,
    source,
    target,
  };
};

export const getAssociationCenterLabelPosition = (
  labelX: number,
  labelY: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset = 14,
): AssociationLabelPosition => {
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: labelX, y: labelY - offset };
  }

  return { x: labelX + offset, y: labelY };
};

export const oppositeConnectionSide = (side: ConnectionSide): ConnectionSide => OPPOSITE_SIDE[side];
