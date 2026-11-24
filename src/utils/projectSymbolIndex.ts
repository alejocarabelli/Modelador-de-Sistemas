import type {
  AssociationRelationType,
  ClassDiagramArtifact,
  ClassDiagramNode,
} from '../types/diagram';

export type ProjectSymbolRelation = {
  edgeId: string;
  targetClass: string;
  relationType: AssociationRelationType;
  /** True when UML navigability allows traversing from this class to targetClass (permits `Leer`). */
  navigable: boolean;
  /** True when a relation exists between the two classes, but navigates only in the reverse direction. */
  isReverseOnly: boolean;
  /** True when an association has navigability === 'none' (no direction marked). */
  isUnspecifiedNavigability: boolean;
  targetMultiplicity: string;
  targetRole: string;
  relationName: string;
  inheritedFrom?: string;
};

export type ProjectSymbolClass = {
  id?: string;
  name: string;
  attributes: { name: string; type: string }[];
  methods: { name: string; returnType?: string }[];
  parametricValues: string[];
  relatedClasses: string[];
  relations?: ProjectSymbolRelation[];
};

export type ProjectSymbolIndex = {
  classes: ProjectSymbolClass[];
};

const clean = (value: string | undefined): string => value?.trim() ?? '';

const getNodeName = (node: ClassDiagramNode | undefined): string => clean(node?.data.name);

export const buildProjectSymbolIndex = (artifact: ClassDiagramArtifact | undefined): ProjectSymbolIndex => {
  if (artifact === undefined) {
    return { classes: [] };
  }

  const nodeById = new Map(artifact.content.nodes.map((node) => [node.id, node]));
  const relatedByClassName = new Map<string, Set<string>>();
  const directRelationsByNodeId = new Map<string, ProjectSymbolRelation[]>();

  artifact.content.nodes.forEach((node) => {
    const name = getNodeName(node);
    if (name.length > 0) {
      relatedByClassName.set(name, new Set());
    }
    directRelationsByNodeId.set(node.id, []);
  });

  const pushRelation = (fromNodeId: string, relation: ProjectSymbolRelation): void => {
    const list = directRelationsByNodeId.get(fromNodeId);
    if (list) list.push(relation);
  };

  artifact.content.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceName = getNodeName(sourceNode);
    const targetName = getNodeName(targetNode);

    if (sourceName.length === 0 || targetName.length === 0) {
      return;
    }

    if (sourceName !== targetName) {
      relatedByClassName.get(sourceName)?.add(targetName);
      relatedByClassName.get(targetName)?.add(sourceName);
    }

    const relationType: AssociationRelationType = edge.data?.relationType ?? 'association';
    if (relationType === 'generalization' || relationType === 'realization') {
      return;
    }

    const nav = edge.data?.navigability ?? 'none';
    const relationName = clean(edge.data?.name);
    const sourceMult = clean(edge.data?.sourceMultiplicity);
    const targetMult = clean(edge.data?.targetMultiplicity);
    const sourceRole = clean(edge.data?.sourceRole);
    const targetRole = clean(edge.data?.targetRole);

    if (relationType === 'dependency') {
      pushRelation(edge.source, {
        edgeId: edge.id,
        targetClass: targetName,
        relationType,
        navigable: true,
        isReverseOnly: false,
        isUnspecifiedNavigability: false,
        targetMultiplicity: targetMult,
        targetRole,
        relationName,
      });
      if (edge.source !== edge.target) {
        pushRelation(edge.target, {
          edgeId: edge.id,
          targetClass: sourceName,
          relationType,
          navigable: false,
          isReverseOnly: true,
          isUnspecifiedNavigability: false,
          targetMultiplicity: sourceMult,
          targetRole: sourceRole,
          relationName,
        });
      }
      return;
    }

    if (relationType === 'aggregation' || relationType === 'composition') {
      const wholeIsSource = (edge.data?.diamondEnd ?? 'source') === 'source';
      const sourceToTargetNav = wholeIsSource || nav === 'source-to-target' || nav === 'bidirectional';
      const targetToSourceNav = !wholeIsSource || nav === 'target-to-source' || nav === 'bidirectional';

      pushRelation(edge.source, {
        edgeId: edge.id,
        targetClass: targetName,
        relationType,
        navigable: sourceToTargetNav,
        isReverseOnly: !sourceToTargetNav && targetToSourceNav,
        isUnspecifiedNavigability: false,
        targetMultiplicity: targetMult,
        targetRole,
        relationName,
      });
      if (edge.source !== edge.target) {
        pushRelation(edge.target, {
          edgeId: edge.id,
          targetClass: sourceName,
          relationType,
          navigable: targetToSourceNav,
          isReverseOnly: !targetToSourceNav && sourceToTargetNav,
          isUnspecifiedNavigability: false,
          targetMultiplicity: sourceMult,
          targetRole: sourceRole,
          relationName,
        });
      }
      return;
    }

    // Standard association
    const sourceToTargetNav = nav === 'source-to-target' || nav === 'bidirectional';
    const targetToSourceNav = nav === 'target-to-source' || nav === 'bidirectional';
    const unspecified = nav === 'none';

    pushRelation(edge.source, {
      edgeId: edge.id,
      targetClass: targetName,
      relationType,
      navigable: sourceToTargetNav,
      isReverseOnly: !sourceToTargetNav && targetToSourceNav,
      isUnspecifiedNavigability: unspecified,
      targetMultiplicity: targetMult,
      targetRole,
      relationName,
    });
    if (edge.source !== edge.target) {
      pushRelation(edge.target, {
        edgeId: edge.id,
        targetClass: sourceName,
        relationType,
        navigable: targetToSourceNav,
        isReverseOnly: !targetToSourceNav && sourceToTargetNav,
        isUnspecifiedNavigability: unspecified,
        targetMultiplicity: sourceMult,
        targetRole: sourceRole,
        relationName,
      });
    }
  });

  // A subclass inherits its parents' attributes, methods and outgoing navigable relations.
  const parentIds = new Map<string, string[]>();
  artifact.content.edges.forEach((edge) => {
    if (edge.data?.relationType !== 'generalization') return;
    const parent = edge.data.triangleEnd === 'source' ? edge.source : edge.target;
    const child = parent === edge.source ? edge.target : edge.source;
    parentIds.set(child, [...(parentIds.get(child) ?? []), parent]);
  });
  const lineage = (nodeId: string): ClassDiagramNode[] => {
    const seen = new Set<string>();
    const result: ClassDiagramNode[] = [];
    const visit = (id: string): void => {
      if (seen.has(id)) return; // an inheritance cycle stops here
      seen.add(id);
      const node = nodeById.get(id);
      if (node === undefined) return;
      result.push(node);
      (parentIds.get(id) ?? []).forEach(visit);
    };
    visit(nodeId);
    return result;
  };
  const uniqueByName = <Item extends { name: string }>(items: Item[]): Item[] => {
    const names = new Set<string>();
    return items.filter((item) => {
      if (item.name.length === 0 || names.has(item.name)) return false;
      names.add(item.name);
      return true;
    });
  };

  const classes: ProjectSymbolClass[] = [];

  artifact.content.nodes.forEach((node) => {
    const name = clean(node.data.name);

    if (name.length === 0) {
      return;
    }

    const family = lineage(node.id);
    const relations: ProjectSymbolRelation[] = [];
    family.forEach((member, depthIndex) => {
      const memberName = clean(member.data.name);
      (directRelationsByNodeId.get(member.id) ?? []).forEach((rel) => {
        relations.push(depthIndex === 0 ? rel : { ...rel, inheritedFrom: memberName });
      });
    });

    const relatedSet = new Set<string>(relatedByClassName.get(name) ?? []);
    relations.forEach((rel) => {
      if (rel.targetClass !== name) relatedSet.add(rel.targetClass);
    });

    classes.push({
      id: node.id,
      name,
      attributes: uniqueByName(family.flatMap((member) => member.data.attributes
        .map((attribute) => ({ name: clean(attribute.name), type: clean(attribute.type) })))),
      methods: uniqueByName(family.flatMap((member) => member.data.methods
        .map((method) => ({ name: clean(method.name), returnType: clean(method.returnType) || undefined })))),
      parametricValues: (node.data.parametricValues ?? [])
        .map((value) => clean(value.value))
        .filter((value) => value.length > 0),
      relatedClasses: Array.from(relatedSet),
      relations,
    });
  });

  return { classes };
};

