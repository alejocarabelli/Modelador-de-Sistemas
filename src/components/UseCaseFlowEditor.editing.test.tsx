import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { runtime, createMemoryStorage, stubBrowser } from '../hooks/testHookHarness';
import type { DiagramProject, UseCaseFlowArtifact, UseCaseFlowContent } from '../types/diagram';
import { normalizeUseCaseFlowContent } from '../utils/diagramNormalization';
import { createEmptyUseCaseFlowContent, createFlowActionNode, createFlowMainStep } from '../utils/useCaseFlowModel';
import { themes } from '../theme/themes';
import { UseCaseFlowEditor } from './UseCaseFlowEditor';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const { runtime: hooks } = await import('../hooks/testHookHarness');
  return { ...actual, ...hooks.api, useLayoutEffect: hooks.api.useEffect };
});

type TestElement = ReactElement<Record<string, unknown>>;
const elements = (node: unknown): TestElement[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    node,
    ...elements(node.props.children),
    ...elements(node.props.start),
    ...elements(node.props.create),
    ...elements(node.props.end),
  ];
};

let artifact: UseCaseFlowArtifact;
let project: DiagramProject;
const onChangeContent = vi.fn();

const renderEditor = () => {
  runtime.begin();
  return UseCaseFlowEditor({
    artifact,
    project,
    theme: themes[0],
    canUndo: false,
    canRedo: false,
    onChangeContent,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  });
};

beforeEach(() => {
  runtime.reset();
  vi.clearAllMocks();
  stubBrowser({
    localStorage: createMemoryStorage(),
    requestAnimationFrame: (cb: FrameRequestCallback) => { cb(0); return 1; },
  });
  const base = createEmptyUseCaseFlowContent();
  base.classDiagramArtifactId = null;
  base.basicFlow = [
    createFlowMainStep('actor', 'Iniciar CU', { id: 'b1', primitive: 'iniciar-cu' }),
    createFlowMainStep('system', 'Verificar socio', {
      id: 'b2',
      children: [
        createFlowActionNode('comprobar', 'Comprobar que estado es activo', { id: 'b2-1' }),
      ],
    }),
  ];
  artifact = {
    id: 'flow',
    type: 'use-case-flow',
    name: 'Flujo',
    createdAt: 'now',
    updatedAt: 'now',
    content: normalizeUseCaseFlowContent(base),
  };
  project = {
    id: 'project',
    name: 'Proyecto',
    createdAt: 'now',
    updatedAt: 'now',
    activeArtifactId: artifact.id,
    artifacts: [artifact],
  };
  onChangeContent.mockImplementation((content: UseCaseFlowContent) => {
    artifact = { ...artifact, content };
    project = { ...project, artifacts: project.artifacts.map((a) => (a.id === artifact.id ? artifact : a)) };
  });
});

afterEach(() => {
  runtime.unmount();
  vi.unstubAllGlobals();
});

describe('UseCaseFlowEditor v2 interactions', () => {
  it('updates description fields without mutating unrelated flow steps', () => {
    const tree = renderEditor();
    const nameInput = elements(tree).find((el) => el.props.id === 'ucf-field-name');
    expect(nameInput).toBeDefined();
    (nameInput!.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'Asentar Resultado' } });

    expect(onChangeContent).toHaveBeenCalledTimes(1);
    expect(artifact.content.description.useCaseName).toBe('Asentar Resultado');
    expect(artifact.content.basicFlow).toHaveLength(2);
  });

  it('adds a new alternative flow from the toolbar button', () => {
    const tree = renderEditor();
    const addButton = elements(tree).find((el) => el.props.label === 'Camino alternativo');
    expect(addButton).toBeDefined();
    (addButton!.props.onClick as () => void)();

    expect(artifact.content.alternativeFlows).toHaveLength(1);
    expect(artifact.content.alternativeFlows[0].number).toBe(1);
  });

  it('toggles preview mode cleanly without altering content', () => {
    const tree = renderEditor();
    const previewBtn = elements(tree).find((el) => String(el.props.className ?? '').includes('ucf-preview-toggle'));
    expect(previewBtn).toBeDefined();
    (previewBtn!.props.onClick as () => void)();
    const previewTree = renderEditor();
    const hasPrintSheet = elements(previewTree).some((el) => String(el.props.className ?? '').includes('ucf-preview-container'));
    expect(hasPrintSheet).toBe(true);
    expect(onChangeContent).not.toHaveBeenCalled();
  });
});
