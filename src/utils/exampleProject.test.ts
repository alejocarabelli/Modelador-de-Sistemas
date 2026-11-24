import { describe, expect, it } from 'vitest';
import demo from '../../fixtures/demo-gestion-tramites.json';
import type { DesignArtifact, DiagramProject } from '../types/diagram';
import { EXAMPLE_PROJECT_NAME, createExampleProject, findExampleProject } from './exampleProject';
import { reviewClassDiagram } from './classDiagramReview';
import { buildProjectSymbolIndex } from './projectSymbolIndex';
import { reviewUseCaseFlow } from './useCaseFlowReview';
import { analyzeSequenceDiagramSemantics, collectSequenceReviewProblems } from './sequenceDiagram';
import { computeFlowNumbering } from './useCaseFlowModel';

const artifactOfType = <T extends DesignArtifact['type']>(project: DiagramProject, type: T) =>
  project.artifacts.find((artifact): artifact is Extract<DesignArtifact, { type: T }> => artifact.type === type)!;

describe('createExampleProject', () => {
  it('has no review warnings in any artifact', () => {
    const project = createExampleProject();
    const existingArtifactIds = new Set(project.artifacts.map((artifact) => artifact.id));

    for (const artifact of project.artifacts) {
      switch (artifact.type) {
        case 'class-diagram':
        case 'class-sequence-diagram':
          expect(reviewClassDiagram(artifact.content), artifact.name).toEqual([]);
          break;
        case 'use-case-flow': {
          const model = project.artifacts.find((candidate) => candidate.type === 'class-diagram'
            && candidate.id === artifact.content.classDiagramArtifactId);
          expect(model?.type).toBe('class-diagram');
          const symbols = buildProjectSymbolIndex(model?.type === 'class-diagram' ? model : undefined);
          expect(reviewUseCaseFlow(artifact.content, symbols), artifact.name).toEqual([]);
          break;
        }
        case 'sequence-diagram': {
          const semantics = analyzeSequenceDiagramSemantics(artifact.content, { existingArtifactIds });
          expect(collectSequenceReviewProblems(artifact.content, semantics.problems), artifact.name).toEqual([]);
          break;
        }
        // The use case model has no review panel or review function.
        case 'use-case-model':
          break;
      }
    }
  });

  it('branches at the system search and continues with consistent numbering', () => {
    const content = artifactOfType(createExampleProject(), 'use-case-flow').content;
    const alternative = content.alternativeFlows[0];
    const numbering = computeFlowNumbering(content);

    expect(numbering.branchOriginByFlowId.get(alternative.id)).toMatchObject({ stepNumber: '2.1', flowId: 'basic', mainNumber: 2 });
    expect(numbering.firstStepNumberByFlowId.get(alternative.id)).toBe(3);
    expect(numbering.stepNumberById.get(alternative.steps[0].id)).toBe('3');
  });

  it('copies the five artifacts of the fixture under the example name', () => {
    const project = createExampleProject();

    expect(project.name).toBe(EXAMPLE_PROJECT_NAME);
    expect(project.artifacts.map((artifact) => artifact.type).sort())
      .toEqual(demo.artifacts.map((artifact) => artifact.type).sort());
  });

  it('gives the project and every artifact new ids, not the fixture ids', () => {
    const project = createExampleProject();
    const fixtureIds = new Set([demo.id, ...demo.artifacts.map((artifact) => artifact.id)]);

    expect(fixtureIds.has(project.id)).toBe(false);
    project.artifacts.forEach((artifact) => expect(fixtureIds.has(artifact.id)).toBe(false));
    expect(new Set(project.artifacts.map((artifact) => artifact.id)).size).toBe(5);
    expect(project.artifacts.map((artifact) => artifact.id)).toContain(project.activeArtifactId);
  });

  it('creates a different copy each time', () => {
    const first = createExampleProject();
    const second = createExampleProject();

    expect(second.id).not.toBe(first.id);
    expect(second.artifacts.some((artifact) => first.artifacts.some((other) => other.id === artifact.id))).toBe(false);
  });

  it('points the links between artifacts at the copied artifacts', () => {
    const project = createExampleProject();
    const classDiagram = artifactOfType(project, 'class-diagram');
    const classSequence = artifactOfType(project, 'class-sequence-diagram');
    const flow = artifactOfType(project, 'use-case-flow');
    const sequence = artifactOfType(project, 'sequence-diagram');

    expect(flow.content.classDiagramArtifactId).toBe(classDiagram.id);
    expect(classSequence.content.sourceClassDiagramArtifactId).toBe(classDiagram.id);
    expect(classSequence.content.linkedSequenceDiagramIds).toEqual([sequence.id]);
    // The fixture stores the sequence's model link as "cd"; it is normalized to the sequence model.
    expect(sequence.content.classDiagramArtifactId).toBe(classSequence.id);
    expect(sequence.content.flowArtifactId).toBe(flow.id);
  });
});

describe('findExampleProject', () => {
  it('finds the example copy by name and ignores other projects', () => {
    const example = createExampleProject();
    const other = { ...createExampleProject(), name: 'Otro proyecto' };

    expect(findExampleProject([other, example])).toBe(example);
    expect(findExampleProject([other])).toBeUndefined();
  });
});
