import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  activeLookOf,
  assignmentsOnChannel,
  lookMaskedPlateIds,
  lookOperatorFrames,
  lookPlateFits,
  lookPlateFocuses,
  lookPlateRects,
  type PreviewPlateCropTarget,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  isOnAirStatus,
  sameLiveCropFocus,
  type ControlLiveLayout,
  type StackItemState,
} from '@cg/shared-schema';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { useCanOperate } from '../../hooks/useCanOperate.js';
import { useLockCoverage } from '../../hooks/useLock.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import {
  setPreserveFrameAspect,
  usePreserveFrameAspect,
} from '../monitors/previewResizePreferences.js';
import {
  currentSourceAssignments,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import {
  draftsVersion,
  previewCropDraftOf,
  snapshotFramePlacementDraft,
  stageFramePlacementsReset,
  stagePreviewCrop,
  subscribeDrafts,
} from './draftStore.js';
import { FrameAutoLayout, frameAutoLayoutAvailability } from './FrameAutoLayout.js';
import { FrameEffectControls } from './FrameEffectControls.js';

export function LiveFrameAdjustments({
  item,
  live,
  channel,
  rehearsing,
  previewLookId,
  controlLiveLayout,
}: {
  item: StackItemState;
  live: TemplateLiveSources;
  channel: number;
  rehearsing?: boolean | undefined;
  previewLookId?: string | undefined;
  controlLiveLayout?: ControlLiveLayout | undefined;
}): JSX.Element | null {
  const capabilities = useAuthCapabilities();
  const canOperate = useCanOperate();
  const lock = useLockCoverage();
  const preserveAspect = usePreserveFrameAspect();
  const aspectId = useId();
  const [cropRead, setCropRead] = useState<{
    key: string;
    live: TemplateLiveSources;
    targets: readonly PreviewPlateCropTarget[];
  }>();
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);
  const sourceRevision = useSyncExternalStore(subscribeSources, sourcesVersion, sourcesVersion);

  const onAir = isOnAirStatus(item);
  const previewFrameEffect =
    rehearsing === true &&
    Object.keys(lookOperatorFrames(live, previewLookId ?? item.activeLookId)).length > 0;
  const frameEffect = item.onAirFrameTransition === true || previewFrameEffect;
  const presetEffect =
    (live.looks?.length ?? 0) > 1 && (rehearsing || !onAir || item.onAirPresetTransition === true);
  const canEdit =
    canOperate &&
    !item.pending &&
    item.status !== 'exiting' &&
    lock.kind !== 'all' &&
    (lock.kind !== 'partial' || !lock.channels.includes(channel));
  const lookId = activeLookOf(live, item.activeLookId)?.id;
  const frames = Object.values(lookOperatorFrames(live, lookId));
  const hasAppliedFrames =
    item.framePlacementsPendingReset !== true && (item.framePlacements?.length ?? 0) > 0;
  const frameDraft = snapshotFramePlacementDraft(item.itemId);
  const showResetFrames =
    capabilities?.liveFramePlacementReset === true &&
    (hasAppliedFrames ||
      frames.length > 0 ||
      live.looks?.some((look) => Object.keys(look.operatorFrames ?? {}).length > 0) === true);
  const canResetFrames =
    canEdit &&
    (!onAir || item.onAirFramePlacement === true) &&
    ((frameDraft?.edits.size ?? 0) > 0 || (hasAppliedFrames && frameDraft?.reset === undefined));
  const showAspect =
    capabilities?.previewResizeMode === true && frames.some((frame) => frame.resize === 'free');
  const layout =
    capabilities?.liveFramePlacement === true
      ? frameAutoLayoutAvailability(live, lookId)
      : undefined;
  const fits = lookPlateFits(live, lookId);
  const rects = lookPlateRects(live, lookId);
  const masked = lookMaskedPlateIds(live, lookId);
  const cropEligible = (plateId: string): boolean =>
    rects[plateId] !== undefined && !masked.has(plateId);
  const fitOverride = assignmentsOnChannel(currentSourceAssignments(), channel).assignments.some(
    (entry) =>
      entry.templateId === item.templateId &&
      entry.fitMode === 'cover' &&
      cropEligible(entry.plateId),
  );
  const showResetCrop =
    capabilities?.liveCropReset === true &&
    (Object.entries(fits).some(([plateId, fit]) => fit === 'cover' && cropEligible(plateId)) ||
      fitOverride ||
      ((item.previewPlateCrops?.length ?? 0) > 0 && Object.keys(rects).some(cropEligible)));

  // Saved tokens are opaque and can belong to any preset. Read the current targets from Bridge,
  // then compare each token-matched draft or applied focus to the author's setting.
  const cropKey =
    canEdit && showResetCrop
      ? JSON.stringify([
          item.itemId,
          item.templateId,
          channel,
          lookId,
          onAir,
          sourceRevision,
          item.position,
          item.sourceOverride,
          item.lookSourceOverride,
          item.frozenAssignment,
          item.framePlacements,
          item.framePlacementsPendingReset,
          item.previewPlateCrops,
        ])
      : null;
  useEffect(() => {
    if (cropKey === null) {
      setCropRead(undefined);
      return;
    }
    let current = true;
    void (async () => {
      try {
        const result = await window.cg.stack.previewPlateCrop({
          itemId: item.itemId,
          ...(onAir && { allowOnAir: true }),
        });
        if (current) setCropRead({ key: cropKey, live, targets: result.ok ? result.targets : [] });
      } catch {
        if (current) setCropRead(undefined);
      }
    })();
    return () => {
      current = false;
    };
  }, [cropKey, live, item.itemId, onAir]);

  const defaults = lookPlateFocuses(live, lookId);
  const targets = cropRead?.key === cropKey && cropRead.live === live ? cropRead.targets : [];
  const cropResets = targets.flatMap((target) => {
    if (masked.has(target.plateId)) return [];
    const focus = defaults[target.plateId] ?? DEFAULT_LIVE_CROP_FOCUS;
    const draft = previewCropDraftOf(item.itemId, target.token);
    if (
      (draft?.kind === 'guide' && draft.reset === true) ||
      sameLiveCropFocus(draft?.focus ?? target.focus, focus)
    )
      return [];
    return [{ target, focus }];
  });

  function resetCrop(): void {
    for (const { target, focus } of cropResets) {
      stagePreviewCrop(
        item.itemId,
        {
          kind: 'guide',
          key: target.token,
          token: target.token,
          focus,
          lookId,
          ...(!sameLiveCropFocus(target.focus, focus) && { reset: true as const }),
        },
        target.focus,
      );
    }
  }

  return (
    <>
      {showResetFrames && (
        <Button
          variant="neutral"
          disabled={!canResetFrames}
          title="Restore the authored size and position of this template’s frames"
          onClick={() => stageFramePlacementsReset(item.itemId, hasAppliedFrames)}
        >
          Reset frames
        </Button>
      )}
      {showResetCrop && (
        <Button
          variant="neutral"
          disabled={cropResets.length === 0}
          title="Restore the authored crop and zoom in the active preset"
          onClick={resetCrop}
        >
          Reset crop
        </Button>
      )}
      {showAspect && (
        <label className="cg-position-aspect" htmlFor={aspectId}>
          <Checkbox
            id={aspectId}
            checked={preserveAspect}
            onChange={setPreserveFrameAspect}
            disabled={!canEdit}
          />
          Preserve frame aspect ratio
        </label>
      )}
      {controlLiveLayout === undefined ? (
        (frameEffect || presetEffect) && (
          <FrameEffectControls
            disabled={!canEdit}
            {...(presetEffect && {
              label: frameEffect ? 'Frame and preset effects' : 'Preset effect',
            })}
          />
        )
      ) : (
        <>
          {frameEffect && <FrameEffectControls disabled={!canEdit} />}
          {presetEffect && (
            <FrameEffectControls
              key={item.itemId}
              label="Preset effect"
              disabled={!canEdit}
              preset={{ itemId: item.itemId, value: controlLiveLayout.effects.focus }}
            />
          )}
        </>
      )}
      {layout?.kind === 'permissions' && (
        <p className="cg-frame-auto-layout cg-frame-auto-layout__notice" role="status">
          Auto layout unavailable. In Designer, enable Allow move and unlock Resize for every frame
          in this preset.
        </p>
      )}
      <FrameAutoLayout
        key={item.itemId}
        item={item}
        live={live}
        lookId={lookId}
        frames={layout?.kind === 'eligible' ? layout.frames : []}
        enabled={canEdit && (!onAir || item.onAirFramePlacement === true)}
      />
    </>
  );
}
