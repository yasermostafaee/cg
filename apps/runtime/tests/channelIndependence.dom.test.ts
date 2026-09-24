// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultLayerAlias,
  StackClearAllChannel,
  StackOutChannel,
  StackRemoveAllChannel,
  StackSilenceAllLivePlatesChannel,
  StackSnapshotChannel,
  StackStopAllChannel,
  StackStopChannel,
  StackTakeChannel,
} from '@cg/shared-ipc';
import { StackItemStateSchema } from '@cg/shared-schema';
import { LayerRow } from '../src/renderer/features/layers/LayerRow.js';
import { resolveRowBinding } from '../src/renderer/features/layers/rowState.js';
import {
  channelIds,
  resolveSelectedChannel,
} from '../src/renderer/features/channels/channelList.js';
import {
  __resetChannelChoiceForTest,
  readChannelChoice,
  selectChannel,
} from '../src/renderer/features/channels/channelStore.js';
import { itemWith, slotWith, stubBridge, type RowStubs } from './support/layerRow.js';

/**
 * 🔴 **`RUNTIME-REDESIGN-01` PHASE 10 (`PROMPT.md` §10) — CHANNEL INDEPENDENCE, PROVED AT THE
 * LEVEL IT CAN BE PROVED AT, AND BOUNDED HONESTLY WHERE IT CANNOT.**
 *
 * §10 asks that *"an action on one channel does not disturb another's state"*. Before
 * asserting that, this file states what it is and is not able to observe, because a
 * verification that overstates its own evidence is worse than one that finds a gap.
 *
 * ── WHAT CANNOT BE PROVED HERE, AND WHERE IT IS PROVED NOW ──────────────────
 *
 * **Not at the wire — here.** When this file was written the bridge was single-channel in
 * exactly three places (`R-062`): five verbs took `z.void()`, there was no channel-discovery
 * call, and `fixedLayers` declared ONE bank on ONE channel, so no harness could put a second
 * channel's rows on a bridge and then fail to disturb them. ⭐ `MULTI-CHANNEL-01` closed all
 * three: the bridge holds one bank per declared channel, and channel independence is now
 * measured AT THE WIRE, with two declared channels on the fake AMCP, in
 * `tools/caspar-bridge/tests/multi-channel-banks.integration.test.ts` and
 * `channel-independence.integration.test.ts` — each negative with its positive control.
 *
 * **The app's mock** now carries every row-bound item's slot and keys its bindings by
 * `(channel, layer)` (`mockSlotParity.test.ts`), so two rows on two channels are expressible
 * offline too.
 *
 * ── WHAT IS PROVED HERE, AND AT WHICH LEVEL ─────────────────────────────────
 *
 *   **§1 — THE CONTRACT.** The ADDRESS of a per-row verb is the item, and the CHANNEL is a
 *   fact carried inside the item (`StackItemStateSchema.slot.channel`). Two rows on two
 *   channels are therefore two distinct addresses, and no per-row verb can name a channel
 *   at all — which is what makes the per-row verbs channel-agnostic rather than
 *   channel-blind. This is the contract half of owner answer A3.
 *
 *   **§2 — THE UI.** Pressing a verb on a row belonging to channel 1 dispatches THAT row's
 *   id and nothing else, and the row belonging to channel 2 is untouched — asserted on two
 *   rows sharing the SAME LAYER NUMBER on different channels, which is the discriminating
 *   case: a console keyed by layer alone would collide there and pass everywhere else.
 *
 *   **§3 — THE BOUND, ASSERTED SO IT CANNOT ROT.** The four housekeeping verbs take an
 *   OPTIONAL channel (`MULTI-CHANNEL-01` §2 B — this pin went red on purpose, and `R-062` was
 *   read first); `silenceAllLivePlates` still takes `z.void()` — owner answer A16, decided rather
 *   than deferred — and the per-channel silence is a separate verb beside it.
 *
 *   **§4 — THE SELECTION.** The console's only channel-scoped ACTION today is choosing which
 *   channel the per-channel surfaces report on: every per-channel surface is read-only
 *   (`ChannelSection` displays the raster and does not type it; `OutputsSection` reports).
 *   So the strongest true statement about a selection is that it is a pure scope change —
 *   `channelStore` holds a CHOICE and no channel state, and the resolution is a pure
 *   function of (list, choice, bank). A round trip through another channel returns the same
 *   answer.
 *
 * ⚠ **None of the four is a wire test, and this file does not dress one as one.** Together
 * they say: the addressing is channel-safe by construction, the surface honours it, the
 * housekeeping verbs can be scoped to a channel while PANIC deliberately cannot, and the
 * selection changes nothing that is held. The wire half lives in the bridge's suites (above).
 */

