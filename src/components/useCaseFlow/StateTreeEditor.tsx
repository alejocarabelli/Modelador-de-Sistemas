import { useState } from 'react';
import { ClipboardPaste, GitBranch, Layers, Link2, Plus, Trash2 } from 'lucide-react';
import type {
  StateBlock,
  StateDetailItem,
  StateInstanceBlock,
  StateInstanceMultiplicity,
  StateInstanceQualifier,
} from '../../types/diagram';
import type { FlowVocabulary } from '../../utils/flowDocument';
import { findSymbolClass, type ProjectSymbolIndex } from '../../utils/projectSymbolIndex';
import {
  createStateConditionBlock,
  createStateDetailAttribute,
  createStateDetailExpression,
  createStateDetailRelation,
  createStateInstanceBlock,
  createStateSectionBlock,
  parseStateTextToBlocks,
  STATE_COMPARATORS,
} from '../../utils/useCaseFlowModel';

type StateTreeEditorProps = {
  mode: 'initial' | 'final';
  blocks: StateBlock[];
  highlightedId?: string | null;
  symbolIndex: ProjectSymbolIndex;
  vocabulary: FlowVocabulary;
  inputParamNames: string[];
  onChange: (blocks: StateBlock[]) => void;
};

const BULLET_GLYPHS = ['•', '◦', '▪'] as const;

const MULTIPLICITY_LABELS: Record<StateInstanceMultiplicity, string> = {
  single: 'Instancia de',
  multiple: 'Instancias de',
  'one-or-more': 'Instancia/s de',
};

const REL_MULTIPLICITY_LABELS: Record<StateInstanceMultiplicity, string> = {
  single: 'instancia de',
  multiple: 'instancias de',
  'one-or-more': 'instancia/s de',
};

