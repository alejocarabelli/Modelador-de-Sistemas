import { AssociationTextLabel } from './AssociationTextLabel';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  useStore,
  type EdgeProps,
} from 'reactflow';
import { useRef, useState, type MouseEvent } from 'react';
import type { AssociationConnectionSide, AssociationEdgeData } from '../types/diagram';
import { buildAssociationPath, buildSelfAssociationPath, getAssociationCenterLabelPosition } from '../utils/associationRouting';
import { MultiplicityInput } from './MultiplicityInput';
import { DEFAULT_ASSOCIATION_DATA } from '../utils/association';
import { AssociationLineStyleToolbar, AssociationMultiplicityChips } from './AssociationQuickControls';

const edgeLabelStyle = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'all',
} as const;

type MultiplicityEnd = 'source' | 'target';

const sideToPosition: Record<Exclude<AssociationConnectionSide, 'automatic'>, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

const getOutwardUnit = (position: Position, fallback: { x: number; y: number }) => {
  if (position === Position.Top) {
    return { x: 0, y: -1 };
  }
  if (position === Position.Right) {
    return { x: 1, y: 0 };
  }
  if (position === Position.Bottom) {
    return { x: 0, y: 1 };
  }
  if (position === Position.Left) {
    return { x: -1, y: 0 };
  }
  return fallback;
};

type Vector = { x: number; y: number };

const getPathPoints = (path: string): Vector[] => {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Vector[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const point = { x: numbers[index], y: numbers[index + 1] };
    const last = points.at(-1);
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.5) points.push(point);
  }
  return points;
};

/**
 * The side of the line an end's labels go on: the one the drawn route does not
 * turn to after leaving the class, so the line never runs through them. A
 * route with no turn falls back to the side away from the other end.
 */
const getEndpointLabelSide = (outward: Vector, route: Vector[]): Vector => {
  const side = { x: -outward.y, y: outward.x };
  let turn: Vector | null = null;
  for (let index = 1; index + 1 < route.length; index += 1) {
    const segment = { x: route[index + 1].x - route[index].x, y: route[index + 1].y - route[index].y };
    if (Math.abs(segment.x * outward.y - segment.y * outward.x) > 0.5) {
      turn = segment;
      break;
    }
  }
  const last = route.at(-1);
  const first = route[0];
  const toward = turn ?? (last && first ? { x: last.x - first.x, y: last.y - first.y } : { x: 0, y: 0 });
  return toward.x * side.x + toward.y * side.y > 1 ? { x: -side.x, y: -side.y } : side;
};

const getEndpointLabelPosition = (
  endpoint: Vector,
  outward: Vector,
  side: Vector,
  rowOffset = 0,
) => {
  const alongOffset = 23;
  const sideOffset = 20;
  const perpendicularX = side.x * sideOffset;
  const perpendicularY = side.y * sideOffset;
  // Extend role rows away from the anchor: further out on the label's side of
  // a horizontal line, further along a vertical one.
  const rowDirection = side.y !== 0 ? Math.sign(side.y) : outward.y < 0 ? -1 : 1;

  return {
    x: endpoint.x + outward.x * alongOffset + perpendicularX,
    y: endpoint.y + outward.y * alongOffset + perpendicularY + rowDirection * rowOffset,
  };
};

/**
 * A multiplicity sits beside the line, as in a printed UML figure, and close
 * to its class: inside the first stretch of the line, before any bend, and
 * never on top of it, so the line is never cut or covered.
 */
const getMultiplicityLabelStyle = (endpoint: Vector, outward: Vector, side: Vector) => {
  const besideLine = 9;
  if (Math.abs(side.x) >= Math.abs(side.y)) {
    // Vertical line: the label to its left or right, centred 13px out of the class.
    return {
      ...edgeLabelStyle,
      left: endpoint.x + side.x * besideLine,
      top: endpoint.y + outward.y * 13,
      transform: `translate(${side.x < 0 ? '-100%' : '0'}, -50%)`,
    };
  }
  // Horizontal line: above or below it, starting just off the class border.
  return {
    ...edgeLabelStyle,
    left: endpoint.x + outward.x * 6,
    top: endpoint.y + side.y * 4,
    transform: `translate(${outward.x < 0 ? '-100%' : '0'}, ${side.y < 0 ? '-100%' : '0'})`,
  };
};

