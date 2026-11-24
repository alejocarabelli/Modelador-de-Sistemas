import type {
  FlowDetailItem,
  FlowMainStep,
  FlowSubNode,
  StateBlock,
  StateDetailItem,
  StateInstanceBlock,
  UseCaseFlowContent,
} from '../types/diagram';
import {
  DEFAULT_FLOW_EXPORT_OPTIONS,
  type FlowExportOptions,
} from '../types/useCaseFlowEditor';
import type { ProjectSymbolIndex } from './projectSymbolIndex';
import {
  computeFlowNumbering,
  extractPseudoEntities,
  formatAlternativeRef,
  formatAlternativeTitle,
  formatFlowRef,
  formatInputParameters,
  formatJumpTargetText,
  formatStateDetailText,
  formatStateInstanceHeader,
  formatStepAnchorSuffix,
  type FlowNumberingIndex,
} from './useCaseFlowModel';

export type FlowInlineKind = 'plain' | 'class' | 'attribute' | 'keyword' | 'stepRef' | 'pathRef' | 'literal';

export type FlowInlineToken = { kind: FlowInlineKind; text: string };

export type FlowVocabulary = {
  attributes: Set<string>;
  classes: Set<string>;
};

export const buildFlowVocabulary = (
  symbolIndex: ProjectSymbolIndex,
  extraClasses: string[] = [],
  extraAttributes: string[] = [],
): FlowVocabulary => ({
  classes: new Set([
    ...symbolIndex.classes.map((cls) => cls.name),
    ...extraClasses.filter(Boolean),
  ]),
  attributes: new Set([
    ...symbolIndex.classes.flatMap((cls) => cls.attributes.map((attr) => attr.name)),
    ...extraAttributes.filter(Boolean),
  ]),
});

const KEYWORD_PREFIX_RE =
  /^(Por\s+cada|Mientras|FINSI|FIN\s+SI|SINO|SI|Fin\s+CU|Guardar\s+Cambios|Ir\s+a\s+paso|Ir\s+a\s+CU|Definir\s+pseudo-?entidad|Invocar\s+servicio)\b/i;

const INLINE_TOKEN_RE =
  /(\((?:ver\s+)?pasos?\s+[^)]*\))|(\bpasos?\s+(?:N°\s*)?\[?\d+(?:\.\d+)*\]?)|(\b(?:CA\s*N°\s*\d+|GUI-\d+)\b)|("[^"\n]*"?|“[^”\n]*”?|‘[^’\n]*’?|'[^'\n]*'?)|([A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\wÁÉÍÓÚÜÑáéíóúüñ]*)/g;

export const tokenizeFlowInline = (
  text: string,
  vocabulary: FlowVocabulary,
  detectKeyword = true,
): FlowInlineToken[] => {
  const tokens: FlowInlineToken[] = [];
  const push = (kind: FlowInlineKind, value: string): void => {
    if (!value) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind && kind === 'plain') {
      prev.text += value;
      return;
    }
    tokens.push({ kind, text: value });
  };

  let rest = text;
  if (detectKeyword) {
    const kw = KEYWORD_PREFIX_RE.exec(text);
    if (kw) {
      push('keyword', kw[0]);
      rest = text.slice(kw[0].length);
    }
  }

  let lastIndex = 0;
  for (const match of rest.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? 0;
    push('plain', rest.slice(lastIndex, index));
    lastIndex = index + match[0].length;

    if (match[1] !== undefined || match[2] !== undefined) {
      push('stepRef', match[0]);
    } else if (match[3] !== undefined) {
      push('pathRef', match[0]);
    } else if (match[4] !== undefined) {
      push('literal', match[0]);
    } else if (vocabulary.classes.has(match[0])) {
      push('class', match[0]);
    } else if (vocabulary.attributes.has(match[0])) {
      push('attribute', match[0]);
    } else {
      push('plain', match[0]);
    }
  }

  push('plain', rest.slice(lastIndex));
  return tokens;
};

// ---------------------------------------------------------------------------
// Intermediate Document Model shared by PDF, DOCX, Viewer & Editor Print Preview

export type FlowDocSegment = {
  bold?: boolean;
  italic?: boolean;
  text: string;
  underline?: boolean;
};

