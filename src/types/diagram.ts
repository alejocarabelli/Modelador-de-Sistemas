import type { ClassGroupColor } from '../constants/classGroupColors';
import type { Edge, Node, XYPosition } from 'reactflow';
import type { MouseEvent } from 'react';

export type ClassAttribute = {
  id: string;
  name: string;
  type: string;
  /** Class-scoped member: UML draws it underlined. Absent means instance-scoped. */
  isStatic?: boolean;
};

export type ClassMethod = {
  id: string;
  visibility: '+' | '-' | '#' | '';
  name: string;
  parameters: string;
  returnType: string;
  /** Class-scoped member: UML draws it underlined. Absent means instance-scoped. */
  isStatic?: boolean;
};

export type ParametricValue = {
  id: string;
  value: string;
};

export type ParametricValuesNoteHandle = 'top' | 'right' | 'bottom' | 'left';
export type ParametricValuesNoteConnectionMode = 'automatic' | 'manual';

export type ClassNodeData = {
  groupColor?: ClassGroupColor;
  hideAttributes?: boolean;
  hideMethods?: boolean;
  name: string;
  description?: string;
  attributes: ClassAttribute[];
  methods: ClassMethod[];
  hasParametricValuesNote?: boolean;
  parametricValuesNoteConnectionMode?: ParametricValuesNoteConnectionMode;
  parametricValuesNoteHandle?: ParametricValuesNoteHandle;
  parametricValuesNoteTargetHandle?: ParametricValuesNoteHandle;
  parametricValuesNotePosition?: XYPosition;
  parametricValues?: ParametricValue[];
  shouldStartNameEditing?: boolean;
  shouldStartAttributeEditing?: string;
  shouldStartMethodEditing?: string;
  isConnectionInProgress?: boolean;
  isConnectionSource?: boolean;
  /** Names of the classes in the same diagram, so member types that refer to one can be told apart. */
  knownClassNames?: readonly string[];
  onCreateAttribute?: (nodeId: string, attribute: ClassAttribute) => void;
  onCreateMethod?: (nodeId: string, method: ClassMethod) => void;
  onDeleteAttribute?: (nodeId: string, attributeId: string) => void;
  onDeleteAttributeAndCreateMethod?: (nodeId: string, attributeId: string, method: ClassMethod) => void;
  onDeleteMethod?: (nodeId: string, methodId: string) => void;
  onAttributeEditingStarted?: (nodeId: string) => void;
  onMethodEditingStarted?: (nodeId: string) => void;
  onNameEditingStarted?: (nodeId: string) => void;
  onOpenContextMenu?: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  onRenameClass?: (nodeId: string, name: string) => void;
  onRenameClassAndCreateAttribute?: (nodeId: string, name: string, attribute: ClassAttribute) => void;
  onSetParametricValuesNote?: (nodeId: string, enabled: boolean) => void;
  onUpdateAttribute?: (nodeId: string, attributeId: string, field: 'name' | 'type', value: string) => void;
  onUpdateAttributeFields?: (
    nodeId: string,
    attributeId: string,
    values: Pick<ClassAttribute, 'name' | 'type'>,
  ) => void;
  onUpdateAttributeFieldsAndCreateAttribute?: (
    nodeId: string,
    attributeId: string,
    values: Pick<ClassAttribute, 'name' | 'type'>,
    nextAttribute: ClassAttribute,
  ) => void;
  onUpdateMethodFields?: (
    nodeId: string,
    methodId: string,
    values: Omit<ClassMethod, 'id'>,
  ) => void;
  onUpdateMethodFieldsAndCreateMethod?: (
    nodeId: string,
    methodId: string,
    values: Omit<ClassMethod, 'id'>,
    nextMethod: ClassMethod,
  ) => void;
  onUpdateParametricValues?: (nodeId: string, values: ParametricValue[]) => void;
};

export type ClassDiagramNode = Node<ClassNodeData, 'classNode'>;

export type ConnectionSide = 'top' | 'right' | 'bottom' | 'left';
export type AssociationNavigability = 'none' | 'source-to-target' | 'target-to-source' | 'bidirectional';
export type AssociationRelationType =
  | 'association'
  | 'generalization'
  | 'aggregation'
  | 'composition'
  | 'dependency'
  | 'realization';
