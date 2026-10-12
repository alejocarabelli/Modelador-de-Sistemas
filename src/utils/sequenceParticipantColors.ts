import { SEQUENCE_NOTE_COLORS, type SequenceNoteColor, type SequenceNoteColorScheme, type SequenceParticipant } from '../types/diagram';
import type { DiagramTheme } from '../theme/themes';

export type ParticipantVisualFamily = {
  id: string;
  name: string;
  headerFill: string;
  headerBorder: string;
  lifelineStroke: string;
  activationFill: string;
  activationBorder: string;
  glyphStroke: string;
};

export type ParticipantVisualIdentity = {
  identityKey: string;
  familyId: string;
  headerFill: string;
  headerBorder: string;
  lifelineStroke: string;
  activationFill: string;
  activationBorder: string;
  glyphStroke: string;
};

/**
 * Ocho familias para los participantes, derivadas de los mismos tonos que los
 * grupos de clases (azul, turquesa, verde, ámbar, violeta, rosa) más pizarra y
 * terracota, para que todos los artefactos hablen el mismo idioma de color
 * sobre la hoja blanca.
 *
 * Cada familia sale del tono base con mezclas fijas: el encabezado lleva el
 * mismo tinte (16 %) que el encabezado de una clase con color; el borde y las
 * activaciones mezclan el tono con la tinta del documento, y la línea de vida
 * es ese borde aclarado para guiar la mirada sin competir con los mensajes.
 */
export const SEQUENCE_PARTICIPANT_PALETTE: readonly ParticipantVisualFamily[] = [
  {
    id: 'blue',
    name: 'Azul',
    headerFill: '#E8EFF6',
    headerBorder: '#55728F',
    lifelineStroke: '#96A8BA',
    activationFill: '#E0E9F3',
    activationBorder: '#506B85',
    glyphStroke: '#486076',
  },
  {
    id: 'teal',
    name: 'Turquesa',
    headerFill: '#E6F1F1',
    headerBorder: '#4C7A7A',
    lifelineStroke: '#90ADAD',
    activationFill: '#DDECEB',
    activationBorder: '#487172',
    glyphStroke: '#426667',
  },
  {
    id: 'green',
    name: 'Verde',
    headerFill: '#EBF0E9',
    headerBorder: '#60785C',
    lifelineStroke: '#9CAB9A',
    activationFill: '#E4EBE1',
    activationBorder: '#5A7058',
    glyphStroke: '#506451',
  },
  {
    id: 'amber',
    name: 'Ámbar',
    headerFill: '#F5F0E6',
    headerBorder: '#887550',
    lifelineStroke: '#B5A992',
    activationFill: '#F2EADC',
    activationBorder: '#7D6E4D',
    glyphStroke: '#6D6248',
  },
  {
    id: 'violet',
    name: 'Violeta',
    headerFill: '#EFECF6',
    headerBorder: '#70688D',
    lifelineStroke: '#A6A1B8',
    activationFill: '#E9E5F2',
    activationBorder: '#676283',
    glyphStroke: '#5C5975',
  },
  {
    id: 'rose',
    name: 'Rosa',
    headerFill: '#F5ECF0',
    headerBorder: '#886876',
    lifelineStroke: '#B5A1AA',
    activationFill: '#F2E5EA',
    activationBorder: '#7D626F',
    glyphStroke: '#6D5864',
  },
  {
    id: 'slate',
    name: 'Pizarra',
    headerFill: '#EBEDEF',
    headerBorder: '#5E6A73',
    lifelineStroke: '#9BA3A8',
    activationFill: '#E3E6E9',
    activationBorder: '#57636C',
    glyphStroke: '#4F5A61',
  },
  {
    id: 'terracotta',
    name: 'Terracota',
    headerFill: '#F6ECE8',
    headerBorder: '#886859',
    lifelineStroke: '#B5A198',
    activationFill: '#F2E5E0',
    activationBorder: '#7D6255',
    glyphStroke: '#6E584F',
  },
] as const;