/**
 * The chips sit beside their own multiplicity, on the side of the line the
 * label is on, and never further along the line: on a short relation that
 * would carry them past the middle, next to the other end's label.
 */
const getMultiplicityChipsStyle = (
  label: Vector,
  outward: Vector,
  side: Vector,
  bounds: { left: number; right: number } | null,
) => {
  const width = 156;
  const gap = 14;
  let left: number;
  let top: number;
  let translateX: string;
  let translateY: string;

  if (Math.abs(side.x) >= Math.abs(side.y)) {
    // Vertical line: chips to the left or right of the label, at its height.
    left = label.x + Math.sign(side.x || 1) * gap;
    translateX = side.x < 0 ? '-100%' : '0';
    top = label.y;
    translateY = '-50%';
  } else {
    // Horizontal line: chips above or below the label, past the role row
    // (getEndpointLabelPosition stacks it on that side), starting at the class
    // border and running away from it so they never cover the class.
    const pastRole = 40;
    left = label.x - outward.x * 19;
    translateX = outward.x < 0 ? '-100%' : '0';
    top = label.y + Math.sign(side.y) * pastRole;
    translateY = side.y < 0 ? '-100%' : '0';
  }

  if (bounds !== null) {
    const startsAt = translateX === '-100%' ? left - width : left;
    const shift = Math.max(bounds.left - startsAt, Math.min(0, bounds.right - (startsAt + width)));
    left += shift;
  }

  return { ...edgeLabelStyle, left, top, transform: `translate(${translateX}, ${translateY})`, width };
};

const getOpenChevronPath = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
  length = 14,
  halfWidth = 7,
): string => {
  const baseX = endpoint.x + towardLine.x * length;
  const baseY = endpoint.y + towardLine.y * length;
  const perpendicularX = -towardLine.y * halfWidth;
  const perpendicularY = towardLine.x * halfWidth;

  return `M ${baseX + perpendicularX} ${baseY + perpendicularY} L ${endpoint.x} ${endpoint.y} L ${baseX - perpendicularX} ${baseY - perpendicularY}`;
};

// Marker depths along the line. The line stops exactly at the marker's base,
// so a hollow triangle or diamond closes against it with no gap.
const TRIANGLE_LENGTH = 20;
const DIAMOND_LENGTH = 22;

const getTrianglePoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const baseX = endpoint.x + towardLine.x * TRIANGLE_LENGTH;
  const baseY = endpoint.y + towardLine.y * TRIANGLE_LENGTH;
  const perpendicularX = -towardLine.y * 9;
  const perpendicularY = towardLine.x * 9;
  return `${endpoint.x},${endpoint.y} ${baseX + perpendicularX},${baseY + perpendicularY} ${baseX - perpendicularX},${baseY - perpendicularY}`;
};

const getDiamondPoints = (
  endpoint: { x: number; y: number },
  towardLine: { x: number; y: number },
): string => {
  const middleX = endpoint.x + towardLine.x * (DIAMOND_LENGTH / 2);
  const middleY = endpoint.y + towardLine.y * (DIAMOND_LENGTH / 2);
  const farX = endpoint.x + towardLine.x * DIAMOND_LENGTH;
  const farY = endpoint.y + towardLine.y * DIAMOND_LENGTH;
  const perpendicularX = -towardLine.y * 7;
  const perpendicularY = towardLine.x * 7;
  return `${endpoint.x},${endpoint.y} ${middleX + perpendicularX},${middleY + perpendicularY} ${farX},${farY} ${middleX - perpendicularX},${middleY - perpendicularY}`;
};

