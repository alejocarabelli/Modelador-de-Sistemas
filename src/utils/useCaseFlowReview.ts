import type {
  FlowActionNode,
  FlowDetailItem,
  FlowMainStep,
  FlowRef,
  FlowSubNode,
  StateBlock,
  StateDetailItem,
  StateInstanceBlock,
  UseCaseFlowContent,
} from '../types/diagram';
import {
  checkClassNavigability,
  findSymbolClass,
  type ProjectSymbolIndex,
} from './projectSymbolIndex';
import {
  computeFlowNumbering,
  extractPseudoEntities,
  formatAlternativeRef,
  inferActionSemantic,
  normalizeLegacyFlowCode,
} from './useCaseFlowModel';

export type FlowIssueLocation =
  | { kind: 'description'; field: 'useCaseNumber' | 'useCaseName' | 'actor' | 'description' | 'inputParameters' | 'precondition' }
  | { kind: 'state'; field: 'initialState' | 'finalState'; blockId: string; detailId?: string }
  | { kind: 'step'; flowId: 'basic' | string; stepId: string; mainStepId: string }
  | { kind: 'alternative'; flowId: string };

export type FlowIssueCategory =
  | 'navigabilidad'
  | 'modelo-clases'
  | 'referencias'
  | 'persistencia-cierre'
  | 'metodologia';

export type FlowIssue = {
  id: string;
  kind: 'error' | 'review';
  category: FlowIssueCategory;
  location?: FlowIssueLocation;
  message: string;
};

const IDENT = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ_][\\wÁÉÍÓÚÜÑáéíóúüñ]*';

const MANUAL_STEP_REF_RE =
  /\bpasos?\s+(?:N°\s*)?\[?(\d+(?:\.\d+)*)\]?(?:\s+(?:del?|de\s+la)\s+\[?(camino\s+(?:b[aá]sico|principal)|C\.?\s?A\.?\s*(?:N°\s*)?\d+|camino\s+altern(?:o|ativo)\s*(?:N°\s*)?\d+)\]?)?/gi;

const CLASS_MENTION_RE = new RegExp(
  `\\b(?:Buscar|Crear|Modificar|Leer(?:\\s+de)?|Por\\s+cada|Relacionad[ao]s?\\s+a|Seleccionar)\\s+(?:la\\s+|las\\s+)?(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?(${IDENT})`,
  'gi',
);

const ATTR_BULLET_RE = new RegExp(
  `^(?:Con\\s+)?(${IDENT})\\s+(?:igual\\s+a|distint[oa]\\s+(?:de|a)|menor|mayor|<=|>=|=|!=|<|>)`,
  'i',
);

const isEndingText = (text: string): boolean =>
  /^(?:Ir|Retornar|Volver)\s+a(?:l)?\s+paso\b|^Fin(?:alizar)?\s+(?:(?:del?|el)\s+)?(?:CU|caso\s+de\s+uso)\b/i.test(text.trim());

/**
 * Validaciones de cátedra (UTN FRM — Diseño de Sistemas).
 * Panel no bloqueante: señala errores de consistencia con el DC (incluyendo navegabilidad
 * en `Leer`), integridad de CAs/pasos, `Guardar Cambios`, cierre de CAs y reglas metodológicas.
 */
