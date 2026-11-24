import { Fragment } from 'react';
import type { FlowDocLine, FlowDocTable, FlowDocument } from '../../utils/flowDocument';

const BULLETS = ['●', '○', '■'] as const;

function DocLines({ lines }: { lines: FlowDocLine[] }) {
  return (
    <>
      {lines.map((line, index) => {
        const loopDepth = line.loopDepth ?? 0;
        const loopClass = loopDepth > 0
          ? ` is-loop-line${line.loopStarts ? ' is-loop-start' : ''}${line.loopEnds ? ' is-loop-end' : ''}`
          : '';
        return (
          <div
            className={`ucf-print-line${line.bold ? ' is-bold' : ''}${loopClass}`}
            key={index}
            style={{
              paddingLeft: `${line.depth * 1.15 + loopDepth * 0.45}rem`,
              marginLeft: loopDepth > 0 ? `${(loopDepth - 1) * 0.35}rem` : undefined,
            }}
          >
            {line.number !== undefined ? <span className="ucf-print-number">{line.number} </span> : null}
            {line.bullet !== undefined ? <span aria-hidden="true" className="ucf-print-bullet">{BULLETS[line.bullet]} </span> : null}
            {line.segments.map((segment, segIdx) => (
              <span
                key={segIdx}
                style={{
                  fontWeight: segment.bold ? 700 : undefined,
                  fontStyle: segment.italic ? 'italic' : undefined,
                  textDecoration: segment.underline ? 'underline' : undefined,
                }}
              >
                {segment.text}
              </span>
            ))}
            {line.segments.length === 0 && line.number === undefined ? '\u00a0' : null}
          </div>
        );
      })}
    </>
  );
}

function PrintFlowTable({ table }: { table: FlowDocTable }) {
  return (
    <table className="ucf-print-table is-flow">
      <colgroup>
        <col className="ucf-print-col-actor" />
        <col className="ucf-print-col-system" />
        <col className="ucf-print-col-ref" />
      </colgroup>
      <thead>
        {table.subtitle ? (
          <tr>
            <th className="is-cu-banner" colSpan={3}>{table.subtitle}</th>
          </tr>
        ) : null}
        <tr>
          <th className="is-section-banner" colSpan={3}>{table.title}</th>
        </tr>
        <tr className="is-col-header">
          <th>Actor</th>
          <th>Sistema</th>
          <th>Ref.</th>
        </tr>
      </thead>
      <tbody>
        {table.rows.length === 0 ? (
          <tr>
            <td className="ucf-print-empty" colSpan={3}>Sin pasos todavía.</td>
          </tr>
        ) : (
          table.rows.map((row) => (
            <Fragment key={row.stepId}>
              {row.subRows.map((sub, subIdx) => (
                <tr
                  className={`${subIdx > 0 ? 'is-sub-continuation' : 'is-step-start'}${subIdx === row.subRows.length - 1 ? ' is-step-end' : ''}`}
                  key={`${row.stepId}:${subIdx}`}
                >
                  <td><DocLines lines={sub.actor} /></td>
                  <td><DocLines lines={sub.system} /></td>
                  <td className="is-ref-col">
                    {sub.ref.split('\n').filter(Boolean).map((r, rIdx) => (
                      <div key={rIdx}>{r}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))
        )}
      </tbody>
    </table>
  );
}

/**
 * Clean UTN FRM printable view of a FlowDocument.
 * Shared by the Editor's "Vista previa de entrega" and the read-only ArtifactViewer window.
 */
export function FlowDocumentPreview({ document }: { document: FlowDocument }) {
  return (
    <article className="ucf-print-sheet">
      {document.includeDescription ? (
        <table className="ucf-print-table is-description">
          <colgroup>
            <col className="ucf-print-col-label" />
            <col />
          </colgroup>
          <tbody>
            {document.fields.map((field) => (
              <tr key={field.label}>
                <th scope="row">{field.label}</th>
                <td><DocLines lines={field.lines} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {document.includeBasicFlow ? <PrintFlowTable table={document.basic} /> : null}

      {document.includeAlternatives
        ? document.alternatives.map((table) => <PrintFlowTable key={table.id} table={table} />)
        : null}
    </article>
  );
}
