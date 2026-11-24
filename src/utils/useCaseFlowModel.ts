import type {
  ActorPrimitive,
  AlternativeUseCaseFlow,
  FlowActionNode,
  FlowActionSemantic,
  FlowConditionalNode,
  FlowDetailItem,
  FlowInputParameter,
  FlowLoopNode,
  FlowMainStep,
  FlowRef,
  FlowSubNode,
  LegacyUseCaseFlowContent,
  LegacyUseCaseFlowStep,
  StateBlock,
  StateDetailItem,
  StateInstanceBlock,
  StateInstanceMultiplicity,
  StateInstanceQualifier,
  StepAnchorRef,
  SystemPrimitive,
  UseCaseFlowContent,
  UseCaseFlowDescription,
  UseCaseFlowPriority,
} from '../types/diagram';
import { createId } from './id';

const IDENT = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\\wÁÉÍÓÚÜÑáéíóúüñ]*';

export const STATE_COMPARATORS = [
  'igual a',
  'distinto de',
  'distinto a',
  'menor a',
  'menor o igual a',
  'mayor a',
  'mayor o igual a',
  '<=',
  '>=',
] as const;

export const ACTOR_PRIMITIVE_DEFS: ReadonlyArray<{
  primitive: ActorPrimitive;
  label: string;
  template: string;
  hint: string;
}> = [
  { primitive: 'iniciar-cu', label: 'Iniciar CU', template: 'Iniciar CU', hint: 'Siempre paso 1 del camino básico' },
  { primitive: 'ingresar', label: 'Ingresar', template: 'Ingresar [dato] (pDato)', hint: 'Valor tipeado por el actor (requiere controlar consistencia)' },
  { primitive: 'seleccionar', label: 'Seleccionar', template: 'Seleccionar [elemento] (pIdElemento)', hint: 'Elige una fila de una colección mostrada antes' },
  { primitive: 'confirmar', label: 'Confirmar', template: 'Confirmar [datos] (confirmacion)', hint: 'Acepta una instancia o conjunto mostrado previamente' },
  { primitive: 'elegir', label: 'Elegir', template: 'Elegir [opción]', hint: 'Botón, acción o check de pantalla' },
];

export const SYSTEM_PRIMITIVE_DEFS: ReadonlyArray<{
  id: string;
  kind: 'action' | 'loop-por-cada' | 'loop-mientras' | 'conditional';
  primitive?: SystemPrimitive;
  label: string;
  template: string;
  hint: string;
  supportsDetails?: boolean;
  suggestsCa?: boolean;
}> = [
  { id: 'buscar', kind: 'action', primitive: 'buscar', label: 'Buscar', template: 'Buscar instancia de ', hint: 'Consulta persistencia (entidades guardadas)', supportsDetails: true, suggestsCa: true },
  { id: 'leer', kind: 'action', primitive: 'leer', label: 'Leer', template: 'Leer ', hint: 'Accede a atributo o relación navegable en memoria', supportsDetails: true },
  { id: 'seleccionar', kind: 'action', primitive: 'seleccionar', label: 'Seleccionar', template: 'Seleccionar instancia de ', hint: 'Elige instancia de colección ya en memoria', suggestsCa: true },
  { id: 'mostrar-mensaje', kind: 'action', primitive: 'mostrar-mensaje', label: 'Mostrar mensaje', template: 'Mostrar mensaje “”', hint: 'Informa o solicita datos al actor', supportsDetails: true },
  { id: 'crear', kind: 'action', primitive: 'crear', label: 'Crear', template: 'Crear instancia de ', hint: 'Crea en memoria (persiste con Guardar Cambios)', supportsDetails: true },
  { id: 'modificar', kind: 'action', primitive: 'modificar', label: 'Modificar', template: 'Modificar instancia de ', hint: 'Actualiza atributos/relaciones en memoria', supportsDetails: true },
  { id: 'comprobar', kind: 'action', primitive: 'comprobar', label: 'Comprobar', template: 'Comprobar que ', hint: 'Regla de negocio (suele disparar un CA)', suggestsCa: true },
  { id: 'controlar-consistencia', kind: 'action', primitive: 'controlar-consistencia', label: 'Controlar consistencia', template: 'Controlar consistencia de datos ingresados', hint: 'Valida formato/tipos tras un Ingresar', suggestsCa: true },
  { id: 'loop-por-cada', kind: 'loop-por-cada', label: 'Por cada (recuadro)', template: 'Por cada instancia de ', hint: 'Iteración sobre colección en memoria (recuadro visual)' },
  { id: 'loop-mientras', kind: 'loop-mientras', label: 'Mientras (recuadro)', template: 'Mientras ', hint: 'Bucle condicional (recuadro visual)' },
  { id: 'conditional', kind: 'conditional', label: 'SI / SINO / FINSI', template: '', hint: 'Condicional estructurado inline' },
  { id: 'ordenar', kind: 'action', primitive: 'ordenar', label: 'OrdenarPor', template: 'OrdenarPor()', hint: 'Ordena colección en memoria por atributo' },
  { id: 'variable', kind: 'action', primitive: 'variable', label: 'Variable / Cálculo', template: 'variable = ', hint: 'Acumulador o variable local auxiliar' },
  { id: 'invocar-servicio', kind: 'action', primitive: 'invocar-servicio', label: 'Invocar servicio', template: 'Invocar servicio NombreServicio en SistemaExterno (): datosRetorno [], variableRetorno', hint: 'Comunicación con sistema externo', suggestsCa: true },
  { id: 'definir-pseudoentidad', kind: 'action', primitive: 'definir-pseudoentidad', label: 'Definir pseudoentidad', template: 'Definir pseudoentidad NombrePseudo (attr1, attr2)', hint: 'Estructura temporal en memoria (no persiste)' },
  { id: 'guardar-cambios', kind: 'action', primitive: 'guardar-cambios', label: 'Guardar Cambios', template: 'Guardar Cambios', hint: 'Persiste instancias creadas/modificadas del DC' },
  { id: 'ir-a-paso', kind: 'action', primitive: 'ir-a-paso', label: 'Ir a paso', template: 'Ir a paso ', hint: 'Salto a otro paso del básico o de un CA' },
  { id: 'ir-a-cu', kind: 'action', primitive: 'ir-a-cu', label: 'Ir a CU', template: 'Ir a CU NombreCU ()', hint: 'Inclusión o extensión hacia otro caso de uso' },
  { id: 'fin-cu', kind: 'action', primitive: 'fin-cu', label: 'Fin CU', template: 'Fin CU', hint: 'Cierre explícito del caso de uso' },
];

// ---------------------------------------------------------------------------
// Factories

export const createInputParameter = (patch: Partial<FlowInputParameter> = {}): FlowInputParameter => ({
  id: createId(),
  name: '',
  ...patch,
});

export const createStateDetailAttribute = (
  attribute = '',
  comparator = 'igual a',
  value = '',
): Extract<StateDetailItem, { kind: 'attribute' }> => ({
  id: createId(),
  kind: 'attribute',
  attribute,
  comparator,
  value,
});

export const createStateDetailRelation = (
  className = '',
  multiplicity: StateInstanceMultiplicity = 'single',
  children: StateDetailItem[] = [],
): Extract<StateDetailItem, { kind: 'relation' }> => ({
  id: createId(),
  kind: 'relation',
  multiplicity,
  className,
  children,
});

export const createStateDetailExpression = (text = ''): Extract<StateDetailItem, { kind: 'expression' }> => ({
  id: createId(),
  kind: 'expression',
  text,
});

export const createStateInstanceBlock = (
  mode: 'initial' | 'final',
  className = '',
  multiplicity: StateInstanceMultiplicity = 'single',
): StateInstanceBlock => ({
  id: createId(),
  kind: 'instance',
  multiplicity,
  className,
  qualifier: mode === 'initial' ? 'existente' : 'creada',
  details: [createStateDetailAttribute()],
});

export const createStateSectionBlock = (title = 'Instancias principales'): Extract<StateBlock, { kind: 'section' }> => ({
  id: createId(),
  kind: 'section',
  title,
});

export const createStateConditionBlock = (condition = ''): Extract<StateBlock, { kind: 'condition' }> => ({
  id: createId(),
  kind: 'condition',
  condition,
  blocks: [],
});

export const createFlowDetailItem = (text = '', stepRef?: StepAnchorRef): FlowDetailItem => ({
  id: createId(),
  text,
  ...(stepRef ? { stepRef } : {}),
});

export const createFlowActionNode = (
  primitive: SystemPrimitive | ActorPrimitive = 'custom',
  text = '',
  extra: Partial<FlowActionNode> = {},
): FlowActionNode => ({
  id: createId(),
  kind: 'action',
  primitive,
  text,
  details: [],
  refs: [],
  ...extra,
});

export const createFlowLoopNode = (
  loopKind: 'por-cada' | 'mientras' = 'por-cada',
  header = loopKind === 'por-cada' ? 'Por cada instancia de :' : 'Mientras :',
): FlowLoopNode => ({
  id: createId(),
  kind: 'loop',
  loopKind,
  header,
  details: [],
  children: [createFlowActionNode('leer', 'Leer ')],
  refs: [],
});

export const createFlowConditionalNode = (condition = ''): FlowConditionalNode => ({
  id: createId(),
  kind: 'conditional',
  condition,
  thenChildren: [createFlowActionNode('custom', '')],
  refs: [],
});

export const createFlowMainStep = (
  speaker: 'actor' | 'system',
  title = '',
  extra: Partial<FlowMainStep> = {},
): FlowMainStep => ({
  id: createId(),
  speaker,
  title,
  refs: [],
  children: [],
  ...extra,
});