export type AssociationDiamondEnd = 'source' | 'target';
export type AssociationLineStyle = 'straight' | 'orthogonal';
export type AssociationConnectionSide = 'automatic' | ConnectionSide;

export type AssociationEdgeData = {
  labelOffset?: XYPosition;
  routingObstacles?: Array<{ x: number; y: number; width: number; height: number }>;
  onUpdateLabel?: (edgeId: string, values: Partial<AssociationEdgeData>) => void;
  onUpdateAssociation?: (edgeId: string, values: Partial<AssociationEdgeData>) => void;
  name: string;
  sourceMultiplicity: string;
  targetMultiplicity: string;
  sourceRole: string;
  targetRole: string;
  navigability: AssociationNavigability;
  relationType?: AssociationRelationType;
  diamondEnd?: AssociationDiamondEnd;
  /** Generalization only: the superclass end. Separate from diamondEnd so older diagrams keep the triangle at the target. */
  triangleEnd?: AssociationDiamondEnd;
  lineStyle?: AssociationLineStyle;
  sourceSide?: AssociationConnectionSide;
  targetSide?: AssociationConnectionSide;
  waypoints?: XYPosition[];
  onUpdateMultiplicity?: (edgeId: string, end: 'source' | 'target', value: string) => void;
};

export type ClassDiagramEdge = Edge<AssociationEdgeData>;

export type ClassDiagramContent = {
  nodes: ClassDiagramNode[];
  edges: ClassDiagramEdge[];
};

export type ClassSequenceDiagramContent = ClassDiagramContent & {
  version: 1;
  sourceClassDiagramArtifactId?: string;
  linkedSequenceDiagramIds: string[];
};

export type UseCaseNodeKind = 'actor' | 'use-case' | 'system-boundary';
export type UseCaseRelationType = 'association' | 'include' | 'extend' | 'generalization';

export type UseCaseNodeData = {
  kind: UseCaseNodeKind;
  name: string;
  onOpenContextMenu?: (nodeId: string, event: MouseEvent<HTMLElement>) => void;
  onRename?: (nodeId: string, name: string) => void;
  /** Runtime only, while a relation is being dragged: how this node takes it. */
  connectState?: 'source' | 'valid' | 'invalid';
};

export type UseCaseModelNode = Node<UseCaseNodeData, 'useCaseActor' | 'useCaseOval' | 'systemBoundary'>;

export type UseCaseEdgeData = {
  relationType: UseCaseRelationType;
  label?: string;
};

export type UseCaseModelEdge = Edge<UseCaseEdgeData>;

export type UseCaseModelContent = {
  nodes: UseCaseModelNode[];
  edges: UseCaseModelEdge[];
};

export type UseCaseFlowPriority = 'A' | 'B' | 'C';

export type UseCaseFlowDescription = {
  useCaseNumber: string;
  useCaseName: string;
  actor: string;
  description: string;
  priority: UseCaseFlowPriority;
  inputParameters: string;
  precondition: string;
  postcondition: string;
  initialState: string;
  finalState: string;
};

export type UseCaseFlowStep = {
  id: string;
  actor: string;
  system: string;
  ref: string;
};

export type AlternativeUseCaseFlow = {
  id: string;
  code: string;
  name: string;
  /** First step number; when absent it follows the step that references the path. */
  firstStepNumber?: number;
  steps: UseCaseFlowStep[];
};

export type UseCaseFlowContent = {
  /** null: "Sin referencia" chosen explicitly. Absent: never chosen, so the project's only class diagram is used. */
  classDiagramArtifactId?: string | null;
  description: UseCaseFlowDescription;
  basicFlow: UseCaseFlowStep[];
  alternativeFlows: AlternativeUseCaseFlow[];
};

export type SequenceParticipantKind = 'actor' | 'boundary' | 'control' | 'entity' | 'object';
export type SequenceMessageType = 'synchronous' | 'asynchronous' | 'return' | 'create' | 'destroy';
export type SequenceFragmentOperator = 'alt' | 'loop' | 'opt' | 'par' | 'break' | 'critical' | 'ref';
export type SequenceNumberingMode = 'sequential' | 'hierarchical' | 'none';

