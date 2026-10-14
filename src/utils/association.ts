import type { EdgeMarker } from 'reactflow';
import type {
  AssociationConnectionSide,
  AssociationDiamondEnd,
  AssociationEdgeData,
  AssociationLineStyle,
  AssociationNavigability,
  AssociationRelationType,
  ClassDiagramEdge,
} from '../types/diagram';

export const DEFAULT_ASSOCIATION_DATA: AssociationEdgeData = {
  name: '',
  sourceMultiplicity: '',
  targetMultiplicity: '',
  sourceRole: '',
  targetRole: '',
  navigability: 'none',
  relationType: 'association',
  diamondEnd: 'source',
  triangleEnd: 'target',
  lineStyle: 'orthogonal',
  sourceSide: 'automatic',
  targetSide: 'automatic',
  waypoints: [],
};

export type ResolvedAssociationLineStyle = AssociationLineStyle;

export const resolveAssociationLineStyle = (
  lineStyle: AssociationLineStyle | undefined,
  deltaX: number,
  deltaY: number,
): ResolvedAssociationLineStyle => {
  if (lineStyle === 'straight') {
    return 'straight';
  }

  const alignmentTolerance = 12;
  return Math.abs(deltaX) <= alignmentTolerance || Math.abs(deltaY) <= alignmentTolerance
    ? 'straight'
    : 'orthogonal';
};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '');
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === 'string' && options.some((option) => option === value);

const navigabilities: readonly AssociationNavigability[] = [
  'none',
  'source-to-target',
  'target-to-source',
  'bidirectional',
];
export const ASSOCIATION_RELATION_TYPES: readonly AssociationRelationType[] = [
  'association',
  'generalization',
  'aggregation',
  'composition',
  'dependency',
  'realization',
];
const diamondEnds: readonly AssociationDiamondEnd[] = ['source', 'target'];
const lineStyles: readonly AssociationLineStyle[] = ['straight', 'orthogonal'];
const connectionSides: readonly AssociationConnectionSide[] = ['automatic', 'top', 'right', 'bottom', 'left'];

type AssociationDataInput = Partial<Omit<AssociationEdgeData, 'lineStyle'>> & { lineStyle?: unknown };

export const normalizeAssociationData = (data: AssociationDataInput | undefined): AssociationEdgeData => ({
  name: normalizeString(data?.name),
  ...(Number.isFinite(data?.labelOffset?.x) && Number.isFinite(data?.labelOffset?.y)
    ? { labelOffset: { x: data!.labelOffset!.x, y: data!.labelOffset!.y } } : {}),
  sourceMultiplicity: normalizeString(data?.sourceMultiplicity),
  targetMultiplicity: normalizeString(data?.targetMultiplicity),
  sourceRole: normalizeString(data?.sourceRole),
  targetRole: normalizeString(data?.targetRole),
  navigability: isOneOf(data?.navigability, navigabilities)
    ? data.navigability
    : DEFAULT_ASSOCIATION_DATA.navigability,
  relationType: isOneOf(data?.relationType, ASSOCIATION_RELATION_TYPES)
    ? data.relationType
    : DEFAULT_ASSOCIATION_DATA.relationType,
  diamondEnd: isOneOf(data?.diamondEnd, diamondEnds) ? data.diamondEnd : DEFAULT_ASSOCIATION_DATA.diamondEnd,
  triangleEnd: isOneOf(data?.triangleEnd, diamondEnds) ? data.triangleEnd : DEFAULT_ASSOCIATION_DATA.triangleEnd,
  lineStyle: isOneOf(data?.lineStyle, lineStyles) ? data.lineStyle : DEFAULT_ASSOCIATION_DATA.lineStyle,
  sourceSide: isOneOf(data?.sourceSide, connectionSides) ? data.sourceSide : DEFAULT_ASSOCIATION_DATA.sourceSide,
  targetSide: isOneOf(data?.targetSide, connectionSides) ? data.targetSide : DEFAULT_ASSOCIATION_DATA.targetSide,
  waypoints: Array.isArray(data?.waypoints)
    ? data.waypoints
        .filter((point) => typeof point?.x === 'number' && Number.isFinite(point.x) && typeof point?.y === 'number' && Number.isFinite(point.y))
        .map((point) => ({ x: point.x, y: point.y }))
    : [],
});

export const normalizeAssociationEdge = (edge: ClassDiagramEdge): ClassDiagramEdge => {
  const data = normalizeAssociationData(edge.data);

  const normalizedEdge: ClassDiagramEdge = {
    ...edge,
    id: normalizeString(edge?.id),
    source: normalizeString(edge?.source),
    target: normalizeString(edge?.target),
    type: 'association',
    sourceHandle: data.sourceSide === 'automatic' ? edge.sourceHandle : data.sourceSide,
    targetHandle: data.targetSide === 'automatic' ? edge.targetHandle : data.targetSide,
    data,
    markerStart: getAssociationMarker(data.navigability, 'source', data.relationType),
    markerEnd: getAssociationMarker(data.navigability, 'target', data.relationType),
  };

  delete normalizedEdge.selected;

  return normalizedEdge;
};

export const getAssociationMarker = (
  navigability: AssociationNavigability | undefined,
  end: 'source' | 'target',
  relationType: AssociationRelationType | undefined = 'association',
): EdgeMarker | undefined => {
  if (relationType !== 'association') {
    return undefined;
  }

  if (navigability === 'bidirectional') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  if (navigability === 'source-to-target' && end === 'target') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  if (navigability === 'target-to-source' && end === 'source') {
    return { type: 'arrow' as EdgeMarker['type'], width: 24, height: 24, color: 'var(--marker-stroke)' };
  }

  return undefined;
};
