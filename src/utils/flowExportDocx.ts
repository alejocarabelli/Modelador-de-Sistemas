import type { FlowDocLine, FlowDocSegment, FlowDocTable, FlowDocument } from './flowDocument';
import { createZip } from './zipStore';

/*
 * Word (.docx) export matching the UTN FRM Diseño de Sistemas template:
 * - Default A4 Portrait (optional Landscape)
 * - Descriptive List with dark left column (#26303D) and white bold labels
 * - 3-column Flow table (Actor 22% | Sistema 65% | Ref. 13%)
 * - Sub-row alignment for Ref. (CA N°X, GUI-N) with no internal horizontal rules
 * - Visual box frames via <w:pBdr> around Por cada / Mientras loops
 * - Underlined classes, italic attributes, bold main steps & Actor actions
 */

const MARGIN = 720; // 0.5 in
const DEPTH_INDENT = 260;
const BULLETS = ['●', '○', '■'];

const DARK_HEADER_HEX = '26303D';
const SECTION_BANNER_HEX = 'EBEFF4';
const TABLE_HEADER_HEX = 'F4F6F8';

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const run = (segment: FlowDocSegment, forceBold = false, color?: string): string => {
  const properties = [
    forceBold || segment.bold ? '<w:b/>' : '',
    segment.italic ? '<w:i/>' : '',
    segment.underline ? '<w:u w:val="single"/>' : '',
    color ? `<w:color w:val="${color}"/>` : '',
  ].join('');
  return `<w:r>${properties.length > 0 ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(segment.text)}</w:t></w:r>`;
};

const paragraph = (
  inner: string,
  options: {
    align?: 'center';
    hanging?: number;
    left?: number;
    loopBox?: { start?: boolean; end?: boolean };
  } = {},
): string => {
  const pBdr = options.loopBox
    ? `<w:pBdr>${
        options.loopBox.start ? '<w:top w:val="single" w:sz="6" w:space="3" w:color="2D3748"/>' : ''
      }<w:left w:val="single" w:sz="6" w:space="6" w:color="2D3748"/><w:right w:val="single" w:sz="6" w:space="6" w:color="2D3748"/>${
        options.loopBox.end ? '<w:bottom w:val="single" w:sz="6" w:space="3" w:color="2D3748"/>' : ''
      }<w:between w:val="none"/></w:pBdr>`
    : '';

  const properties = [
    options.align === 'center' ? '<w:jc w:val="center"/>' : '',
    options.left !== undefined ? `<w:ind w:left="${options.left}" w:hanging="${options.hanging ?? 0}"/>` : '',
    pBdr,
  ].join('');
  return `<w:p>${properties.length > 0 ? `<w:pPr>${properties}</w:pPr>` : ''}${inner}</w:p>`;
};

const markerWidth = (marker: string): number => Math.max(260, marker.length * 95 + 120);

const lineParagraph = (line: FlowDocLine): string => {
  const marker = line.number ?? (line.bullet !== undefined ? BULLETS[line.bullet] : undefined);
  const text = line.segments.map((segment) => run(segment, line.bold)).join('');
  const loopBox = (line.loopDepth ?? 0) > 0
    ? { start: Boolean(line.loopStarts), end: Boolean(line.loopEnds) }
    : undefined;
  const extraLoopIndent = (line.loopDepth ?? 0) * 120;

  if (marker === undefined) {
    return paragraph(text, { left: line.depth * DEPTH_INDENT + extraLoopIndent, hanging: 0, loopBox });
  }

  const hanging = markerWidth(marker);
  return paragraph(`${run({ text: marker }, line.bold)}<w:r><w:tab/></w:r>${text}`, {
    left: line.depth * DEPTH_INDENT + extraLoopIndent + hanging,
    hanging,
    loopBox,
  });
};

const cellParagraphs = (lines: FlowDocLine[]): string =>
  lines.length === 0 ? paragraph('') : lines.map(lineParagraph).join('');

const cell = (
  width: number,
  inner: string,
  options: {
    fill?: string;
    noBottom?: boolean;
    noTop?: boolean;
    span?: number;
  } = {},
): string => {
  const borders = [
    options.noTop ? '<w:top w:val="nil"/>' : '',
    options.noBottom ? '<w:bottom w:val="nil"/>' : '',
  ].join('');
  const properties = [
    `<w:tcW w:w="${width}" w:type="dxa"/>`,
    options.span !== undefined ? `<w:gridSpan w:val="${options.span}"/>` : '',
    borders.length > 0 ? `<w:tcBorders>${borders}</w:tcBorders>` : '',
    options.fill !== undefined ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '',
  ].join('');
  return `<w:tc><w:tcPr>${properties}</w:tcPr>${inner}</w:tc>`;
};