export const createAlternativeFlow = (number: number, title = ''): AlternativeUseCaseFlow => ({
  id: createId(),
  number,
  title,
  steps: [
    createFlowMainStep('system', '', {
      children: [createFlowActionNode('mostrar-mensaje', 'Mostrar mensaje “”')],
    }),
  ],
});

export const createEmptyUseCaseFlowContent = (): UseCaseFlowContent => ({
  version: 2,
  classDiagramArtifactId: undefined,
  description: {
    useCaseNumber: '',
    useCaseName: '',
    actor: '',
    description: '',
    priority: 'A',
    inputParameters: [],
    precondition: '',
    initialState: [],
    finalState: [],
  },
  basicFlow: [],
  alternativeFlows: [],
});

export const getNextAlternativeNumber = (flows: AlternativeUseCaseFlow[]): number => {
  const used = new Set(flows.map((flow) => flow.number));
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
};

// ---------------------------------------------------------------------------
// Formatting helpers (canonical UTN FRM notation)

export const formatAlternativeRef = (number: number): string => `CA N°${number}`;

export const formatAlternativeTitle = (number: number, title: string): string =>
  title.trim().length > 0 ? `Camino alternativo N°${number}: ${title.trim()}` : `Camino alternativo N°${number}`;

export const formatInputParameter = (param: FlowInputParameter): string => {
  const name = param.name.trim();
  if (!name) return '';
  const options = (param.options ?? []).map((opt) => opt.trim()).filter(Boolean);
  const core = options.length > 0 ? `${name} (${options.join(' - ')})` : name;
  return param.optional ? `[${core}]` : core;
};

export const formatInputParameters = (params: FlowInputParameter[]): string =>
  params.map(formatInputParameter).filter(Boolean).join(', ');

const splitTopLevelCommas = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
};

export const parseInputParametersText = (raw: string): FlowInputParameter[] => {
  if (!raw.trim()) return [];
  return splitTopLevelCommas(raw)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): FlowInputParameter => {
      let optional = false;
      let inner = chunk;
      if (inner.startsWith('[') && inner.endsWith(']') && inner.length > 2) {
        optional = true;
        inner = inner.slice(1, -1).trim();
      }
      const optionMatch = /^([^(]+?)\s*\(([^)]+)\)\s*$/.exec(inner);
      if (optionMatch) {
        const options = optionMatch[2]
          .split(/\s*[-/|]\s*|\s*,\s*/)
          .map((item) => item.trim())
          .filter(Boolean);
        return {
          id: createId(),
          name: optionMatch[1].trim(),
          ...(options.length > 0 ? { options } : {}),
          ...(optional ? { optional: true } : {}),
        };
      }
      return {
        id: createId(),
        name: inner,
        ...(optional ? { optional: true } : {}),
      };
    });
};

export const formatMultiplicityPrefix = (multiplicity: StateInstanceMultiplicity, capitalize = true): string => {
  const word = multiplicity === 'multiple' ? 'instancias de' : multiplicity === 'one-or-more' ? 'instancia/s de' : 'instancia de';
  return capitalize ? word[0].toUpperCase() + word.slice(1) : word;
};

export const formatQualifierWord = (
  qualifier: StateInstanceQualifier,
  multiplicity: StateInstanceMultiplicity,
  customQualifier?: string,
): string => {
  if (qualifier === 'custom') return customQualifier?.trim() ?? '';
  if (qualifier === 'existente') {
    return multiplicity === 'multiple' ? 'existentes' : multiplicity === 'one-or-more' ? 'existente/s' : 'existente';
  }
  if (qualifier === 'creada') {
    return multiplicity === 'multiple' ? 'creadas' : multiplicity === 'one-or-more' ? 'creada/s' : 'creada';
  }
  return multiplicity === 'multiple' ? 'modificadas' : multiplicity === 'one-or-more' ? 'modificada/s' : 'modificada';
};

export const formatStateInstanceHeader = (block: StateInstanceBlock): string => {
  const prefix = formatMultiplicityPrefix(block.multiplicity, true);
  const qualifier = formatQualifierWord(block.qualifier, block.multiplicity, block.customQualifier);
  const className = block.className.trim() || 'Clase';
  const suffix = block.details.length > 0 ? ':' : '';
  return qualifier ? `${prefix} ${className} ${qualifier}${suffix}` : `${prefix} ${className}${suffix}`;
};

export const formatStateDetailText = (detail: StateDetailItem): string => {
  if (detail.kind === 'expression') return detail.text;
  if (detail.kind === 'relation') {
    const prefix = formatMultiplicityPrefix(detail.multiplicity, false);
    const note = detail.relationNote?.trim() ? ` ${detail.relationNote.trim()}` : '';
    const colon = detail.children.length > 0 ? ':' : '';
    return `Relacionada a ${prefix} ${detail.className.trim() || 'Clase'}${note}${colon}`;
  }
  const attr = detail.attribute.trim();
  const comp = detail.comparator.trim();
  const val = detail.value.trim();
  if (!attr && !val) return '';
  return `Con ${attr}${comp ? ` ${comp}` : ''}${val ? ` ${val}` : ''}`.trim();
};

const STATE_BULLET_GLYPHS = ['•', '◦', '▪'] as const;

export const serializeStateDetailsToLines = (details: StateDetailItem[], depth = 0): string[] =>
  details.flatMap((detail) => {
    const indent = '  '.repeat(depth + 1);
    const glyph = STATE_BULLET_GLYPHS[Math.min(depth, STATE_BULLET_GLYPHS.length - 1)];
    const line = `${indent}${glyph} ${formatStateDetailText(detail)}`;
    if (detail.kind === 'relation' && detail.children.length > 0) {
      return [line, ...serializeStateDetailsToLines(detail.children, depth + 1)];
    }
    return [line];
  });

export const serializeStateBlocksToText = (blocks: StateBlock[]): string => {
  const out: string[] = [];
  blocks.forEach((block, index) => {
    if (index > 0) out.push('');
    if (block.kind === 'section') {
      out.push(block.title);
    } else if (block.kind === 'free-text') {
      out.push(block.text);
    } else if (block.kind === 'instance') {
      out.push(formatStateInstanceHeader(block), ...serializeStateDetailsToLines(block.details, 0));
    } else {
      const cond = block.condition.trim();
      out.push(cond.endsWith(':') ? cond : /^si\b/i.test(cond) ? `${cond}:` : `Si ${cond}:`);
      block.blocks.forEach((inst) => {
        out.push(formatStateInstanceHeader(inst), ...serializeStateDetailsToLines(inst.details, 0));
      });
    }
  });
  return out.join('\n');
};

// ---------------------------------------------------------------------------
// State text parser (used for v1→v2 migration and paste-to-tree in editor)

const STATE_INSTANCE_HEADER_RE = new RegExp(
  `^(instancias?|instancia\\/s)\\s+(?:de\\s+)?(${IDENT})(?:\\s+(existentes?|existente\\/s|creadas?|creada\\/s|modificadas?|modificada\\/s))?(?:\\s+con)?\\s*:?\\s*$`,
  'i',
);

const STATE_BULLET_RE = /^(\s*)([•◦▪*-])\s?(.*)$/;

const STATE_RELATION_RE = new RegExp(
  `^(?:con\\s+)?relacionad[ao]s?\\s+a\\s+(?:la\\s+|las\\s+)?(instancias?|instancia\\/s)?\\s*(?:de\\s+)?(${IDENT})(.*?):?\\s*$`,
  'i',
);

const STATE_ATTR_RE = new RegExp(
  `^(?:con\\s+)?(${IDENT})\\s+(igual\\s+a|distint[oa]\\s+(?:de|a)|menor\\s+o\\s+igual\\s+a|mayor\\s+o\\s+igual\\s+a|menor\\s+a|mayor\\s+a|<=|>=|!=|=|<|>)\\s*(.*)$`,
  'i',
);

const parseMultiplicity = (raw: string | undefined): StateInstanceMultiplicity => {
  if (!raw) return 'single';
  const low = raw.toLowerCase();
  if (low.includes('/s')) return 'one-or-more';
  if (low.endsWith('s')) return 'multiple';
  return 'single';
};

const parseQualifier = (raw: string | undefined, mode: 'initial' | 'final'): StateInstanceQualifier => {
  if (!raw) return mode === 'initial' ? 'existente' : 'creada';
  const low = raw.toLowerCase();
  if (low.startsWith('exist')) return 'existente';
  if (low.startsWith('cread')) return 'creada';
  if (low.startsWith('modif')) return 'modificada';
  return 'custom';
};

const parseStateBulletItem = (body: string): StateDetailItem => {
  const trimmed = body.trim();
  const rel = STATE_RELATION_RE.exec(trimmed);
  if (rel) {
    const note = rel[3].replace(/:$/, '').replace(/\s+con$/i, '').trim();
    return {
      id: createId(),
      kind: 'relation',
      multiplicity: parseMultiplicity(rel[1]),
      className: rel[2],
      ...(note ? { relationNote: note } : {}),
      children: [],
    };
  }
  const attr = STATE_ATTR_RE.exec(trimmed);
  if (attr) {
    return {
      id: createId(),
      kind: 'attribute',
      attribute: attr[1],
      comparator: attr[2].replace(/\s+/g, ' ').toLowerCase(),
      value: attr[3].trim(),
    };
  }
  return {
    id: createId(),
    kind: 'expression',
    text: trimmed,
  };
};

