import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { canCheckLiveInput, type SourceDefinition } from '@cg/shared-ipc';
import { useModalForeground } from '../../ui/modalForeground.js';
import {
  stopNdiAudio,
  toggleNdiAudio,
  useNdiAudioReceiver,
  type NdiReceiver,
} from '../sources/directNdiPreview.js';
import { currentSourceCatalog } from '../sources/sourceStore.js';
import { useLiveInputPicture } from './useLiveInputPicture.js';
import { usePvwRoutedAudio } from './usePvwRoutedAudio.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';

export interface PreviewAudioInput {
  readonly id: string;
  readonly name: string;
  readonly direct?: true;
  readonly receiver?: NdiReceiver;
}

interface MonitorableInput extends PreviewAudioInput {
  readonly routed?: SourceDefinition;
}

export interface PreviewAudioControls {
  readonly inputs: readonly MonitorableInput[];
  readonly activeId?: string | undefined;
  readonly failure?: string | undefined;
  readonly livePicture?: PvwSourceFrame | undefined;
  stateOf(id: string): 'muted' | 'connecting' | 'audible' | undefined;
  pictureStateOf(id: string): 'snapshots' | 'connecting' | 'live' | undefined;
  toggle(id: string): void;
  togglePicture(id: string): void;
}

const NO_INPUTS: readonly PreviewAudioInput[] = [];
export const PreviewAudioContext = createContext<PreviewAudioControls | null>(null);

export function usePreviewAudioControls(
  channel: number | null,
  visible: boolean,
  candidates = NO_INPUTS,
): PreviewAudioControls {
  const foreground = useModalForeground();
  const enabled = visible && foreground;
  const routed = usePvwRoutedAudio(channel ?? undefined, enabled);
  const listening = useNdiAudioReceiver();
  const owned = useRef<NdiReceiver>();
  const catalog = currentSourceCatalog();
  const inputs = enabled
    ? candidates.flatMap((input): MonitorableInput[] => {
        if (input.receiver !== undefined) return [input];
        if (input.direct || channel === null || !routed.pictureAvailable) return [];
        const source = catalog.sources.find(({ id }) => id === input.id);
        return source !== undefined && canCheckLiveInput(source, channel)
          ? [{ ...input, routed: source }]
          : [];
      })
    : [];
  const activeNdi = inputs.find(({ receiver }) => receiver !== undefined && receiver === listening);
  const routedActive = routed.audible || routed.pending ? routed.sourceId : undefined;
  const ownedPictureId = routed.pictureSourceId;
  const pictureSourceId = inputs.some(
    ({ id, routed: source }) => id === ownedPictureId && source !== undefined,
  )
    ? ownedPictureId
    : undefined;
  const decoded = useLiveInputPicture(
    pictureSourceId === undefined ? undefined : routed.picture,
    routed.stall,
  );
  const livePicture = useMemo<PvwSourceFrame | undefined>(() => {
    if (pictureSourceId === undefined || decoded === undefined) return undefined;
    return {
      sourceId: pictureSourceId,
      signal: 'present',
      width: decoded.width,
      height: decoded.height,
      engine: decoded.engine,
      livePicture: decoded,
    };
  }, [decoded, pictureSourceId]);
  const stopNative = useCallback((): void => {
    const receiver = owned.current;
    owned.current = undefined;
    if (receiver !== undefined) stopNdiAudio(receiver);
  }, []);
  useEffect(() => stopNative, [channel, stopNative]);
  useEffect(() => {
    if (owned.current !== undefined && !inputs.some(({ receiver }) => receiver === owned.current)) {
      stopNative();
    }
    if (
      (routedActive !== undefined &&
        !inputs.some(({ id, routed }) => id === routedActive && routed)) ||
      (ownedPictureId !== undefined && pictureSourceId === undefined)
    ) {
      routed.stop();
    }
  }, [inputs, ownedPictureId, pictureSourceId, routedActive, routed.stop, stopNative]);

  return {
    inputs: inputs.filter(({ receiver }) => receiver !== undefined || routed.available),
    activeId: activeNdi?.id ?? routedActive,
    failure: routed.failure,
    livePicture,
    stateOf(id) {
      const input = inputs.find((candidate) => candidate.id === id);
      if (input === undefined || (input.receiver === undefined && !routed.available))
        return undefined;
      if (input.receiver !== undefined && input.receiver === listening) return 'audible';
      if (input.routed !== undefined && routed.sourceId === id) {
        if (routed.pending) return 'connecting';
        if (routed.audible) return 'audible';
      }
      return 'muted';
    },
    pictureStateOf(id) {
      if (
        !routed.pictureAvailable ||
        !inputs.some((input) => input.id === id && input.routed !== undefined)
      )
        return undefined;
      if (pictureSourceId !== id) return 'snapshots';
      return livePicture === undefined ? 'connecting' : 'live';
    },
    toggle(id) {
      const input = inputs.find((candidate) => candidate.id === id);
      if (input?.receiver !== undefined) {
        routed.mute();
        const receiver = input.receiver;
        owned.current = listening === receiver ? undefined : receiver;
        toggleNdiAudio(receiver);
      } else if (input?.routed !== undefined && routed.available) {
        stopNative();
        if (routedActive === id) routed.mute();
        else routed.start(input.routed);
      }
    },
    togglePicture(id) {
      const source = inputs.find((input) => input.id === id)?.routed;
      if (source === undefined || !routed.pictureAvailable) return;
      if (id === pictureSourceId) routed.stop();
      else routed.startPicture(source);
    },
  };
}

export function usePreviewAudio(): PreviewAudioControls | null {
  return useContext(PreviewAudioContext);
}
