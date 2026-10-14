import type { XYPosition } from 'reactflow';
import { MULTIPLICITY_SUGGESTIONS } from '../constants/multiplicity';
import type { AssociationRelationType, ClassAttribute, ClassMethod } from '../types/diagram';
import { shortcutLabel } from './shortcutLabel';

/**
 * Keyboard mode of the class diagram, the sibling of the sequence one: M turns
 * it on, a cursor walks the classes and a few keys add members, relations and
 * classes. The cursor is mirrored to the selection, so the inspector follows it.
 */
export type ClassKeyboardStage =
  | 'off'
  | 'navigate'
  | 'attribute'
  | 'method'
  | 'relation'
  | 'details'
  | 'newClass'
  | 'search'
  | 'import';

export type ClassKeyboardDirection = 'left' | 'right' | 'up' | 'down';

export type ClassKeyboardDetails = {
  sourceMultiplicity: string;
  name: string;
  targetMultiplicity: string;
};

export type ClassKeyboardState = {
  stage: ClassKeyboardStage;
  cursorId: string | null;
  targetId: string | null;
  text: string;
  side: ClassKeyboardDirection;
  /** What a search looks for: the class to walk to, or the target of a relation. */
  searchFor: 'cursor' | 'target';
  details: ClassKeyboardDetails;
  importIndex: number;
  /** Import items already handled in this pass, by key. */
  importHandled: Record<string, 'done' | 'skipped'>;
  /** Relation the current import suggestion would create; 1–6 change only this one. */
  importRelationType: AssociationRelationType;
  /** The last target each class related to, so R points there first. */
  lastTargets: Record<string, string>;
};

export const emptyClassKeyboardDetails = (): ClassKeyboardDetails => ({ sourceMultiplicity: '', name: '', targetMultiplicity: '' });

export const createInactiveClassKeyboardState = (): ClassKeyboardState => ({
  stage: 'off',
  cursorId: null,
  targetId: null,
  text: '',
  side: 'right',
  searchFor: 'cursor',
  details: emptyClassKeyboardDetails(),
  importIndex: 0,
  importHandled: {},
  importRelationType: 'dependency',
  lastTargets: {},
});

export type ClassRect = { id: string; name: string; x: number; y: number; width: number; height: number };

const centerOf = (rect: ClassRect): XYPosition => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

export const directionFromKey = (key: string): ClassKeyboardDirection | null =>
  key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : null;

/**
 * The class an arrow key lands on: the nearest one whose centre lies in that
 * direction, weighing the sideways offset twice so the move stays in its lane.
 * A class barely ahead but far aside (the neighbour of the same row for ↓)
 * only counts when nothing lies within the arrow's cone.
 */
export const findClassInDirection = (
  rects: ClassRect[],
  fromId: string,
  direction: ClassKeyboardDirection,
  excludeIds: readonly string[] = [],
): string | null => {
  const from = rects.find((rect) => rect.id === fromId);
  if (from === undefined) return null;
  const origin = centerOf(from);
  let best: string | null = null;
  let bestScore = Infinity;
  let bestInCone = false;
  for (const rect of rects) {
    if (rect.id === fromId || excludeIds.includes(rect.id)) continue;
    const point = centerOf(rect);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const [ahead, aside] = direction === 'right' ? [dx, Math.abs(dy)]
      : direction === 'left' ? [-dx, Math.abs(dy)]
        : direction === 'down' ? [dy, Math.abs(dx)]
          : [-dy, Math.abs(dx)];
    if (ahead <= 4) continue;
    const inCone = ahead * 2.5 >= aside;
    const score = ahead + aside * 2;
    if ((inCone && !bestInCone) || (inCone === bestInCone && score < bestScore)) {
      bestScore = score;
      best = rect.id;
      bestInCone = inCone;
    }
  }
  return best;
};