// React's own act() gate — without it every `act` here warns and the flush is not guaranteed.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface TwoRows {
  container: HTMLDivElement;
  stubs: RowStubs;
  unmount: () => Promise<void>;
}

/** Only ever used to NAME a row, through the one composition — never as a channel authority. */
const BANK_FOR_NAMES = { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 2 };

/**
 * The row carrying a given item — found by `data-item-id`, the row's own stable hook, NOT by
 * `data-layer`: both rows here declare layer 70, which is the whole point of the fixture.
 */
const rowEl = (container: HTMLElement, itemId: string): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`);
  if (el === null) throw new Error(`no row for ${itemId}`);
  return el;
};

const verb = (row: HTMLElement, label: string): HTMLButtonElement => {
  const btn = row.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (btn === null) throw new Error(`no ${label} verb on this row`);
  return btn;
};

/**
 * TWO ROWS, ONE TREE, ONE BRIDGE — and the same LAYER NUMBER on two channels.
 *
 * One tree because the row reads `window.cg` at press time: two separate renders would each
 * re-stub it, and the second stub would silently answer the first tree's presses. One bridge
 * because the whole question is whether one press reaches the other row.
 */
async function renderTwoRows(): Promise<TwoRows> {
  const stubs = stubBridge('live');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const rows = [
    { itemId: 'item-ch1', channel: 1, alias: 'CH1 ROW' },
    { itemId: 'item-ch2', channel: 2, alias: 'CH2 ROW' },
  ] as const;

  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        ...rows.map((r, i) => {
          const item = itemWith('on-air', {
            itemId: r.itemId,
            slot: { channel: r.channel, layer: 70, server: 'primary' },
          });
          const slot = slotWith({
            channel: r.channel,
            layer: 70,
            alias: r.alias,
            binding: { itemId: r.itemId, templateType: 'clock', templateId: 'tpl-1' },
          });
          return createElement(LayerRow, {
            key: r.itemId,
            slot,
            acceptsBank: 'high' as const,
            binding: resolveRowBinding(slot.binding, item, true),
            template: {
              templateId: 'tpl-1',
              name: 'Lower third',
              templateType: 'clock',
              fields: [],
            },
            displayPosition: i + 1,
            rehearsing: false,
            /*
              `B-203` / `cg/bank-shape` — the display name comes from the ONE composition, never
              from a hand-built `Layer ${n}`: the panel formatted its own once and bed 9 read
              `Layer 1`, the name of operator row 89. Caught here by the lint rule, on a test
              fixture, which is exactly where a second spelling would otherwise start.
            */
            defaultAlias: defaultLayerAlias(BANK_FOR_NAMES, 70),
            selected: false,
            emptiedAir: false,
            dirty: false,
            seatedPlates: [],
            onSelect: (): void => undefined,
            onUpdate: () => Promise.resolve({ accepted: true }),
          });
        }),
      ),
    );
  });

  return {
    container,
    stubs,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
  __resetChannelChoiceForTest();
});

// ───────────────────────── §1 — THE CONTRACT: THE ITEM IS THE ADDRESS ─────────────────────

describe('§1 — the address is the ITEM, and the CHANNEL is carried inside it', () => {
  it('a stack item on channel 2 keeps its own channel through the schema', () => {
    const parsed = StackItemStateSchema.parse({
      itemId: 'item-ch2',
      templateId: 'tpl-1',
      fields: {},
      status: 'on-air',
      pending: false,
      slot: { channel: 2, layer: 70, server: 'primary' },
    });
    // Non-empty FIRST, then identity (`PROMPT.md` §11): a schema that dropped `slot`
    // entirely would satisfy a bare `not.toBe(1)`.
    expect(parsed.slot, 'the item carries a slot at all').toBeDefined();
    expect(parsed.slot?.channel).toBe(2);
    // …and the layer number ALONE does not identify the row, which is the whole point.
    expect(parsed.slot?.layer).toBe(70);
  });

  it('🔴 no per-row verb can name a channel — the itemId is the only address it takes', () => {
    for (const channel of [StackTakeChannel, StackStopChannel, StackOutChannel]) {
      // It takes an item…
      expect(
        channel.request.safeParse({ itemId: 'item-ch1' }).success,
        `${channel.name} accepts an itemId`,
      ).toBe(true);
      // …and a channel is not an address it understands, so it cannot be pointed at one.
      expect(
        channel.request.safeParse({ channel: 2 }).success,
        `${channel.name} cannot be addressed by channel`,
      ).toBe(false);
      expect(channel.request.safeParse(undefined).success, `${channel.name} needs an item`).toBe(
        false,
      );
    }
  });
});

// ───────────────────────── §2 — THE UI: ONE PRESS REACHES ONE ROW ─────────────────────────

describe('§2 — a verb pressed on one channel’s row dispatches that row and nothing else', () => {
  it('🔴 two rows on the SAME LAYER NUMBER, different channels: STOP on channel 1 reaches only channel 1', async () => {
    const two = await renderTwoRows();
    cleanup = two.unmount;

    // The discriminating fixture really is what it claims to be — both rows exist, and they
    // share a layer number. Without this the test could pass by rendering one row.
    const ch1 = rowEl(two.container, 'item-ch1');
    const ch2 = rowEl(two.container, 'item-ch2');
    expect(ch1).not.toBe(ch2);
    const ch2Before = ch2.outerHTML;

    await act(async () => {
      verb(ch1, 'STOP').click();
    });

    expect(two.stubs.stop.mock.calls, 'exactly one dispatch').toHaveLength(1);
    /*
      The payload is the CHANNEL'S OWN REQUEST SHAPE — `{ itemId }`, the thing §1 proved
      cannot name a channel — so the row is not merely passing an id that happens to be
      unique: it is using the only address the contract offers.
    */
    expect(two.stubs.stop.mock.calls[0], 'and it names channel 1’s row').toEqual([
      { itemId: 'item-ch1' },
    ]);
    expect(
      StackStopChannel.request.safeParse(two.stubs.stop.mock.calls[0]?.[0]).success,
      'and what the row sent is what the channel accepts',
    ).toBe(true);
    // Nothing else went out on the shared bridge in the same press.
    expect(two.stubs.take).not.toHaveBeenCalled();
    expect(two.stubs.out).not.toHaveBeenCalled();
    expect(two.stubs.remove).not.toHaveBeenCalled();
    // …and channel 2's row is exactly as it was.
    expect(rowEl(two.container, 'item-ch2').outerHTML).toBe(ch2Before);
  });

  it('THE POSITIVE CONTROL — the same press on channel 2’s row names channel 2’s row', async () => {
    const two = await renderTwoRows();
    cleanup = two.unmount;

    await act(async () => {
      verb(rowEl(two.container, 'item-ch2'), 'STOP').click();
    });

    expect(two.stubs.stop.mock.calls).toEqual([[{ itemId: 'item-ch2' }]]);
  });
});

// ─────── §3 — THE BOUND: FOUR VERBS TAKE AN OPTIONAL CHANNEL, AND PANIC STILL CANNOT ───────

describe('§3 — the bulk verbs, after `R-062` gap 1 closed (`MULTI-CHANNEL-01` §2 B)', () => {
  /**
   * 🔴 THIS WAS A PIN, AND IT WENT RED ON PURPOSE. It asserted that all five bulk verbs took
   * `z.void()`, so that the day one of them gained a channel `R-062` would have to be read
   * first. `MULTI-CHANNEL-01` is that day, and it read it: the four HOUSEKEEPING verbs take an
   * OPTIONAL channel (a bare call keeps its meaning byte for byte), and PANIC does not — owner
   * answer A16, confirmed 2026-09-23: *the scope of a panic is not the caller's to choose*, and a
   * per-channel silence is a NEW verb beside it, never a parameter on it.
   *
   * The pin now holds that split in place, both halves: the four accept a channel, the fifth
   * still refuses one. Loosening PANIC here would redden the half below that stayed exactly as it
   * was.
   */
  const HOUSEKEEPING = [
    StackRemoveAllChannel,
    StackClearAllChannel,
    StackStopAllChannel,
    StackSnapshotChannel,
  ];

  it('🔴 each housekeeping verb takes a bare call AND `{ channel }` — the bare call keeps its meaning', () => {
    expect(HOUSEKEEPING, 'exactly the four housekeeping names').toHaveLength(4);
    for (const channel of HOUSEKEEPING) {
      expect(channel.request.safeParse(undefined).success, `${channel.name} takes nothing`).toBe(
        true,
      );
      expect(
        channel.request.safeParse({ channel: 2 }).success,
        `${channel.name} can be scoped to a channel`,
      ).toBe(true);
      // A channel that is not one is still refused — the scope is a channel NUMBER, nothing else.
      expect(channel.request.safeParse({ channel: 0 }).success, `${channel.name} channel 0`).toBe(
        false,
      );
    }
  });

  it('🔴 `silenceAllLivePlates` still takes `z.void()` — it cannot be scoped to a channel (A16)', () => {
    const channel = StackSilenceAllLivePlatesChannel;
    expect(channel.request.safeParse(undefined).success, `${channel.name} takes nothing`).toBe(
      true,
    );
    expect(
      channel.request.safeParse({ channel: 1 }).success,
      `${channel.name} cannot be scoped to a channel`,
    ).toBe(false);
  });

  it('THE POSITIVE CONTROL — a verb that DOES take an argument rejects `undefined`', () => {
    // Without this, `safeParse(undefined).success === true` above would be satisfied by a
    // schema that accepts literally anything.
    expect(StackTakeChannel.request.safeParse(undefined).success).toBe(false);
    expect(StackRemoveAllChannel.request.safeParse('anything').success).toBe(false);
  });
});

// ────────────────────── §4 — THE SELECTION IS A PURE SCOPE CHANGE ─────────────────────────

describe('§4 — choosing a channel changes what is REPORTED, never what is HELD', () => {
  const SETTINGS = {
    settings: [
      { channel: 1, raster: { width: 1920, height: 1080 } },
      { channel: 2, raster: { width: 1280, height: 720 } },
    ],
    observed: [],
  };
  const BANK = { channel: 1, low: { start: 50, count: 9 }, start: 70, count: 2 };

  it('the store holds a CHOICE and no channel state, so a selection cannot mutate a channel', () => {
    expect(readChannelChoice(), 'nothing chosen at rest').toBeNull();
    selectChannel(2);
    expect(readChannelChoice()).toBe(2);
    selectChannel(1);
    expect(readChannelChoice()).toBe(1);
    // The list is derived from what the bridge publishes and is unmoved by the choice —
    // a store that cached a resolution would have to be told the list changed.
    expect(channelIds(BANK, SETTINGS)).toEqual([1, 2]);
  });

  it('🔴 a round trip through another channel returns the SAME answer for the first', () => {
    const list = channelIds(BANK, SETTINGS);
    const before = resolveSelectedChannel(list, readChannelChoice(), BANK.channel);

    selectChannel(2);
    // POSITIVE CONTROL: the instrument really moves, or "unchanged" means nothing.
    expect(resolveSelectedChannel(list, readChannelChoice(), BANK.channel)).toBe(2);

    selectChannel(1);
    expect(resolveSelectedChannel(list, readChannelChoice(), BANK.channel)).toBe(before);
    // …and the settings the two channels carry are untouched by any of it.
    expect(SETTINGS.settings.map((s) => s.raster.width)).toEqual([1920, 1280]);
  });
});