export const parseStateTextToBlocks = (raw: string, mode: 'initial' | 'final'): StateBlock[] => {
  if (!raw.trim()) return [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const blocks: StateBlock[] = [];
  let activeCondition: Extract<StateBlock, { kind: 'condition' }> | null = null;
  let activeInstance: StateInstanceBlock | null = null;
  const bulletStack: Array<{ indent: number; item: StateDetailItem }> = [];

  const pushInstance = (inst: StateInstanceBlock): void => {
    if (activeCondition) activeCondition.blocks.push(inst);
    else blocks.push(inst);
    activeInstance = inst;
    bulletStack.length = 0;
  };

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const bulletMatch = STATE_BULLET_RE.exec(rawLine);

    if (bulletMatch && activeInstance) {
      const indent = bulletMatch[1].replace(/\t/g, '    ').length;
      const item = parseStateBulletItem(bulletMatch[3]);
      while (bulletStack.length > 0 && bulletStack[bulletStack.length - 1].indent >= indent) {
        bulletStack.pop();
      }
      const parent = [...bulletStack].reverse().find((entry) => entry.item.kind === 'relation');
      if (parent && parent.item.kind === 'relation') {
        parent.item.children.push(item);
      } else {
        activeInstance.details.push(item);
      }
      bulletStack.push({ indent, item });
      continue;
    }

    const trimmed = rawLine.trim();
    const headerMatch = STATE_INSTANCE_HEADER_RE.exec(trimmed);
    if (headerMatch) {
      const multiplicity = parseMultiplicity(headerMatch[1]);
      const qualifier = parseQualifier(headerMatch[3], mode);
      pushInstance({
        id: createId(),
        kind: 'instance',
        multiplicity,
        className: headerMatch[2],
        qualifier,
        details: [],
      });
      continue;
    }

    if (/^si\b/i.test(trimmed) && !bulletMatch) {
      activeInstance = null;
      bulletStack.length = 0;
      const condText = trimmed.replace(/^si\s+/i, '').replace(/:\s*$/, '').trim();
      const condBlock: Extract<StateBlock, { kind: 'condition' }> = {
        id: createId(),
        kind: 'condition',
        condition: condText || trimmed,
        blocks: [],
      };
      blocks.push(condBlock);
      activeCondition = condBlock;
      continue;
    }

    if (/^(instancias\s+(?:principales|secundarias)|primer(?:a)?\s+instancia|instancias\s+\w+\s+siguientes)/i.test(trimmed) && !bulletMatch) {
      activeCondition = null;
      activeInstance = null;
      bulletStack.length = 0;
      blocks.push({ id: createId(), kind: 'section', title: trimmed.replace(/:\s*$/, '') });
      continue;
    }

    // Fallback lossless preservation for arbitrary lines or top-level bullets without instance header.
    activeCondition = null;
    activeInstance = null;
    bulletStack.length = 0;
    blocks.push({ id: createId(), kind: 'free-text', text: trimmed });
  }

  return blocks;
};

// ---------------------------------------------------------------------------
// Semantic inference & primitive detection

export const detectActorPrimitive = (text: string): ActorPrimitive => {
  const t = text.trim();
  if (/^iniciar\s+cu\b/i.test(t)) return 'iniciar-cu';
  if (/^ingresar\b/i.test(t)) return 'ingresar';
  if (/^seleccionar\b/i.test(t)) return 'seleccionar';
  if (/^confirmar\b/i.test(t)) return 'confirmar';
  if (/^elegir\b/i.test(t)) return 'elegir';
  return 'custom';
};

export const detectSystemPrimitive = (text: string): SystemPrimitive => {
  const t = text.trim();
  if (/^buscar\b/i.test(t)) return 'buscar';
  if (/^leer\b/i.test(t)) return 'leer';
  if (/^seleccionar\b/i.test(t)) return 'seleccionar';
  if (/^mostrar\s+mensaje\b|^mostrar\b/i.test(t)) return 'mostrar-mensaje';
  if (/^crear\b/i.test(t)) return 'crear';
  if (/^modificar\b/i.test(t)) return 'modificar';
  if (/^comprobar\b/i.test(t)) return 'comprobar';
  if (/^controlar\s+consistencia\b|^controlar\b/i.test(t)) return 'controlar-consistencia';
  if (/^ordenarpor\s*\(/i.test(t)) return 'ordenar';
  if (/^invocar\s+servicio\b/i.test(t)) return 'invocar-servicio';
  if (/^definir\s+pseudo-?entidad\b/i.test(t)) return 'definir-pseudoentidad';
  if (/^guardar\s+cambios\b/i.test(t)) return 'guardar-cambios';
  if (/^(?:ir|retornar|volver)\s+a(?:l)?\s+paso\b/i.test(t)) return 'ir-a-paso';
  if (/^ir\s+a\s+cu\b/i.test(t)) return 'ir-a-cu';
  if (/^(?:fin(?:alizar)?\s+(?:(?:del?|el)\s+)?(?:cu|caso\s+de\s+uso))\b/i.test(t)) return 'fin-cu';
  if (/^[a-zÁÉÍÓÚÜÑáéíóúüñ_]\w*\s*=\s*.+/.test(t)) return 'variable';
  return 'custom';
};

export const inferActionSemantic = (
  primitive: SystemPrimitive | ActorPrimitive,
  text: string,
  existing?: FlowActionSemantic,
): FlowActionSemantic | undefined => {
  const t = text.trim();
  const next: FlowActionSemantic = { ...existing };

  if (primitive === 'buscar' || primitive === 'crear' || primitive === 'modificar' || primitive === 'seleccionar') {
    const m = new RegExp(`^(?:Buscar|Crear|Modificar|Seleccionar)\\s+(?:la\\s+|las\\s+)?(?:instancias?|instancia\\/s)?\\s*(?:de\\s+)?(${IDENT})`, 'i').exec(t);
    if (m && /^[A-ZÁÉÍÓÚÜÑ]/.test(m[1])) {
      next.targetClass = m[1];
    }
  }

  if (primitive === 'leer') {
    // Pattern 1: "Leer instancia/s de ClaseB relacionada/s a [instancia/s de] ClaseA"
    const rel = new RegExp(
      `^Leer\\s+(?:la\\s+|las\\s+)?(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?(${IDENT})\\s+relacionad[ao]s?\\s+(?:a|con)\\s+(?:la\\s+|las\\s+)?(?:(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?)?(${IDENT})`,
      'i',
    ).exec(t);
    if (rel) {
      next.targetClass = rel[1];
      next.sourceClass = rel[2];
    } else {
      // Pattern 2: "Leer atributo de [instancia de] ClaseA"
      const attrOf = new RegExp(
        `^Leer\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+)?(${IDENT})\\s+de\\s+(?:la\\s+)?(?:(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?)?(${IDENT})`,
        'i',
      ).exec(t);
      if (attrOf && /^[A-ZÁÉÍÓÚÜÑ]/.test(attrOf[2])) {
        next.attribute = attrOf[1];
        next.sourceClass = attrOf[2];
      } else {
        // Pattern 3: "Leer de instancia [de] ClaseA:"
        const fromCls = new RegExp(`^Leer\\s+de\\s+(?:la\\s+)?(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?(${IDENT})`, 'i').exec(t);
        if (fromCls && /^[A-ZÁÉÍÓÚÜÑ]/.test(fromCls[1])) {
          next.sourceClass = fromCls[1];
        }
      }
    }
  }

  if (primitive === 'definir-pseudoentidad') {
    const m = new RegExp(`Definir\\s+pseudo-?entidad\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'i').exec(t);
    if (m) {
      next.pseudoEntity = {
        name: m[1],
        fields: m[2].split(',').map((field) => field.trim()).filter(Boolean),
      };
    }
  }

  if (primitive === 'invocar-servicio') {
    const m = new RegExp(`Invocar\\s+servicio\\s+(${IDENT})\\s+en\\s+(${IDENT})`, 'i').exec(t);
    if (m) {
      next.serviceName = m[1];
      next.externalSystem = m[2];
    }
  }

  if (primitive === 'ir-a-cu') {
    const m = /^Ir\s+a\s+CU\s+([^(]+?)(?:\s*\(|$)/i.exec(t);
    if (m) next.targetUseCase = m[1].trim();
  }

  if (primitive === 'ordenar') {
    const m = new RegExp(`OrdenarPor\\s*\\(\\s*(${IDENT})`, 'i').exec(t);
    if (m) next.attribute = m[1];
  }

  return Object.values(next).some((v) => v !== undefined) ? next : undefined;
};

export type DeclaredPseudoEntity = {
  name: string;
  fields: string[];
  flowId: 'basic' | string;
  stepId: string;
};

export const extractPseudoEntities = (content: UseCaseFlowContent): DeclaredPseudoEntity[] => {
  const byName = new Map<string, DeclaredPseudoEntity>();
  const scanText = (text: string, flowId: 'basic' | string, stepId: string): void => {
    for (const m of text.matchAll(new RegExp(`Definir\\s+pseudo-?entidad\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'gi'))) {
      byName.set(m[1], {
        name: m[1],
        fields: m[2].split(',').map((f) => f.trim()).filter(Boolean),
        flowId,
        stepId,
      });
    }
  };
  const scanSubNodes = (nodes: FlowSubNode[], flowId: 'basic' | string): void => {
    for (const node of nodes) {
      if (node.kind === 'action') {
        if (node.semantic?.pseudoEntity?.name) {
          byName.set(node.semantic.pseudoEntity.name, {
            name: node.semantic.pseudoEntity.name,
            fields: node.semantic.pseudoEntity.fields,
            flowId,
            stepId: node.id,
          });
        }
        scanText(node.text, flowId, node.id);
      } else if (node.kind === 'loop') {
        scanSubNodes(node.children, flowId);
      } else {
        scanSubNodes(node.thenChildren, flowId);
        if (node.elseChildren) scanSubNodes(node.elseChildren, flowId);
      }
    }
  };
  const scanSteps = (steps: FlowMainStep[], flowId: 'basic' | string): void => {
    for (const step of steps) {
      if (step.semantic?.pseudoEntity?.name) {
        byName.set(step.semantic.pseudoEntity.name, {
          name: step.semantic.pseudoEntity.name,
          fields: step.semantic.pseudoEntity.fields,
          flowId,
          stepId: step.id,
        });
      }
      scanText(step.title, flowId, step.id);
      scanSubNodes(step.children, flowId);
    }
  };
  scanSteps(content.basicFlow, 'basic');
  content.alternativeFlows.forEach((alt) => scanSteps(alt.steps, alt.id));
  return Array.from(byName.values());
};

