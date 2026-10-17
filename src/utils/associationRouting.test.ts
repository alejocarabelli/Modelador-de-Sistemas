import { Position } from 'reactflow';
import { describe, expect, it } from 'vitest';
import type { ClassDiagramEdge } from '../types/diagram';
import { normalizeAssociationData } from './association';
import {
  buildAssociationPath,
  buildSelfAssociationPath,
  distributeAssociationEnds,
  getAssociationCenterLabelPosition,
  resolveAssociationHandles,
  resolveAutomaticNoteHandles,
  resolveRenderedAssociationHandles,
} from './associationRouting';

const automaticEdge: ClassDiagramEdge = {
  id: 'edge',
  source: 'source',
  target: 'target',
  type: 'association',
  data: normalizeAssociationData({ sourceSide: 'automatic', targetSide: 'automatic' }),
};

describe('association geometry', () => {
  it('moves automatic endpoints when classes exchange vertical order', () => {
    const upper = { position: { x: 100, y: 20 }, width: 220, height: 100 };
    const lower = { position: { x: 110, y: 300 }, width: 220, height: 100 };

    expect(resolveAssociationHandles(automaticEdge, upper, lower)).toMatchObject({
      sourceSide: 'bottom',
      targetSide: 'top',
    });
    expect(resolveAssociationHandles(automaticEdge, lower, upper)).toMatchObject({
      sourceSide: 'top',
      targetSide: 'bottom',
    });
  });

  it('selects an offset slot while preserving central handle ids', () => {
    const source = { position: { x: 0, y: 0 }, width: 220, height: 120 };
    const target = { position: { x: 400, y: 220 }, width: 220, height: 120 };
    const handles = resolveAssociationHandles(automaticEdge, source, target);

    expect(handles.sourceHandle).toBe('right-end');
    expect(handles.targetHandle).toBe('left-start');

    const centeredTarget = { position: { x: 400, y: 0 }, width: 220, height: 120 };
    expect(resolveAssociationHandles(automaticEdge, source, centeredTarget)).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
  });

  it('respects a manual endpoint and derives the opposite automatic side', () => {
    const edge: ClassDiagramEdge = {
      ...automaticEdge,
      data: normalizeAssociationData({ sourceSide: 'top', targetSide: 'automatic' }),
    };
    const handles = resolveAssociationHandles(
      edge,
      { position: { x: 0, y: 0 }, width: 220, height: 100 },
      { position: { x: 400, y: 0 }, width: 220, height: 100 },
    );

    expect(handles.sourceHandle).toBe('top');
    expect(handles.targetSide).toBe('bottom');
  });

  it('uses opposing note endpoints based on relative position', () => {
    const classNode = { position: { x: 100, y: 100 }, width: 220, height: 100 };
    const noteBelow = { position: { x: 120, y: 280 }, width: 180, height: 90 };

    expect(resolveAutomaticNoteHandles(classNode, noteBelow)).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    });
  });

  it('builds a sharp orthogonal preview for diagonal endpoints', () => {
    const resolution = buildAssociationPath({
      sourceX: 0,
      sourceY: 0,
      targetX: 300,
      targetY: 180,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      lineStyle: 'orthogonal',
    });

    expect(resolution.style).toBe('orthogonal');
    expect(resolution.path).toContain('L');
    expect(Number.isFinite(resolution.labelX)).toBe(true);
    expect(Number.isFinite(resolution.labelY)).toBe(true);
  });

  it.each([
    { sourceX: 100, sourceY: 100, targetX: 500, targetY: 112, sourcePosition: Position.Right, targetPosition: Position.Left, source: { x: 100, y: 106 }, target: { x: 500, y: 106 } },
    { sourceX: 500, sourceY: 100, targetX: 100, targetY: 92, sourcePosition: Position.Left, targetPosition: Position.Right, source: { x: 500, y: 96 }, target: { x: 100, y: 96 } },
    { sourceX: 100, sourceY: 100, targetX: 112, targetY: 500, sourcePosition: Position.Bottom, targetPosition: Position.Top, source: { x: 106, y: 100 }, target: { x: 106, y: 500 } },
    { sourceX: 100, sourceY: 500, targetX: 92, targetY: 100, sourcePosition: Position.Top, targetPosition: Position.Bottom, source: { x: 96, y: 500 }, target: { x: 96, y: 100 } },
  ])('draws a perfectly axis-aligned orthogonal line between $sourcePosition and $targetPosition', (input) => {
    const resolution = buildAssociationPath({ ...input, lineStyle: 'orthogonal' });
    const coordinates = resolution.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number);

    expect(resolution.style).toBe('straight');
    expect(resolution.source).toEqual(input.source);
    expect(resolution.target).toEqual(input.target);
    expect(coordinates).toEqual([input.source.x, input.source.y, input.target.x, input.target.y]);
    expect(resolution.source.x === resolution.target.x || resolution.source.y === resolution.target.y).toBe(true);
  });

  it('keeps elbows outside the alignment tolerance or with endpoints facing away', () => {
    const input = { sourceX: 100, sourceY: 100, targetX: 500, targetY: 113, sourcePosition: Position.Right, targetPosition: Position.Left, lineStyle: 'orthogonal' as const };
    expect(buildAssociationPath(input).style).toBe('orthogonal');
    expect(buildAssociationPath({ ...input, targetY: 106, targetPosition: Position.Right })).toMatchObject({
      style: 'orthogonal', source: { x: 100, y: 100 }, target: { x: 500, y: 106 },
    });
  });

  it('preserves a deliberately straight diagonal without snapping its endpoints', () => {
    expect(buildAssociationPath({ sourceX: 100, sourceY: 100, targetX: 500, targetY: 106, sourcePosition: Position.Right, targetPosition: Position.Left, lineStyle: 'straight' })).toMatchObject({
      style: 'straight', source: { x: 100, y: 100 }, target: { x: 500, y: 106 },
    });
  });

  it('places a relationship label above predominantly horizontal paths', () => {
    expect(getAssociationCenterLabelPosition(150, 90, 0, 80, 300, 100)).toEqual({
      x: 150,
      y: 76,
    });
  });

  it('places a relationship label beside predominantly vertical paths', () => {
    expect(getAssociationCenterLabelPosition(90, 150, 80, 0, 100, 300)).toEqual({
      x: 104,
      y: 150,
    });
  });
});