export type NavigabilityCheckResult =
  | 'navigable'
  | 'reverse-only'
  | 'unspecified'
  | 'no-relation'
  | 'unknown-class';

const foldName = (value: string): string =>
  value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const findSymbolClass = (
  symbolIndex: ProjectSymbolIndex,
  className: string,
): ProjectSymbolClass | undefined => {
  const exact = symbolIndex.classes.find((c) => c.name === className.trim());
  if (exact) return exact;
  const target = foldName(className);
  return symbolIndex.classes.find((c) => foldName(c.name) === target);
};

export const checkClassNavigability = (
  symbolIndex: ProjectSymbolIndex,
  fromClassName: string,
  toClassName: string,
): NavigabilityCheckResult => {
  const from = findSymbolClass(symbolIndex, fromClassName);
  const to = findSymbolClass(symbolIndex, toClassName);
  if (!from || !to) return 'unknown-class';

  const matching = (from.relations ?? []).filter((rel) => foldName(rel.targetClass) === foldName(to.name));
  if (matching.length === 0) {
    // Support tests/callers that construct a synthetic ProjectSymbolIndex with relatedClasses only.
    if (from.relations === undefined) {
      return from.relatedClasses.some((c) => foldName(c) === foldName(to.name)) ? 'navigable' : 'no-relation';
    }
    return 'no-relation';
  }
  if (matching.some((rel) => rel.navigable)) return 'navigable';
  if (matching.some((rel) => rel.isReverseOnly)) return 'reverse-only';
  if (matching.some((rel) => rel.isUnspecifiedNavigability)) return 'unspecified';
  return 'no-relation';
};