// ---------------------------------------------------------------------------
// Deterministic Numbering Engine (with SINO / FINSI unnumbered)

export type IndexedFlowStep = {
  flowId: 'basic' | string;
  stepId: string;
  mainStepId: string;
  number: string;
  mainNumber: number;
  depth: number;
  speaker: 'actor' | 'system';
  label: string;
  isMain: boolean;
};

export type FlowBranchOrigin = {
  flowId: 'basic' | string;
  stepId: string;
  mainStepId: string;
  stepNumber: string;
  mainNumber: number;
};

export type FlowNumberingIndex = {
  stepNumberById: Map<string, string>;
  flowIdByStepId: Map<string, 'basic' | string>;
  firstStepNumberByFlowId: Map<string, number>;
  defaultFirstStepNumberByFlowId: Map<string, number>;
  branchOriginByFlowId: Map<string, FlowBranchOrigin>;
  entries: IndexedFlowStep[];
  entriesByFlowId: Map<string, IndexedFlowStep[]>;
};

const collectCaReferencesInSubNodes = (
  nodes: FlowSubNode[],
  flowId: 'basic' | string,
  mainStepId: string,
  out: Array<{ targetFlowId: string; flowId: 'basic' | string; stepId: string; mainStepId: string }>,
): void => {
  for (const node of nodes) {
    for (const ref of node.refs) {
      if (ref.kind === 'ca') {
        out.push({ targetFlowId: ref.flowId, flowId, stepId: node.id, mainStepId });
      }
    }
    if (node.kind === 'loop') {
      collectCaReferencesInSubNodes(node.children, flowId, mainStepId, out);
    } else if (node.kind === 'conditional') {
      collectCaReferencesInSubNodes(node.thenChildren, flowId, mainStepId, out);
      if (node.elseChildren) collectCaReferencesInSubNodes(node.elseChildren, flowId, mainStepId, out);
    }
  }
};

const collectCaReferencesInFlow = (
  steps: FlowMainStep[],
  flowId: 'basic' | string,
): Array<{ targetFlowId: string; flowId: 'basic' | string; stepId: string; mainStepId: string }> => {
  const out: Array<{ targetFlowId: string; flowId: 'basic' | string; stepId: string; mainStepId: string }> = [];
  for (const step of steps) {
    for (const ref of step.refs) {
      if (ref.kind === 'ca') {
        out.push({ targetFlowId: ref.flowId, flowId, stepId: step.id, mainStepId: step.id });
      }
    }
    collectCaReferencesInSubNodes(step.children, flowId, step.id, out);
  }
  return out;
};

export const computeFlowNumbering = (content: UseCaseFlowContent): FlowNumberingIndex => {
  const stepNumberById = new Map<string, string>();
  const flowIdByStepId = new Map<string, 'basic' | string>();
  const firstStepNumberByFlowId = new Map<string, number>();
  const defaultFirstStepNumberByFlowId = new Map<string, number>();
  const branchOriginByFlowId = new Map<string, FlowBranchOrigin>();
  const entries: IndexedFlowStep[] = [];
  const entriesByFlowId = new Map<string, IndexedFlowStep[]>();

  const numberSubNodes = (
    nodes: FlowSubNode[],
    prefix: string,
    mainNumber: number,
    depth: number,
    flowId: 'basic' | string,
    mainStepId: string,
    flowEntries: IndexedFlowStep[],
    startCounter = 1,
  ): number => {
    let counter = startCounter;
    for (const node of nodes) {
      const number = `${prefix}.${counter}`;
      counter += 1;
      stepNumberById.set(node.id, number);
      flowIdByStepId.set(node.id, flowId);
      const speaker: 'actor' | 'system' = node.kind === 'action' ? (node.speaker ?? 'system') : 'system';
      const label = node.kind === 'action'
        ? node.text.trim()
        : node.kind === 'loop'
          ? node.header.trim()
          : `SI ${node.condition.trim()}`.trim();
      const entry: IndexedFlowStep = {
        flowId,
        stepId: node.id,
        mainStepId,
        number,
        mainNumber,
        depth,
        speaker,
        label,
        isMain: false,
      };
      flowEntries.push(entry);
      entries.push(entry);

      if (node.kind === 'loop') {
        numberSubNodes(node.children, number, mainNumber, depth + 1, flowId, mainStepId, flowEntries, 1);
      } else if (node.kind === 'conditional') {
        // SINO and FINSI stay unnumbered; elseChildren continue the unique sub-numbering under SI.
        const nextCounter = numberSubNodes(node.thenChildren, number, mainNumber, depth + 1, flowId, mainStepId, flowEntries, 1);
        if (node.elseChildren && node.elseChildren.length > 0) {
          numberSubNodes(node.elseChildren, number, mainNumber, depth + 1, flowId, mainStepId, flowEntries, nextCounter);
        }
      }
    }
    return counter;
  };

  const numberFlow = (steps: FlowMainStep[], flowId: 'basic' | string, firstStepNumber: number): void => {
    const flowEntries: IndexedFlowStep[] = [];
    entriesByFlowId.set(flowId, flowEntries);
    firstStepNumberByFlowId.set(flowId, firstStepNumber);
    let mainCounter = firstStepNumber;

    for (const step of steps) {
      const number = String(mainCounter);
      stepNumberById.set(step.id, number);
      flowIdByStepId.set(step.id, flowId);
      const entry: IndexedFlowStep = {
        flowId,
        stepId: step.id,
        mainStepId: step.id,
        number,
        mainNumber: mainCounter,
        depth: 0,
        speaker: step.speaker,
        label: step.title.trim(),
        isMain: true,
      };
      flowEntries.push(entry);
      entries.push(entry);
      numberSubNodes(step.children, number, mainCounter, 1, flowId, step.id, flowEntries, 1);
      mainCounter += 1;
    }
  };

  const basicStart = content.basicFlowFirstStepNumber && content.basicFlowFirstStepNumber > 0
    ? content.basicFlowFirstStepNumber
    : 1;
  defaultFirstStepNumberByFlowId.set('basic', basicStart);
  numberFlow(content.basicFlow, 'basic', basicStart);

  // Collect CA references per flow, then resolve CAs iteratively (handles Basic → CA → CA chains cleanly).
  const allRefs = [
    ...collectCaReferencesInFlow(content.basicFlow, 'basic'),
    ...content.alternativeFlows.flatMap((alt) => collectCaReferencesInFlow(alt.steps, alt.id)),
  ];

  const remaining = new Set(content.alternativeFlows.map((alt) => alt.id));
  const altById = new Map(content.alternativeFlows.map((alt) => [alt.id, alt]));

  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const altId of Array.from(remaining)) {
      const alt = altById.get(altId)!;
      const originRef = allRefs.find((ref) =>
        ref.targetFlowId === altId && ref.flowId !== altId && stepNumberById.has(ref.stepId));
      if (!originRef) continue;
      const stepNumber = stepNumberById.get(originRef.stepId)!;
      const mainNumber = Number(stepNumber.split('.')[0]) || 1;
      branchOriginByFlowId.set(altId, {
        flowId: originRef.flowId,
        stepId: originRef.stepId,
        mainStepId: originRef.mainStepId,
        stepNumber,
        mainNumber,
      });
      const defaultFirst = mainNumber + 1;
      defaultFirstStepNumberByFlowId.set(altId, defaultFirst);
      const effectiveFirst = alt.firstStepNumberOverride && alt.firstStepNumberOverride > 0
        ? alt.firstStepNumberOverride
        : defaultFirst;
      numberFlow(alt.steps, altId, effectiveFirst);
      remaining.delete(altId);
      progressed = true;
    }
  }

  // Unreferenced CAs (or mutually cyclic CAs): default to 1 unless overridden.
  for (const altId of remaining) {
    const alt = altById.get(altId)!;
    const defaultFirst = 1;
    defaultFirstStepNumberByFlowId.set(altId, defaultFirst);
    const effectiveFirst = alt.firstStepNumberOverride && alt.firstStepNumberOverride > 0
      ? alt.firstStepNumberOverride
      : defaultFirst;
    numberFlow(alt.steps, altId, effectiveFirst);
  }

  return {
    stepNumberById,
    flowIdByStepId,
    firstStepNumberByFlowId,
    defaultFirstStepNumberByFlowId,
    branchOriginByFlowId,
    entries,
    entriesByFlowId,
  };
};

export const formatFlowRef = (ref: FlowRef, content: UseCaseFlowContent): string => {
  if (ref.kind === 'ca') {
    const alt = content.alternativeFlows.find((candidate) => candidate.id === ref.flowId);
    return alt ? formatAlternativeRef(alt.number) : 'CA N°?';
  }
  if (ref.kind === 'ca-missing') {
    const digits = /(\d+)\s*$/.exec(ref.code.trim())?.[1];
    return digits ? `CA N°${Number(digits)}` : ref.code.trim();
  }
  return ref.label.trim();
};

export const formatFlowNameShort = (flowId: 'basic' | string, content: UseCaseFlowContent): string => {
  if (flowId === 'basic') return 'camino principal';
  const alt = content.alternativeFlows.find((candidate) => candidate.id === flowId);
  return alt ? formatAlternativeRef(alt.number) : 'camino alternativo';
};