export function AssociationEdge({
  data,
  id,
  selected,
  source,
  target,
  sourcePosition,
  sourceX: handleSourceX,
  sourceY: handleSourceY,
  targetPosition,
  targetX: handleTargetX,
  targetY: handleTargetY,
}: EdgeProps<AssociationEdgeData>) {
  // An end spread along a crowded side is drawn from its own point, not the shared handle.
  const sourceX = data?.sourcePoint?.x ?? handleSourceX;
  const sourceY = data?.sourcePoint?.y ?? handleSourceY;
  const targetX = data?.targetPoint?.x ?? handleTargetX;
  const targetY = data?.targetPoint?.y ?? handleTargetY;
  const [editingMultiplicity, setEditingMultiplicity] = useState<MultiplicityEnd | null>(null);
  const [editingRole, setEditingRole] = useState<MultiplicityEnd | null>(null);
  const originalMultiplicityRef = useRef('');
  const viewportTransform = useStore(state => selected ? state.transform : null);
  const canvasWidth = useStore(state => selected ? state.width : 0);
  const chipsBounds = viewportTransform !== null && canvasWidth > 0 ? {
    left: (8 - viewportTransform[0]) / viewportTransform[2],
    right: (canvasWidth - 8 - viewportTransform[0]) / viewportTransform[2],
  } : null;
  const isSelfAssociation = source === target;
  // A loop only needs the class box when its ends sit on opposite sides; a
  // string keeps the selector stable while nothing moves.
  const selfBoundsKey = useStore(state => {
    if (!isSelfAssociation) return '';
    const node = state.nodeInternals.get(source);
    const position = node?.positionAbsolute ?? node?.position;
    return node && position ? `${position.x},${position.y},${node.width ?? 0},${node.height ?? 0}` : '';
  });
  const selfBounds = selfBoundsKey === '' ? undefined : (() => {
    const [x, y, width, height] = selfBoundsKey.split(',').map(Number);
    return { x, y, width, height };
  })();
  const edgeData = data ?? DEFAULT_ASSOCIATION_DATA;
  const relationType = edgeData.relationType ?? 'association';
  const supportsEndpoints = relationType === 'association'
    || relationType === 'aggregation'
    || relationType === 'composition';
  const lineStyle = edgeData.lineStyle ?? 'orthogonal';
  const effectiveSourcePosition =
    edgeData.sourceSide !== undefined && edgeData.sourceSide !== 'automatic'
      ? sideToPosition[edgeData.sourceSide]
      : sourcePosition;
  const effectiveTargetPosition =
    edgeData.targetSide !== undefined && edgeData.targetSide !== 'automatic'
      ? sideToPosition[edgeData.targetSide]
      : targetPosition;
  const markerEndPosition =
    relationType === 'realization' || relationType === 'dependency'
      ? 'target'
      : relationType === 'generalization'
        ? edgeData.triangleEnd ?? 'target'
        : edgeData.diamondEnd === 'target'
        ? 'target'
        : 'source';
  const selfPath = (sourceInset: number, targetInset: number) => buildSelfAssociationPath({
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    sourcePosition: effectiveSourcePosition,
    targetPosition: effectiveTargetPosition,
    bounds: selfBounds,
    sourceInset,
    targetInset,
  });
  const preliminaryPath = isSelfAssociation ? selfPath(0, 0) : buildAssociationPath({
    sourcePosition: effectiveSourcePosition,
    sourceX,
    sourceY,
    targetPosition: effectiveTargetPosition,
    targetX,
    targetY,
    lineStyle,
    obstacles: edgeData.routingObstacles,
  });
  const sourceEndpoint = preliminaryPath.source;
  const targetEndpoint = preliminaryPath.target;
  const deltaX = targetEndpoint.x - sourceEndpoint.x;
  const deltaY = targetEndpoint.y - sourceEndpoint.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const sourceOutward = getOutwardUnit(effectiveSourcePosition, { x: unitX, y: unitY });
  const targetOutward = getOutwardUnit(effectiveTargetPosition, { x: -unitX, y: -unitY });
  const sourcePathOutward = preliminaryPath.style === 'straight' ? { x: unitX, y: unitY } : sourceOutward;
  const targetPathOutward = preliminaryPath.style === 'straight' ? { x: -unitX, y: -unitY } : targetOutward;
  // Open arrows (association, dependency) end at the tip; triangles and diamonds at their base.
  const lineInset =
    relationType === 'generalization' || relationType === 'realization'
      ? TRIANGLE_LENGTH
      : relationType === 'aggregation' || relationType === 'composition'
        ? DIAMOND_LENGTH
        : 0;
  const hasSourceNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'target-to-source' || edgeData.navigability === 'bidirectional');
  const hasTargetNavigationArrow =
    relationType === 'association' &&
    (edgeData.navigability === 'source-to-target' || edgeData.navigability === 'bidirectional');
  const hasDependencyArrow = relationType === 'dependency';
  const adjustedSourceX =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.x + sourcePathOutward.x * lineInset
      : sourceEndpoint.x;
  const adjustedSourceY =
    relationType !== 'association' && markerEndPosition === 'source'
      ? sourceEndpoint.y + sourcePathOutward.y * lineInset
      : sourceEndpoint.y;
  const adjustedTargetX =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.x + targetPathOutward.x * lineInset
      : targetEndpoint.x;
  const adjustedTargetY =
    relationType !== 'association' && markerEndPosition === 'target'
      ? targetEndpoint.y + targetPathOutward.y * lineInset
      : targetEndpoint.y;
  const { path: edgePath, labelX, labelY } = isSelfAssociation ? selfPath(
    Math.hypot(adjustedSourceX - sourceEndpoint.x, adjustedSourceY - sourceEndpoint.y),
    Math.hypot(adjustedTargetX - targetEndpoint.x, adjustedTargetY - targetEndpoint.y),
  ) : buildAssociationPath({
    sourcePosition: effectiveSourcePosition,
    sourceX: adjustedSourceX,
    sourceY: adjustedSourceY,
    targetPosition: effectiveTargetPosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    lineStyle,
    obstacles: edgeData.routingObstacles,
  });
  const centerLabelPosition = getAssociationCenterLabelPosition(
    labelX,
    labelY,
    adjustedSourceX,
    adjustedSourceY,
    adjustedTargetX,
    adjustedTargetY,
  );
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  const centerLabelOffset = relationType === 'generalization' ? undefined : edgeData.labelOffset;
  const toolbarPosition = {
    x: centerLabelPosition.x + (centerLabelOffset?.x ?? 0),
    y: centerLabelPosition.y + (centerLabelOffset?.y ?? 0),
  };

  const routePoints = getPathPoints(edgePath);
  const sourceSide = getEndpointLabelSide(sourceOutward, routePoints);
  const targetSide = getEndpointLabelSide(targetOutward, [...routePoints].reverse());
  const sourceLabelPosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward, sourceSide);
  const targetLabelPosition = getEndpointLabelPosition(targetEndpoint, targetOutward, targetSide);
  const sourceRolePosition = getEndpointLabelPosition(sourceEndpoint, sourceOutward, sourceSide, 26);
  const targetRolePosition = getEndpointLabelPosition(targetEndpoint, targetOutward, targetSide, 26);
  const markerEndpoint = markerEndPosition === 'target' ? targetEndpoint : sourceEndpoint;
  const markerOutward = markerEndPosition === 'target' ? targetPathOutward : sourcePathOutward;
  const startMultiplicityEditing = (end: MultiplicityEnd, event: MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    originalMultiplicityRef.current = end === 'source' ? edgeData.sourceMultiplicity : edgeData.targetMultiplicity;
    setEditingMultiplicity(end);
  };

  const updateMultiplicity = (end: MultiplicityEnd, value: string): void => {
    edgeData.onUpdateMultiplicity?.(id, end, value);
  };

  const cancelMultiplicityEditing = (): void => {
    if (editingMultiplicity !== null) {
      updateMultiplicity(editingMultiplicity, originalMultiplicityRef.current);
    }

    setEditingMultiplicity(null);
  };

  const renderMultiplicity = (end: MultiplicityEnd, value: string, x: number, y: number) => {
    const isEditing = editingMultiplicity === end;

    if (!value && !isEditing && !selected) {
      return null;
    }

    return (
      <>
        <div
          className="association-label association-label-end nodrag nopan"
          data-empty={!value}
          style={end === 'source'
            ? getMultiplicityLabelStyle(sourceEndpoint, sourceOutward, sourceSide)
            : getMultiplicityLabelStyle(targetEndpoint, targetOutward, targetSide)}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onDoubleClick={(event) => startMultiplicityEditing(end, event)}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {isEditing ? (
            <MultiplicityInput
              ariaLabel={end === 'source' ? 'Multiplicidad origen' : 'Multiplicidad destino'}
              autoFocus
              compact
              value={value}
              onCancel={cancelMultiplicityEditing}
              onChange={(nextValue) => updateMultiplicity(end, nextValue)}
              onConfirm={() => setEditingMultiplicity(null)}
            />
          ) : (
            <button
              type="button"
              className="association-multiplicity-value"
              aria-label={`Editar multiplicidad de ${end === 'source' ? 'origen' : 'destino'}`}
              title="Doble clic para editar un valor libre"
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  originalMultiplicityRef.current = value;
                  setEditingMultiplicity(end);
                }
              }}
            >
              {value || '…'}
            </button>
          )}
        </div>
        {selected && !isEditing && editingRole === null ? (
          <AssociationMultiplicityChips
            end={end}
            value={value}
            style={getMultiplicityChipsStyle({ x, y }, end === 'source' ? sourceOutward : targetOutward, end === 'source' ? sourceSide : targetSide, chipsBounds)}
            onChange={(nextValue) => updateMultiplicity(end, nextValue)}
          />
        ) : null}
      </>
    );
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--association-stroke-selected)' : 'var(--association-stroke)',
          strokeWidth: selected ? 'calc(var(--association-stroke-width) + 0.9)' : 'var(--association-stroke-width)',
          strokeDasharray: relationType === 'dependency' || relationType === 'realization' ? '8 6' : undefined,
        }}
      />
      <path
        className="association-edge-hit-area"
        d={edgePath}
      />
      {hasSourceNavigationArrow ? (
        <path
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(sourceEndpoint, sourcePathOutward)}
        />
      ) : null}
      {hasTargetNavigationArrow ? (
        <path
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {hasDependencyArrow ? (
        <path
          className={`association-navigation-chevron${selected ? ' is-selected' : ''}`}
          d={getOpenChevronPath(targetEndpoint, targetPathOutward)}
        />
      ) : null}
      {relationType === 'generalization' ? (
        <polygon
          className={`association-uml-marker association-uml-marker-open${selected ? ' is-selected' : ''}`}
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'realization' ? (
        <polygon
          className={`association-uml-marker association-uml-marker-open${selected ? ' is-selected' : ''}`}
          points={getTrianglePoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      {relationType === 'aggregation' || relationType === 'composition' ? (
        <polygon
          className={`association-uml-marker ${
            relationType === 'composition' ? 'association-uml-marker-filled' : 'association-uml-marker-open'
          }${selected ? ' is-selected' : ''}`}
          points={getDiamondPoints(markerEndpoint, markerOutward)}
        />
      ) : null}
      <EdgeLabelRenderer>
      {relationType !== 'generalization' ? <>
          <AssociationTextLabel value={edgeData.name} placeholder="Nombre de relación"
            x={centerLabelPosition.x} y={centerLabelPosition.y} offset={edgeData.labelOffset}
            className="association-label-center association-relation-label"
            onCommit={name => edgeData.onUpdateLabel?.(id, { name })}
            onMove={labelOffset => edgeData.onUpdateLabel?.(id, { labelOffset })} />
          {supportsEndpoints ? <>
            <AssociationTextLabel value={edgeData.sourceRole} placeholder="Rol de origen"
              x={sourceRolePosition.x} y={sourceRolePosition.y} className="association-role-label"
              onEditingChange={editing => setEditingRole(editing ? 'source' : null)}
              onCommit={sourceRole => edgeData.onUpdateLabel?.(id, { sourceRole })} />
            <AssociationTextLabel value={edgeData.targetRole} placeholder="Rol de destino"
              x={targetRolePosition.x} y={targetRolePosition.y} className="association-role-label"
              onEditingChange={editing => setEditingRole(editing ? 'target' : null)}
              onCommit={targetRole => edgeData.onUpdateLabel?.(id, { targetRole })} />
          </> : null}
        </> : null}
        {supportsEndpoints
          ? renderMultiplicity('source', edgeData.sourceMultiplicity, sourceLabelPosition.x, sourceLabelPosition.y)
          : null}
        {supportsEndpoints
          ? renderMultiplicity('target', edgeData.targetMultiplicity, targetLabelPosition.x, targetLabelPosition.y)
          : null}
        {selected ? (
          <AssociationLineStyleToolbar
            edgeId={id}
            lineStyle={lineStyle}
            style={{
              ...edgeLabelStyle,
              left: toolbarPosition.x + (horizontal ? 0 : 18),
              top: toolbarPosition.y - 18,
              transform: horizontal ? 'translate(-50%, -100%)' : 'translateY(-100%)',
            }}
            onUpdateAssociation={edgeData.onUpdateAssociation}
          />
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}