export function StateTreeEditor({
  mode,
  blocks,
  highlightedId,
  symbolIndex,
  inputParamNames,
  onChange,
}: StateTreeEditorProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState('');
  const datalistPrefix = `ucf-state-${mode}`;

  const allClassNames = symbolIndex.classes.map((c) => c.name);

  const updateBlock = (blockId: string, updater: (block: StateBlock) => StateBlock): void => {
    onChange(blocks.map((block) => (block.id === blockId ? updater(block) : block)));
  };

  const removeBlock = (blockId: string): void => {
    onChange(blocks.filter((block) => block.id !== blockId));
  };

  const moveBlock = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const renderDetails = (
    details: StateDetailItem[],
    ownerClassName: string,
    depth: number,
    onUpdateDetails: (next: StateDetailItem[]) => void,
  ) => {
    const ownerClass = ownerClassName ? findSymbolClass(symbolIndex, ownerClassName) : undefined;
    const attrListId = `${datalistPrefix}-attrs-${ownerClass?.name ?? 'none'}-${depth}`;
    const valueListId = `${datalistPrefix}-vals-${ownerClass?.name ?? 'none'}-${depth}`;
    const bullet = BULLET_GLYPHS[Math.min(depth, BULLET_GLYPHS.length - 1)];

    const updateAt = (index: number, nextItem: StateDetailItem): void => {
      onUpdateDetails(details.map((item, i) => (i === index ? nextItem : item)));
    };
    const removeAt = (index: number): void => {
      onUpdateDetails(details.filter((_, i) => i !== index));
    };

    const relatedFirst = ownerClass
      ? [
          ...ownerClass.relatedClasses,
          ...allClassNames.filter((c) => !ownerClass.relatedClasses.includes(c)),
        ]
      : allClassNames;
    const relListId = `${datalistPrefix}-rel-${ownerClass?.name ?? 'any'}-${depth}`;

    return (
      <div className="ucf-state-details" style={{ paddingLeft: `${depth === 0 ? 18 : 20}px` }}>
        {ownerClass ? (
          <datalist id={attrListId}>
            {ownerClass.attributes.map((attr) => (
              <option key={attr.name} value={attr.name}>{attr.type ? `${attr.name}: ${attr.type}` : attr.name}</option>
            ))}
          </datalist>
        ) : null}
        <datalist id={valueListId}>
          <option value="vacío" />
          <option value="fecha actual" />
          <option value="fecha_actual()" />
          <option value="calculado" />
          <option value="generado" />
          {ownerClass?.parametricValues.map((pv) => <option key={pv} value={`'${pv}'`} />)}
          {inputParamNames.map((p) => <option key={p} value={p} />)}
        </datalist>
        <datalist id={relListId}>
          {relatedFirst.map((cls) => <option key={cls} value={cls} />)}
        </datalist>

        {details.map((detail, index) => (
          <div
            className={`ucf-state-detail-row${highlightedId === detail.id ? ' is-highlighted' : ''}`}
            key={detail.id}
          >
            <div className="ucf-state-detail-line">
              <span aria-hidden="true" className="ucf-state-bullet">{bullet}</span>

              {detail.kind === 'attribute' ? (
                <div className="ucf-state-attr-fields">
                  <span className="ucf-state-kw">Con</span>
                  <input
                    aria-label="Atributo"
                    className="ucf-state-attr-input"
                    list={ownerClass ? attrListId : undefined}
                    placeholder="atributo"
                    value={detail.attribute}
                    onChange={(event) => updateAt(index, { ...detail, attribute: event.target.value })}
                  />
                  <select
                    aria-label="Comparador"
                    className="ucf-state-comp-select"
                    value={STATE_COMPARATORS.includes(detail.comparator as (typeof STATE_COMPARATORS)[number]) ? detail.comparator : 'igual a'}
                    onChange={(event) => updateAt(index, { ...detail, comparator: event.target.value })}
                  >
                    {STATE_COMPARATORS.map((comp) => (
                      <option key={comp} value={comp}>{comp}</option>
                    ))}
                  </select>
                  <input
                    aria-label="Valor esperado o asignado"
                    className="ucf-state-val-input"
                    list={valueListId}
                    placeholder="valor / vacío / fecha actual"
                    value={detail.value}
                    onChange={(event) => updateAt(index, { ...detail, value: event.target.value })}
                  />
                </div>
              ) : detail.kind === 'relation' ? (
                <div className="ucf-state-rel-fields">
                  <span className="ucf-state-kw">Relacionada a</span>
                  <select
                    aria-label="Multiplicidad de relación"
                    className="ucf-state-mult-select"
                    value={detail.multiplicity}
                    onChange={(event) =>
                      updateAt(index, { ...detail, multiplicity: event.target.value as StateInstanceMultiplicity })
                    }
                  >
                    {(['single', 'multiple', 'one-or-more'] as const).map((m) => (
                      <option key={m} value={m}>{REL_MULTIPLICITY_LABELS[m]}</option>
                    ))}
                  </select>
                  <input
                    aria-label="Clase relacionada"
                    className="ucf-state-class-input"
                    list={relListId}
                    placeholder="ClaseB"
                    value={detail.className}
                    onChange={(event) => updateAt(index, { ...detail, className: event.target.value })}
                  />
                  <input
                    aria-label="Nota opcional de relación"
                    className="ucf-state-rel-note"
                    placeholder="nota opcional"
                    value={detail.relationNote ?? ''}
                    onChange={(event) =>
                      updateAt(index, { ...detail, relationNote: event.target.value || undefined })
                    }
                  />
                </div>
              ) : (
                <input
                  aria-label="Fórmula o expresión"
                  className="ucf-state-expr-input"
                  placeholder="Expresión o fórmula..."
                  value={detail.text}
                  onChange={(event) => updateAt(index, { ...detail, text: event.target.value })}
                />
              )}

              <div className="ucf-state-row-actions">
                {detail.kind === 'relation' ? (
                  <>
                    <button
                      tabIndex={-1}
                      title="Agregar atributo de esta clase relacionada"
                      type="button"
                      onClick={() => updateAt(index, { ...detail, children: [...detail.children, createStateDetailAttribute()] })}
                    >
                      + Attr
                    </button>
                    <button
                      tabIndex={-1}
                      title="Anidar otra relación"
                      type="button"
                      onClick={() => updateAt(index, { ...detail, children: [...detail.children, createStateDetailRelation()] })}
                    >
                      + Rel
                    </button>
                  </>
                ) : null}
                <button
                  aria-label="Quitar detalle"
                  className="ucf-icon-danger"
                  tabIndex={-1}
                  type="button"
                  onClick={() => removeAt(index)}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </div>

            {detail.kind === 'relation' && detail.children.length > 0
              ? renderDetails(detail.children, detail.className, depth + 1, (children) =>
                  updateAt(index, { ...detail, children }),
                )
              : null}
          </div>
        ))}

        <div className="ucf-state-detail-add">
          <button
            tabIndex={-1}
            type="button"
            onClick={() => onUpdateDetails([...details, createStateDetailAttribute()])}
          >
            <Plus size={11} aria-hidden="true" /> Atributo
          </button>
          <button
            tabIndex={-1}
            type="button"
            onClick={() => onUpdateDetails([...details, createStateDetailRelation()])}
          >
            <Link2 size={11} aria-hidden="true" /> Relación
          </button>
          <button
            tabIndex={-1}
            type="button"
            onClick={() => onUpdateDetails([...details, createStateDetailExpression()])}
          >
            + Fórmula / libre
          </button>
        </div>
      </div>
    );
  };

  const renderInstanceCard = (
    inst: StateInstanceBlock,
    onUpdateInst: (next: StateInstanceBlock) => void,
    onRemoveInst: () => void,
    moveControls?: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void },
  ) => (
    <div
      className={`ucf-state-instance${highlightedId === inst.id ? ' is-highlighted' : ''}`}
      key={inst.id}
    >
      <div className="ucf-state-instance-header">
        <select
          aria-label="Cantidad de instancias"
          className="ucf-state-mult-select"
          value={inst.multiplicity}
          onChange={(event) =>
            onUpdateInst({ ...inst, multiplicity: event.target.value as StateInstanceMultiplicity })
          }
        >
          {(['single', 'multiple', 'one-or-more'] as const).map((m) => (
            <option key={m} value={m}>{MULTIPLICITY_LABELS[m]}</option>
          ))}
        </select>
        <input
          aria-label="Nombre de clase"
          className="ucf-state-class-input is-main"
          list={`${datalistPrefix}-classes`}
          placeholder="NombreClase"
          value={inst.className}
          onChange={(event) => onUpdateInst({ ...inst, className: event.target.value })}
        />
        <select
          aria-label="Estado de la instancia"
          className="ucf-state-qual-select"
          value={inst.qualifier}
          onChange={(event) =>
            onUpdateInst({ ...inst, qualifier: event.target.value as StateInstanceQualifier })
          }
        >
          {mode === 'initial' ? (
            <>
              <option value="existente">existente</option>
              <option value="custom">otro...</option>
            </>
          ) : (
            <>
              <option value="creada">creada</option>
              <option value="modificada">modificada</option>
              <option value="custom">otro...</option>
            </>
          )}
        </select>
        {inst.qualifier === 'custom' ? (
          <input
            aria-label="Calificador personalizado"
            className="ucf-state-custom-qual"
            placeholder="calificador"
            value={inst.customQualifier ?? ''}
            onChange={(event) => onUpdateInst({ ...inst, customQualifier: event.target.value })}
          />
        ) : null}
        <span className="ucf-state-colon">:</span>

        <div className="ucf-state-row-actions">
          {moveControls ? (
            <>
              <button disabled={!moveControls.canUp} tabIndex={-1} title="Mover arriba" type="button" onClick={moveControls.onUp}>↑</button>
              <button disabled={!moveControls.canDown} tabIndex={-1} title="Mover abajo" type="button" onClick={moveControls.onDown}>↓</button>
            </>
          ) : null}
          <button aria-label="Eliminar instancia" className="ucf-icon-danger" tabIndex={-1} type="button" onClick={onRemoveInst}>
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {renderDetails(inst.details, inst.className, 0, (details) => onUpdateInst({ ...inst, details }))}
    </div>
  );

  return (
    <div className="ucf-state-editor">
      <datalist id={`${datalistPrefix}-classes`}>
        {allClassNames.map((name) => <option key={name} value={name} />)}
      </datalist>

      {blocks.length === 0 ? (
        <p className="ucf-state-empty">
          {mode === 'initial'
            ? 'Sin instancias iniciales definidas todavía. Agregá una instancia del DC, una sección (Principales / Secundarias) o pegá texto.'
            : 'Sin cambios persistidos (en consultas se imprime «-»). Agregá instancias creadas/modificadas o ramas condicionales.'}
        </p>
      ) : (
        <div className="ucf-state-blocks">
          {blocks.map((block, index) => {
            const moveControls = {
              canUp: index > 0,
              canDown: index < blocks.length - 1,
              onUp: () => moveBlock(index, -1),
              onDown: () => moveBlock(index, 1),
            };

            if (block.kind === 'section') {
              return (
                <div className="ucf-state-section" key={block.id}>
                  <input
                    aria-label="Título de sección"
                    className="ucf-state-section-input"
                    placeholder="Instancias principales"
                    value={block.title}
                    onChange={(event) => updateBlock(block.id, () => ({ ...block, title: event.target.value }))}
                  />
                  <div className="ucf-state-row-actions">
                    <button disabled={!moveControls.canUp} tabIndex={-1} type="button" onClick={moveControls.onUp}>↑</button>
                    <button disabled={!moveControls.canDown} tabIndex={-1} type="button" onClick={moveControls.onDown}>↓</button>
                    <button aria-label="Quitar sección" className="ucf-icon-danger" tabIndex={-1} type="button" onClick={() => removeBlock(block.id)}>
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            }

            if (block.kind === 'free-text') {
              return (
                <div className="ucf-state-freetext" key={block.id}>
                  <input
                    aria-label="Línea libre de estado"
                    className="ucf-state-expr-input"
                    value={block.text}
                    onChange={(event) => updateBlock(block.id, () => ({ ...block, text: event.target.value }))}
                  />
                  <button aria-label="Quitar línea" className="ucf-icon-danger" tabIndex={-1} type="button" onClick={() => removeBlock(block.id)}>
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            }

            if (block.kind === 'condition') {
              return (
                <div className="ucf-state-condition" key={block.id}>
                  <div className="ucf-state-condition-header">
                    <span className="ucf-state-cond-kw">Si</span>
                    <input
                      aria-label="Condición de estado"
                      className="ucf-state-cond-input"
                      placeholder="se resuelve el Caso"
                      value={block.condition}
                      onChange={(event) => updateBlock(block.id, () => ({ ...block, condition: event.target.value }))}
                    />
                    <span className="ucf-state-colon">:</span>
                    <div className="ucf-state-row-actions">
                      <button
                        tabIndex={-1}
                        type="button"
                        onClick={() =>
                          updateBlock(block.id, () => ({
                            ...block,
                            blocks: [...block.blocks, createStateInstanceBlock(mode)],
                          }))
                        }
                      >
                        + Instancia
                      </button>
                      <button disabled={!moveControls.canUp} tabIndex={-1} type="button" onClick={moveControls.onUp}>↑</button>
                      <button disabled={!moveControls.canDown} tabIndex={-1} type="button" onClick={moveControls.onDown}>↓</button>
                      <button aria-label="Quitar bloque condicional" className="ucf-icon-danger" tabIndex={-1} type="button" onClick={() => removeBlock(block.id)}>
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="ucf-state-condition-body">
                    {block.blocks.map((inst) =>
                      renderInstanceCard(
                        inst,
                        (nextInst) =>
                          updateBlock(block.id, () => ({
                            ...block,
                            blocks: block.blocks.map((item) => (item.id === inst.id ? nextInst : item)),
                          })),
                        () =>
                          updateBlock(block.id, () => ({
                            ...block,
                            blocks: block.blocks.filter((item) => item.id !== inst.id),
                          })),
                      ),
                    )}
                  </div>
                </div>
              );
            }

            return renderInstanceCard(
              block,
              (nextInst) => updateBlock(block.id, () => nextInst),
              () => removeBlock(block.id),
              moveControls,
            );
          })}
        </div>
      )}

      <div className="ucf-state-toolbar">
        <button
          type="button"
          onClick={() => onChange([...blocks, createStateInstanceBlock(mode)])}
        >
          <Plus size={12} aria-hidden="true" /> Instancia
        </button>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...blocks,
              createStateSectionBlock(
                blocks.some((b) => b.kind === 'section' && /principales/i.test(b.title))
                  ? 'Instancias secundarias'
                  : 'Instancias principales',
              ),
            ])
          }
        >
          <Layers size={12} aria-hidden="true" /> Sección
        </button>
        <button
          type="button"
          onClick={() => onChange([...blocks, createStateConditionBlock()])}
        >
          <GitBranch size={12} aria-hidden="true" /> Si [condición]
        </button>
        <button
          type="button"
          onClick={() => setPasteOpen((open) => !open)}
        >
          <ClipboardPaste size={12} aria-hidden="true" /> Pegar texto
        </button>
      </div>

      {pasteOpen ? (
        <div className="ucf-state-paste-box">
          <textarea
            aria-label="Pegar texto estructurado de estado"
            placeholder={'Instancia de Socio existente:\n  • Con numeroSocio igual a nsocio\n  • Relacionada a instancia de SocioEstado:\n      ◦ Con fechaFinalSocioEstado igual a vacío'}
            rows={4}
            value={pasteDraft}
            onChange={(event) => setPasteDraft(event.target.value)}
          />
          <div className="ucf-state-paste-actions">
            <button type="button" onClick={() => setPasteOpen(false)}>Cancelar</button>
            <button
              className="is-primary"
              type="button"
              onClick={() => {
                const parsed = parseStateTextToBlocks(pasteDraft, mode);
                if (parsed.length > 0) onChange([...blocks, ...parsed]);
                setPasteDraft('');
                setPasteOpen(false);
              }}
            >
              Convertir e insertar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