export const formatStepAnchorSuffix = (
  anchor: StepAnchorRef | undefined,
  content: UseCaseFlowContent,
  numbering: FlowNumberingIndex,
  currentFlowId: 'basic' | string,
): string => {
  if (!anchor) return '';
  const num = numbering.stepNumberById.get(anchor.stepId);
  if (!num) return '(paso ?)';
  if (anchor.flowId === currentFlowId) return `(paso ${num})`;
  return `(paso ${num} de ${formatFlowNameShort(anchor.flowId, content)})`;
};

export const formatJumpTargetText = (
  jumpTarget: StepAnchorRef | undefined,
  content: UseCaseFlowContent,
  numbering: FlowNumberingIndex,
  fallbackText = '',
): string => {
  if (!jumpTarget) return fallbackText;
  const num = numbering.stepNumberById.get(jumpTarget.stepId);
  const flowLabel = formatFlowNameShort(jumpTarget.flowId, content);
  if (!num) return fallbackText || `Ir a paso ? de ${flowLabel}`;
  return `Ir a paso ${num} de ${flowLabel}`;
};

// ---------------------------------------------------------------------------
// Tree mutation utilities for FlowSubNode trees (immutable)

export const mapSubNodes = (
  nodes: FlowSubNode[],
  updater: (node: FlowSubNode) => FlowSubNode,
): FlowSubNode[] =>
  nodes.map((node) => {
    const mapped = updater(node);
    if (mapped.kind === 'loop') {
      return { ...mapped, children: mapSubNodes(mapped.children, updater) };
    }
    if (mapped.kind === 'conditional') {
      return {
        ...mapped,
        thenChildren: mapSubNodes(mapped.thenChildren, updater),
        ...(mapped.elseChildren !== undefined ? { elseChildren: mapSubNodes(mapped.elseChildren, updater) } : {}),
      };
    }
    return mapped;
  });

export const removeSubNodeById = (nodes: FlowSubNode[], targetId: string): FlowSubNode[] =>
  nodes
    .filter((node) => node.id !== targetId)
    .map((node) => {
      if (node.kind === 'loop') {
        return { ...node, children: removeSubNodeById(node.children, targetId) };
      }
      if (node.kind === 'conditional') {
        return {
          ...node,
          thenChildren: removeSubNodeById(node.thenChildren, targetId),
          ...(node.elseChildren !== undefined ? { elseChildren: removeSubNodeById(node.elseChildren, targetId) } : {}),
        };
      }
      return node;
    });

export const insertSubNodeAfterId = (
  nodes: FlowSubNode[],
  afterId: string,
  newNode: FlowSubNode,
): FlowSubNode[] => {
  const index = nodes.findIndex((node) => node.id === afterId);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, newNode);
    return next;
  }
  return nodes.map((node) => {
    if (node.kind === 'loop') {
      return { ...node, children: insertSubNodeAfterId(node.children, afterId, newNode) };
    }
    if (node.kind === 'conditional') {
      return {
        ...node,
        thenChildren: insertSubNodeAfterId(node.thenChildren, afterId, newNode),
        ...(node.elseChildren !== undefined
          ? { elseChildren: insertSubNodeAfterId(node.elseChildren, afterId, newNode) }
          : {}),
      };
    }
    return node;
  });
};

export const moveSubNodeById = (
  nodes: FlowSubNode[],
  targetId: string,
  direction: -1 | 1,
): FlowSubNode[] => {
  const index = nodes.findIndex((node) => node.id === targetId);
  if (index >= 0) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= nodes.length) return nodes;
    const next = [...nodes];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    return next;
  }
  return nodes.map((node) => {
    if (node.kind === 'loop') {
      return { ...node, children: moveSubNodeById(node.children, targetId, direction) };
    }
    if (node.kind === 'conditional') {
      return {
        ...node,
        thenChildren: moveSubNodeById(node.thenChildren, targetId, direction),
        ...(node.elseChildren !== undefined
          ? { elseChildren: moveSubNodeById(node.elseChildren, targetId, direction) }
          : {}),
      };
    }
    return node;
  });
};

export const findSubNodeById = (nodes: FlowSubNode[], targetId: string): FlowSubNode | undefined => {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.kind === 'loop') {
      const found = findSubNodeById(node.children, targetId);
      if (found) return found;
    } else if (node.kind === 'conditional') {
      const found = findSubNodeById(node.thenChildren, targetId)
        ?? (node.elseChildren ? findSubNodeById(node.elseChildren, targetId) : undefined);
      if (found) return found;
    }
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Migration v1 → v2 and Normalization v2

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizePriority = (value: unknown): UseCaseFlowPriority =>
  value === 'B' || value === 'C' ? value : 'A';

const LEGACY_NUMBERED_RE = /^(\s*)(\d+(?:\.\d+)*)\.\s?(.*)$/;
const LEGACY_BULLET_RE = /^(\s*)[-*•◦▪]\s?(.*)$/;
const LEGACY_TRAILING_REF_RE = /\s*\[(C\.?\s?A\.?\s*(?:N°\s*)?\d+|GUI[- ]?\d+)\]\s*$/i;

export const normalizeLegacyFlowCode = (code: string): string => {
  const digits = /(\d+)\s*$/.exec(code.trim())?.[1];
  return digits === undefined ? code.trim().toUpperCase() : `CA ${Number(digits)}`;
};

