import { describe, expect, it } from 'vitest';
import {
  applyTypeSuggestion,
  createInactiveClassKeyboardState,
  findClassInDirection,
  getClassKeyboardInstruction,
  getTypeSuggestions,
  initialRelationTarget,
  nextPendingImportIndex,
  parseAttributeInput,
  parseMethodInput,
  positionBeside,
  searchClasses,
  stepMultiplicity,
  type ClassKeyboardImportItem,
  type ClassRect,
} from './classKeyboardMode';

// Laid out like the example's Clases de secuencias: three on top, two below.
const rects: ClassRect[] = [
  { id: 'tramite', name: 'Tramite', x: 0, y: 0, width: 240, height: 160 },
  { id: 'estadoTramite', name: 'EstadoTramite', x: 420, y: 0, width: 260, height: 140 },
  { id: 'estado', name: 'Estado', x: 800, y: 0, width: 200, height: 120 },
  { id: 'consultor', name: 'Consultor', x: 0, y: 340, width: 200, height: 140 },
  { id: 'tipo', name: 'TipoTramite', x: 420, y: 340, width: 200, height: 120 },
];

describe('findClassInDirection', () => {
  it('walks to the nearest class in the lane of the arrow', () => {
    expect(findClassInDirection(rects, 'tramite', 'right')).toBe('estadoTramite');
    expect(findClassInDirection(rects, 'estadoTramite', 'right')).toBe('estado');
    expect(findClassInDirection(rects, 'tramite', 'down')).toBe('consultor');
    expect(findClassInDirection(rects, 'tipo', 'up')).toBe('estadoTramite');
    expect(findClassInDirection(rects, 'consultor', 'left')).toBeNull();
  });

  it('skips the classes it is told to, such as the origin of a relation', () => {
    expect(findClassInDirection(rects, 'tipo', 'left', ['consultor'])).toBe('tramite');
  });
});

describe('initialRelationTarget', () => {
  it('points at the last target of the class first, then at its neighbour to the right', () => {
    expect(initialRelationTarget(rects, 'tramite', {})).toBe('estadoTramite');
    expect(initialRelationTarget(rects, 'tramite', { tramite: 'tipo' })).toBe('tipo');
    expect(initialRelationTarget(rects, 'estado', {})).toBe('tipo');
    expect(initialRelationTarget(rects, 'tramite', { tramite: 'borrada' })).toBe('estadoTramite');
  });

  it('has nothing to point at when the class is alone', () => {
    expect(initialRelationTarget([rects[0]], 'tramite', {})).toBeNull();
  });
});

describe('positionBeside', () => {
  it('leaves room for the new class on the chosen side', () => {
    const size = { width: 240, height: 150 };
    expect(positionBeside(rects[0], 'right', size)).toEqual({ x: 330, y: 0 });
    expect(positionBeside(rects[0], 'down', size)).toEqual({ x: 0, y: 250 });
    expect(positionBeside(rects[3], 'left', size)).toEqual({ x: -330, y: 340 });
    expect(positionBeside(rects[3], 'up', size)).toEqual({ x: 0, y: 100 });
  });
});

describe('searchClasses', () => {
  it('finds classes by any part of the name, those that start with it first', () => {
    expect(searchClasses(rects, 'estado').map((rect) => rect.id)).toEqual(['estado', 'estadoTramite']);
    expect(searchClasses(rects, 'tram').map((rect) => rect.id)).toEqual(['tramite', 'estadoTramite', 'tipo']);
    expect(searchClasses(rects, 'tram', 'tramite').map((rect) => rect.id)).toEqual(['estadoTramite', 'tipo']);
  });
});

describe('parseAttributeInput', () => {
  it('reads name and type, with or without a type or a visibility', () => {
    expect(parseAttributeInput('fechaCierre: Date')).toEqual({ name: 'fechaCierre', type: 'Date' });
    expect(parseAttributeInput('  nombre  ')).toEqual({ name: 'nombre', type: '' });
    expect(parseAttributeInput('- saldo:double')).toEqual({ name: 'saldo', type: 'double' });
    expect(parseAttributeInput(': int')).toBeNull();
  });
});

describe('parseMethodInput', () => {
  it('reads the signature the way the sequence composer writes it', () => {
    expect(parseMethodInput('cerrar(fecha: Date): void')).toEqual({ visibility: '+', name: 'cerrar', parameters: 'fecha: Date', returnType: 'void' });
    expect(parseMethodInput('getNombre')).toEqual({ visibility: '+', name: 'getNombre', parameters: '', returnType: '' });
    expect(parseMethodInput('esActual: boolean')).toEqual({ visibility: '+', name: 'esActual', parameters: '', returnType: 'boolean' });
    expect(parseMethodInput('- validar(dato')).toEqual({ visibility: '-', name: 'validar', parameters: 'dato', returnType: '' });
    expect(parseMethodInput('(x)')).toBeNull();
  });
});

describe('type suggestions', () => {
  it('completes the type after the last colon with classes and basic types', () => {
    expect(getTypeSuggestions('fecha: Da', ['Tramite'])).toEqual(['Date', 'DateTime']);
    expect(getTypeSuggestions('estado: Est', ['Estado', 'EstadoTramite'])).toEqual(['Estado', 'EstadoTramite']);
    expect(getTypeSuggestions('cerrar(fecha: Date', [])).toEqual(['DateTime']);
    expect(getTypeSuggestions('cerrar(a: int, b', [])).toEqual([]);
    expect(getTypeSuggestions('nombre', [])).toEqual([]);
    expect(applyTypeSuggestion('fecha: Da', 'Date')).toBe('fecha: Date');
  });
});

describe('stepMultiplicity', () => {
  it('cycles through the usual multiplicities', () => {
    expect(stepMultiplicity('', 1)).toBe('1');
    expect(stepMultiplicity('', -1)).toBe('0..*');
    expect(stepMultiplicity('1', 1)).toBe('0..1');
    expect(stepMultiplicity('0..*', 1)).toBe('1');
  });
});

describe('nextPendingImportIndex', () => {
  const items: ClassKeyboardImportItem[] = [
    { key: 'a', kind: 'class', className: 'A', noveltyKeys: [], members: [] },
    { key: 'b', kind: 'members', className: 'B', noveltyKeys: [], members: [] },
    { key: 'c', kind: 'relation', sourceClassName: 'A', targetClassName: 'B', message: 'm()' },
  ];

  it('moves to the next item not handled yet, wrapping around', () => {
    expect(nextPendingImportIndex(items, {}, 0)).toBe(1);
    expect(nextPendingImportIndex(items, { b: 'skipped' }, 0)).toBe(2);
    expect(nextPendingImportIndex(items, { a: 'skipped' }, 2)).toBe(1);
    expect(nextPendingImportIndex(items, { a: 'skipped', b: 'done', c: 'skipped' }, 0)).toBeNull();
  });
});

describe('getClassKeyboardInstruction', () => {
  it('offers T only where there is something to bring', () => {
    const state = { ...createInactiveClassKeyboardState(), stage: 'navigate' as const };
    expect(getClassKeyboardInstruction(state, true)).toContain('T traer de las secuencias');
    expect(getClassKeyboardInstruction(state, false)).not.toContain('T traer');
  });
});
