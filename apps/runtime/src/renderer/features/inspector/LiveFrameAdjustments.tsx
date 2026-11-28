import { useUiText } from '../../i18n/locale.js';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  activeLookOf,
  assignmentsOnChannel,
  lookMaskedPlateIds,
  lookOperatorCropAllowed,
  lookOperatorFrames,
  lookPlateFits,
  lookPlateFocuses,
  lookPlateRects,
  type PreviewPlateCropTarget,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import {
  controlLiveLayoutFocusTarget,
  DEFAULT_LIVE_CROP_FOCUS,
  isOnAirStatus,
  sameLiveCropFocus,
  type ControlLiveLayout,
  type FrameTransition,
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

function useCanEditLiveFrames(item: StackItemState, channel: number): boolean {
  const canOperate = useCanOperate();
  const lock = useLockCoverage();
  return (
    canOperate &&
    !item.pending &&
    item.status !== 'exiting' &&
    lock.kind !== 'all' &&
    (lock.kind !== 'partial' || !lock.channels.includes(channel))
  );
}

export function InspectorPresetEffect({
  item,
  channel,
  authored,
  defaultLabel,
  sharedWithMove,
}: {
  item: StackItemState;
  channel: number;
  authored: FrameTransition | undefined;
  defaultLabel: string | undefined;
  sharedWithMove: boolean;
}): JSX.Element {
  const canEdit = useCanEditLiveFrames(item, channel);
  return (
    <FrameEffectControls
      disabled={!canEdit}
      label={sharedWithMove ? 'Move / resize and preset effects' : 'Preset effect'}
      preset={
        authored === undefined
          ? undefined
          : {
              itemId: item.itemId,
              value: authored,
              ...(defaultLabel !== undefined && { defaultLabel }),
            }
      }
    />
  );
}

export function LiveFrameAdjustments({
  item,
  live,
  channel,
  rehearsing,
  previewLookId,
  controlLiveLayout,
  moveEffect = false,
}: {
  item: StackItemState;
  live: TemplateLiveSources;
  channel: number;
  rehearsing?: boolean | undefined;
  previewLookId?: string | undefined;
  controlLiveLayout?: ControlLiveLayout | undefined;
  moveEffect?: boolean;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const capabilities = useAuthCapabilities();
  const canEdit = useCanEditLiveFrames(item, channel);
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
  const arrangeLookId =
    rehearsing === true && previewLookId !== undefined
      ? activeLookOf(live, previewLookId)?.id
      : lookId;
  const focus =
    controlLiveLayout === undefined
      ? undefined
      : controlLiveLayoutFocusTarget(controlLiveLayout, arrangeLookId);
  const preset = controlLiveLayout?.presets.find(
    ({ id }) => id === (focus?.presetId ?? arrangeLookId),
  );
  const layout =
    capabilities?.liveFramePlacement === true
      ? frameAutoLayoutAvailability(live, arrangeLookId)
      : undefined;
  const fits = lookPlateFits(live, lookId);
  const rects = lookPlateRects(live, lookId);
  const masked = lookMaskedPlateIds(live, lookId);
  const cropEligible = (plateId: string): boolean =>
    rects[plateId] !== undefined &&
    !masked.has(plateId) &&
    lookOperatorCropAllowed(live, lookId, plateId);
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
          title={localizeUi('Restore the authored size and position of this template’s frames')}
          onClick={() => stageFramePlacementsReset(item.itemId, hasAppliedFrames)}
        >
          {localizeUi('Reset frames')}
        </Button>
      )}
      {showResetCrop && (
        <Button
          variant="neutral"
          disabled={cropResets.length === 0}
          title={localizeUi('Restore the authored crop and zoom in the active preset')}
          onClick={resetCrop}
        >
          {localizeUi('Reset crop')}
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
          {localizeUi('Preserve frame aspect ratio')}
        </label>
      )}
      {moveEffect && <FrameEffectControls disabled={!canEdit} />}
      {layout?.kind === 'permissions' && (
        <p className="cg-frame-auto-layout cg-frame-auto-layout__notice" role="status">
          {localizeUi(
            'Auto layout unavailable. In Designer, enable Allow move and unlock Resize for every frame in this preset.',
          )}
        </p>
      )}
      <FrameAutoLayout
        key={item.itemId}
        item={item}
        live={live}
        lookId={arrangeLookId}
        authoredMargins={focus ? preset?.focusMargins : preset?.margins}
        authoredFill={focus !== undefined || preset?.fill}
        frames={layout?.kind === 'eligible' ? layout.frames : []}
        enabled={canEdit && (!onAir || item.onAirFramePlacement === true)}
      />
    </>
  );
}