describe('self associations', () => {
  const pointsOf = (path: string) => path.split(/[ML]/).map((part) => part.trim()).filter(Boolean)
    .map((pair) => pair.split(',').map(Number));

  it('loops around the corner shared by two neighbouring sides', () => {
    // Class at (100, 100), 200 × 120: leaves the right side near the top, comes back in from the top near the right.
    const loop = buildSelfAssociationPath({
      source: { x: 300, y: 124 },
      target: { x: 260, y: 100 },
      sourcePosition: Position.Right,
      targetPosition: Position.Top,
      clearance: 40,
    });

    expect(pointsOf(loop.path)).toEqual([[300, 124], [340, 124], [340, 60], [260, 60], [260, 100]]);
    expect(loop.style).toBe('orthogonal');
    expect(loop.source).toEqual({ x: 300, y: 124 });
  });

  it('stops short of the border where a triangle or diamond sits', () => {
    const loop = buildSelfAssociationPath({
      source: { x: 300, y: 124 },
      target: { x: 260, y: 100 },
      sourcePosition: Position.Right,
      targetPosition: Position.Top,
      sourceInset: 22,
      clearance: 40,
    });

    expect(pointsOf(loop.path)[0]).toEqual([322, 124]);
    expect(pointsOf(loop.path).at(-1)).toEqual([260, 100]);
  });

  it('brackets both ends on the same side and goes over the class for opposite sides', () => {
    const sameSide = buildSelfAssociationPath({
      source: { x: 300, y: 124 },
      target: { x: 300, y: 196 },
      sourcePosition: Position.Right,
      targetPosition: Position.Right,
      clearance: 40,
    });
    expect(pointsOf(sameSide.path)).toEqual([[300, 124], [340, 124], [340, 196], [300, 196]]);

    const opposite = buildSelfAssociationPath({
      source: { x: 300, y: 160 },
      target: { x: 100, y: 160 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      bounds: { x: 100, y: 100, width: 200, height: 120 },
      clearance: 40,
    });
    expect(pointsOf(opposite.path)).toEqual([[300, 160], [340, 160], [340, 60], [60, 60], [60, 160], [100, 160]]);
  });

  it('spreads two ends fixed to the same point so the loop does not collapse', () => {
    const loop = buildSelfAssociationPath({
      source: { x: 300, y: 160 },
      target: { x: 300, y: 160 },
      sourcePosition: Position.Right,
      targetPosition: Position.Right,
      clearance: 40,
    });

    expect(loop.source).toEqual({ x: 300, y: 140 });
    expect(loop.target).toEqual({ x: 300, y: 180 });
    expect(pointsOf(loop.path)).toEqual([[300, 140], [340, 140], [340, 180], [300, 180]]);
  });
});

describe('resolveRenderedAssociationHandles', () => {
  const left = { position: { x: 0, y: 0 }, width: 220, height: 120 };
  const right = { position: { x: 400, y: 0 }, width: 220, height: 120 };

  it('chooses facing ports for a relation written without handles', () => {
    expect(resolveRenderedAssociationHandles(automaticEdge, left, right)).toEqual({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('keeps stored ports and fills only the missing one', () => {
    expect(resolveRenderedAssociationHandles({ ...automaticEdge, sourceHandle: 'bottom-end' }, left, right))
      .toEqual({ sourceHandle: 'bottom-end', targetHandle: 'left' });
  });

  it('ignores an unknown port name', () => {
    expect(resolveRenderedAssociationHandles({ ...automaticEdge, sourceHandle: 'middle', targetHandle: 'left' }, left, right))
      .toEqual({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('gives a self-relation without ports the corner loop', () => {
    expect(resolveRenderedAssociationHandles({ ...automaticEdge, target: 'source' }, left, left))
      .toEqual({ sourceHandle: 'right-start', targetHandle: 'top-end' });
  });
});

describe('distributeAssociationEnds', () => {
  const box = (x: number, y: number) => ({ position: { x, y }, width: 200, height: 200 });
  const edge = (id: string, target: string, extra: Partial<ClassDiagramEdge> = {}): ClassDiagramEdge => ({
    ...automaticEdge, id, source: 'hub', target, ...extra,
  });

  it('spreads relations that leave by the same side, in the order of their classes', () => {
    const geometry = new Map([
      ['hub', box(0, 0)],
      ['a', box(600, -150)],
      ['b', box(600, -60)],
      ['c', box(600, 60)],
      ['d', box(600, 150)],
    ]);
    const ids = ['to-a', 'to-b', 'to-c', 'to-d'];
    const ends = distributeAssociationEnds([edge('to-c', 'c'), edge('to-a', 'a'), edge('to-d', 'd'), edge('to-b', 'b')], geometry);
    expect(ids.map((id) => ends.get(id)!.sourcePoint!.y)).toEqual([40, 80, 120, 160]);
    expect(ids.every((id) => ends.get(id)!.sourcePoint!.x === 200)).toBe(true);
  });

  it('leaves a lone relation and hand-placed ports where they are', () => {
    const geometry = new Map([['hub', box(0, 0)], ['b', box(500, 0)]]);
    expect(distributeAssociationEnds([edge('only', 'b')], geometry).get('only')!.sourcePoint).toBeUndefined();
  });

  it('moves a self-relation loop off a port another relation uses', () => {
    const geometry = new Map([['hub', box(0, 0)], ['b', box(500, 0)]]);
    const straight = edge('straight', 'b', { sourceHandle: 'right', targetHandle: 'left' });
    const loop = edge('loop', 'hub', { sourceHandle: 'right', targetHandle: 'top' });
    const ends = distributeAssociationEnds([straight, loop], geometry);
    expect(ends.get('straight')!.sourcePoint).toBeUndefined();
    expect(ends.get('loop')!.sourcePoint).toBeDefined();
    expect(ends.get('loop')!.sourcePoint!.y).not.toBe(100);
  });
});