const table = (widths: number[], rows: string[]): string => `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${widths.reduce((total, width) => total + width, 0)}" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:color="374151"/><w:left w:val="single" w:sz="6" w:color="374151"/>
      <w:bottom w:val="single" w:sz="6" w:color="374151"/><w:right w:val="single" w:sz="6" w:color="374151"/>
      <w:insideH w:val="single" w:sz="6" w:color="374151"/><w:insideV w:val="single" w:sz="6" w:color="374151"/>
    </w:tblBorders>
    <w:tblCellMar><w:top w:w="45" w:type="dxa"/><w:left w:w="95" w:type="dxa"/><w:bottom w:w="45" w:type="dxa"/><w:right w:w="95" w:type="dxa"/></w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>
  ${rows.join('\n')}
</w:tbl>`;

const tableRow = (cells: string[], header = false): string =>
  `<w:tr>${header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : ''}${cells.join('')}</w:tr>`;

const descriptionTable = (document: FlowDocument, contentWidth: number): string => {
  const labelWidth = Math.round(contentWidth * 0.24);
  const valueWidth = contentWidth - labelWidth;
  return table(
    [labelWidth, valueWidth],
    document.fields.map((field) =>
      tableRow([
        cell(labelWidth, paragraph(run({ text: field.label, bold: true }, true, 'FFFFFF')), { fill: DARK_HEADER_HEX }),
        cell(valueWidth, cellParagraphs(field.lines)),
      ]),
    ),
  );
};

const flowTable = (flow: FlowDocTable, contentWidth: number): string => {
  const actorWidth = Math.round(contentWidth * 0.22);
  const refWidth = Math.round(contentWidth * 0.13);
  const systemWidth = contentWidth - actorWidth - refWidth;
  const widths = [actorWidth, systemWidth, refWidth];

  const rows: string[] = [];
  if (flow.subtitle) {
    rows.push(
      tableRow([
        cell(contentWidth, paragraph(run({ text: flow.subtitle, bold: true }, true, 'FFFFFF'), { align: 'center' }), {
          span: 3,
          fill: DARK_HEADER_HEX,
        }),
      ], true),
    );
  }
  rows.push(
    tableRow([
      cell(contentWidth, paragraph(run({ text: flow.title, bold: true }), { align: 'center' }), {
        span: 3,
        fill: SECTION_BANNER_HEX,
      }),
    ], true),
    tableRow([
      cell(actorWidth, paragraph(run({ text: 'Actor', bold: true }), { align: 'center' }), { fill: TABLE_HEADER_HEX }),
      cell(systemWidth, paragraph(run({ text: 'Sistema', bold: true }), { align: 'center' }), { fill: TABLE_HEADER_HEX }),
      cell(refWidth, paragraph(run({ text: 'Ref.', bold: true }), { align: 'center' }), { fill: TABLE_HEADER_HEX }),
    ], true),
  );

  flow.rows.forEach((row) => {
    const total = row.subRows.length;
    row.subRows.forEach((sub, index) => {
      const first = index === 0;
      const last = index === total - 1;
      const refParagraphs = sub.ref
        ? sub.ref.split('\n').map((refLine) => paragraph(run({ text: refLine }), { align: 'center' })).join('')
        : paragraph('');
      rows.push(tableRow([
        cell(actorWidth, cellParagraphs(sub.actor), { noTop: !first, noBottom: !last }),
        cell(systemWidth, cellParagraphs(sub.system), { noTop: !first, noBottom: !last }),
        cell(refWidth, refParagraphs, { noTop: !first, noBottom: !last }),
      ]));
    });
  });

  return table(widths, rows);
};

const spacer = paragraph('');

export const buildFlowDocumentXml = (
  document: FlowDocument,
  options: { orientation?: 'portrait' | 'landscape' } = {},
): string => {
  const orientation = options.orientation ?? 'portrait';
  const pageWidth = orientation === 'portrait' ? 11906 : 16838;
  const pageHeight = orientation === 'portrait' ? 16838 : 11906;
  const contentWidth = pageWidth - MARGIN * 2;

  const sections: string[] = [];
  if (document.includeDescription) sections.push(descriptionTable(document, contentWidth));
  if (document.includeBasicFlow) sections.push(flowTable(document.basic, contentWidth));
  if (document.includeAlternatives) {
    document.alternatives.forEach((alt) => sections.push(flowTable(alt, contentWidth)));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${sections.join(`\n${spacer}\n`)}
${spacer}
<w:sectPr>
  <w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"${orientation === 'landscape' ? ' w:orient="landscape"' : ''}/>
  <w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="360" w:footer="360" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:lang w:val="es-AR"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

export const createFlowDocx = (
  document: FlowDocument,
  options: { orientation?: 'portrait' | 'landscape' } = {},
): Blob => {
  const bytes = createZip([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'word/document.xml', data: buildFlowDocumentXml(document, options) },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/_rels/document.xml.rels', data: documentRelsXml },
  ]);
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
};