/** Where R points first: the last target of this class, else the nearest class to the right, below, left or above. */
export const initialRelationTarget = (rects: ClassRect[], fromId: string, lastTargets: Record<string, string>): string | null => {
  const remembered = lastTargets[fromId];
  if (remembered !== undefined && remembered !== fromId && rects.some((rect) => rect.id === remembered)) return remembered;
  for (const direction of ['right', 'down', 'left', 'up'] as const) {
    const found = findClassInDirection(rects, fromId, direction);
    if (found !== null) return found;
  }
  return null;
};

/** The preferred top-left corner for a class created beside another one. */
export const positionBeside = (rect: ClassRect, side: ClassKeyboardDirection, size: { width: number; height: number }): XYPosition => {
  const gap = 90;
  switch (side) {
    case 'right': return { x: Math.round(rect.x + rect.width + gap), y: Math.round(rect.y) };
    case 'left': return { x: Math.round(rect.x - size.width - gap), y: Math.round(rect.y) };
    case 'down': return { x: Math.round(rect.x), y: Math.round(rect.y + rect.height + gap) };
    case 'up': return { x: Math.round(rect.x), y: Math.round(rect.y - size.height - gap) };
  }
};

export const sideLabels: Record<ClassKeyboardDirection, string> = {
  right: 'A la derecha de',
  left: 'A la izquierda de',
  down: 'Debajo de',
  up: 'Arriba de',
};

/** Classes whose name contains the query: the exact name first, then those that start with it. */
export const searchClasses = (rects: ClassRect[], query: string, excludeId?: string): ClassRect[] => {
  const needle = query.trim().toLocaleLowerCase();
  const rank = (rect: ClassRect): number => {
    const name = rect.name.toLocaleLowerCase();
    return name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
  };
  const candidates = rects.filter((rect) => rect.id !== excludeId && rect.name.trim().length > 0);
  if (needle.length === 0) return candidates.slice(0, 6);
  return candidates
    .filter((rect) => rect.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 6);
};

const visibilities = ['+', '-', '#'] as const;

