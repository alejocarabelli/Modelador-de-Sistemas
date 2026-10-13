import { describe, expect, it } from 'vitest';
import type { SequenceDiagramContent, SequenceMessage } from '../types/diagram';
import { createSequenceFragment, createSequenceMessage } from './sequenceDiagram';
import { buildSequenceLayout } from './sequenceDiagramLayout';
import {
  buildSequenceKeyboardInsertionSlots,
  createInactiveSequenceKeyboardState,
  findCompatibleSequenceReturnCalls,
  findSequenceKeyboardLastTarget,
  findSequenceKeyboardParticipantByDigit,
  findSequenceKeyboardSlotNearPoint,
  getSequenceKeyboardParticipantNumbers,
  stepSequenceKeyboardSourceHistory,
  insertSequenceItemAtSlot,
  moveCircular,
  parseSequenceCreatedParticipant,
  parseSequenceKeyboardSignature,
  noPendingCallFeedback,
  resolveKeyboardTargetMove,
  sequenceKeyboardMessageTypes,
  sequenceKeyboardModeReducer,
} from './sequenceKeyboardMode';

const participant = (id: string, x: number) => ({
  id,
  kind: 'object' as const,
  name: id,
  classifierName: id.toUpperCase(),
  x,
});

const contentWith = (items: SequenceDiagramContent['items']): SequenceDiagramContent => ({
  version: 1,
  numbering: 'sequential',
  showActivations: true,
  participants: [participant('a', 120), participant('b', 350), participant('c', 580)],
  items,
  activations: [],
  problems: [],
  notes: [],
  canvas: { width: 900, height: 700 },
});