export type FlowDocLine = {
  /** 0 = ●, 1 = ○, 2 = ■. */
  bullet?: number;
  bold?: boolean;
  /** Visual indentation depth (0 = main step, 1 = 4.1, 2 = inside loop/if, etc.). */
  depth: number;
  /** Displayed step number, e.g. "4." or "4.1." (absent for bullets, SINO, FINSI). */
  number?: string;
  refs: string[];
  segments: FlowDocSegment[];
  /** Number of active nested loop boxes enclosing this line (0 outside loops). */
  loopDepth?: number;
  /** Number of loop boxes that open immediately at this line. */
  loopStarts?: number;
  /** Number of loop boxes that close immediately after this line. */
  loopEnds?: number;
};

export type FlowDocSubRow = {
  actor: FlowDocLine[];
  system: FlowDocLine[];
  ref: string;
};

export type FlowDocRow = {
  stepId: string;
  subRows: FlowDocSubRow[];
};

export type FlowDocTable = {
  id: string;
  title: string;
  subtitle?: string;
  rows: FlowDocRow[];
};

export type FlowDocField = {
  label: string;
  lines: FlowDocLine[];
};

export type FlowDocument = {
  title: string;
  useCaseNumber: string;
  useCaseName: string;
  includeDescription: boolean;
  includeBasicFlow: boolean;
  includeAlternatives: boolean;
  fields: FlowDocField[];
  basic: FlowDocTable;
  alternatives: FlowDocTable[];
};

const tokensToSegments = (
  text: string,
  vocabulary: FlowVocabulary,
  options: { detectKeyword?: boolean; forceBold?: boolean; uppercaseKeyword?: boolean } = {},
): FlowDocSegment[] => {
  if (!text) return [];
  const tokens = tokenizeFlowInline(text, vocabulary, options.detectKeyword ?? true);
  return tokens.map((token) => {
    const isStrongKw = token.kind === 'keyword' && /^(SI|SINO|FINSI|FIN\s+SI)$/i.test(token.text);
    const outText = isStrongKw && options.uppercaseKeyword ? token.text.toUpperCase() : token.text;
    return {
      text: outText,
      bold: options.forceBold || isStrongKw || undefined,
      underline: token.kind === 'class' || undefined,
      italic: token.kind === 'attribute' || undefined,
    };
  });
};

const stateDetailsToDocLines = (
  details: StateDetailItem[],
  vocabulary: FlowVocabulary,
  depth = 0,
): FlowDocLine[] =>
  details.flatMap((detail): FlowDocLine[] => {
    const text = formatStateDetailText(detail);
    const line: FlowDocLine = {
      bullet: Math.min(2, depth),
      depth: depth + 1,
      refs: [],
      segments: tokensToSegments(text, vocabulary, { detectKeyword: false }),
    };
    if (detail.kind === 'relation' && detail.children.length > 0) {
      return [line, ...stateDetailsToDocLines(detail.children, vocabulary, depth + 1)];
    }
    return [line];
  });

const stateInstanceToDocLines = (
  inst: StateInstanceBlock,
  vocabulary: FlowVocabulary,
): FlowDocLine[] => [
  {
    depth: 0,
    refs: [],
    segments: tokensToSegments(formatStateInstanceHeader(inst), vocabulary, { detectKeyword: false }),
  },
  ...stateDetailsToDocLines(inst.details, vocabulary, 0),
];

const stateBlocksToDocLines = (
  blocks: StateBlock[],
  vocabulary: FlowVocabulary,
  emptyFallback = '',
): FlowDocLine[] => {
  if (blocks.length === 0) {
    return emptyFallback ? [{ depth: 0, refs: [], segments: [{ text: emptyFallback }] }] : [];
  }
  const lines: FlowDocLine[] = [];
  blocks.forEach((block, index) => {
    if (index > 0 && (block.kind === 'section' || block.kind === 'condition' || block.kind === 'instance')) {
      lines.push({ depth: 0, refs: [], segments: [] });
    }
    if (block.kind === 'section') {
      lines.push({
        bold: true,
        depth: 0,
        refs: [],
        segments: [{ text: block.title, bold: true }],
      });
    } else if (block.kind === 'free-text') {
      block.text.split('\n').forEach((raw) => {
        lines.push({
          depth: 0,
          refs: [],
          segments: tokensToSegments(raw, vocabulary, { detectKeyword: false }),
        });
      });
    } else if (block.kind === 'instance') {
      lines.push(...stateInstanceToDocLines(block, vocabulary));
    } else {
      const cond = block.condition.trim();
      const heading = cond ? (/^si\b/i.test(cond) ? (cond.endsWith(':') ? cond : `${cond}:`) : `Si ${cond}:`) : 'Si:';
      lines.push({
        bold: true,
        depth: 0,
        refs: [],
        segments: tokensToSegments(heading, vocabulary, { detectKeyword: false, forceBold: true }),
      });
      block.blocks.forEach((inst) => {
        lines.push(...stateInstanceToDocLines(inst, vocabulary));
      });
    }
  });
  return lines;
};

