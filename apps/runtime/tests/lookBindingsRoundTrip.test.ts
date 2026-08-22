import { afterEach, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  __resetDraftsForTest,
  effectiveLookBinding,
  stageLookBinding,
} from '../src/renderer/features/inspector/draftStore.js';

/**
 * 🔴 **SESSION BO §3c — THE ROUND TRIP: panel → bridge → PUBLISHED STATE → panel.**
 *
 * The owner: _"Pressing UPDATE sends the values back to template default."_
 *
 * ── WHY THIS FILE EXISTS AT ALL, WHICH IS THE REAL FINDING ──────────────────
 *
 * Every piece of this path was already tested, and the defect still shipped:
 *
 *   - the PANEL is tested in jsdom against a HAND-BUILT `item`, so it never sees what the
 *     bridge actually publishes;
 *   - the BRIDGE is tested at the AMCP wire and on `stackSnapshot()`, so it never sees what
 *     the panel does with the answer;
 *   - and nothing at all ran the two together.
 *
 * That seam has now produced three defects in three sessions — `createRuntimeBridge`'s mock
 * shim silently dropping Stage 1's `lookId`, `StackRetentionStore.toRetained` silently
 * dropping the whole map, and this. **Each was invisible to both suites and obvious to the
 * first person who pressed the button.** So the test is written at the seam deliberately:
 * it stages through the real draft store, applies through the real `applyDraft`, crosses a
 * real bridge, and reads the value back through the same `effectiveLookBinding` the panel
 * renders from.
 *
 * ⚠ It uses `MockRuntime` rather than `CasparRuntime` because the seam under test is the
 * RENDERER's, and the mock is what the SPA is developed and E2E'd against
 * (`mock-bridge-parity.test.ts` is what keeps the two honest about each other). A bridge
 * that publishes correctly while the renderer loses the value is exactly the failure this
 * catches, and it catches it on either backend.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'debate',
  templateType: 'debate',
  fields: [{ id: 'title', label: 'Title', type: 'text' }],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'e1',
        sourceId: 'l-1',
        rect: { x: 0, y: 0, width: 960, height: 540 },
        dynamic: false,
      },
      {
        elementId: 'e2',
        sourceId: 'l-2',
        rect: { x: 960, y: 0, width: 960, height: 540 },
        dynamic: false,
      },
    ],
    looks: [
      {
        id: 'two',
        name: '2-box',
        entered: { mode: 'cut' },
        rects: {
          'l-1': { x: 0, y: 0, width: 960, height: 540 },
          'l-2': { x: 960, y: 0, width: 960, height: 540 },
        },
      },
      {
        id: 'solo',
        name: 'Solo',
        entered: { mode: 'cut' },
        rects: { 'l-1': { x: 0, y: 0, width: 1920, height: 1080 } },
      },
    ],
    defaultLookId: 'two',
  },
} as unknown as TemplateInfo;

afterEach(() => {
  __resetDraftsForTest();
  vi.unstubAllGlobals();
});

/**
 * A mock-backed bridge on `window.cg`, plus whatever it has PUBLISHED.
 *
 * 🔴 Everything below goes through the BRIDGE CONTRACT, never through the MockRuntime
 * behind it — including the subscription. That is the point: the renderer only ever sees
 * this surface, so a value lost between the runtime and the contract (which is exactly what
 * `createRuntimeBridge`’s shim did to Stage 1’s `lookId`) is invisible to any test that
 * reaches past it.
 */
function boot(): { cg: RuntimeBridge; latest: () => readonly StackItemState[] } {
  const cg = createMockBridge();
  let latest: readonly StackItemState[] = [];
  cg.stack.onStateChanged((snapshot) => {
    latest = snapshot;
  });
  vi.stubGlobal('window', { cg });
  return { cg, latest: () => latest };
}
const itemOf = (items: readonly StackItemState[], id = 'item-1'): StackItemState => {
  const found = items.find((i) => i.itemId === id);
  if (found === undefined) throw new Error(`no published item ${id}`);
  return found;
};