describe('sequence keyboard mode state', () => {
  it('enters, composes, edits and backs out one stage at a time', () => {
    let state = createInactiveSequenceKeyboardState();
    state = sequenceKeyboardModeReducer(state, { type: 'activate', slotIndex: 2, sourceId: 'a' });
    expect(state).toMatchObject({ stage: 'navigate', slotIndex: 2, sourceId: 'a', targetId: 'a' });

    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous' });
    state = sequenceKeyboardModeReducer(state, { type: 'set-route', targetId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing', text: 'buscar(id): Caso' });
    expect(state).toMatchObject({ stage: 'typing', targetId: 'b', text: 'buscar(id): Caso' });

    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('aim');
    expect(state.text).toBe('buscar(id): Caso');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('navigate');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state.stage).toBe('off');
  });

  it('keeps a call and its return as one committed cursor transition', () => {
    const state = sequenceKeyboardModeReducer(
      sequenceKeyboardModeReducer(
        sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' }),
        { type: 'begin', messageType: 'synchronous', targetId: 'b' },
      ),
      { type: 'committed', slotIndex: 1, sourceId: 'a' },
    );
    expect(state).toMatchObject({ stage: 'navigate', slotIndex: 1, sourceId: 'a', targetId: 'a' });
  });

  it('opens a participant command without entering message signature mode and cancels with Escape', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: '' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin-participant' });
    expect(state).toMatchObject({ stage: 'participant', text: '' });
    state = sequenceKeyboardModeReducer(state, { type: 'set-text', text: '  TramiteActual : Tramite  ' });
    expect(state.text).toBe('  TramiteActual : Tramite  ');
    state = sequenceKeyboardModeReducer(state, { type: 'back' });
    expect(state).toMatchObject({ stage: 'navigate', text: '' });
  });

  it('preserves the edited message when its type changes to a return', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 1, sourceId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'start-typing', text: 'buscar()', editId: 'message-1' });
    state = sequenceKeyboardModeReducer(state, {
      type: 'begin',
      messageType: 'return',
      targetId: 'a',
      returnCandidateIds: ['call-1'],
      preserveEdit: true,
    });
    expect(state).toMatchObject({
      stage: 'aim',
      messageType: 'return',
      editId: 'message-1',
      text: 'buscar()',
      returnCandidateIds: ['call-1'],
    });
  });

  it('moves the target with the arrows without ever changing the message type', () => {
    const order = ['a', 'b', 'c'];
    const mirrored = ['c', 'b', 'a'];
    for (const type of ['synchronous', 'asynchronous', 'destroy'] as const) {
      // The same gesture, in both orders of the lifelines, lands on the same neighbour.
      expect(resolveKeyboardTargetMove({ participantIds: order, targetId: 'b', messageType: type, direction: 1, returnCalls: [] })).toEqual({ targetId: 'c' });
      expect(resolveKeyboardTargetMove({ participantIds: order, targetId: 'b', messageType: type, direction: -1, returnCalls: [] })).toEqual({ targetId: 'a' });
      expect(resolveKeyboardTargetMove({ participantIds: mirrored, targetId: 'b', messageType: type, direction: 1, returnCalls: [] })).toEqual({ targetId: 'a' });
      expect(resolveKeyboardTargetMove({ participantIds: mirrored, targetId: 'b', messageType: type, direction: -1, returnCalls: [] })).toEqual({ targetId: 'c' });
    }
    // Wrapping around the ends keeps the type too: only the target changes.
    expect(resolveKeyboardTargetMove({ participantIds: order, targetId: 'c', messageType: 'synchronous', direction: 1, returnCalls: [] })).toEqual({ targetId: 'a' });
  });

  it('steps a return only through the participants with a call waiting, in either direction', () => {
    const calls = [{ id: 'call-b', sourceId: 'b' }, { id: 'call-c', sourceId: 'c' }, { id: 'call-c2', sourceId: 'c' }];
    // Source is `a`; callers are b (right) and c (further right): returns go to the right too.
    expect(resolveKeyboardTargetMove({ participantIds: ['a', 'b', 'c'], targetId: 'b', messageType: 'return', direction: 1, returnCalls: calls }))
      .toEqual({ targetId: 'c', returnCandidateIds: ['call-c', 'call-c2'], returnCandidateIndex: 0 });
    expect(resolveKeyboardTargetMove({ participantIds: ['a', 'b', 'c'], targetId: 'c', messageType: 'return', direction: -1, returnCalls: calls }))
      .toEqual({ targetId: 'b', returnCandidateIds: ['call-b'], returnCandidateIndex: 0 });
    // Mirrored lifelines: the same callers, the same answers.
    expect(resolveKeyboardTargetMove({ participantIds: ['c', 'b', 'a'], targetId: 'b', messageType: 'return', direction: -1, returnCalls: calls }))
      .toEqual({ targetId: 'c', returnCandidateIds: ['call-c', 'call-c2'], returnCandidateIndex: 0 });
    // A single caller keeps the arrows where they are, not on a nobody's lifeline.
    expect(resolveKeyboardTargetMove({ participantIds: ['a', 'b', 'c'], targetId: 'b', messageType: 'return', direction: 1, returnCalls: [calls[0]] }))
      .toEqual({ targetId: 'b', returnCandidateIds: ['call-b'], returnCandidateIndex: 0 });
    // Nothing to answer: say so instead of building an invalid return.
    expect(resolveKeyboardTargetMove({ participantIds: ['a', 'b', 'c'], targetId: 'a', messageType: 'return', direction: 1, returnCalls: [] }))
      .toEqual({ feedback: noPendingCallFeedback });
  });

  it('keeps the selected type through reducer route changes', () => {
    // In reducer: set-route can update messageType and returnCandidateIds atomically
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'b' });
    state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'b' });
    state = sequenceKeyboardModeReducer(state, {
      type: 'set-route',
      targetId: 'a',
      messageType: 'return',
      returnCandidateIds: ['call-1'],
    });
    expect(state).toMatchObject({
      stage: 'aim',
      targetId: 'a',
      messageType: 'return',
      returnCandidateIds: ['call-1'],
    });

    state = sequenceKeyboardModeReducer(state, {
      type: 'set-route',
      targetId: 'c',
      messageType: 'synchronous',
      returnCandidateIds: [],
    });
    expect(state).toMatchObject({
      stage: 'aim',
      targetId: 'c',
      messageType: 'synchronous',
      returnCandidateIds: [],
    });
  });
});

describe('sequence keyboard parsing', () => {
  it('parses a compact method signature without losing free text', () => {
    expect(parseSequenceKeyboardSignature('autenticarUsuario(credenciales): Sesion')).toEqual({
      name: 'autenticarUsuario',
      arguments: 'credenciales',
      returnType: 'Sesion',
    });
    expect(parseSequenceKeyboardSignature('texto libre / especial')).toEqual({
      name: 'texto libre / especial',
      arguments: '',
      returnType: '',
    });
    expect(parseSequenceKeyboardSignature('validar(calcular(a,b),c):boolean')).toEqual({
      name: 'validar',
      arguments: 'calcular(a,b),c',
      returnType: 'boolean',
    });
  });

  it('parses the compact participant notation used by create', () => {
    expect(parseSequenceCreatedParticipant('pedido : Pedido')).toEqual({ name: 'pedido', classifierName: 'Pedido' });
    expect(parseSequenceCreatedParticipant('Pedido')).toEqual({ name: '', classifierName: 'Pedido' });
  });
});