const formatDetailsToDocLines = (
  details: FlowDetailItem[],
  content: UseCaseFlowContent,
  numbering: FlowNumberingIndex,
  flowId: 'basic' | string,
  vocabulary: FlowVocabulary,
  baseDepth: number,
  loopDepth: number,
  bulletDepth = 0,
): FlowDocLine[] =>
  details.flatMap((detail): FlowDocLine[] => {
    const suffix = formatStepAnchorSuffix(detail.stepRef, content, numbering, flowId);
    const fullText = suffix ? `${detail.text.trimEnd()} ${suffix}` : detail.text;
    const line: FlowDocLine = {
      bullet: Math.min(2, bulletDepth),
      depth: baseDepth + bulletDepth,
      refs: [],
      segments: tokensToSegments(fullText, vocabulary, { detectKeyword: false }),
      ...(loopDepth > 0 ? { loopDepth } : {}),
    };
    if (detail.children && detail.children.length > 0) {
      return [
        line,
        ...formatDetailsToDocLines(
          detail.children,
          content,
          numbering,
          flowId,
          vocabulary,
          baseDepth,
          loopDepth,
          bulletDepth + 1,
        ),
      ];
    }
    return [line];
  });

const buildMainStepRow = (
  step: FlowMainStep,
  content: UseCaseFlowContent,
  numbering: FlowNumberingIndex,
  flowId: 'basic' | string,
  vocabulary: FlowVocabulary,
): FlowDocRow => {
  const mainNum = numbering.stepNumberById.get(step.id) ?? '';
  const mainRefText = step.refs.map((ref) => formatFlowRef(ref, content)).filter(Boolean).join('\n');
  const titleText = step.jumpTarget
    ? formatJumpTargetText(step.jumpTarget, content, numbering, step.title)
    : (() => {
        const suffix = formatStepAnchorSuffix(step.stepRef, content, numbering, flowId);
        return suffix ? `${step.title.trimEnd()} ${suffix}` : step.title;
      })();

  const mainLine: FlowDocLine = {
    bold: true,
    depth: 0,
    number: mainNum ? `${mainNum}.` : undefined,
    refs: step.refs.map((ref) => formatFlowRef(ref, content)).filter(Boolean),
    segments: tokensToSegments(titleText, vocabulary, { forceBold: true }),
  };

  const mainDetails = step.details && step.details.length > 0
    ? formatDetailsToDocLines(step.details, content, numbering, flowId, vocabulary, 1, 0)
    : [];

  const subRows: FlowDocSubRow[] = [
    step.speaker === 'actor'
      ? { actor: [mainLine, ...mainDetails], system: [], ref: mainRefText }
      : { actor: [], system: [mainLine, ...mainDetails], ref: mainRefText },
  ];

  // Recursively emit aligned sub-rows for every child sub-node so Ref. aligns pixel-perfectly.
  const emitSubNodes = (nodes: FlowSubNode[], depth: number, loopDepth: number): void => {
    for (const node of nodes) {
      const num = numbering.stepNumberById.get(node.id) ?? '';
      const refs = node.refs.map((ref) => formatFlowRef(ref, content)).filter(Boolean);
      const refText = refs.join('\n');

      if (node.kind === 'action') {
        const speaker = node.speaker ?? 'system';
        const display = node.jumpTarget
          ? formatJumpTargetText(node.jumpTarget, content, numbering, node.text)
          : (() => {
              const suffix = formatStepAnchorSuffix(node.stepRef, content, numbering, flowId);
              return suffix ? `${node.text.trimEnd()} ${suffix}` : node.text;
            })();
        const line: FlowDocLine = {
          bold: speaker === 'actor' || undefined,
          depth,
          number: num ? `${num}.` : undefined,
          refs,
          segments: tokensToSegments(display, vocabulary, { forceBold: speaker === 'actor' }),
          ...(loopDepth > 0 ? { loopDepth } : {}),
        };
        const detailLines = formatDetailsToDocLines(
          node.details,
          content,
          numbering,
          flowId,
          vocabulary,
          depth + 1,
          loopDepth,
        );
        if (speaker === 'actor') {
          subRows.push({ actor: [line, ...detailLines], system: [], ref: refText });
        } else {
          subRows.push({ actor: [], system: [line, ...detailLines], ref: refText });
        }
      } else if (node.kind === 'loop') {
        const nextLoopDepth = loopDepth + 1;
        const suffix = formatStepAnchorSuffix(node.stepRef, content, numbering, flowId);
        const headerText = suffix ? `${node.header.trimEnd()} ${suffix}` : node.header;
        const startRowIdx = subRows.length;
        const headerLine: FlowDocLine = {
          depth,
          number: num ? `${num}.` : undefined,
          refs,
          segments: tokensToSegments(headerText, vocabulary),
          loopDepth: nextLoopDepth,
          loopStarts: 1,
        };
        const detailLines = formatDetailsToDocLines(
          node.details,
          content,
          numbering,
          flowId,
          vocabulary,
          depth + 1,
          nextLoopDepth,
        );
        subRows.push({ actor: [], system: [headerLine, ...detailLines], ref: refText });
        emitSubNodes(node.children, depth + 1, nextLoopDepth);

        // Mark the very last system line emitted inside this loop with loopEnds += 1
        for (let r = subRows.length - 1; r >= startRowIdx; r -= 1) {
          const sysLines = subRows[r].system;
          if (sysLines.length > 0) {
            const last = sysLines[sysLines.length - 1];
            last.loopEnds = (last.loopEnds ?? 0) + 1;
            break;
          }
        }
      } else {
        // Conditional: SI [cond] → thenChildren → (SINO → elseChildren) → FINSI (SINO & FINSI unnumbered!)
        const condText = node.condition.trim();
        const siSegments: FlowDocSegment[] = [
          { text: 'SI', bold: true },
          ...(condText ? [{ text: ' ' }, ...tokensToSegments(condText, vocabulary, { detectKeyword: false })] : []),
        ];
        subRows.push({
          actor: [],
          system: [{
            depth,
            number: num ? `${num}.` : undefined,
            refs,
            segments: siSegments,
            ...(loopDepth > 0 ? { loopDepth } : {}),
          }],
          ref: refText,
        });
        emitSubNodes(node.thenChildren, depth + 1, loopDepth);
        if (node.elseChildren !== undefined) {
          subRows.push({
            actor: [],
            system: [{
              depth,
              refs: [],
              segments: [{ text: 'SINO', bold: true }],
              ...(loopDepth > 0 ? { loopDepth } : {}),
            }],
            ref: '',
          });
          emitSubNodes(node.elseChildren, depth + 1, loopDepth);
        }
        subRows.push({
          actor: [],
          system: [{
            depth,
            refs: [],
            segments: [{ text: 'FINSI', bold: true }],
            ...(loopDepth > 0 ? { loopDepth } : {}),
          }],
          ref: '',
        });
      }
    }
  };

  emitSubNodes(step.children, 1, 0);
  return { stepId: step.id, subRows };
};