export const reviewUseCaseFlow = (
  content: UseCaseFlowContent,
  symbolIndex: ProjectSymbolIndex,
): FlowIssue[] => {
  const issues: FlowIssue[] = [];
  const numbering = computeFlowNumbering(content);
  const pseudoEntities = extractPseudoEntities(content);
  const pseudoByName = new Map(pseudoEntities.map((entity) => [entity.name, entity]));
  const hasLinkedClasses = symbolIndex.classes.length > 0;
  const reportedMissingClasses = new Set<string>();

  const altById = new Map(content.alternativeFlows.map((alt) => [alt.id, alt]));
  const altByCode = new Map(content.alternativeFlows.map((alt) => [`CA ${alt.number}`, alt]));
  const referencedAltIds = new Set<string>();

  const numbersByFlowId = new Map<string, Set<string>>();
  numbering.entriesByFlowId.forEach((entries, flowId) => {
    numbersByFlowId.set(flowId, new Set(entries.map((entry) => entry.number)));
  });

  const flowLabel = (flowId: 'basic' | string): string => {
    if (flowId === 'basic') return 'del camino básico';
    const alt = altById.get(flowId);
    return alt ? `de ${formatAlternativeRef(alt.number)}` : 'del camino alternativo';
  };

  const stepWhere = (flowId: 'basic' | string, stepId: string): string => {
    const num = numbering.stepNumberById.get(stepId);
    return `paso ${num ?? '?'} ${flowLabel(flowId)}`;
  };

  const checkClassExists = (name: string, location: FlowIssueLocation, where: string): void => {
    const trimmed = name.trim();
    if (!hasLinkedClasses || !trimmed || !/^[A-ZÁÉÍÓÚÜÑ]/.test(trimmed)) return;
    if (findSymbolClass(symbolIndex, trimmed) || pseudoByName.has(trimmed)) return;
    const key = `${trimmed}`;
    if (reportedMissingClasses.has(key)) return;
    reportedMissingClasses.add(key);
    issues.push({
      id: `class:${trimmed}`,
      kind: 'review',
      category: 'modelo-clases',
      location,
      message: `«${trimmed}» (${where}) no existe en el Diagrama de Clases vinculado ni fue declarada con «Definir pseudoentidad».`,
    });
  };

  const checkAttributeExists = (
    ownerClassName: string | undefined,
    attributeName: string,
    location: FlowIssueLocation,
    where: string,
    idSuffix: string,
  ): void => {
    const attr = attributeName.trim();
    if (!hasLinkedClasses || !ownerClassName || !attr) return;
    const pseudo = pseudoByName.get(ownerClassName);
    if (pseudo) {
      if (pseudo.fields.length > 0 && !pseudo.fields.includes(attr)) {
        issues.push({
          id: `pseudo-attr:${idSuffix}:${attr}`,
          kind: 'review',
          category: 'modelo-clases',
          location,
          message: `«${attr}» no fue declarado en la pseudoentidad ${pseudo.name} (${where}).`,
        });
      }
      return;
    }
    const cls = findSymbolClass(symbolIndex, ownerClassName);
    if (!cls) return;
    if (!cls.attributes.some((candidate) => candidate.name === attr)) {
      issues.push({
        id: `attr:${idSuffix}:${cls.name}:${attr}`,
        kind: 'review',
        category: 'modelo-clases',
        location,
        message: `«${attr}» no es un atributo de ${cls.name} en el DC vinculado (${where}).`,
      });
    }
  };

  const checkRefs = (refs: FlowRef[], flowId: 'basic' | string, stepId: string, mainStepId: string): void => {
    const location: FlowIssueLocation = { kind: 'step', flowId, stepId, mainStepId };
    const where = stepWhere(flowId, stepId);

    for (const ref of refs) {
      if (ref.kind === 'ca') {
        if (altById.has(ref.flowId)) {
          referencedAltIds.add(ref.flowId);
        } else {
          issues.push({
            id: `ref-ca-broken:${stepId}:${ref.id}`,
            kind: 'error',
            category: 'referencias',
            location,
            message: `El ${where} referencia un Camino Alternativo que ya no existe.`,
          });
        }
      } else if (ref.kind === 'ca-missing') {
        const alt = altByCode.get(normalizeLegacyFlowCode(ref.code));
        if (alt) {
          referencedAltIds.add(alt.id);
        } else {
          issues.push({
            id: `ref-ca-missing:${stepId}:${ref.id}`,
            kind: 'error',
            category: 'referencias',
            location,
            message: `El ${where} deriva a ${ref.code || 'un CA'}, pero ese Camino Alternativo no está definido abajo.`,
          });
        }
      }
      // `kind === 'gui'` and `kind === 'custom'` are valid non-CA references (e.g. GUI-1).
    }
  };

  const checkManualStepReferences = (
    text: string,
    flowId: 'basic' | string,
    stepId: string,
    mainStepId: string,
  ): void => {
    const location: FlowIssueLocation = { kind: 'step', flowId, stepId, mainStepId };
    const where = stepWhere(flowId, stepId);

    for (const match of text.matchAll(MANUAL_STEP_REF_RE)) {
      const targetNum = match[1];
      const qualifier = match[2];
      let targetFlowId: 'basic' | string | undefined = flowId;
      let targetFlowLabel = flowId === 'basic' ? 'el camino básico' : flowLabel(flowId);

      if (qualifier) {
        if (/b[aá]sico|principal/i.test(qualifier)) {
          targetFlowId = 'basic';
          targetFlowLabel = 'el camino principal';
        } else {
          const norm = normalizeLegacyFlowCode(qualifier);
          const found = altByCode.get(norm);
          targetFlowId = found?.id;
          targetFlowLabel = norm;
        }
      }

      if (!targetFlowId) {
        issues.push({
          id: `manual-flow:${stepId}:${match.index}`,
          kind: 'error',
          category: 'referencias',
          location,
          message: `El ${where} menciona ${targetFlowLabel}, que no existe.`,
        });
        continue;
      }

      const validNums = numbersByFlowId.get(targetFlowId);
      if (!validNums?.has(targetNum)) {
        issues.push({
          id: `manual-step:${stepId}:${match.index}`,
          kind: 'error',
          category: 'referencias',
          location,
          message: `El ${where} apunta al paso ${targetNum}${targetFlowId === flowId ? '' : ` de ${targetFlowLabel}`}, que no existe.`,
        });
      }
    }
  };

  const checkAnchorExists = (
    anchor: { flowId: 'basic' | string; stepId: string } | undefined,
    flowId: 'basic' | string,
    stepId: string,
    mainStepId: string,
    kindLabel: 'Ir a paso' | 'referencia de paso',
  ): void => {
    if (!anchor) return;
    if (!numbering.stepNumberById.has(anchor.stepId)) {
      issues.push({
        id: `anchor:${stepId}:${anchor.stepId}`,
        kind: 'error',
        category: 'referencias',
        location: { kind: 'step', flowId, stepId, mainStepId },
        message: `La ${kindLabel} en el ${stepWhere(flowId, stepId)} apunta a un paso eliminado o inexistente.`,
      });
    }
  };

  // Track which real DC classes are created/modified in the flow (for Estado Final coherence & Guardar Cambios).
  const persistedMutatedClasses = new Set<string>();

  const checkDetails = (
    details: FlowDetailItem[],
    ownerClass: string | undefined,
    flowId: 'basic' | string,
    stepId: string,
    mainStepId: string,
  ): void => {
    const location: FlowIssueLocation = { kind: 'step', flowId, stepId, mainStepId };
    const where = stepWhere(flowId, stepId);

    for (const detail of details) {
      checkAnchorExists(detail.stepRef, flowId, stepId, mainStepId, 'referencia de paso');
      checkManualStepReferences(detail.text, flowId, stepId, mainStepId);

      const relMatch = new RegExp(`Relacionad[ao]s?\\s+a\\s+(?:la\\s+|las\\s+)?(?:instancias?|instancia\\/s)\\s+(?:de\\s+)?(${IDENT})`, 'i').exec(detail.text);
      if (relMatch) {
        checkClassExists(relMatch[1], location, where);
        if (detail.children && detail.children.length > 0) {
          checkDetails(detail.children, relMatch[1], flowId, stepId, mainStepId);
        }
        continue;
      }

      const attrMatch = ATTR_BULLET_RE.exec(detail.text.trim());
      if (attrMatch && ownerClass) {
        checkAttributeExists(ownerClass, attrMatch[1], location, where, detail.id);
      }

      if (detail.children && detail.children.length > 0) {
        checkDetails(detail.children, ownerClass, flowId, stepId, mainStepId);
      }
    }
  };

  const reviewFlow = (steps: FlowMainStep[], flowId: 'basic' | string): void => {
    let mutatesDomainEntity = false;
    let savedAfterMutation = false;
    let firstMutationLocation: FlowIssueLocation | undefined;
    let lastExecutableStep: { stepId: string; mainStepId: string; primitive?: string; text: string; hasJump: boolean } | undefined;

    const inspectAction = (
      node: Pick<FlowActionNode, 'id' | 'primitive' | 'text' | 'semantic' | 'details' | 'refs' | 'stepRef' | 'jumpTarget'>,
      mainStepId: string,
      speaker: 'actor' | 'system',
    ): void => {
      const location: FlowIssueLocation = { kind: 'step', flowId, stepId: node.id, mainStepId };
      const where = stepWhere(flowId, node.id);
      const semantic = speaker === 'system' ? inferActionSemantic(node.primitive, node.text, node.semantic) : undefined;

      checkRefs(node.refs, flowId, node.id, mainStepId);
      checkAnchorExists(node.stepRef, flowId, node.id, mainStepId, 'referencia de paso');
      checkAnchorExists(node.jumpTarget, flowId, node.id, mainStepId, 'Ir a paso');
      checkManualStepReferences(node.text, flowId, node.id, mainStepId);

      if (node.text.trim() || node.jumpTarget) {
        lastExecutableStep = {
          stepId: node.id,
          mainStepId,
          primitive: node.primitive,
          text: node.text,
          hasJump: Boolean(node.jumpTarget),
        };
      }

      if (speaker === 'actor') return;

      // Check class mentions in text
      for (const m of node.text.matchAll(CLASS_MENTION_RE)) {
        checkClassExists(m[1], location, where);
      }
      if (semantic?.targetClass) checkClassExists(semantic.targetClass, location, where);
      if (semantic?.sourceClass) checkClassExists(semantic.sourceClass, location, where);

      // CRITICAL CÁTEDRA RULE: `Leer ClaseB relacionada a ClaseA` requires navigability ClaseA → ClaseB in DC!
      if (node.primitive === 'leer' && hasLinkedClasses) {
        if (semantic?.sourceClass && semantic?.targetClass) {
          if (!pseudoByName.has(semantic.sourceClass) && !pseudoByName.has(semantic.targetClass)) {
            const nav = checkClassNavigability(symbolIndex, semantic.sourceClass, semantic.targetClass);
            if (nav === 'reverse-only') {
              issues.push({
                id: `nav-reverse:${node.id}`,
                kind: 'error',
                category: 'navigabilidad',
                location,
                message: `En el ${where}, «Leer ${semantic.targetClass}» desde «${semantic.sourceClass}» no tiene navegabilidad en ese sentido (el DC navega ${semantic.targetClass} → ${semantic.sourceClass}). Usá «Buscar instancia de ${semantic.targetClass}» o corregí la navegabilidad en el DC.`,
              });
            } else if (nav === 'unspecified') {
              issues.push({
                id: `nav-none:${node.id}`,
                kind: 'review',
                category: 'navigabilidad',
                location,
                message: `En el ${where}, la asociación entre «${semantic.sourceClass}» y «${semantic.targetClass}» no tiene navegabilidad marcada hacia «${semantic.targetClass}». Revisá el DC o usá «Buscar».`,
              });
            } else if (nav === 'no-relation') {
              issues.push({
                id: `nav-missing:${node.id}`,
                kind: 'error',
                category: 'navigabilidad',
                location,
                message: `En el ${where}, no existe relación directa de «${semantic.sourceClass}» hacia «${semantic.targetClass}» en el DC; no es válido usar «Leer».`,
              });
            }
          }
        }
        if (semantic?.sourceClass && semantic?.attribute) {
          checkAttributeExists(semantic.sourceClass, semantic.attribute, location, where, node.id);
        }
      }

      // Check details (Buscar / Crear / Modificar / Leer / Mostrar mensaje)
      const detailOwner = node.primitive === 'leer'
        ? semantic?.sourceClass ?? semantic?.targetClass
        : semantic?.targetClass;
      if (node.details.length > 0) {
        checkDetails(node.details, detailOwner, flowId, node.id, mainStepId);
      }

      // Track persistence mutations (only on real DC entities, NOT pseudoentities!)
      if (node.primitive === 'crear' || node.primitive === 'modificar') {
        const target = semantic?.targetClass;
        const isPseudo = target !== undefined && pseudoByName.has(target);
        if (!isPseudo) {
          mutatesDomainEntity = true;
          savedAfterMutation = false;
          firstMutationLocation = firstMutationLocation ?? location;
          if (target) persistedMutatedClasses.add(target);
        }
      }

      if (node.primitive === 'guardar-cambios' || /^Guardar\s+Cambios\b/i.test(node.text.trim())) {
        if (mutatesDomainEntity) savedAfterMutation = true;
      }

      // Comprobar / Controlar consistencia normally trigger a CA in Ref.
      if (
        (node.primitive === 'comprobar' || node.primitive === 'controlar-consistencia')
        && !node.refs.some((ref) => ref.kind === 'ca' || ref.kind === 'ca-missing')
      ) {
        issues.push({
          id: `missing-ca-ref:${node.id}`,
          kind: 'review',
          category: 'metodologia',
          location,
          message: `El ${where} (${node.primitive === 'comprobar' ? 'Comprobar' : 'Controlar consistencia'}) no referencia ningún CA en la columna Ref.`,
        });
      }
    };

    const inspectSubNodes = (nodes: FlowSubNode[], mainStepId: string): void => {
      for (const node of nodes) {
        const location: FlowIssueLocation = { kind: 'step', flowId, stepId: node.id, mainStepId };
        const where = stepWhere(flowId, node.id);

        if (node.kind === 'action') {
          inspectAction(node, mainStepId, node.speaker ?? 'system');
          if (node.children) inspectSubNodes(node.children, mainStepId);
        } else if (node.kind === 'loop') {
          checkRefs(node.refs, flowId, node.id, mainStepId);
          checkAnchorExists(node.stepRef, flowId, node.id, mainStepId, 'referencia de paso');
          checkManualStepReferences(node.header, flowId, node.id, mainStepId);
          if (node.targetClass) checkClassExists(node.targetClass, location, where);
          for (const m of node.header.matchAll(CLASS_MENTION_RE)) {
            checkClassExists(m[1], location, where);
          }
          if (node.details.length === 0 && node.children.length === 0) {
            issues.push({
              id: `empty-loop:${node.id}`,
              kind: 'review',
              category: 'metodologia',
              location,
              message: `El bucle (${node.loopKind === 'por-cada' ? 'Por cada' : 'Mientras'}) del ${where} no tiene acciones adentro.`,
            });
          }
          if (node.details.length > 0) checkDetails(node.details, node.targetClass, flowId, node.id, mainStepId);
          inspectSubNodes(node.children, mainStepId);
        } else {
          checkRefs(node.refs, flowId, node.id, mainStepId);
          checkManualStepReferences(node.condition, flowId, node.id, mainStepId);
          if (node.thenChildren.length === 0) {
            issues.push({
              id: `empty-if:${node.id}`,
              kind: 'review',
              category: 'metodologia',
              location,
              message: `El condicional SI del ${where} no tiene pasos dentro de su rama verdadera.`,
            });
          }
          inspectSubNodes(node.thenChildren, mainStepId);
          if (node.elseChildren !== undefined) {
            if (node.elseChildren.length === 0) {
              issues.push({
                id: `empty-else:${node.id}`,
                kind: 'review',
                category: 'metodologia',
                location,
                message: `La rama SINO del ${where} está vacía.`,
              });
            }
            inspectSubNodes(node.elseChildren, mainStepId);
          }
        }
      }
    };

    const containsControlarConsistencia = (step: FlowMainStep): boolean => {
      if (step.primitive === 'controlar-consistencia' || /controlar\s+consistencia/i.test(step.title)) return true;
      const walk = (nodes: FlowSubNode[]): boolean =>
        nodes.some((n) =>
          n.kind === 'action'
            ? n.primitive === 'controlar-consistencia' || /controlar\s+consistencia/i.test(n.text) || walk(n.children ?? [])
            : n.kind === 'loop'
              ? walk(n.children)
              : walk(n.thenChildren) || (n.elseChildren ? walk(n.elseChildren) : false));
      return walk(step.children);
    };

    steps.forEach((step, index) => {
      inspectAction(
        {
          id: step.id,
          primitive: step.primitive ?? 'custom',
          text: step.title,
          semantic: step.semantic,
          details: step.details ?? [],
          refs: step.refs,
          stepRef: step.stepRef,
          jumpTarget: step.jumpTarget,
        },
        step.id,
        step.speaker,
      );

      inspectSubNodes(step.children, step.id);

      // Methodological check: Actor `Ingresar` should be followed by System `Controlar consistencia`.
      if (step.speaker === 'actor' && (step.primitive === 'ingresar' || /^Ingresar\b/i.test(step.title.trim()))) {
        const nextStep = steps[index + 1];
        if (nextStep && nextStep.speaker === 'system' && !containsControlarConsistencia(nextStep)) {
          issues.push({
            id: `ingresar-no-consistencia:${step.id}`,
            kind: 'review',
            category: 'metodologia',
            location: { kind: 'step', flowId, stepId: nextStep.id, mainStepId: nextStep.id },
            message: `Después del «Ingresar» (${stepWhere(flowId, step.id)}), el ${stepWhere(flowId, nextStep.id)} no incluye «Controlar consistencia de datos ingresados».`,
          });
        }
      }
    });

    if (mutatesDomainEntity && !savedAfterMutation) {
      issues.push({
        id: `missing-save:${flowId}`,
        kind: 'review',
        category: 'persistencia-cierre',
        location: firstMutationLocation,
        message: `Hay primitivas Crear o Modificar sobre entidades del DC ${flowLabel(flowId)} sin un «Guardar Cambios» posterior.`,
      });
    }

    if (flowId === 'basic' && steps.length > 0) {
      const first = steps[0];
      if (first.speaker !== 'actor' || !/^Iniciar\s+CU\b/i.test(first.title.trim())) {
        issues.push({
          id: 'basic-start',
          kind: 'review',
          category: 'metodologia',
          location: { kind: 'step', flowId: 'basic', stepId: first.id, mainStepId: first.id },
          message: 'El camino básico debería iniciar en el paso 1 con el Actor ejecutando «Iniciar CU».',
        });
      }
      if (
        lastExecutableStep
        && lastExecutableStep.primitive !== 'fin-cu'
        && lastExecutableStep.primitive !== 'ir-a-paso'
        && lastExecutableStep.primitive !== 'ir-a-cu'
        && !lastExecutableStep.hasJump
        && !isEndingText(lastExecutableStep.text)
      ) {
        issues.push({
          id: 'basic-end',
          kind: 'review',
          category: 'persistencia-cierre',
          location: { kind: 'step', flowId: 'basic', stepId: lastExecutableStep.stepId, mainStepId: lastExecutableStep.mainStepId },
          message: 'El camino básico no cierra explícitamente con «Fin CU».',
        });
      }
    }

    if (flowId !== 'basic') {
      const alt = altById.get(flowId);
      const codeLabel = alt ? formatAlternativeRef(alt.number) : 'El camino alternativo';
      if (steps.length === 0 || !lastExecutableStep) {
        issues.push({
          id: `empty-alt:${flowId}`,
          kind: 'review',
          category: 'persistencia-cierre',
          location: { kind: 'alternative', flowId },
          message: `${codeLabel} todavía no tiene pasos.`,
        });
      } else if (
        lastExecutableStep.primitive !== 'fin-cu'
        && lastExecutableStep.primitive !== 'ir-a-paso'
        && !lastExecutableStep.hasJump
        && !isEndingText(lastExecutableStep.text)
      ) {
        issues.push({
          id: `alt-end:${flowId}`,
          kind: 'review',
          category: 'persistencia-cierre',
          location: { kind: 'step', flowId, stepId: lastExecutableStep.stepId, mainStepId: lastExecutableStep.mainStepId },
          message: `${codeLabel} debe cerrar explícitamente con «Ir a paso [N]» o «Fin CU».`,
        });
      }
    }
  };

  reviewFlow(content.basicFlow, 'basic');
  content.alternativeFlows.forEach((alt) => reviewFlow(alt.steps, alt.id));

  // Orphan & unnamed alternative flows
  content.alternativeFlows.forEach((alt) => {
    const label = formatAlternativeRef(alt.number);
    if (!referencedAltIds.has(alt.id)) {
      issues.push({
        id: `orphan:${alt.id}`,
        kind: 'review',
        category: 'referencias',
        location: { kind: 'alternative', flowId: alt.id },
        message: `${label} es huérfano: ningún paso lo referencia en la columna Ref.`,
      });
    }
    if (alt.title.trim().length === 0) {
      issues.push({
        id: `unnamed:${alt.id}`,
        kind: 'review',
        category: 'metodologia',
        location: { kind: 'alternative', flowId: alt.id },
        message: `${label} no tiene descripción de causa (ej. «No existe socio con número ingresado»).`,
      });
    }
  });

  // Validate Initial State and Final State against the linked Class Diagram
  const validateStateDetails = (
    details: StateDetailItem[],
    ownerClass: string,
    field: 'initialState' | 'finalState',
    blockId: string,
  ): void => {
    const where = field === 'initialState' ? 'en el Estado Inicial' : 'en el Estado Final';
    for (const detail of details) {
      const location: FlowIssueLocation = { kind: 'state', field, blockId, detailId: detail.id };
      if (detail.kind === 'attribute') {
        checkAttributeExists(ownerClass, detail.attribute, location, where, detail.id);
      } else if (detail.kind === 'relation') {
        checkClassExists(detail.className, location, where);
        validateStateDetails(detail.children, detail.className, field, blockId);
      }
    }
  };

  const finalStateMutatedClasses = new Set<string>();
  const validateStateInstance = (
    inst: StateInstanceBlock,
    field: 'initialState' | 'finalState',
    blockId: string,
  ): void => {
    const where = field === 'initialState' ? 'en el Estado Inicial' : 'en el Estado Final';
    checkClassExists(inst.className, { kind: 'state', field, blockId }, where);
    validateStateDetails(inst.details, inst.className, field, blockId);
    if (field === 'finalState' && inst.className.trim() && (inst.qualifier === 'creada' || inst.qualifier === 'modificada')) {
      finalStateMutatedClasses.add(inst.className.trim());
    }
  };

  const validateStateBlocks = (blocks: StateBlock[], field: 'initialState' | 'finalState'): void => {
    for (const block of blocks) {
      if (block.kind === 'instance') {
        validateStateInstance(block, field, block.id);
      } else if (block.kind === 'condition') {
        block.blocks.forEach((inst) => validateStateInstance(inst, field, inst.id));
      }
    }
  };

  validateStateBlocks(content.description.initialState, 'initialState');
  validateStateBlocks(content.description.finalState, 'finalState');

  // Coherence check between Final State and Flow mutations (only when both exist)
  if (content.basicFlow.length > 0 && finalStateMutatedClasses.size > 0) {
    finalStateMutatedClasses.forEach((clsName) => {
      const hasMutation = Array.from(persistedMutatedClasses).some(
        (candidate) => candidate.toLowerCase() === clsName.toLowerCase(),
      );
      if (!hasMutation) {
        issues.push({
          id: `final-state-unmatched:${clsName}`,
          kind: 'review',
          category: 'metodologia',
          message: `El Estado Final indica cambios en «${clsName}», pero el flujo no tiene un «Crear» ni «Modificar» sobre esa clase.`,
        });
      }
    });
  }

  return issues;
};
