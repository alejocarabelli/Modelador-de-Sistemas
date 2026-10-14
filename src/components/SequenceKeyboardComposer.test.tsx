import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SequenceKeyboardComposer } from './SequenceKeyboardComposer';
import {
  createInactiveSequenceKeyboardState,
  sequenceKeyboardMessageTypes,
  sequenceKeyboardModeReducer,
} from '../utils/sequenceKeyboardMode';

const onSelectType = vi.fn();
const onMoveTarget = vi.fn();

const renderComposer = (state: ReturnType<typeof createInactiveSequenceKeyboardState>, extra: { returnAvailable?: boolean } = {}): string => renderToString(
  <SequenceKeyboardComposer
    state={state}
    context="Secuencia principal"
    sourceName="Sin participantes"
    targetName="Elegí un destino"
    position={{ left: '120px', top: '80px' }}
    methodOptions={[]}
    selectedCount={0}
    onTextChange={vi.fn()}
    onGuardChange={vi.fn()}
    onSubmit={vi.fn()}
    onBack={vi.fn()}
    onMethodSelect={vi.fn()}
    onAddParticipant={vi.fn()}
    onSelectType={onSelectType}
    onMoveTarget={onMoveTarget}
    {...extra}
  />,
);

describe('SequenceKeyboardComposer participant flow', () => {
  it('exposes the participant command from the empty navigation state', () => {
    const state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: '' },
    );
    const html = renderComposer(state);

    expect(html).toContain('participante');
    expect(html).toContain('<kbd>P</kbd>');
    expect(html).toContain('<kbd>F</kbd>');
    expect(html).toContain('fragmento');
  });

  it('renders the shared textual participant input and cancellation hint', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: '' },
    );
    state = sequenceKeyboardModeReducer(state, { type: 'begin-participant' });
    const html = renderComposer(state);

    expect(html).toContain('Agregar participante');
    expect(html).toContain('instancia:Clase o :Clase');
    expect(html).toContain('Esc cancelar');
  });

  it('does not render a signature input when creating a return by keyboard', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'b' },
    );
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call-1'],
    });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing' });

    const html = renderComposer(state);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('resultado / valor');
    expect(html).toContain('Retorno');
  });

  it('shows only the four keyboard choices and highlights return without a create ghost state', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'b' },
    );
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call-1'],
    });

    const html = renderComposer(state);
    expect(html).toContain('mensaje');
    expect(html).toContain('retorno');
    expect(html).toContain('crear');
    expect(html).toContain('destruir');
    expect(html).not.toContain('Síncrono');
    expect(html).not.toContain('Asíncrono');
    expect(html).toContain('aria-selected="true" class="active" data-message-type="return"');
    expect(html).not.toContain('aria-selected="true" class="active" data-message-type="create"');
  });

  it('keeps the route label and the single highlighted choice synchronized for every type', () => {
    for (const messageType of sequenceKeyboardMessageTypes) {
      let state = sequenceKeyboardModeReducer(
        createInactiveSequenceKeyboardState(),
        { type: 'activate', slotIndex: 0, sourceId: 'a' },
      );
      state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType, targetId: 'b' });

      const html = renderComposer(state);
      expect(html).toContain(`class="sequence-keyboard-dest" data-message-type="${messageType}"`);
      expect(html).toContain(`aria-selected="true" class="active" data-message-type="${messageType}"`);
      expect((html.match(/aria-selected="true"/g) ?? [])).toHaveLength(1);
    }
  });

  it('presents a legacy asynchronous message as the single generic message choice', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'a' },
    );
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'asynchronous', targetId: 'b' });

    const html = renderComposer(state);
    expect(html).toContain('class="sequence-keyboard-dest" data-message-type="synchronous"');
    expect(html).toContain('aria-selected="true" class="active" data-message-type="synchronous"');
    expect((html.match(/aria-selected="true"/g) ?? [])).toHaveLength(1);
  });

  it('does not render a signature input when editing an existing return by keyboard', () => {
    let state = sequenceKeyboardModeReducer(
      createInactiveSequenceKeyboardState(),
      { type: 'activate', slotIndex: 0, sourceId: 'b' },
    );
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call-1'],
    });
    state = sequenceKeyboardModeReducer(state, {
      type: 'start-typing', text: 'resultado legado', editId: 'return-1',
    });

    const html = renderComposer(state);
    expect(state.editId).toBe('return-1');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('resultado legado');
    expect(html).toContain('Retorno');
  });
});

describe('message type pills', () => {
  it('marks exactly the current type and disables a return with nothing to return', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'create' });
    const html = renderComposer(state, { returnAvailable: false });
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*data-message-type="create"[^>]*aria-selected="true"|<button[^>]*aria-selected="true"[^>]*data-message-type="create"/);
    expect(html).toMatch(/<button[^>]*data-message-type="return"[^>]*disabled/);
    expect(html).toContain('No hay llamada pendiente para retornar.');
  });
});

describe('aim stage panel', () => {
  const aim = () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'b' });
    return state;
  };

  it('shows each type with its letter and the full destination, with no vertical-arrow help', () => {
    const html = renderComposer(aim());
    for (const letter of ['S', 'R', 'C', 'D']) expect(html).toContain(`<kbd class="sequence-keyboard-key">${letter}</kbd>`);
    expect(html).toContain('Destino');
    expect(html).not.toContain('↑');
  });

  it('offers the arrow keys as buttons for the destination', () => {
    const html = renderComposer(aim());
    expect(html).toMatch(/<button[^>]*aria-label="Destino anterior"/);
    expect(html).toMatch(/<button[^>]*aria-label="Destino siguiente"/);
  });
});