export type SequenceParticipant = {
  id: string;
  kind: SequenceParticipantKind;
  name: string;
  classifierName: string;
  classifierNodeId?: string;
  x: number;
  createdByMessageId?: string;
  destroyedByMessageId?: string;
  terminateLifeline?: boolean;
};

export type SequenceMessage = {
  id: string;
  kind: 'message';
  type: SequenceMessageType;
  sourceId: string;
  targetId: string;
  name: string;
  arguments: string;
  parameterValues: string;
  returnType: string;
  operationMethodId?: string;
  replyToMessageId?: string;
  flowReference: string;
};

export type SequenceFragmentOperand = {
  id: string;
  guard: string;
  items: SequenceTimelineItem[];
};

export type SequenceFragment = {
  id: string;
  kind: 'fragment';
  operator: SequenceFragmentOperator;
  name: string;
  startParticipantId?: string;
  endParticipantId?: string;
  operands: SequenceFragmentOperand[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  interactionArtifactId?: string;
};

export type SequenceTimelineItem = SequenceMessage | SequenceFragment;

export type SequenceActivation = {
  id: string;
  participantId: string;
  startMessageId: string;
  endMessageId?: string;
  /** Boundary used when an activation is open only inside an alternative path. */
  endScope?: {
    fragmentId: string;
    operandId: string;
  };
  level: number;
  manual: boolean;
};

/**
 * A recoverable semantic issue found while reading a sequence timeline.
 * Items are deliberately kept in the document so an import never loses the
 * original authoring evidence; consumers can decide how to present or repair
 * the issue later.
 */
export type SequenceDiagramProblemCode =
  | 'normalization-repair'
  | 'missing-participant-reference'
  | 'message-before-create'
  | 'message-after-destroy'
  | 'conditional-participant-lifecycle'
  | 'duplicate-create'
  | 'create-after-destroy'
  | 'destroy-before-create'
  | 'duplicate-destroy'
  | 'unmatched-return'
  | 'ambiguous-activation'
  | 'ambiguous-lifecycle-marker'
  | 'invalid-manual-activation'
  | 'broken-interaction-reference'
  | 'unlinked-interaction-reference'
  | 'unnamed-message'
  | 'incomplete-fragment';

export type SequenceDiagramProblem = {
  id: string;
  code: SequenceDiagramProblemCode;
  severity: 'error' | 'warning';
  message: string;
  activationId?: string;
  messageId?: string;
  participantId?: string;
  fragmentId?: string;
  operandId?: string;
};

export type SequenceNoteAnchorKind = 'free' | 'message' | 'fragment' | 'participant';

export type SequenceNoteColor = 'yellow' | 'red' | 'green' | 'blue';

export type SequenceNoteColorScheme = {
  background: string;
  border: string;
  fold: string;
  text: string;
  connectionLine: string;
  dot: string;
  label: string;
};

export const SEQUENCE_NOTE_COLORS: Record<SequenceNoteColor, SequenceNoteColorScheme> = {
  yellow: {
    background: '#FFF4CF',
    border: '#BDA35A',
    fold: '#D7BD6A',
    text: '#423A27',
    connectionLine: '#93835D',
    dot: '#B88C26',
    label: 'Ámbar',
  },
  red: {
    background: '#F4E8E7',
    border: '#A9827E',
    fold: '#C4A09D',
    text: '#4A302F',
    connectionLine: '#8D6A67',
    dot: '#8D6A67',
    label: 'Rosa mineral',
  },
  green: {
    background: '#EAF1E8',
    border: '#849B7A',
    fold: '#A9B99F',
    text: '#2F4132',
    connectionLine: '#6F866A',
    dot: '#6F866A',
    label: 'Salvia',
  },
  blue: {
    background: '#E8F0F2',
    border: '#76939B',
    fold: '#A4B9BE',
    text: '#293E45',
    connectionLine: '#617F87',
    dot: '#617F87',
    label: 'Azul grisáceo',
  },
};

export type SequenceNote = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorKind: SequenceNoteAnchorKind;
  anchorId?: string;
  color?: SequenceNoteColor;
};