const extractLegacyNumber = (code: string, fallback: number): number => {
  const digits = /(\d+)\s*$/.exec(code.trim())?.[1];
  const parsed = digits ? Number(digits) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseLegacyRefToken = (
  rawRef: string,
  altIdByCode: Map<string, string>,
): FlowRef | null => {
  const clean = rawRef.trim();
  if (!clean) return null;
  if (/^GUI[- ]?\d+/i.test(clean)) {
    const num = /(\d+)/.exec(clean)?.[1] ?? '';
    return { id: createId(), kind: 'gui', label: num ? `GUI-${num}` : clean.toUpperCase() };
  }
  if (/^C\.?\s?A\.?/i.test(clean)) {
    const norm = normalizeLegacyFlowCode(clean);
    const flowId = altIdByCode.get(norm);
    return flowId
      ? { id: createId(), kind: 'ca', flowId }
      : { id: createId(), kind: 'ca-missing', code: norm };
  }
  return { id: createId(), kind: 'custom', label: clean };
};

const splitLegacyTrailingRefs = (
  text: string,
  altIdByCode: Map<string, string>,
): { body: string; refs: FlowRef[] } => {
  let body = text;
  const refs: FlowRef[] = [];
  for (let match = LEGACY_TRAILING_REF_RE.exec(body); match !== null; match = LEGACY_TRAILING_REF_RE.exec(body)) {
    const parsed = parseLegacyRefToken(match[1], altIdByCode);
    if (parsed) refs.unshift(parsed);
    body = body.slice(0, match.index);
  }
  return { body: body.trimEnd(), refs };
};

type LegacyParsedLine = {
  kind: 'step' | 'bullet' | 'text';
  level: number;
  indent: number;
  oldNumber?: string;
  body: string;
  refs: FlowRef[];
  speaker: 'actor' | 'system';
  rowId: string;
};

const parseLegacyRowLines = (
  row: Partial<LegacyUseCaseFlowStep>,
  altIdByCode: Map<string, string>,
): { actorLines: LegacyParsedLine[]; systemLines: LegacyParsedLine[]; rowRefs: FlowRef[] } => {
  const rowId = asString(row.id) || createId();
  const rowRefs: FlowRef[] = [];
  const rawRowRef = asString(row.ref).trim();
  if (rawRowRef) {
    rawRowRef.split(/\s*[,;/]\s*/).forEach((token) => {
      const parsed = parseLegacyRefToken(token, altIdByCode);
      if (parsed) rowRefs.push(parsed);
    });
  }

  const parseField = (raw: string, speaker: 'actor' | 'system'): LegacyParsedLine[] => {
    if (!raw.trim()) return [];
    return raw.replace(/\r\n?/g, '\n').split('\n').flatMap((line): LegacyParsedLine[] => {
      if (!line.trim()) return [];
      const numbered = LEGACY_NUMBERED_RE.exec(line);
      if (numbered) {
        const { body, refs } = splitLegacyTrailingRefs(numbered[3], altIdByCode);
        return [{
          kind: 'step',
          level: numbered[2].split('.').length,
          indent: numbered[1].replace(/\t/g, '    ').length,
          oldNumber: numbered[2],
          body: body.trim(),
          refs,
          speaker,
          rowId,
        }];
      }
      const bullet = LEGACY_BULLET_RE.exec(line);
      if (bullet) {
        const { body, refs } = splitLegacyTrailingRefs(bullet[2], altIdByCode);
        return [{
          kind: 'bullet',
          level: 0,
          indent: bullet[1].replace(/\t/g, '    ').length,
          body: body.trim(),
          refs,
          speaker,
          rowId,
        }];
      }
      const indent = (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;
      const { body, refs } = splitLegacyTrailingRefs(line.trim(), altIdByCode);
      return [{ kind: 'text', level: 0, indent, body: body.trim(), refs, speaker, rowId }];
    });
  };

  return {
    actorLines: parseField(asString(row.actor), 'actor'),
    systemLines: parseField(asString(row.system), 'system'),
    rowRefs,
  };
};

type LegacyJumpPending = {
  owner: FlowMainStep | FlowActionNode;
  targetNumber: string;
  qualifier?: string;
  currentFlowId: 'basic' | string;
};

type LegacyStepRefPending = {
  owner: FlowActionNode | FlowLoopNode | FlowDetailItem | FlowMainStep;
  targetNumber: string;
  qualifier?: string;
  currentFlowId: 'basic' | string;
  cleanText: (text: string) => void;
};

const migrateLegacyRowsToMainSteps = (
  rows: Partial<LegacyUseCaseFlowStep>[],
  flowId: 'basic' | string,
  altIdByCode: Map<string, string>,
  oldNumberToStepId: Map<string, Map<string, string>>,
  pendingJumps: LegacyJumpPending[],
  pendingStepRefs: LegacyStepRefPending[],
): FlowMainStep[] => {
  const numberMap = new Map<string, string>();
  oldNumberToStepId.set(flowId, numberMap);

  // Flatten into ordered turns: if a v1 row has BOTH actor and system, actor goes first, then system.
  const mainSteps: FlowMainStep[] = [];
  type ContainerFrame = {
    level: number;
    targetArray: FlowSubNode[];
    conditionalNode?: FlowConditionalNode;
  };
  let stack: ContainerFrame[] = [];
  let lastActionOrLoop: FlowActionNode | FlowLoopNode | FlowMainStep | null = null;
  const usedIds = new Set<string>();
  const allocId = (preferred?: string): string => {
    if (preferred && !usedIds.has(preferred)) {
      usedIds.add(preferred);
      return preferred;
    }
    let id = createId();
    while (usedIds.has(id)) id = createId();
    usedIds.add(id);
    return id;
  };

  const detectJump = (text: string, owner: FlowMainStep | FlowActionNode): void => {
    const m = /^(?:Ir|Retornar|Volver)\s+a(?:l)?\s+paso\s+(?:N°\s*)?\[?(\d+(?:\.\d+)*)\]?(?:\s+(?:del?|de\s+la)\s+\[?(camino\s+(?:b[aá]sico|principal)|C\.?\s?A\.?\s*(?:N°\s*)?\d+|camino\s+altern(?:o|ativo)\s*(?:N°\s*)?\d+)\]?)?/i.exec(text.trim());
    if (m) {
      pendingJumps.push({ owner, targetNumber: m[1], qualifier: m[2], currentFlowId: flowId });
    }
  };

  const detectTrailingStepRef = (
    text: string,
    owner: FlowActionNode | FlowLoopNode | FlowDetailItem | FlowMainStep,
    setter: (next: string) => void,
  ): void => {
    const m = /\s*\((?:ver\s+)?pasos?\s+(?:N°\s*)?(\d+(?:\.\d+)*)(?:\s+(?:del?|de\s+la)\s+(camino\s+(?:b[aá]sico|principal)|C\.?\s?A\.?\s*(?:N°\s*)?\d+))?\)\s*$/i.exec(text);
    if (m) {
      pendingStepRefs.push({
        owner,
        targetNumber: m[1],
        qualifier: m[2],
        currentFlowId: flowId,
        cleanText: () => setter(text.slice(0, m.index).trimEnd()),
      });
    }
  };

  const appendLine = (line: LegacyParsedLine, extraRowRefs: FlowRef[], preferredMainId?: string): void => {
    const refs = [...line.refs, ...extraRowRefs];

    if (line.kind === 'bullet') {
      const detail: FlowDetailItem = { id: allocId(), text: line.body };
      detectTrailingStepRef(detail.text, detail, (clean) => { detail.text = clean; });
      if (lastActionOrLoop) {
        if ('kind' in lastActionOrLoop) {
          lastActionOrLoop.details.push(detail);
          if (refs.length > 0) lastActionOrLoop.refs.push(...refs);
        } else {
          lastActionOrLoop.details = [...(lastActionOrLoop.details ?? []), detail];
          if (refs.length > 0) lastActionOrLoop.refs.push(...refs);
        }
        return;
      }
      // Orphan bullet → create system step so no text is lost.
      const step = createFlowMainStep(line.speaker, line.body, { id: allocId(preferredMainId), refs });
      mainSteps.push(step);
      stack = [{ level: 1, targetArray: step.children }];
      lastActionOrLoop = step;
      return;
    }

    // Level 1 step (or unnumbered text when there is no active main step or speaker changed outside block)
    const isTopLevel = (line.kind === 'step' && line.level === 1)
      || (line.kind === 'text' && mainSteps.length === 0)
      || (line.kind === 'text' && line.speaker === 'actor');

    if (isTopLevel) {
      const primitive = line.speaker === 'actor'
        ? detectActorPrimitive(line.body)
        : detectSystemPrimitive(line.body);
      const id = allocId(preferredMainId);
      const step: FlowMainStep = {
        id,
        speaker: line.speaker,
        primitive,
        title: line.body,
        semantic: line.speaker === 'system' ? inferActionSemantic(primitive, line.body) : undefined,
        refs,
        children: [],
      };
      if (line.oldNumber) numberMap.set(line.oldNumber, id);
      if (primitive === 'ir-a-paso') detectJump(line.body, step);
      else detectTrailingStepRef(step.title, step, (clean) => { step.title = clean; });
      mainSteps.push(step);
      stack = [{ level: 1, targetArray: step.children }];
      lastActionOrLoop = step;
      return;
    }

    // Sub-step (level >= 2) or continuation text inside current main step
    if (mainSteps.length === 0) {
      const placeholder = createFlowMainStep(line.speaker, '', { id: allocId(preferredMainId) });
      mainSteps.push(placeholder);
      stack = [{ level: 1, targetArray: placeholder.children }];
    }

    const level = line.kind === 'step' ? line.level : Math.max(2, stack[stack.length - 1]?.level ?? 2);
    const body = line.body;

    // Closing FIN SI / FINSI → pop conditional frame
    if (/^FIN\s*SI\b/i.test(body)) {
      while (stack.length > 1 && !stack[stack.length - 1].conditionalNode) stack.pop();
      if (stack.length > 1 && stack[stack.length - 1].conditionalNode) stack.pop();
      return;
    }

    // SINO → switch active conditional frame to elseChildren
    if (/^SINO\b/i.test(body)) {
      while (stack.length > 1 && (!stack[stack.length - 1].conditionalNode || stack[stack.length - 1].level > level)) {
        stack.pop();
      }
      const frame = stack[stack.length - 1];
      if (frame?.conditionalNode) {
        frame.conditionalNode.elseChildren = frame.conditionalNode.elseChildren ?? [];
        frame.targetArray = frame.conditionalNode.elseChildren;
        return;
      }
    }

    // Pop stack back to parent level
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const targetArray = stack[stack.length - 1].targetArray;

    // Loop opener: POR CADA / MIENTRAS
    if (/^POR\s+CADA\b/i.test(body) || /^MIENTRAS\b/i.test(body)) {
      const isPorCada = /^POR\s+CADA\b/i.test(body);
      const id = allocId();
      const clsMatch = isPorCada
        ? new RegExp(`^POR\\s+CADA\\s+(?:instancias?\\s+)?(?:de\\s+)?(${IDENT})`, 'i').exec(body)
        : null;
      const loopNode: FlowLoopNode = {
        id,
        kind: 'loop',
        loopKind: isPorCada ? 'por-cada' : 'mientras',
        header: body,
        ...(clsMatch && /^[A-ZÁÉÍÓÚÜÑ]/.test(clsMatch[1]) ? { targetClass: clsMatch[1] } : {}),
        details: [],
        children: [],
        refs,
      };
      if (line.oldNumber) numberMap.set(line.oldNumber, id);
      detectTrailingStepRef(loopNode.header, loopNode, (clean) => { loopNode.header = clean; });
      targetArray.push(loopNode);
      stack.push({ level, targetArray: loopNode.children });
      lastActionOrLoop = loopNode;
      return;
    }

    // Conditional opener: SI ...
    if (/^SI\b/i.test(body)) {
      const id = allocId();
      const cond = body.replace(/^SI\s+/i, '').replace(/^\[(.*)\]$/, '$1').trim();
      const condNode: FlowConditionalNode = {
        id,
        kind: 'conditional',
        condition: cond,
        thenChildren: [],
        refs,
      };
      if (line.oldNumber) numberMap.set(line.oldNumber, id);
      targetArray.push(condNode);
      stack.push({ level, targetArray: condNode.thenChildren, conditionalNode: condNode });
      lastActionOrLoop = null;
      return;
    }

    // Standard action sub-node
    const id = allocId();
    const primitive = line.speaker === 'actor'
      ? detectActorPrimitive(body)
      : detectSystemPrimitive(body);
    const actionNode: FlowActionNode = {
      id,
      kind: 'action',
      ...(line.speaker === 'actor' ? { speaker: 'actor' } : {}),
      primitive,
      text: body,
      semantic: line.speaker === 'system' ? inferActionSemantic(primitive, body) : undefined,
      details: [],
      refs,
    };
    if (line.oldNumber) numberMap.set(line.oldNumber, id);
    if (primitive === 'ir-a-paso') detectJump(body, actionNode);
    else detectTrailingStepRef(actionNode.text, actionNode, (clean) => { actionNode.text = clean; });
    targetArray.push(actionNode);
    lastActionOrLoop = actionNode;
  };

  for (const row of rows) {
    const rowId = asString(row.id) || createId();
    const { actorLines, systemLines, rowRefs } = parseLegacyRowLines(row, altIdByCode);
    const hasActor = actorLines.length > 0;
    const hasSystem = systemLines.length > 0;

    if (!hasActor && !hasSystem) {
      mainSteps.push(createFlowMainStep('actor', '', { id: allocId(rowId), refs: rowRefs }));
      continue;
    }

    if (hasActor) {
      actorLines.forEach((line, idx) => {
        appendLine(
          line,
          !hasSystem && idx === 0 ? rowRefs : [],
          idx === 0 ? rowId : undefined,
        );
      });
    }

    if (hasSystem) {
      systemLines.forEach((line, idx) => {
        appendLine(
          line,
          idx === 0 ? rowRefs : [],
          !hasActor && idx === 0 ? rowId : undefined,
        );
      });
    }
  }

  return mainSteps;
};

export const isUseCaseFlowV2 = (content: unknown): content is Partial<UseCaseFlowContent> =>
  isRecord(content) && content.version === 2;

export const migrateUseCaseFlowV1ToV2 = (raw: Partial<LegacyUseCaseFlowContent> | undefined): UseCaseFlowContent => {
  const rawDesc: Record<string, unknown> = isRecord(raw?.description) ? raw.description : {};
  const rawBasic = Array.isArray(raw?.basicFlow) ? raw.basicFlow : [];
  const rawAlts = Array.isArray(raw?.alternativeFlows) ? raw.alternativeFlows : [];

  // Pre-allocate alternative IDs and map normalized codes (e.g. "CA 1") → alt.id
  const altMeta = rawAlts.map((alt, index) => {
    const id = asString(alt?.id) || createId();
    const rawCode = asString(alt?.code) || `CA ${index + 1}`;
    const number = extractLegacyNumber(rawCode, index + 1);
    return {
      id,
      rawCode,
      normalizedCode: normalizeLegacyFlowCode(rawCode),
      number,
      title: asString(alt?.name),
      rawFirstStepNumber:
        typeof alt?.firstStepNumber === 'number' && Number.isInteger(alt.firstStepNumber) && alt.firstStepNumber > 0
          ? alt.firstStepNumber
          : undefined,
      rawSteps: Array.isArray(alt?.steps) ? alt.steps : [],
    };
  });

  const altIdByCode = new Map<string, string>();
  altMeta.forEach((meta) => {
    altIdByCode.set(meta.normalizedCode, meta.id);
    altIdByCode.set(`CA ${meta.number}`, meta.id);
  });

  const oldNumberToStepId = new Map<string, Map<string, string>>();
  const pendingJumps: LegacyJumpPending[] = [];
  const pendingStepRefs: LegacyStepRefPending[] = [];

  const basicFlow = migrateLegacyRowsToMainSteps(
    rawBasic,
    'basic',
    altIdByCode,
    oldNumberToStepId,
    pendingJumps,
    pendingStepRefs,
  );

  const alternativeFlows: AlternativeUseCaseFlow[] = altMeta.map((meta) => ({
    id: meta.id,
    number: meta.number,
    title: meta.title,
    ...(meta.rawFirstStepNumber !== undefined ? { firstStepNumberOverride: meta.rawFirstStepNumber } : {}),
    steps: migrateLegacyRowsToMainSteps(
      meta.rawSteps,
      meta.id,
      altIdByCode,
      oldNumberToStepId,
      pendingJumps,
      pendingStepRefs,
    ),
  }));

  const resolveQualifierFlowId = (qualifier: string | undefined, currentFlowId: 'basic' | string): 'basic' | string | undefined => {
    if (!qualifier) return currentFlowId;
    if (/b[aá]sico|principal/i.test(qualifier)) return 'basic';
    return altIdByCode.get(normalizeLegacyFlowCode(qualifier));
  };

  pendingJumps.forEach((item) => {
    const targetFlowId = resolveQualifierFlowId(item.qualifier, item.currentFlowId);
    const stepId = targetFlowId ? oldNumberToStepId.get(targetFlowId)?.get(item.targetNumber) : undefined;
    if (targetFlowId && stepId) {
      item.owner.jumpTarget = { flowId: targetFlowId, stepId };
    }
  });

  pendingStepRefs.forEach((item) => {
    const targetFlowId = resolveQualifierFlowId(item.qualifier, item.currentFlowId);
    const stepId = targetFlowId ? oldNumberToStepId.get(targetFlowId)?.get(item.targetNumber) : undefined;
    if (targetFlowId && stepId) {
      item.owner.stepRef = { flowId: targetFlowId, stepId };
      item.cleanText('');
    }
  });

  const legacyPostcondition = asString(rawDesc.postcondition).trim();
  const migrated: UseCaseFlowContent = {
    version: 2,
    classDiagramArtifactId:
      raw?.classDiagramArtifactId === null
        ? null
        : asString(raw?.classDiagramArtifactId) || undefined,
    description: {
      useCaseNumber: asString(rawDesc.useCaseNumber),
      useCaseName: asString(rawDesc.useCaseName),
      actor: asString(rawDesc.actor),
      description: asString(rawDesc.description),
      priority: normalizePriority(rawDesc.priority),
      inputParameters: parseInputParametersText(asString(rawDesc.inputParameters)),
      precondition: asString(rawDesc.precondition),
      initialState: parseStateTextToBlocks(asString(rawDesc.initialState), 'initial'),
      finalState: parseStateTextToBlocks(asString(rawDesc.finalState), 'final'),
      ...(legacyPostcondition ? { legacyPostcondition } : {}),
    },
    basicFlow,
    alternativeFlows,
  };

  // Drop redundant firstStepNumberOverride if it already equals the automatic computed start
  const numbering = computeFlowNumbering(migrated);
  migrated.alternativeFlows = migrated.alternativeFlows.map((alt) => {
    const autoDefault = numbering.defaultFirstStepNumberByFlowId.get(alt.id);
    if (alt.firstStepNumberOverride !== undefined && alt.firstStepNumberOverride === autoDefault) {
      const rest = { ...alt };
      delete rest.firstStepNumberOverride;
      return rest;
    }
    return alt;
  });

  return normalizeUseCaseFlowV2(migrated);
};

// ---------------------------------------------------------------------------
// Strict v2 normalizer (ensures unique IDs across the whole artifact and clean shapes)

const createIdAllocator = () => {
  const used = new Set<string>();
  return (candidate: unknown): string => {
    const raw = typeof candidate === 'string' ? candidate.trim() : '';
    if (raw.length > 0 && !used.has(raw)) {
      used.add(raw);
      return raw;
    }
    let next = createId();
    while (used.has(next)) next = createId();
    used.add(next);
    return next;
  };
};

const normalizeFlowRef = (raw: unknown, allocId: (v: unknown) => string): FlowRef | null => {
  if (!isRecord(raw)) return null;
  const id = allocId(raw.id);
  if (raw.kind === 'ca' && typeof raw.flowId === 'string' && raw.flowId.trim()) {
    return { id, kind: 'ca', flowId: raw.flowId.trim() };
  }
  if (raw.kind === 'ca-missing') {
    return { id, kind: 'ca-missing', code: asString(raw.code) };
  }
  if (raw.kind === 'gui') {
    return { id, kind: 'gui', label: asString(raw.label) };
  }
  if (raw.kind === 'custom') {
    return { id, kind: 'custom', label: asString(raw.label) };
  }
  return null;
};

const normalizeStepAnchor = (raw: unknown): StepAnchorRef | undefined => {
  if (!isRecord(raw)) return undefined;
  const flowId = asString(raw.flowId).trim();
  const stepId = asString(raw.stepId).trim();
  return flowId && stepId ? { flowId, stepId } : undefined;
};

const normalizeFlowDetail = (raw: unknown, allocId: (v: unknown) => string): FlowDetailItem | null => {
  if (!isRecord(raw)) return null;
  const stepRef = normalizeStepAnchor(raw.stepRef);
  const children = Array.isArray(raw.children)
    ? raw.children.map((c) => normalizeFlowDetail(c, allocId)).filter((c): c is FlowDetailItem => c !== null)
    : undefined;
  return {
    id: allocId(raw.id),
    text: asString(raw.text),
    ...(stepRef ? { stepRef } : {}),
    ...(children && children.length > 0 ? { children } : {}),
  };
};

const normalizeFlowSubNode = (raw: unknown, allocId: (v: unknown) => string): FlowSubNode | null => {
  if (!isRecord(raw)) return null;
  const id = allocId(raw.id);
  const refs = Array.isArray(raw.refs)
    ? raw.refs.map((r) => normalizeFlowRef(r, allocId)).filter((r): r is FlowRef => r !== null)
    : [];

  if (raw.kind === 'loop') {
    const stepRef = normalizeStepAnchor(raw.stepRef);
    return {
      id,
      kind: 'loop',
      loopKind: raw.loopKind === 'mientras' ? 'mientras' : 'por-cada',
      header: asString(raw.header),
      ...(typeof raw.targetClass === 'string' && raw.targetClass.trim() ? { targetClass: raw.targetClass.trim() } : {}),
      ...(stepRef ? { stepRef } : {}),
      details: Array.isArray(raw.details)
        ? raw.details.map((d) => normalizeFlowDetail(d, allocId)).filter((d): d is FlowDetailItem => d !== null)
        : [],
      children: Array.isArray(raw.children)
        ? raw.children.map((c) => normalizeFlowSubNode(c, allocId)).filter((c): c is FlowSubNode => c !== null)
        : [],
      refs,
    };
  }

  if (raw.kind === 'conditional') {
    const elseChildren = Array.isArray(raw.elseChildren)
      ? raw.elseChildren.map((c) => normalizeFlowSubNode(c, allocId)).filter((c): c is FlowSubNode => c !== null)
      : undefined;
    return {
      id,
      kind: 'conditional',
      condition: asString(raw.condition),
      thenChildren: Array.isArray(raw.thenChildren)
        ? raw.thenChildren.map((c) => normalizeFlowSubNode(c, allocId)).filter((c): c is FlowSubNode => c !== null)
        : [],
      ...(elseChildren !== undefined ? { elseChildren } : {}),
      refs,
    };
  }

  const speaker = raw.speaker === 'actor' ? 'actor' : undefined;
  const text = asString(raw.text);
  const primitive = (typeof raw.primitive === 'string' && raw.primitive.length > 0
    ? raw.primitive
    : speaker === 'actor' ? detectActorPrimitive(text) : detectSystemPrimitive(text)) as SystemPrimitive | ActorPrimitive;
  const stepRef = normalizeStepAnchor(raw.stepRef);
  const jumpTarget = normalizeStepAnchor(raw.jumpTarget);
  const semantic = isRecord(raw.semantic) ? raw.semantic as FlowActionSemantic : undefined;

  return {
    id,
    kind: 'action',
    ...(speaker ? { speaker } : {}),
    primitive,
    text,
    ...(semantic ? { semantic } : {}),
    details: Array.isArray(raw.details)
      ? raw.details.map((d) => normalizeFlowDetail(d, allocId)).filter((d): d is FlowDetailItem => d !== null)
      : [],
    ...(stepRef ? { stepRef } : {}),
    ...(jumpTarget ? { jumpTarget } : {}),
    refs,
  };
};

const normalizeFlowMainStep = (raw: unknown, allocId: (v: unknown) => string): FlowMainStep | null => {
  if (!isRecord(raw)) return null;
  const speaker = raw.speaker === 'system' ? 'system' : 'actor';
  const title = asString(raw.title);
  const primitive = typeof raw.primitive === 'string' && raw.primitive.length > 0
    ? raw.primitive as ActorPrimitive | SystemPrimitive
    : undefined;
  const stepRef = normalizeStepAnchor(raw.stepRef);
  const jumpTarget = normalizeStepAnchor(raw.jumpTarget);
  const semantic = isRecord(raw.semantic) ? raw.semantic as FlowActionSemantic : undefined;
  const details = Array.isArray(raw.details)
    ? raw.details.map((d) => normalizeFlowDetail(d, allocId)).filter((d): d is FlowDetailItem => d !== null)
    : undefined;

  return {
    id: allocId(raw.id),
    speaker,
    ...(primitive ? { primitive } : {}),
    title,
    ...(semantic ? { semantic } : {}),
    ...(details && details.length > 0 ? { details } : {}),
    ...(jumpTarget ? { jumpTarget } : {}),
    ...(stepRef ? { stepRef } : {}),
    refs: Array.isArray(raw.refs)
      ? raw.refs.map((r) => normalizeFlowRef(r, allocId)).filter((r): r is FlowRef => r !== null)
      : [],
    children: Array.isArray(raw.children)
      ? raw.children.map((c) => normalizeFlowSubNode(c, allocId)).filter((c): c is FlowSubNode => c !== null)
      : [],
  };
};

const normalizeStateDetail = (raw: unknown, allocId: (v: unknown) => string): StateDetailItem | null => {
  if (!isRecord(raw)) return null;
  const id = allocId(raw.id);
  if (raw.kind === 'relation') {
    const mult = raw.multiplicity === 'multiple' || raw.multiplicity === 'one-or-more' ? raw.multiplicity : 'single';
    const relationNote = asString(raw.relationNote).trim();
    return {
      id,
      kind: 'relation',
      multiplicity: mult,
      className: asString(raw.className),
      ...(relationNote ? { relationNote } : {}),
      children: Array.isArray(raw.children)
        ? raw.children.map((c) => normalizeStateDetail(c, allocId)).filter((c): c is StateDetailItem => c !== null)
        : [],
    };
  }
  if (raw.kind === 'expression') {
    return { id, kind: 'expression', text: asString(raw.text) };
  }
  return {
    id,
    kind: 'attribute',
    attribute: asString(raw.attribute),
    comparator: asString(raw.comparator) || 'igual a',
    value: asString(raw.value),
  };
};

const normalizeStateInstance = (
  raw: Record<string, unknown>,
  mode: 'initial' | 'final',
  allocId: (v: unknown) => string,
): StateInstanceBlock => {
  const multiplicity: StateInstanceMultiplicity =
    raw.multiplicity === 'multiple' || raw.multiplicity === 'one-or-more' ? raw.multiplicity : 'single';
  const qualifier: StateInstanceQualifier =
    raw.qualifier === 'existente' || raw.qualifier === 'creada' || raw.qualifier === 'modificada' || raw.qualifier === 'custom'
      ? raw.qualifier
      : mode === 'initial' ? 'existente' : 'creada';
  const customQualifier = asString(raw.customQualifier).trim();
  return {
    id: allocId(raw.id),
    kind: 'instance',
    multiplicity,
    className: asString(raw.className),
    qualifier,
    ...(qualifier === 'custom' && customQualifier ? { customQualifier } : {}),
    details: Array.isArray(raw.details)
      ? raw.details.map((d) => normalizeStateDetail(d, allocId)).filter((d): d is StateDetailItem => d !== null)
      : [],
  };
};

const normalizeStateBlocks = (
  raw: unknown,
  mode: 'initial' | 'final',
  allocId: (v: unknown) => string,
): StateBlock[] => {
  if (typeof raw === 'string') return parseStateTextToBlocks(raw, mode);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): StateBlock[] => {
    if (!isRecord(entry)) return [];
    if (entry.kind === 'section') {
      return [{ id: allocId(entry.id), kind: 'section', title: asString(entry.title) }];
    }
    if (entry.kind === 'free-text') {
      return [{ id: allocId(entry.id), kind: 'free-text', text: asString(entry.text) }];
    }
    if (entry.kind === 'condition') {
      const blocks = Array.isArray(entry.blocks)
        ? entry.blocks.filter(isRecord).map((b) => normalizeStateInstance(b, mode, allocId))
        : [];
      return [{ id: allocId(entry.id), kind: 'condition', condition: asString(entry.condition), blocks }];
    }
    return [normalizeStateInstance(entry, mode, allocId)];
  });
};