describe('sequence keyboard insertion and returns', () => {
  it('exposes root and empty operand slots', () => {
    const fragment = createSequenceFragment('alt');
    const content = contentWith([fragment]);
    const slots = buildSequenceKeyboardInsertionSlots(content, buildSequenceLayout(content));
    expect(slots.some((slot) => slot.containerId === 'root')).toBe(true);
    fragment.operands.forEach((operand) => {
      expect(slots.some((slot) => slot.containerId === operand.id && slot.itemIds.length === 0)).toBe(true);
    });
  });

  it('finds only calls that remain open in the selected branch', () => {
    const call = createSequenceMessage('synchronous', 'a', 'b');
    call.name = 'abrir';
    const content = contentWith([call]);
    const layout = buildSequenceLayout(content);
    const slots = buildSequenceKeyboardInsertionSlots(content, layout);
    const lastSlot = slots.find((slot) => slot.containerId === 'root' && slot.index === 1)!;
    expect(findCompatibleSequenceReturnCalls(content, layout, lastSlot, 'b').map((message) => message.id)).toEqual([call.id]);

    const reply = createSequenceMessage('return', 'b', 'a');
    reply.replyToMessageId = call.id;
    const closedContent = contentWith([call, reply] as SequenceMessage[]);
    const closedLayout = buildSequenceLayout(closedContent);
    const closedSlot = buildSequenceKeyboardInsertionSlots(closedContent, closedLayout)
      .find((slot) => slot.containerId === 'root' && slot.index === 2)!;
    expect(findCompatibleSequenceReturnCalls(closedContent, closedLayout, closedSlot, 'b')).toEqual([]);
  });
});

describe('sequence keyboard message type navigation and confirmation', () => {
  it('offers one generic message choice plus return, create and destroy', () => {
    expect(sequenceKeyboardMessageTypes).toEqual([
      'synchronous',
      'return',
      'create',
      'destroy',
    ]);

    let current = sequenceKeyboardMessageTypes[0];
    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('return');

    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('create');

    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('destroy');
    current = moveCircular(sequenceKeyboardMessageTypes, current, 1)!;
    expect(current).toBe('synchronous');

    const prevFromCreate = moveCircular(sequenceKeyboardMessageTypes, 'create', -1);
    expect(prevFromCreate).toBe('return');

    const prevFromSync = moveCircular(sequenceKeyboardMessageTypes, 'synchronous', -1);
    expect(prevFromSync).toBe('destroy');
  });

  it('advances text-bearing message types from aim to typing', () => {
    for (const type of sequenceKeyboardMessageTypes.filter((candidate) => candidate !== 'return')) {
      let state = createInactiveSequenceKeyboardState();
      state = sequenceKeyboardModeReducer(state, { type: 'activate', slotIndex: 0, sourceId: 'a' });
      state = sequenceKeyboardModeReducer(state, { type: 'begin', messageType: type, targetId: 'b' });
      expect(state.stage).toBe('aim');
      expect(state.messageType).toBe(type);

      // Confirming with Enter transitions to typing
      state = sequenceKeyboardModeReducer(state, { type: 'start-typing' });
      expect(state.stage).toBe('typing');
      expect(state.messageType).toBe(type);

      // Esc returns back to aim
      state = sequenceKeyboardModeReducer(state, { type: 'back' });
      expect(state.stage).toBe('aim');
      expect(state.messageType).toBe(type);
    }
  });

  it('keeps creation and editing of textless returns in aim without retaining text', () => {
    let creation = createInactiveSequenceKeyboardState();
    creation = sequenceKeyboardModeReducer(creation, { type: 'activate', slotIndex: 0, sourceId: 'b' });
    creation = sequenceKeyboardModeReducer(creation, {
      type: 'begin', messageType: 'return', targetId: 'a', returnCandidateIds: ['call'],
    });
    creation = sequenceKeyboardModeReducer(creation, { type: 'start-typing', text: 'texto descartable' });
    expect(creation).toMatchObject({ stage: 'aim', messageType: 'return', text: '' });

    const editing = sequenceKeyboardModeReducer(creation, {
      type: 'start-typing', text: 'resultado legado', editId: 'return-1',
    });
    expect(editing).toMatchObject({ stage: 'aim', messageType: 'return', text: '', editId: 'return-1' });
  });
});