export type SequenceParticipantColorMode = 'automatic' | 'disabled';
/** Compact packs one-line messages tightly, as Enterprise Architect draws them. */
export type SequenceSpacingMode = 'normal' | 'compact';

export type SequenceDiagramContent = {
  version: 1;
  /** `undefined` = never chose; `null` = "Sin vincular" chosen on purpose (automatic links skip it). */
  classDiagramArtifactId?: string | null;
  flowArtifactId?: string;
  numbering: SequenceNumberingMode;
  showActivations: boolean;
  participantColors?: SequenceParticipantColorMode;
  spacing?: SequenceSpacingMode;
  participants: SequenceParticipant[];
  items: SequenceTimelineItem[];
  activations: SequenceActivation[];
  problems: SequenceDiagramProblem[];
  notes: SequenceNote[];
  canvas: {
    width: number;
    height: number;
  };
};

export type DiagramContent = ClassDiagramContent | UseCaseModelContent;
export type ArtifactContent = DiagramContent | ClassSequenceDiagramContent | UseCaseFlowContent | SequenceDiagramContent;

/**
 * "Apuntes": a private sheet per artifact for doubts and ideas while modelling.
 * It lives on the artifact, never inside `content`, so it stays out of the
 * diagram's undo history and out of every export except the JSON files.
 * (Not called `notes`: sequence diagrams already have UML notes.)
 */
export type SketchColor = 'ink' | 'accent' | 'red';

/** Coordinates are logical units: a sketch is always 1000 wide, scaled to the sheet. */
export type SketchShape =
  | { id: string; kind: 'pen'; color: SketchColor; points: number[] }
  | { id: string; kind: 'arrow'; color: SketchColor; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: 'rect'; color: SketchColor; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'text'; color: SketchColor; x: number; y: number; text: string };

export type NotebookBlock =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'question'; text: string; resolved: boolean }
  /** `height` is in the same logical units as the shapes (width 1000). */
  | { id: string; kind: 'sketch'; height: number; shapes: SketchShape[] };

export type ArtifactNotebook = { version: 1; blocks: NotebookBlock[] };

export type ClassDiagramArtifact = {
  id: string;
  type: 'class-diagram';
  name: string;
  createdAt: string;
  updatedAt: string;
  notebook?: ArtifactNotebook;
  content: ClassDiagramContent;
};

export type ClassSequenceDiagramArtifact = {
  id: string;
  type: 'class-sequence-diagram';
  name: string;
  createdAt: string;
  updatedAt: string;
  notebook?: ArtifactNotebook;
  content: ClassSequenceDiagramContent;
};

export type UseCaseModelArtifact = {
  id: string;
  type: 'use-case-model';
  name: string;
  createdAt: string;
  updatedAt: string;
  notebook?: ArtifactNotebook;
  content: UseCaseModelContent;
};

export type UseCaseFlowArtifact = {
  id: string;
  type: 'use-case-flow';
  name: string;
  createdAt: string;
  updatedAt: string;
  notebook?: ArtifactNotebook;
  content: UseCaseFlowContent;
};

export type SequenceDiagramArtifact = {
  id: string;
  type: 'sequence-diagram';
  name: string;
  createdAt: string;
  updatedAt: string;
  notebook?: ArtifactNotebook;
  content: SequenceDiagramContent;
};

export type DesignArtifact =
  | ClassDiagramArtifact
  | ClassSequenceDiagramArtifact
  | UseCaseModelArtifact
  | UseCaseFlowArtifact
  | SequenceDiagramArtifact;

export type ClassModelArtifact = ClassDiagramArtifact | ClassSequenceDiagramArtifact;

/** A PDF kept with the project. Only the metadata lives here; the bytes are stored apart (src/storage/projectFiles.ts). */
export type ProjectFile = {
  id: string;
  name: string;
  size: number;
  pageCount?: number;
  addedAt: string;
};

export type DesignProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeArtifactId?: string;
  artifacts: DesignArtifact[];
  files?: ProjectFile[];
};

export type DiagramProject = DesignProject;

export type LegacyDiagramProject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  content: ClassDiagramContent;
};