export const buildFlowDocument = (
  content: UseCaseFlowContent,
  artifactName: string,
  symbolIndex: ProjectSymbolIndex,
  options: Partial<FlowExportOptions> = {},
): FlowDocument => {
  const opts: FlowExportOptions = { ...DEFAULT_FLOW_EXPORT_OPTIONS, ...options };
  const numbering = computeFlowNumbering(content);
  const pseudoEntities = extractPseudoEntities(content);
  const vocabulary = buildFlowVocabulary(
    symbolIndex,
    pseudoEntities.map((pe) => pe.name),
    pseudoEntities.flatMap((pe) => pe.fields),
  );
  const desc = content.description;
  const displayName = desc.useCaseName.trim() || artifactName;
  const textField = (label: string, value: string): FlowDocField => ({
    label,
    lines: (value.trim().length === 0 ? [''] : value.split('\n')).map((line) => ({
      depth: 0,
      refs: [],
      segments: line ? [{ text: line }] : [],
    })),
  });

  const allFields: FlowDocField[] = [
    textField('Número', desc.useCaseNumber),
    textField('Nombre del Caso de Uso', displayName),
    textField('Actor', desc.actor),
    textField('Descripción', desc.description),
    textField('Prioridad', desc.priority),
    textField('Parámetros de Entrada', formatInputParameters(desc.inputParameters)),
    ...(desc.precondition.trim().length > 0 ? [textField('Precondición', desc.precondition)] : []),
    { label: 'Estado Inicial', lines: stateBlocksToDocLines(desc.initialState, vocabulary) },
    { label: 'Estado Final', lines: stateBlocksToDocLines(desc.finalState, vocabulary, '-') },
  ];

  const fields = opts.descriptionMode === 'brief-and-initial'
    ? allFields.filter((field) =>
        ['Número', 'Nombre del Caso de Uso', 'Actor', 'Descripción', 'Estado Inicial'].includes(field.label))
    : allFields;

  const selectedAlts = opts.selectedAlternativeIds
    ? content.alternativeFlows.filter((alt) => opts.selectedAlternativeIds!.includes(alt.id))
    : content.alternativeFlows;

  const cuBanner = desc.useCaseNumber.trim()
    ? `CU N°${desc.useCaseNumber.trim()} — ${displayName}`
    : displayName;

  return {
    title: displayName,
    useCaseNumber: desc.useCaseNumber.trim(),
    useCaseName: displayName,
    includeDescription: opts.includeDescription,
    includeBasicFlow: opts.includeBasicFlow,
    includeAlternatives: opts.includeAlternatives,
    fields,
    basic: {
      id: 'basic',
      title: 'CAMINO BÁSICO',
      subtitle: !opts.includeDescription ? cuBanner : undefined,
      rows: content.basicFlow.map((step) => buildMainStepRow(step, content, numbering, 'basic', vocabulary)),
    },
    alternatives: selectedAlts.map((alt) => ({
      id: alt.id,
      title: formatAlternativeTitle(alt.number, alt.title),
      rows: alt.steps.map((step) => buildMainStepRow(step, content, numbering, alt.id, vocabulary)),
    })),
  };
};

