import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Minus, Search, X } from 'lucide-react';
import type { ProjectSymbolIndex } from '../../utils/projectSymbolIndex';
import type { DeclaredPseudoEntity } from '../../utils/useCaseFlowModel';

type ClassDiagramSidePanelProps = {
  diagramName?: string;
  symbolIndex: ProjectSymbolIndex;
  pseudoEntities: DeclaredPseudoEntity[];
  onInsertToken: (text: string) => void;
  onClose: () => void;
};

export function ClassDiagramSidePanel({
  diagramName,
  symbolIndex,
  pseudoEntities,
  onInsertToken,
  onClose,
}: ClassDiagramSidePanelProps) {
  const [query, setQuery] = useState('');
  const [expandedNames, setExpandedNames] = useState<Set<string>>(() => new Set());

  const filteredClasses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbolIndex.classes;
    return symbolIndex.classes.filter((cls) =>
      cls.name.toLowerCase().includes(q)
      || cls.attributes.some((attr) => attr.name.toLowerCase().includes(q))
      || (cls.relations ?? []).some((rel) => rel.targetClass.toLowerCase().includes(q)),
    );
  }, [query, symbolIndex.classes]);

  const toggleClass = (name: string): void => {
    setExpandedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <aside aria-label="Consulta del Diagrama de Clases" className="ucf-dc-panel">
      <div className="ucf-dc-panel-header">
        <div className="ucf-dc-panel-title">
          <strong>Diagrama de clases</strong>
          <small>{diagramName ?? 'Sin vincular'}</small>
        </div>
        <button aria-label="Cerrar panel de clases" className="v2-tool" type="button" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {symbolIndex.classes.length === 0 ? (
        <p className="ucf-dc-empty">
          Vinculá un Diagrama de Clases en la ficha superior para consultar clases, atributos, valores paramétricos y navegabilidad en vivo mientras escribís.
        </p>
      ) : (
        <>
          <div className="ucf-dc-search">
            <Search size={13} aria-hidden="true" />
            <input
              aria-label="Filtrar clases o atributos"
              placeholder="Filtrar clase o atributo..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <p className="ucf-dc-hint">
            Hacé clic en una clase, atributo o valor para insertarlo donde tengas el cursor.
          </p>

          <div className="ucf-dc-list">
            {filteredClasses.map((cls) => {
              const isOpen = query.trim().length > 0 || expandedNames.has(cls.name);
              const relations = cls.relations ?? [];

              return (
                <div className="ucf-dc-class-card" key={cls.name}>
                  <div className="ucf-dc-class-row">
                    <button
                      aria-expanded={isOpen}
                      className="ucf-dc-expand"
                      type="button"
                      onClick={() => toggleClass(cls.name)}
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button
                      className="ucf-dc-class-name"
                      title={`Insertar «${cls.name}»`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onInsertToken(cls.name)}
                    >
                      <u>{cls.name}</u>
                    </button>
                    <span className="ucf-dc-count">{cls.attributes.length}</span>
                  </div>

                  {isOpen ? (
                    <div className="ucf-dc-class-body">
                      {cls.attributes.length > 0 ? (
                        <div className="ucf-dc-section">
                          <span className="ucf-dc-eyebrow">Atributos</span>
                          <div className="ucf-dc-chips">
                            {cls.attributes.map((attr) => (
                              <button
                                className="ucf-dc-attr-chip"
                                key={attr.name}
                                title={attr.type ? `${attr.name}: ${attr.type}` : attr.name}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onInsertToken(attr.name)}
                              >
                                <em>{attr.name}</em>
                                {attr.type ? <small>{attr.type}</small> : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {cls.parametricValues.length > 0 ? (
                        <div className="ucf-dc-section">
                          <span className="ucf-dc-eyebrow">Valores paramétricos</span>
                          <div className="ucf-dc-chips">
                            {cls.parametricValues.map((pv) => (
                              <button
                                className="ucf-dc-val-chip"
                                key={pv}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onInsertToken(`'${pv}'`)}
                              >
                                ‘{pv}’
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {relations.length > 0 ? (
                        <div className="ucf-dc-section">
                          <span className="ucf-dc-eyebrow">Relaciones y navegabilidad</span>
                          <ul className="ucf-dc-relations">
                            {relations.map((rel, relIndex) => (
                              <li
                                className={rel.navigable ? 'is-navigable' : rel.isReverseOnly ? 'is-reverse' : 'is-none'}
                                key={`${rel.edgeId}:${relIndex}`}
                              >
                                {rel.navigable ? (
                                  <ArrowRight size={12} aria-hidden="true" />
                                ) : rel.isReverseOnly ? (
                                  <ArrowLeft size={12} aria-hidden="true" />
                                ) : (
                                  <Minus size={12} aria-hidden="true" />
                                )}
                                <button
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => onInsertToken(rel.targetClass)}
                                >
                                  <u>{rel.targetClass}</u>
                                  {rel.targetMultiplicity ? <span className="ucf-dc-mult">[{rel.targetMultiplicity}]</span> : null}
                                </button>
                                <span className="ucf-dc-nav-badge">
                                  {rel.navigable ? 'Leer' : rel.isReverseOnly ? 'Buscar' : 'sin flecha'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      {pseudoEntities.length > 0 ? (
        <div className="ucf-dc-pseudo-section">
          <span className="ucf-dc-eyebrow">Pseudoentidades del flujo</span>
          {pseudoEntities.map((pe) => (
            <div className="ucf-dc-pseudo-item" key={pe.name}>
              <button
                className="ucf-dc-class-name"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsertToken(pe.name)}
              >
                <u>{pe.name}</u>
              </button>
              <div className="ucf-dc-chips">
                {pe.fields.map((field) => (
                  <button
                    className="ucf-dc-attr-chip"
                    key={field}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onInsertToken(field)}
                  >
                    <em>{field}</em>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