it('🔴 §3c — a per-look input SURVIVES the UPDATE: the panel reads back what it sent', async () => {
  const { cg, latest } = boot();
  await cg.templates.import({
    template: TEMPLATE,
    html: '<!doctype html><html><body>debate</body></html>',
  });
  await cg.stack.load({ itemId: 'item-1', templateId: 'debate', fields: { title: 'before' } });

  // 1. THE PANEL stages an edit, through the real store.
  stageLookBinding('item-1', 'solo', 'l-1', 'studio-3');
  const staged = itemOf(latest());
  expect(
    effectiveLookBinding('item-1', 'solo', 'l-1', staged.lookSourceOverride?.solo?.['l-1']),
    'the draft renders before it is applied',
  ).toBe('studio-3');

  // 2. UPDATE — the real apply path, across a real bridge.
  const res = await applyDraft(staged);
  expect(res.accepted).toBe(true);

  /*
    3. 🔴 THE ASSERTION THE OWNER'S REPORT IS. The drafts have cleared on success, so what
       the control renders now comes entirely from the PUBLISHED state. If the map did not
       survive the round trip, `applied` is undefined and every row falls back to
       `PLATE_UNASSIGNED` — which the panel draws as "— template default —", exactly the
       reported symptom.
  */
  const published = itemOf(latest());
  expect(published.lookSourceOverride, 'the published item carries the map').toEqual({
    solo: { 'l-1': 'studio-3' },
  });
  expect(
    effectiveLookBinding('item-1', 'solo', 'l-1', published.lookSourceOverride?.solo?.['l-1']),
    'and the panel reads the applied value, not the default',
  ).toBe('studio-3');
});

it('§3c — a SECOND update does not lose the first look bindings', async () => {
  /*
    The complete-map contract, exercised rather than assumed: `lookBindings` REPLACES, so an
    update that stages only `two` must still send `solo`'s applied value or it would clear
    it. `buildLookBindingsPayload` starting from the applied map is what makes that true, and
    a delta payload would pass the test above and fail this one.
  */
  const { cg, latest } = boot();
  await cg.templates.import({
    template: TEMPLATE,
    html: '<!doctype html><html><body>debate</body></html>',
  });
  await cg.stack.load({ itemId: 'item-1', templateId: 'debate', fields: {} });

  stageLookBinding('item-1', 'solo', 'l-1', 'studio-3');
  expect((await applyDraft(itemOf(latest()))).accepted).toBe(true);

  stageLookBinding('item-1', 'two', 'l-2', 'studio-4');
  expect((await applyDraft(itemOf(latest()))).accepted).toBe(true);

  expect(itemOf(latest()).lookSourceOverride).toEqual({
    solo: { 'l-1': 'studio-3' },
    two: { 'l-2': 'studio-4' },
  });
});

it('§3c — staging BLANK removes the binding, which is how a composition is undone', async () => {
  const { cg, latest } = boot();
  await cg.templates.import({
    template: TEMPLATE,
    html: '<!doctype html><html><body>debate</body></html>',
  });
  await cg.stack.load({ itemId: 'item-1', templateId: 'debate', fields: {} });

  stageLookBinding('item-1', 'solo', 'l-1', 'studio-3');
  expect((await applyDraft(itemOf(latest()))).accepted).toBe(true);
  expect(itemOf(latest()).lookSourceOverride).toEqual({ solo: { 'l-1': 'studio-3' } });

  // '' is a real staged edit meaning "fall back to the template assignment".
  stageLookBinding('item-1', 'solo', 'l-1', '');
  expect((await applyDraft(itemOf(latest()))).accepted).toBe(true);

  // An empty map is no composition at all — the row must not read as composed.
  expect(itemOf(latest()).lookSourceOverride).toBeUndefined();
});