export const NEUTRAL_PARTICIPANT_FAMILY: ParticipantVisualFamily = {
  id: 'neutral',
  name: 'Neutro',
  headerFill: '#FFFFFF',
  headerBorder: '#AEB7C4',
  lifelineStroke: '#8395A7',
  activationFill: '#FFFFFF',
  activationBorder: '#52606D',
  glyphStroke: '#334E68',
};

/**
 * Normaliza nombres de clasificadores para eliminar prefijos de formato
 * y asegurar comparación case-insensitive consistente.
 */
export const normalizeClassifierName = (name: string | undefined | null): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/^:+/, '')
    .trim()
    .toLowerCase();
};

export type ResolveParticipantIdentityOptions = {
  classNodesById?: Map<string, { name: string }> | Record<string, { name: string }>;
};

/**
 * Resuelve la identidad conceptual del participante para la asignación de color.
 * Prioridades:
 * 1. Si está vinculado a una clase del diagrama de clases (`classifierNodeId`)
 *    y se conoce su nombre, se usa el nombre conceptual de esa clase.
 * 2. Si no, se utiliza el nombre normalizado de su clasificador (`classifierName`).
 * 3. Si solo existe `classifierNodeId`, se utiliza como identificador estable.
 * 4. Fallback:
 *    - Para actores sin clase: 'actor:default'.
 *    - Para participantes sin clase pero con nombre de instancia: 'instance:<nombre>'.
 *    - Fallback final: 'fallback:<kind>'.
 */
export const resolveParticipantIdentityKey = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  options?: ResolveParticipantIdentityOptions,
): string => {
  if (participant.classifierNodeId) {
    const linkedNode = options?.classNodesById instanceof Map
      ? options.classNodesById.get(participant.classifierNodeId)
      : options?.classNodesById?.[participant.classifierNodeId];
    const linkedName = linkedNode?.name ? normalizeClassifierName(linkedNode.name) : '';
    if (linkedName) {
      return `class:${linkedName}`;
    }
  }

  const normalizedClassifier = normalizeClassifierName(participant.classifierName);
  if (normalizedClassifier) {
    return `class:${normalizedClassifier}`;
  }

  if (participant.classifierNodeId) {
    return `class-id:${participant.classifierNodeId}`;
  }

  if (participant.kind === 'actor') {
    return 'actor:default';
  }

  const normalizedName = normalizeClassifierName(participant.name);
  if (normalizedName) {
    return `instance:${normalizedName}`;
  }

  return `fallback:${participant.kind || 'object'}`;
};

/**
 * Hash determinista de 32 bits FNV-1a.
 * Garantiza excelente dispersión uniforme sobre la paleta, sin colisiones
 * redundantes y totalmente libre de aleatoriedad.
 */
export const hashParticipantIdentity = (identityKey: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < identityKey.length; i += 1) {
    hash ^= identityKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const parseHex = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
};