describe('keyboard insertion lands where the cursor is', () => {
  const call = (id: string, sourceId: string, targetId: string) => ({ ...createSequenceMessage('synchronous', sourceId, targetId), id });
  const locate = (items: SequenceDiagramContent['items'], id: string, container = 'root'): string | undefined => {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.id === id) return `${container}:${index}`;
      if (item.kind === 'fragment') {
        for (const operand of item.operands) {
          const found = locate(operand.items, id, operand.id);
          if (found) return found;
        }
      }
    }
    return undefined;
  };

  const withFragment = (spacing: 'compact' | 'normal', reverse: boolean): SequenceDiagramContent => {
    const first = call('m1', 'a', 'b');
    const inside1 = call('m2', 'b', 'c');
    const inside2 = call('m3', 'c', 'b');
    const fragment = createSequenceFragment('alt');
    fragment.operands = [
      { id: 'o1', guard: 'si', items: [inside1, inside2] },
      { id: 'o2', guard: '', items: [] },
    ];
    const content = { ...contentWith([first, fragment, call('m4', 'b', 'c')]), spacing };
    return reverse
      ? { ...content, participants: [...content.participants].reverse() }
      : content;
  };

  it.each([
    ['compact', false], ['compact', true], ['normal', false], ['normal', true],
  ] as const)('puts a message in the branch the cursor is in (%s, mirrored: %s)', (spacing, mirrored) => {
    const content = withFragment(spacing, mirrored);
    const layout = buildSequenceLayout(content);
    const slots = buildSequenceKeyboardInsertionSlots(content, layout);
    for (const slot of slots) {
      // `a` is outside what the branch's own messages span: the cursor still decides.
      const probe = call('probe', 'a', 'b');
      const items = insertSequenceItemAtSlot(content.items, probe, slot);
      expect(locate(items, 'probe')).toBe(`${slot.containerId}:${slot.index}`);
    }
  });

  it('places compact cursor slots between the neighbouring messages, not on top of them', () => {
    const content = withFragment('compact', false);
    const layout = buildSequenceLayout(content);
    const rootSlots = buildSequenceKeyboardInsertionSlots(content, layout).filter((slot) => slot.containerId === 'o1');
    const [before, between] = rootSlots;
    const m2 = layout.messageLayouts.get('m2')!;
    const m3 = layout.messageLayouts.get('m3')!;
    expect(before.y).toBeLessThan(m2.y);
    expect(between.y).toBeGreaterThan(m2.y);
    expect(between.y).toBeLessThan(m3.y);
    // The slot is the boundary between the two real rows.
    expect(between.y).toBe(Math.round(m2.top + m2.height));
  });
});

describe('message type is not remembered between creations', () => {
  it('starts every new message from the default type after a previous one was committed', () => {
    let state = sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'set-message-type', messageType: 'create' });
    state = sequenceKeyboardModeReducer(state, { type: 'committed', slotIndex: 1, sourceId: 'a' });
    expect(state.messageType).toBe('synchronous');
    state = sequenceKeyboardModeReducer(state, { type: 'deactivate' });
    state = sequenceKeyboardModeReducer(state, { type: 'activate', slotIndex: 0, sourceId: 'a' });
    expect(state.messageType).toBe('synchronous');
  });
});

