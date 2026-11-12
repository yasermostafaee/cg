// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateLiveSources } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { LiveFrameAdjustments } from '../src/renderer/features/inspector/LiveFrameAdjustments.js';
import {
  __resetDraftsForTest,
  clearDraft,
  previewCropDraftOf,
  stagePreviewCrop,
} from '../src/renderer/features/inspector/draftStore.js';

vi.mock('../src/renderer/hooks/useAuthCapabilities.js', () => ({
  useAuthCapabilities: () => ({ liveCropReset: true }),
}));
vi.mock('../src/renderer/hooks/useCanOperate.js', () => ({ useCanOperate: () => true }));
vi.mock('../src/renderer/hooks/useLock.js', () => ({ useLockCoverage: () => ({ kind: 'none' }) }));

const rect = { x: 480, y: 270, width: 960, height: 540 };
const authored = { x: 0.25, y: 0.5, zoom: 1.25 };
const changed = { ...authored, zoom: 2 };
const live: TemplateLiveSources = {
  resolution: { width: 1920, height: 1080 },
  defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
  sources: [{ elementId: 'plate', sourceId: 'guest', dynamic: false, rect }],
  looks: ['one', 'two'].map((id) => ({
    id,
    name: id,
    entered: { mode: 'cut' },
    rects: { guest: rect },
    fits: { guest: 'cover' },
    focuses: { guest: authored },
  })),
};
const row: StackItemState = {
  itemId: 'row',
  templateId: 'tpl',
  fields: {},
  status: 'loaded',
  pending: false,
  activeLookId: 'one',
};
const token = 'a'.repeat(64);
const otherToken = 'b'.repeat(64);
const target = { plateId: 'guest', token, sourceAspect: 16 / 9, focus: authored };

describe('Inspector Reset crop availability', () => {
  let host: HTMLDivElement;
  let root: Root;
  const read = vi.fn<RuntimeBridge['stack']['previewPlateCrop']>();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    read.mockReset().mockResolvedValue({ ok: true, targets: [target] });
    Object.assign(window, { cg: { stack: { previewPlateCrop: read } } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    __resetDraftsForTest();
    vi.unstubAllGlobals();
  });

  const render = (item: StackItemState = row) =>
    act(async () => root.render(createElement(LiveFrameAdjustments, { item, live, channel: 1 })));
  const reset = () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === 'Reset crop')!;

  it('stays disabled at the authored crop even with saved and staged changes in another preset', async () => {
    stagePreviewCrop(
      row.itemId,
      { kind: 'guide', key: otherToken, token: otherToken, lookId: 'two', focus: changed },
      authored,
    );
    await render({ ...row, previewPlateCrops: [{ token: otherToken, focus: changed }] });
    expect(read).toHaveBeenCalledWith({ itemId: row.itemId });
    expect(reset().disabled).toBe(true);
    expect(previewCropDraftOf(row.itemId, otherToken)?.focus).toEqual(changed);
  });

  it('enables for a saved deviation and disables once a reset is staged', async () => {
    read.mockResolvedValue({ ok: true, targets: [{ ...target, focus: changed, staged: true }] });
    await render({
      ...row,
      status: 'on-air',
      previewPlateCrops: [{ token, focus: changed }],
    });
    expect(read).toHaveBeenCalledWith({ itemId: row.itemId, allowOnAir: true });
    expect(reset().disabled).toBe(false);

    await act(async () => reset().click());
    expect(previewCropDraftOf(row.itemId, token)).toMatchObject({
      focus: authored,
      lookId: 'one',
      reset: true,
    });
    expect(reset().disabled).toBe(true);

    await act(async () => clearDraft(row.itemId));
    expect(reset().disabled).toBe(false);
  });

  it('removes a draft-only deviation without staging an on-air write', async () => {
    await render();
    expect(reset().disabled).toBe(true);
    await act(async () =>
      stagePreviewCrop(
        row.itemId,
        { kind: 'guide', key: token, token, lookId: 'one', focus: changed },
        authored,
      ),
    );
    expect(reset().disabled).toBe(false);

    await act(async () => reset().click());
    expect(previewCropDraftOf(row.itemId, token)).toBeUndefined();
    expect(reset().disabled).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('ignores a late crop read after switching the active preset', async () => {
    let finish: (result: Awaited<ReturnType<typeof read>>) => void = () => undefined;
    read.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    expect(reset().disabled).toBe(true);
    await render({ ...row, activeLookId: 'two' });
    expect(reset().disabled).toBe(true);

    await act(async () => finish({ ok: true, targets: [{ ...target, focus: changed }] }));
    expect(reset().disabled).toBe(true);
  });
});