/** Clean plain-text summary (for clipboard copy or quick review). */
export const renderFlowPlainText = (doc: FlowDocument): string => {
  const lines: string[] = [];
  const formatLine = (line: FlowDocLine): string => {
    const indent = '  '.repeat(line.depth);
    const marker = line.number ? `${line.number} ` : line.bullet !== undefined ? `${['•', '◦', '▪'][line.bullet]} ` : '';
    return `${indent}${marker}${line.segments.map((s) => s.text).join('')}`.trimEnd();
  };

  if (doc.includeDescription) {
    lines.push('=== LISTA DESCRIPTIVA ===');
    doc.fields.forEach((field) => {
      const body = field.lines.map(formatLine).join('\n');
      if (field.lines.length <= 1) lines.push(`${field.label}: ${body || '-'}`);
      else lines.push(`${field.label}:\n${body}`);
    });
    lines.push('');
  }

  const pushTable = (table: FlowDocTable): void => {
    lines.push(`=== ${table.title} ===`);
    table.rows.forEach((row) => {
      row.subRows.forEach((sub) => {
        const refSuffix = sub.ref ? `  [${sub.ref.replace(/\n/g, ', ')}]` : '';
        if (sub.actor.length > 0) {
          lines.push(`[Actor] ${sub.actor.map(formatLine).join('\n')}${refSuffix}`);
        }
        if (sub.system.length > 0) {
          lines.push(`[Sistema] ${sub.system.map(formatLine).join('\n')}${refSuffix}`);
        }
      });
    });
    lines.push('');
  };

  if (doc.includeBasicFlow) pushTable(doc.basic);
  if (doc.includeAlternatives) doc.alternatives.forEach(pushTable);
  return lines.join('\n').trim();
};

export { formatAlternativeRef };