/** `nombre: Tipo`, with an optional leading visibility that attributes ignore. */
export const parseAttributeInput = (text: string): Pick<ClassAttribute, 'name' | 'type'> | null => {
  const trimmed = text.trim().replace(/^[+\-#]\s*/, '');
  const colon = trimmed.indexOf(':');
  const name = (colon < 0 ? trimmed : trimmed.slice(0, colon)).trim();
  const type = colon < 0 ? '' : trimmed.slice(colon + 1).trim();
  return name.length === 0 ? null : { name, type };
};

/** `nombre(parámetros): Retorno`; the parentheses and the return are optional. */
export const parseMethodInput = (text: string): Omit<ClassMethod, 'id'> | null => {
  let trimmed = text.trim();
  let visibility: ClassMethod['visibility'] = '+';
  const leading = visibilities.find((candidate) => trimmed.startsWith(candidate));
  if (leading !== undefined) {
    visibility = leading;
    trimmed = trimmed.slice(1).trim();
  }
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  let name: string;
  let parameters = '';
  let returnType: string;
  if (open >= 0) {
    name = trimmed.slice(0, open).trim();
    parameters = (close > open ? trimmed.slice(open + 1, close) : trimmed.slice(open + 1)).trim();
    returnType = close > open ? trimmed.slice(close + 1).replace(/^\s*:/, '').trim() : '';
  } else {
    const colon = trimmed.indexOf(':');
    name = (colon < 0 ? trimmed : trimmed.slice(0, colon)).trim();
    returnType = colon < 0 ? '' : trimmed.slice(colon + 1).trim();
  }
  return name.length === 0 ? null : { visibility, name, parameters, returnType };
};

export const BASIC_TYPE_NAMES = ['int', 'String', 'boolean', 'double', 'Date', 'DateTime', 'void'] as const;

/**
 * Type names to complete the word after the last colon (`fecha: Da` → Date,
 * `buscar(id: in` → int), or none when the caret is not on a type.
 */
export const getTypeSuggestions = (text: string, classNames: readonly string[]): string[] => {
  const colon = text.lastIndexOf(':');
  if (colon < 0) return [];
  const typed = text.slice(colon + 1);
  if (/[,()]/.test(typed)) return [];
  const query = typed.trim().toLocaleLowerCase();
  const names = [...new Set([...classNames.map((name) => name.trim()).filter(Boolean), ...BASIC_TYPE_NAMES])];
  return names
    .filter((name) => name.toLocaleLowerCase().startsWith(query) && name.toLocaleLowerCase() !== query)
    .slice(0, 5);
};

export const applyTypeSuggestion = (text: string, suggestion: string): string => {
  const colon = text.lastIndexOf(':');
  return colon < 0 ? text : `${text.slice(0, colon + 1)} ${suggestion}`;
};

/** ↑ ↓ on a multiplicity field step through the usual values. */
export const stepMultiplicity = (value: string, step: 1 | -1): string => {
  const options: readonly string[] = MULTIPLICITY_SUGGESTIONS;
  const index = options.indexOf(value.trim());
  if (index < 0) return step === 1 ? options[0] : options[options.length - 1];
  return options[(index + step + options.length) % options.length];
};

export const getClassKeyboardInstruction = (state: ClassKeyboardState, canImport: boolean): string => {
  switch (state.stage) {
    case 'navigate':
      return `← ↑ → ↓ clase · / buscar · A atributo · O operación · Enter o R relación · 1–6 tipo de relación · N clase nueva${canImport ? ' · T traer de las secuencias' : ''} · M salir`;
    case 'relation':
      return shortcutLabel('← ↑ → ↓ destino · / buscar destino · 1–6 tipo · Tab nombre y multiplicidades · Enter crear · ⌥ Enter crear y quedarse en el origen · Esc volver');
    case 'details':
      return shortcutLabel('Tab campo siguiente · ↑ ↓ multiplicidad · Enter crear · ⌥ Enter crear y quedarse en el origen · Esc volver');
    case 'attribute':
      return 'Escribí nombre: Tipo · ↑ ↓ Tab completar el tipo · Enter guardar y seguir · Enter vacío terminar · Esc volver';
    case 'method':
      return 'Escribí nombre(parámetros): Retorno · ↑ ↓ Tab completar el tipo · Enter guardar y seguir · Enter vacío terminar · Esc volver';
    case 'newClass':
      return '← ↑ → ↓ ubicación (antes de escribir) · Escribí el nombre · Enter crear y seguir con atributos · Esc volver';
    case 'search':
      return `Escribí parte del nombre · ↑ ↓ elegir · Enter ${state.searchFor === 'target' ? 'usar como destino' : 'ir'} · Esc volver`;
    case 'import':
      return 'Enter traer · X saltear · ← → recorrer · 1–6 tipo de la relación sugerida · Esc volver';
    default:
      return '';
  }
};

/** One stop of T: a class (or the members a class lacks) or a relation the messages ask for. */
export type ClassKeyboardImportItem =
  | {
      key: string;
      kind: 'class' | 'members';
      className: string;
      /** The novelty keys the toolbar menu uses, so importing takes exactly these. */
      noveltyKeys: string[];
      members: string[];
    }
  | {
      key: string;
      kind: 'relation';
      sourceClassName: string;
      targetClassName: string;
      message: string;
    };

/** The next item after `index` not handled yet, wrapping around; null when all are handled. */
export const nextPendingImportIndex = (
  items: readonly ClassKeyboardImportItem[],
  handled: Record<string, 'done' | 'skipped'>,
  index: number,
): number | null => {
  for (let offset = 1; offset <= items.length; offset += 1) {
    const candidate = (index + offset) % items.length;
    if (handled[items[candidate].key] === undefined) return candidate;
  }
  return null;
};