describe('keyboard mode in long diagrams', () => {
  const active = () => sequenceKeyboardModeReducer(createInactiveSequenceKeyboardState(), { type: 'activate', slotIndex: 0, sourceId: 'a' });

  it('remembers each jump of the origin so ⇧← goes back and ⇧→ redoes', () => {
    let state = sequenceKeyboardModeReducer(active(), { type: 'navigate', sourceId: 'c', history: 'jump' });
    state = sequenceKeyboardModeReducer(state, { type: 'navigate', sourceId: 'e', history: 'jump' });
    expect(state.sourceBack).toEqual(['a', 'c']);
    const back = stepSequenceKeyboardSourceHistory(state, -1, ['a', 'b', 'c', 'd', 'e'])!;
    expect(back.sourceId).toBe('c');
    state = sequenceKeyboardModeReducer(state, { type: 'source-history', ...back });
    const again = stepSequenceKeyboardSourceHistory(state, -1, ['a', 'b', 'c', 'd', 'e'])!;
    expect(again.sourceId).toBe('a');
    state = sequenceKeyboardModeReducer(state, { type: 'source-history', ...again });
    expect(stepSequenceKeyboardSourceHistory(state, -1, ['a', 'c', 'e'])).toBeUndefined();
    const redo = stepSequenceKeyboardSourceHistory(state, 1, ['a', 'b', 'c', 'd', 'e'])!;
    expect(redo.sourceId).toBe('c');
  });

  it('counts a run of neighbour steps as one move back', () => {
    let state = active();
    for (const id of ['b', 'c', 'd']) state = sequenceKeyboardModeReducer(state, { type: 'navigate', sourceId: id, history: 'step' });
    expect(state.sourceBack).toEqual(['a']);
    expect(stepSequenceKeyboardSourceHistory(state, -1, ['a', 'b', 'c', 'd'])?.sourceId).toBe('a');
  });

  it('skips lines that are not alive at the cursor', () => {
    let state = sequenceKeyboardModeReducer(active(), { type: 'navigate', sourceId: 'b', history: 'jump' });
    state = sequenceKeyboardModeReducer(state, { type: 'navigate', sourceId: 'c', history: 'jump' });
    expect(stepSequenceKeyboardSourceHistory(state, -1, ['a', 'c'])?.sourceId).toBe('a');
  });

  it('keeps the trail and the last destination across saved messages', () => {
    let state = sequenceKeyboardModeReducer(active(), { type: 'begin', messageType: 'synchronous', targetId: 'a' });
    state = sequenceKeyboardModeReducer(state, { type: 'committed', slotIndex: 1, sourceId: 'c', usedTarget: { sourceId: 'a', targetId: 'c' } });
    expect(state).toMatchObject({ stage: 'navigate', sourceId: 'c', sourceBack: ['a'], lastTargets: { a: 'c' }, lastTarget: 'c' });
    // Saving with ⌥ Enter keeps the origin and adds nothing to the trail.
    state = sequenceKeyboardModeReducer(state, { type: 'committed', slotIndex: 2, sourceId: 'c', usedTarget: { sourceId: 'c', targetId: 'd' } });
    expect(state.sourceBack).toEqual(['a']);
    expect(state.lastTargets).toEqual({ a: 'c', c: 'd' });
  });

  it('starts the destination as before and ⇧→ finds the last one used', () => {
    const state = { ...active(), lastTargets: { a: 'd' }, lastTarget: 'e' };
    expect(sequenceKeyboardModeReducer(state, { type: 'begin', messageType: 'synchronous', targetId: 'a' }).targetId).toBe('a');
    expect(findSequenceKeyboardLastTarget(state, ['a', 'd', 'e'])).toBe('d');
    expect(findSequenceKeyboardLastTarget({ ...state, sourceId: 'b' }, ['a', 'd', 'e'])).toBe('e');
    expect(findSequenceKeyboardLastTarget(state, ['a', 'e'])).toBe('e');
    expect(findSequenceKeyboardLastTarget({ ...state, lastTargets: {}, lastTarget: undefined }, ['a'])).toBeUndefined();
  });

  it('numbers lifelines 1 to 9 and 0 from left to right', () => {
    const lifelines = Array.from({ length: 11 }, (_, index) => ({ id: `p${index}`, x: 1000 - index * 50 }));
    const numbers = getSequenceKeyboardParticipantNumbers(lifelines);
    expect(numbers.get('p10')).toBe('1');
    expect(numbers.get('p2')).toBe('9');
    expect(numbers.get('p1')).toBe('0');
    expect(numbers.has('p0')).toBe(false);
    expect(findSequenceKeyboardParticipantByDigit(lifelines, '2')).toBe('p9');
  });

  it('places the cursor at the slot under a point, preferring the branch that contains it', () => {
    const slots = [
      { id: 'root:0', containerId: 'root', containerName: 'r', index: 0, y: 100, itemIds: [] },
      { id: 'op:0', containerId: 'op', containerName: 'o', index: 0, y: 205, bounds: { x: 300, width: 200, top: 180, bottom: 240 }, itemIds: [] },
      { id: 'root:1', containerId: 'root', containerName: 'r', index: 1, y: 260, itemIds: [] },
    ];
    expect(findSequenceKeyboardSlotNearPoint(slots, { x: 400, y: 210 })).toBe(1);
    expect(findSequenceKeyboardSlotNearPoint(slots, { x: 50, y: 210 })).toBe(2);
    expect(findSequenceKeyboardSlotNearPoint(slots, { x: 50, y: 90 })).toBe(0);
  });
});
