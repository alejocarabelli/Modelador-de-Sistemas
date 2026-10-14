import type { AssociationLineStyle, AssociationRelationType } from '../types/diagram';
import { ASSOCIATION_RELATION_TYPES } from '../utils/association';
import { readUiPreference, writeUiPreference } from './uiPreferences';

const ASSOCIATION_LINE_STYLE_KEY = 'modelador.associationLineStyle';
const ASSOCIATION_RELATION_TYPE_KEY = 'modelador.associationRelationType';

export const readAssociationLineStyle = (): AssociationLineStyle =>
  readUiPreference(ASSOCIATION_LINE_STYLE_KEY) === 'straight' ? 'straight' : 'orthogonal';

export const writeAssociationLineStyle = (lineStyle: AssociationLineStyle): boolean =>
  writeUiPreference(ASSOCIATION_LINE_STYLE_KEY, lineStyle);

/** The relation a new connection starts as. Asociación until the person picks another. */
export const readAssociationRelationType = (): AssociationRelationType => {
  const stored = readUiPreference(ASSOCIATION_RELATION_TYPE_KEY);
  return ASSOCIATION_RELATION_TYPES.find((type) => type === stored) ?? 'association';
};

export const writeAssociationRelationType = (relationType: AssociationRelationType): boolean =>
  writeUiPreference(ASSOCIATION_RELATION_TYPE_KEY, relationType);
