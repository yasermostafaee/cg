import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_LIVE_CROP_FOCUS, type StackItemState } from '@cg/shared-schema';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  __resetDraftsForTest,
  appliedPracticeCropOf,
  clearDraft,
  isItemDirty,
  previewCropDraftOf,
  pruneDrafts,
  stageField,
  stagePreviewCrop,
  type PreviewCropDraft,
} from '../src/renderer/features/inspector/draftStore.js';
import * as feedback from '../src/renderer/features/status/commandFeedback.js';

const row: StackItemState = {
  itemId: 'item-1',
  templateId: 'layout',
  fields: { title: 'before' },
  status: 'loaded',
  pending: false,
};
const itemId = row.itemId;
const baseline = DEFAULT_LIVE_CROP_FOCUS;
const guide = {
  key: 'look-1:plate-1',
  kind: 'guide',
  token: 'a'.repeat(64),
  lookId: 'look-1',
  focus: { x: 0.25, y: 0.5 },
} as const satisfies PreviewCropDraft;
const secondGuide = {
  ...guide,
  key: 'look-2:plate-1',
  token: 'b'.repeat(64),
  lookId: 'look-2',
};
const practice = {
  key: 'look-1:plate-2',
  kind: 'practice',
  focus: { x: 0.75, y: 0.5 },
} as const satisfies PreviewCropDraft;

function bridge() {
  const update = vi.fn<RuntimeBridge['stack']['update']>().mockResolvedValue({ accepted: true });
  const previewPlateCrop = vi.fn<RuntimeBridge['stack']['previewPlateCrop']>();
  vi.stubGlobal('window', { cg: { stack: { update, previewPlateCrop } } });
  return { update, previewPlateCrop };
}

const dirty = () => isItemDirty(itemId, row.fields, new Map());

afterEach(() => {
  __resetDraftsForTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('stages framing locally, clears a return to the applied focus and includes framing in Discard', () => {
  const { previewPlateCrop } = bridge();
  stagePreviewCrop(itemId, guide, baseline);
  stagePreviewCrop(itemId, practice, baseline);
  expect(dirty()).toBe(true);
  expect(previewCropDraftOf(itemId, guide.key)).toEqual(guide);
  expect(previewPlateCrop).not.toHaveBeenCalled();
  pruneDrafts({ ready: false });
  expect(previewCropDraftOf(itemId, practice.key)).toEqual(practice);

  stagePreviewCrop(itemId, { ...guide, focus: baseline }, baseline);
  expect(previewCropDraftOf(itemId, guide.key)).toBeUndefined();
  expect(dirty()).toBe(true);
  clearDraft(itemId);
  expect(previewCropDraftOf(itemId, practice.key)).toBeUndefined();
  expect(dirty()).toBe(false);
});

it('applies fields first, then saves all guides in one batch and keeps practice local', async () => {
  const { update, previewPlateCrop } = bridge();
  previewPlateCrop.mockResolvedValue({
    ok: true,
    targets: [],
    applied: [guide.token, secondGuide.token],
  });
  stageField(itemId, ['title'], 'after');
  for (const draft of [guide, practice, secondGuide]) stagePreviewCrop(itemId, draft, baseline);

  await expect(applyDraft(row)).resolves.toMatchObject({ accepted: true });
  expect(update).toHaveBeenCalledWith({ itemId, fields: { title: 'after' }, mergeMode: 'merge' });
  expect(update.mock.invocationCallOrder[0]).toBeLessThan(
    previewPlateCrop.mock.invocationCallOrder[0]!,
  );
  expect(previewPlateCrop).toHaveBeenCalledTimes(1);
  expect(previewPlateCrop).toHaveBeenCalledWith({
    itemId,
    edits: [
      { token: guide.token, focus: guide.focus, lookId: guide.lookId },
      { token: secondGuide.token, focus: secondGuide.focus, lookId: secondGuide.lookId },
    ],
  });
  expect(dirty()).toBe(false);
  expect(appliedPracticeCropOf(itemId, practice.key)).toEqual(practice.focus);
  clearDraft(itemId);
  expect(appliedPracticeCropOf(itemId, practice.key)).toEqual(practice.focus);
  pruneDrafts({ ready: true, liveItemIds: new Set() });
  expect(appliedPracticeCropOf(itemId, practice.key)).toBeUndefined();
});

it('keeps framing staged when fields fail and when Bridge has not confirmed the exact batch', async () => {
  const { update, previewPlateCrop } = bridge();
  const refusal = vi.spyOn(feedback, 'reportCommandError').mockImplementation(() => undefined);
  update.mockResolvedValueOnce({ accepted: false, message: 'The input binding changed.' });
  stagePreviewCrop(itemId, guide, baseline);
  stagePreviewCrop(itemId, secondGuide, baseline);
  stagePreviewCrop(itemId, practice, baseline);

  await expect(applyDraft(row)).resolves.toMatchObject({ accepted: false });
  expect(previewPlateCrop).not.toHaveBeenCalled();
  expect(appliedPracticeCropOf(itemId, practice.key)).toBeUndefined();
  expect(previewCropDraftOf(itemId, practice.key)).toEqual(practice);

  for (const applied of [undefined, [guide.token], [guide.token, guide.token]]) {
    previewPlateCrop.mockResolvedValueOnce({ ok: true, targets: [], applied });
    await expect(applyDraft(row)).resolves.toMatchObject({ accepted: false });
    expect(previewCropDraftOf(itemId, guide.key)).toEqual(guide);
    expect(previewCropDraftOf(itemId, secondGuide.key)).toEqual(secondGuide);
    expect(dirty()).toBe(true);
  }
  expect(refusal).toHaveBeenCalledWith('CG Bridge did not confirm the preview framing update.');
  expect(appliedPracticeCropOf(itemId, practice.key)).toEqual(practice.focus);
});

it('keeps an edit made during Update, including a return to the previously applied focus', async () => {
  const { update, previewPlateCrop } = bridge();
  const response = { ok: true, targets: [], applied: [guide.token] };
  let confirm!: (value: typeof response) => void;
  previewPlateCrop.mockReturnValueOnce(
    new Promise((resolve) => {
      confirm = resolve;
    }),
  );
  stagePreviewCrop(itemId, guide, baseline);
  const firstUpdate = applyDraft(row);
  await vi.waitFor(() => expect(previewPlateCrop).toHaveBeenCalledTimes(1));

  const latest = { ...guide, focus: baseline };
  stagePreviewCrop(itemId, latest, baseline);
  await expect(applyDraft(row)).resolves.toEqual({ accepted: false });
  expect(update).toHaveBeenCalledTimes(1);
  confirm(response);
  await expect(firstUpdate).resolves.toMatchObject({ accepted: true });
  expect(previewCropDraftOf(itemId, guide.key)).toEqual(latest);
  expect(dirty()).toBe(true);
});