const normalizeInputParams = (raw: unknown, allocId: (v: unknown) => string): FlowInputParameter[] => {
  if (typeof raw === 'string') return parseInputParametersText(raw);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): FlowInputParameter[] => {
    if (!isRecord(entry)) return [];
    const options = Array.isArray(entry.options)
      ? entry.options.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
      : undefined;
    return [{
      id: allocId(entry.id),
      name: asString(entry.name),
      ...(options && options.length > 0 ? { options } : {}),
      ...(entry.optional === true ? { optional: true } : {}),
    }];
  });
};

export const normalizeUseCaseFlowV2 = (raw: Partial<UseCaseFlowContent> | undefined): UseCaseFlowContent => {
  const allocId = createIdAllocator();
  const rawDesc: Record<string, unknown> = isRecord(raw?.description) ? raw.description : {};
  const legacyPostcondition = asString(rawDesc.legacyPostcondition).trim();

  const description: UseCaseFlowDescription = {
    useCaseNumber: asString(rawDesc.useCaseNumber),
    useCaseName: asString(rawDesc.useCaseName),
    actor: asString(rawDesc.actor),
    description: asString(rawDesc.description),
    priority: normalizePriority(rawDesc.priority),
    inputParameters: normalizeInputParams(rawDesc.inputParameters, allocId),
    precondition: asString(rawDesc.precondition),
    initialState: normalizeStateBlocks(rawDesc.initialState, 'initial', allocId),
    finalState: normalizeStateBlocks(rawDesc.finalState, 'final', allocId),
    ...(legacyPostcondition ? { legacyPostcondition } : {}),
  };

  const basicFlow = Array.isArray(raw?.basicFlow)
    ? raw.basicFlow.map((s) => normalizeFlowMainStep(s, allocId)).filter((s): s is FlowMainStep => s !== null)
    : [];

  const usedNumbers = new Set<number>();
  const alternativeFlows: AlternativeUseCaseFlow[] = Array.isArray(raw?.alternativeFlows)
    ? raw.alternativeFlows.flatMap((flow, index): AlternativeUseCaseFlow[] => {
        if (!isRecord(flow)) return [];
        let num = typeof flow.number === 'number' && Number.isInteger(flow.number) && flow.number > 0
          ? flow.number
          : index + 1;
        while (usedNumbers.has(num)) num += 1;
        usedNumbers.add(num);
        return [{
          id: allocId(flow.id),
          number: num,
          title: asString(flow.title),
          ...(typeof flow.firstStepNumberOverride === 'number'
            && Number.isInteger(flow.firstStepNumberOverride)
            && flow.firstStepNumberOverride > 0
            ? { firstStepNumberOverride: flow.firstStepNumberOverride }
            : {}),
          steps: Array.isArray(flow.steps)
            ? flow.steps.map((s) => normalizeFlowMainStep(s, allocId)).filter((s): s is FlowMainStep => s !== null)
            : [],
        }];
      })
    : [];

  return {
    version: 2,
    classDiagramArtifactId:
      raw?.classDiagramArtifactId === null
        ? null
        : asString(raw?.classDiagramArtifactId) || undefined,
    ...(typeof raw?.basicFlowFirstStepNumber === 'number'
      && Number.isInteger(raw.basicFlowFirstStepNumber)
      && raw.basicFlowFirstStepNumber > 0
      && raw.basicFlowFirstStepNumber !== 1
      ? { basicFlowFirstStepNumber: raw.basicFlowFirstStepNumber }
      : {}),
    description,
    basicFlow,
    alternativeFlows,
  };
};

export const normalizeAnyUseCaseFlowContent = (
  content: Partial<UseCaseFlowContent> | Partial<LegacyUseCaseFlowContent> | undefined,
): UseCaseFlowContent => {
  if (!content) return createEmptyUseCaseFlowContent();
  if (isUseCaseFlowV2(content)) return normalizeUseCaseFlowV2(content);
  return migrateUseCaseFlowV1ToV2(content as Partial<LegacyUseCaseFlowContent>);
};
