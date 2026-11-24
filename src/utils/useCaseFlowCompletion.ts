import type { UseCaseFlowContent } from '../types/diagram';
import type { CompletionSuggestion, FlowTextField, TextInsertion } from '../types/useCaseFlowEditor';
import type { ProjectSymbolClass, ProjectSymbolIndex } from './projectSymbolIndex';
import {
  ACTOR_PRIMITIVE_DEFS,
  computeFlowNumbering,
  extractPseudoEntities,
  formatAlternativeRef,
  SYSTEM_PRIMITIVE_DEFS,
} from './useCaseFlowModel';

const IDENT = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\\wÁÉÍÓÚÜÑáéíóúüñ]*';

export const normalizeSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const matchesPrefix = (value: string, query: string): boolean =>
  normalizeSearch(value).startsWith(normalizeSearch(query));

export const matchesContains = (value: string, query: string): boolean =>
  normalizeSearch(value).includes(normalizeSearch(query));

const replaceRange = (value: string, start: number, end: number, insertText: string): TextInsertion => ({
  value: `${value.slice(0, start)}${insertText}${value.slice(end)}`,
  caretPosition: start + insertText.length,
});

const createReplace = (
  id: string,
  label: string,
  queryLength: number,
  insertText: string,
  detail?: string,
  badge?: string,
): CompletionSuggestion => ({
  id,
  label,
  detail,
  badge,
  apply: (value, position) => replaceRange(value, Math.max(0, position - queryLength), position, insertText),
});

export type FlowLineCompletionContext = {
  content: UseCaseFlowContent;
  flowId: 'basic' | string;
  symbolIndex: ProjectSymbolIndex;
  ownerClassName?: string;
  useCaseNames?: string[];
  actorNames?: string[];
};

const findClass = (symbolIndex: ProjectSymbolIndex, name: string): ProjectSymbolClass | undefined =>
  symbolIndex.classes.find((c) => normalizeSearch(c.name) === normalizeSearch(name));

/**
 * Context-aware inline autocomplete for a single line (action text, detail bullet, loop header, actor step).
 * Supports `/` slash commands, DC classes, navigable relations for `Leer`, attributes, parametric values,
 * input parameters, pseudoentities, and `(paso ...` references.
 */
