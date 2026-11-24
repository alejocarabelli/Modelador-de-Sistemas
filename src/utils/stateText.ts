import type { StateBlock, StateDetailItem } from '../types/diagram';
import { formatStateDetailText, formatStateInstanceHeader } from './useCaseFlowModel';
import { stepIndent } from './useCaseFlowText';

const GLYPHS = ['•', '◦', '▪'];

const detailLines = (details: StateDetailItem[], depth: number): string[] =>
  details.flatMap((detail) => [
    `${stepIndent.repeat(depth)}${GLYPHS[depth % GLYPHS.length]} ${formatStateDetailText(detail)}`,
    ...(detail.kind === 'relation' ? detailLines(detail.children, depth + 1) : []),
  ]);

/** The state as it is written by hand: headers, then `•` `◦` `▪` bullets four spaces per level. */
export const stateBlocksToEditorText = (blocks: StateBlock[]): string =>
  blocks
    .map((block) => {
      if (block.kind === 'section') return block.title;
      if (block.kind === 'free-text') return block.text;
      if (block.kind === 'instance') return [formatStateInstanceHeader(block), ...detailLines(block.details, 0)].join('\n');
      const condition = block.condition.trim();
      const heading = /^si\b/i.test(condition) ? condition : `Si ${condition}`;
      return [
        heading.endsWith(':') ? heading : `${heading}:`,
        ...block.blocks.map((instance) => [formatStateInstanceHeader(instance), ...detailLines(instance.details, 0)].join('\n')),
      ].join('\n');
    })
    .join('\n\n');

