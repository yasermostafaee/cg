import { useId, useState, useSyncExternalStore } from 'react';
import {
  activeLookOf,
  assignmentsOnChannel,
  lookOperatorFrames,
  lookPlateFits,
  lookPlateFocuses,
  lookPlateRects,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  isOnAirStatus,
  sameLiveCropFocus,
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
import { reportCommandError } from '../status/commandFeedback.js';
import {
  draftsVersion,
  snapshotFramePlacementDraft,
  stageFramePlacementsReset,
  stagePreviewCrop,
  subscribeDrafts,
} from './draftStore.js';

export function LiveFrameAdjustments({
  item,
  live,
  channel,
}: {
  item: StackItemState;
  live: TemplateLiveSources;
  channel: number;
}): JSX.Element | null {
  const capabilities = useAuthCapabilities();
  const canOperate = useCanOperate();
  const lock = useLockCoverage();
  const preserveAspect = usePreserveFrameAspect();
  const aspectId = useId();
  const [readingCrop, setReadingCrop] = useState(false);
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);
  useSyncExternalStore(subscribeSources, sourcesVersion, sourcesVersion);

  const onAir = isOnAirStatus(item);
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
  const fits = lookPlateFits(live, lookId);
  const rects = lookPlateRects(live, lookId);
  const fitOverride = assignmentsOnChannel(currentSourceAssignments(), channel).assignments.some(
    (entry) =>
      entry.templateId === item.templateId &&
      entry.fitMode === 'cover' &&
      rects[entry.plateId] !== undefined,
  );
  const showResetCrop =
    capabilities?.liveCropReset === true &&
    (Object.values(fits).includes('cover') ||
      fitOverride ||
      (item.previewPlateCrops?.length ?? 0) > 0);

  async function resetCrop(): Promise<void> {
    setReadingCrop(true);
    try {
      const result = await window.cg.stack.previewPlateCrop({
        itemId: item.itemId,
        ...(onAir && { allowOnAir: true }),
      });
      if (!result.ok || result.targets.length === 0) {
        reportCommandError(result.message ?? 'No input crop is available in this preset.');
        return;
      }
      const defaults = lookPlateFocuses(live, lookId);
      for (const target of result.targets) {
        const focus = defaults[target.plateId] ?? DEFAULT_LIVE_CROP_FOCUS;
        const saved =
          target.staged === true ||
          item.previewPlateCrops?.some((crop) => crop.token === target.token);
        stagePreviewCrop(
          item.itemId,
          {
            kind: 'guide',
            key: target.token,
            token: target.token,
            focus,
            lookId,
            ...((saved || !sameLiveCropFocus(target.focus, focus)) && { reset: true as const }),
          },
          target.focus,
        );
      }
    } catch (error) {
      reportCommandError(
        error instanceof Error ? error.message : 'Could not check the current crop.',
      );
    } finally {
      setReadingCrop(false);
    }
  }

  if (!showResetFrames && !showResetCrop && !showAspect) return null;
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
          disabled={!canEdit || readingCrop}
          title="Restore the authored crop and zoom in the active preset"
          onClick={() => void resetCrop()}
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
    </>
  );
}
