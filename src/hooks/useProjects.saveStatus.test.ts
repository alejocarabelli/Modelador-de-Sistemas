import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, runtime, stubBrowser } from './testHookHarness';

// Counts every state change requested with 'saving' (the save indicator), through the hook runtime.
const requested = vi.hoisted(() => ({ saving: 0 }));
vi.mock('react', async () => {
  const api = (await import('./testHookHarness')).runtime.api;
  return {
    ...api,
    useState: <T,>(initial: T | (() => T)) => {
      const [value, set] = api.useState(initial);
      return [value, (update: T | ((current: T) => T)) => {
        if (update === ('saving' as unknown as T)) requested.saving += 1;
        set(update);
      }] as const;
    },
  };
});
const { useProjects } = await import('./useProjects');
const hookUnderTest = useProjects;
const renderHook = () => { runtime.begin(); return hookUnderTest(); };

beforeEach(() => {
  vi.useFakeTimers();
  runtime.reset();
  requested.saving = 0;
  stubBrowser();
  vi.stubGlobal('localStorage', createMemoryStorage());
});
afterEach(() => { runtime.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('indicador de guardado', () => {
  it('no pide "guardando" otra vez en cada pulsación mientras ya está guardando', () => {
    renderHook().createProject('Sistema', 'use-case-flow');
    vi.advanceTimersByTime(1000);
    renderHook();
    requested.saving = 0;

    // Fast typing: several edits before the 250 ms save fires.
    for (let edit = 0; edit < 10; edit += 1) {
      const hook = renderHook();
      const project = hook.activeProject!;
      const content = project.artifacts[0].content as unknown as { description: Record<string, unknown> };
      hook.updateProjectArtifactContent(project.id, project.artifacts[0].id, {
        ...content,
        description: { ...content.description, useCaseName: `Caso ${edit}` },
      } as never);
      vi.advanceTimersByTime(2);
    }
    renderHook();

    expect(renderHook().saveStatus).toBe('saving');
    expect(requested.saving).toBeLessThanOrEqual(1);

    vi.advanceTimersByTime(1000);
    expect(renderHook().saveStatus).toBe('saved');
  });
});
