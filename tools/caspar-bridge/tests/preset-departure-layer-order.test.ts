import { describe, expect, it } from 'vitest';
import type { TemplateLiveSources, TemplateLook } from '@cg/shared-ipc';
import { presetDepartureLayerOrder } from '../src/preset-departure-layer-order.js';
import { resolveLookBindings } from '../src/live-look-bindings.js';

const rect = { x: 0, y: 0, width: 400, height: 300 };
const look = (id: string, plates: string[]): TemplateLook => ({
  id,
  name: id,
  entered: { mode: 'cut' },
  rects: Object.fromEntries(plates.map((plate) => [plate, rect])),
  transitionFrames: Object.fromEntries(
    plates.map((plate) => [
      plate,
      { frameKey: id + '/' + plate, elementId: plate, artworkId: plate },
    ]),
  ),
  transitionDepartureGroups: Object.fromEntries(plates.map((plate) => [id + '/' + plate, [plate]])),
});
function setup(
  looks = [look('one', ['a']), look('two', ['a', 'b']), look('three', ['a', 'b', 'c'])],
  alias = false,
) {
  const carrier: TemplateLiveSources = {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: ['a', 'b', 'c'].map((id) => ({
      elementId: 'el-' + id,
      sourceId: id,
      rect,
      dynamic: false,
    })),
    looks,
  };
  const bindings = resolveLookBindings({
    carrier,
    templateId: 'test',
    channel: 1,
    catalog: {
      sources: ['a', 'b', 'c'].map((id) => ({
        id,
        name: id,
        producer: { kind: 'ndi', source: id },
      })),
    },
    assignments: ['a', 'b', 'c'].map((id) => ({
      templateId: 'test',
      plateId: id,
      sourceId: alias && id === 'c' ? 'a' : id,
    })),
    argumentOf: ({ id }) => id,
  });
  const seated = [...bindings.seats.values()].map((seat) => ({
    seatId: seat.seatId,
    plateId: seat.frames[0]!.plateId,
    ...(seat.routeFrom === undefined ? {} : { sharedInputFrom: seat.routeFrom }),
  }));
  return { carrier, bindings, seated, extrasByPlate: new Map<string, string[]>() };
}

describe('fresh preset departure preferences', () => {
  it('puts larger-preset-only seats below retained seats by strict membership inclusion', () => {
    expect(presetDepartureLayerOrder(setup())).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
  });
  it('does not let generated Focus membership remove the normal-preset preference', () => {
    const input = setup([
      look('one', ['a']),
      look('two', ['a', 'b']),
      look('three', ['a', 'b', 'c']),
      look('focus-c', ['c']),
    ]);
    expect(
      presetDepartureLayerOrder({ ...input, normalLookIds: new Set(['one', 'two', 'three']) }),
    ).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
  });
  it('leaves templates without a supported single-plate departure group unchanged', () => {
    const input = setup();
    input.carrier.looks = input.carrier.looks?.map(
      ({ transitionDepartureGroups: _groups, ...plain }) => plain,
    );
    expect(presetDepartureLayerOrder(input)).toEqual([]);
  });
  it('ignores ambiguous source aliases and their copied seats', () => {
    expect(presetDepartureLayerOrder(setup(undefined, true))).toEqual([]);
  });
  it('excludes mask/reveal and fragment seats instead of guessing their group stacking', () => {
    const fragments = setup();
    fragments.extrasByPlate.set('c', ['c-fragment']);
    expect(presetDepartureLayerOrder(fragments)).toEqual([[1, 0]]);
    const masked = setup();
    const three = masked.carrier.looks?.find(({ id }) => id === 'three');
    if (three === undefined) throw new Error('Missing three');
    three.masks = { c: { mode: 'inside', rects: [{ x: 0, y: 0, width: 0.5, height: 1 }] } };
    expect(presetDepartureLayerOrder(masked)).toEqual([[1, 0]]);
    delete three.masks;
    three.reveals = { c: { targetSourceId: 'a', rect: { x: 0, y: 0, width: 0.5, height: 1 } } };
    expect(presetDepartureLayerOrder(masked)).toEqual([]);
  });
  it('does not impose order between unrelated or equally visible seats', () => {
    expect(presetDepartureLayerOrder(setup([look('one', ['a', 'b']), look('two', ['c'])]))).toEqual(
      [],
    );
  });
});