/** Linear sRGB mix of two #RRGGBB colors; `weight` is the share of `from`. */
export const mixHexColors = (from: string, to: string, weight: number): string => {
  const a = parseHex(from);
  const b = parseHex(to);
  return `#${a.map((channel, index) => Math.round(channel * weight + b[index] * (1 - weight)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * Las familias están pensadas para fondos claros. En modo oscuro se conserva el
 * tono (derivado del borde) y se invierte la luminosidad: rellenos profundos,
 * bordes y trazos aclarados para que el texto claro siga siendo legible.
 */
export const toDarkParticipantFamily = (family: ParticipantVisualFamily, canvasBackground: string): ParticipantVisualFamily => ({
  ...family,
  headerFill: mixHexColors(family.headerBorder, canvasBackground, 0.24),
  headerBorder: mixHexColors(family.headerBorder, '#FFFFFF', 0.82),
  lifelineStroke: mixHexColors(family.lifelineStroke, '#FFFFFF', 0.9),
  activationFill: mixHexColors(family.activationBorder, canvasBackground, 0.3),
  activationBorder: mixHexColors(family.activationBorder, '#FFFFFF', 0.8),
  glyphStroke: mixHexColors(family.glyphStroke, '#FFFFFF', 0.55),
});

export type ResolveParticipantVisualIdentityOptions = ResolveParticipantIdentityOptions & {
  enabled?: boolean;
  theme?: DiagramTheme;
};

export const getNeutralVisualIdentity = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  theme?: DiagramTheme,
): ParticipantVisualIdentity => {
  const identityKey = resolveParticipantIdentityKey(participant);
  return {
    identityKey,
    familyId: NEUTRAL_PARTICIPANT_FAMILY.id,
    headerFill: theme?.classNode?.background ?? NEUTRAL_PARTICIPANT_FAMILY.headerFill,
    headerBorder: theme?.classNode?.border ?? NEUTRAL_PARTICIPANT_FAMILY.headerBorder,
    lifelineStroke: theme?.association?.stroke ?? NEUTRAL_PARTICIPANT_FAMILY.lifelineStroke,
    activationFill: theme?.classNode?.background ?? NEUTRAL_PARTICIPANT_FAMILY.activationFill,
    activationBorder: theme?.classNode?.border ?? NEUTRAL_PARTICIPANT_FAMILY.activationBorder,
    glyphStroke: theme?.association?.stroke ?? NEUTRAL_PARTICIPANT_FAMILY.glyphStroke,
  };
};

/**
 * Resuelve la identidad visual completa (colores de fondo, bordes, líneas de vida
 * y activaciones) para un participante determinado.
 */
export const resolveParticipantVisualIdentity = (
  participant: Pick<SequenceParticipant, 'id' | 'kind' | 'name' | 'classifierName' | 'classifierNodeId'>,
  options?: ResolveParticipantVisualIdentityOptions,
): ParticipantVisualIdentity => {
  if (options?.enabled === false) {
    return getNeutralVisualIdentity(participant, options?.theme);
  }

  // «Índigo y ámbar» gives every participant the same identity: the colour says box or activation, not which class.
  const shared = options?.theme?.participants;
  if (shared) {
    return { identityKey: resolveParticipantIdentityKey(participant, options), familyId: options.theme?.palette ?? 'shared', ...shared };
  }

  const identityKey = resolveParticipantIdentityKey(participant, options);

  if (identityKey === 'actor:default') {
    return getNeutralVisualIdentity(participant, options?.theme);
  }

  const hash = hashParticipantIdentity(identityKey);
  const familyIndex = hash % SEQUENCE_PARTICIPANT_PALETTE.length;
  const paletteFamily = SEQUENCE_PARTICIPANT_PALETTE[familyIndex];
  const family = options?.theme?.appearance === 'dark'
    ? toDarkParticipantFamily(paletteFamily, options.theme.sequence.canvasBackground)
    : paletteFamily;

  return {
    identityKey,
    familyId: family.id,
    headerFill: family.headerFill,
    headerBorder: family.headerBorder,
    lifelineStroke: family.lifelineStroke,
    activationFill: family.activationFill,
    activationBorder: family.activationBorder,
    glyphStroke: family.glyphStroke,
  };
};

/**
 * The colours a sequence note is drawn with. «Cuaderno» uses the four schemes
 * as they are; «Índigo y ámbar» keeps their meaning (the border and the dot
 * still tell an alert from a precondition) but draws them on the theme's amber
 * note paper, so a page of notes stays one tone, in both appearances.
 */
export const resolveSequenceNoteScheme = (theme: DiagramTheme | undefined, color: SequenceNoteColor | undefined): SequenceNoteColorScheme => {
  const scheme = SEQUENCE_NOTE_COLORS[color ?? 'yellow'];
  if (theme === undefined || theme.palette === 'cuaderno') return scheme;
  const paper = theme.parametricNote;
  const border = mixHexColors(scheme.border, paper.border, 0.35);
  return {
    ...scheme,
    background: mixHexColors(scheme.border, paper.background, 0.1),
    border,
    fold: border,
    text: paper.text,
    connectionLine: mixHexColors(scheme.connectionLine, paper.connectionLine, 0.35),
    dot: mixHexColors(scheme.dot, paper.border, 0.6),
  };
};