export const buildFlowLineSuggestions = (
  speaker: FlowTextField,
  value: string,
  position: number,
  ctx: FlowLineCompletionContext,
): CompletionSuggestion[] => {
  const before = value.slice(0, position);
  const trimmed = before.trimStart();

  // 1. Slash command palette (`/` at line start)
  if (trimmed.startsWith('/')) {
    const query = trimmed.slice(1);
    if (speaker === 'actor') {
      return ACTOR_PRIMITIVE_DEFS
        .filter((def) => !query || matchesContains(def.label, query))
        .map((def) => createReplace(
          `slash-actor:${def.primitive}`,
          def.label,
          trimmed.length,
          def.template,
          def.hint,
          'Actor',
        ));
    }
    return SYSTEM_PRIMITIVE_DEFS
      .filter((def) => !query || matchesContains(def.label, query) || matchesContains(def.id, query))
      .slice(0, 12)
      .map((def) => createReplace(
        `slash-sys:${def.id}`,
        def.label,
        trimmed.length,
        def.template,
        def.hint,
        def.kind === 'action' ? 'Sistema' : 'Bloque',
      ));
  }

  // 2. Actor actions & input parameters
  if (speaker === 'actor') {
    const paramOpen = /\(([^)]*)$/.exec(before);
    if (paramOpen) {
      const q = paramOpen[1];
      return ctx.content.description.inputParameters
        .filter((param) => param.name.trim() && (!q || matchesContains(param.name, q)))
        .slice(0, 8)
        .map((param) => {
          const text = param.options?.length ? `${param.name} (${param.options.join(' - ')})` : param.name;
          return createReplace(`param:${param.id}`, param.name, q.length, `${text})`, 'parámetro de entrada');
        });
    }
    if (!/\s/.test(trimmed) && trimmed.length > 0) {
      return ACTOR_PRIMITIVE_DEFS
        .filter((def) => matchesPrefix(def.label, trimmed))
        .map((def) => createReplace(`actor:${def.primitive}`, def.label, trimmed.length, `${def.label} `, def.hint));
    }
    return [];
  }

  // 3. Inline `(paso ...` step reference suggestions
  const stepRefMatch = /\(pasos?\s+(\d+(?:\.\d+)*\.?)?$/i.exec(before);
  if (stepRefMatch) {
    const q = stepRefMatch[1] ?? '';
    const numbering = computeFlowNumbering(ctx.content);
    const entries = numbering.entriesByFlowId.get(ctx.flowId) ?? [];
    return entries
      .filter((entry) => !q || entry.number.startsWith(q))
      .slice(-10)
      .reverse()
      .map((entry) => createReplace(
        `step-ref:${entry.stepId}`,
        `paso ${entry.number}`,
        q.length,
        `${entry.number})`,
        entry.label.slice(0, 56),
      ));
  }

  // 4. `Ir a paso ...` suggestions across basic + alternatives
  const jumpMatch = /\b(?:Ir|Retornar|Volver)\s+a(?:l)?\s+paso\s+(\d*)$/i.exec(before);
  if (jumpMatch) {
    const q = jumpMatch[1] ?? '';
    const numbering = computeFlowNumbering(ctx.content);
    const altById = new Map(ctx.content.alternativeFlows.map((a) => [a.id, a]));
    return numbering.entries
      .filter((entry) => entry.isMain && (!q || entry.number.startsWith(q)))
      .slice(0, 12)
      .map((entry) => {
        const flowText = entry.flowId === 'basic'
          ? 'de camino principal'
          : `de ${formatAlternativeRef(altById.get(entry.flowId)?.number ?? 1)}`;
        return createReplace(
          `jump:${entry.stepId}`,
          `${entry.number} ${flowText}`,
          q.length,
          `${entry.number} ${flowText}`,
          entry.label.slice(0, 54),
        );
      });
  }

  // 5. `Ir a CU ...` suggestions from project use cases
  const cuMatch = /\bIr\s+a\s+CU\s+([^(]*)$/i.exec(before);
  if (cuMatch && ctx.useCaseNames && ctx.useCaseNames.length > 0) {
    const q = cuMatch[1];
    return ctx.useCaseNames
      .filter((name) => !q || matchesContains(name, q))
      .slice(0, 8)
      .map((name) => createReplace(`cu:${name}`, name, q.length, `${name} ()`, 'Caso de Uso'));
  }

  const pseudoEntities = extractPseudoEntities(ctx.content);

  // 6. `Leer` smart suggestions: navigable relations + attributes of classes
  const leerRelMatch = new RegExp(`^Leer\\s+(?:instancias?\\s+)?(?:de\\s+)?(${IDENT})\\s+relacionad[ao]s?\\s+a\\s+(?:instancias?\\s+)?(?:de\\s+)?(${IDENT}|)$`, 'i').exec(trimmed);
  if (leerRelMatch) {
    const targetCls = leerRelMatch[1];
    const q = leerRelMatch[2] ?? '';
    // Suggest classes that have a navigable relation TO targetCls first!
    return [...ctx.symbolIndex.classes]
      .sort((a, b) => {
        const aNav = a.relations?.some((r) => r.navigable && normalizeSearch(r.targetClass) === normalizeSearch(targetCls)) ? 1 : 0;
        const bNav = b.relations?.some((r) => r.navigable && normalizeSearch(r.targetClass) === normalizeSearch(targetCls)) ? 1 : 0;
        return bNav - aNav;
      })
      .filter((cls) => !q || matchesPrefix(cls.name, q))
      .slice(0, 8)
      .map((cls) => {
        const isNav = cls.relations?.some((r) => r.navigable && normalizeSearch(r.targetClass) === normalizeSearch(targetCls));
        return createReplace(
          `leer-src:${cls.name}`,
          cls.name,
          q.length,
          cls.name,
          isNav ? `navegable → ${targetCls}` : 'clase del DC',
          isNav ? '✓ Leer' : undefined,
        );
      });
  }

  const leerAttrClassMatch = new RegExp(`^Leer\\s+(${IDENT})\\s+de\\s+(?:instancias?\\s+)?(?:de\\s+)?(${IDENT}|)$`, 'i').exec(trimmed);
  if (leerAttrClassMatch) {
    const attrName = leerAttrClassMatch[1];
    const q = leerAttrClassMatch[2] ?? '';
    return [...ctx.symbolIndex.classes]
      .sort((a, b) => {
        const aHas = a.attributes.some((at) => normalizeSearch(at.name) === normalizeSearch(attrName)) ? 1 : 0;
        const bHas = b.attributes.some((at) => normalizeSearch(at.name) === normalizeSearch(attrName)) ? 1 : 0;
        return bHas - aHas;
      })
      .filter((cls) => !q || matchesPrefix(cls.name, q))
      .slice(0, 8)
      .map((cls) => createReplace(`leer-attr-cls:${cls.name}`, cls.name, q.length, cls.name, 'clase del DC'));
  }

  // 7. Class completion after `Buscar / Crear / Modificar / Seleccionar / Por cada / Relacionada a / Leer instancia/s de`
  const classPromptMatch = new RegExp(
    `(?:Buscar|Crear|Modificar|Seleccionar|Por\\s+cada|Relacionad[ao]s?\\s+a|Leer)\\s+(?:la\\s+|las\\s+)?(?:instancias?|instancia\\/s)?\\s*(?:de\\s+)?(${IDENT}|)$`,
    'i',
  ).exec(trimmed);
  if (classPromptMatch) {
    const q = classPromptMatch[1] ?? '';
    const isCrearOrLoop = /^(?:Crear|Por\s+cada)\b/i.test(trimmed);
    const results: CompletionSuggestion[] = [];

    if (isCrearOrLoop) {
      pseudoEntities
        .filter((pe) => !q || matchesPrefix(pe.name, q))
        .slice(0, 4)
        .forEach((pe) => {
          results.push(createReplace(
            `pseudo:${pe.name}`,
            pe.name,
            q.length,
            `${pe.name}:`,
            `pseudoentidad (${pe.fields.join(', ')})`,
            'Pseudo',
          ));
        });
    }

    const ownerClass = ctx.ownerClassName ? findClass(ctx.symbolIndex, ctx.ownerClassName) : undefined;
    const sortedClasses = [...ctx.symbolIndex.classes].sort((a, b) => {
      const aRel = ownerClass?.relations?.some((r) => r.navigable && r.targetClass === a.name) ? 2 : ownerClass?.relatedClasses.includes(a.name) ? 1 : 0;
      const bRel = ownerClass?.relations?.some((r) => r.navigable && r.targetClass === b.name) ? 2 : ownerClass?.relatedClasses.includes(b.name) ? 1 : 0;
      return bRel - aRel;
    });

    sortedClasses
      .filter((cls) => !q || matchesPrefix(cls.name, q))
      .slice(0, 8)
      .forEach((cls) => {
        const rel = ownerClass?.relations?.find((r) => r.targetClass === cls.name);
        const detail = rel
          ? rel.navigable ? `navegable desde ${ownerClass!.name}` : `relacionada con ${ownerClass!.name}`
          : `${cls.attributes.length} atributos`;
        results.push(createReplace(`cls:${cls.name}`, cls.name, q.length, cls.name, detail, 'Clase'));
      });

    if (results.length > 0) return results.slice(0, 10);
  }

  // 8. Detail bullet completion: attributes, comparators, parametric values & input parameters
  if (ctx.ownerClassName) {
    const ownerCls = findClass(ctx.symbolIndex, ctx.ownerClassName);
    const ownerPseudo = pseudoEntities.find((pe) => pe.name === ctx.ownerClassName);

    // Value after `igual a ` / `distinto de `
    const valMatch = new RegExp(`(?:Con\\s+)?(${IDENT})\\s+(?:igual\\s+a|distint[oa]\\s+(?:de|a)|=)\\s*(['"“]?[\\wÁÉÍÓÚÜÑáéíóúüñ]*)?$`, 'i').exec(trimmed);
    if (valMatch) {
      const valQuery = valMatch[2] ?? '';
      const cleanQ = valQuery.replace(/^['"“]/, '');
      const results: CompletionSuggestion[] = [];

      if (ownerCls && ownerCls.parametricValues.length > 0) {
        ownerCls.parametricValues
          .filter((pv) => !cleanQ || matchesContains(pv, cleanQ))
          .slice(0, 6)
          .forEach((pv) => {
            results.push(createReplace(`pv:${pv}`, `'${pv}'`, valQuery.length, `'${pv}'`, 'valor paramétrico'));
          });
      }

      ctx.content.description.inputParameters
        .filter((param) => param.name.trim() && (!cleanQ || matchesPrefix(param.name, cleanQ)))
        .slice(0, 5)
        .forEach((param) => {
          results.push(createReplace(`inparam:${param.id}`, param.name, valQuery.length, param.name, 'parámetro de entrada'));
        });

      ['vacío', 'fecha_actual()'].forEach((literal) => {
        if (!cleanQ || matchesPrefix(literal, cleanQ)) {
          results.push(createReplace(`lit:${literal}`, literal, valQuery.length, literal, 'constante'));
        }
      });

      if (results.length > 0) return results.slice(0, 9);
    }

    // Attribute name after optional `Con `
    const attrPrompt = new RegExp(`^(?:Con\\s+)?(${IDENT}|)$`, 'i').exec(trimmed);
    if (attrPrompt) {
      const q = attrPrompt[1] ?? '';
      const results: CompletionSuggestion[] = [];
      if (ownerCls) {
        ownerCls.attributes
          .filter((attr) => !q || matchesPrefix(attr.name, q))
          .slice(0, 8)
          .forEach((attr) => {
            const suffix = /^fechaHora(Baja|Fin)/i.test(attr.name) ? ' igual a vacío' : ' igual a ';
            results.push(createReplace(
              `attr:${ownerCls.name}:${attr.name}`,
              attr.name,
              q.length,
              `${attr.name}${suffix}`,
              attr.type || ownerCls.name,
              'Atributo',
            ));
          });
      } else if (ownerPseudo) {
        ownerPseudo.fields
          .filter((field) => !q || matchesPrefix(field, q))
          .slice(0, 8)
          .forEach((field) => {
            results.push(createReplace(`pattr:${field}`, field, q.length, `${field} igual a `, ownerPseudo.name, 'Campo'));
          });
      }

      if (q.length > 0 && matchesPrefix('Relacionada a instancia de', q)) {
        results.unshift(createReplace('rel-prefix', 'Relacionada a instancia de', q.length, 'Relacionada a instancia de ', 'relación'));
      }

      if (results.length > 0) return results;
    }
  }

  // 9. Primitive prefix completion when starting a system action line
  if (trimmed.length > 0 && !trimmed.includes(' ')) {
    const prims = SYSTEM_PRIMITIVE_DEFS
      .filter((def) => matchesPrefix(def.label, trimmed))
      .slice(0, 8)
      .map((def) => createReplace(`prim:${def.id}`, def.label, trimmed.length, def.template, def.hint));
    if (prims.length > 0) return prims;
  }

  return [];
};
