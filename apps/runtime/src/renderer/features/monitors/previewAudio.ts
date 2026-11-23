import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { canCheckLiveInput, type SourceDefinition } from '@cg/shared-ipc';
import { useModalForeground } from '../../ui/modalForeground.js';
import {
  stopNdiAudio,
  toggleNdiAudio,
  useNdiAudioReceiver,
  type NdiReceiver,
} from '../sources/directNdiPreview.js';
import { currentSourceCatalog } from '../sources/sourceStore.js';
import { usePvwRoutedAudio } from './usePvwRoutedAudio.js';

export interface PreviewAudioInput {
  readonly id: string;
  readonly name: string;
  readonly direct?: true;
  readonly receiver?: NdiReceiver;
}

interface MonitorableInput extends PreviewAudioInput {
  readonly routed?: SourceDefinition;
}

interface PreviewAudioControls {
  readonly inputs: readonly MonitorableInput[];
  readonly activeId?: string | undefined;
  readonly failure?: string | undefined;
  stateOf(id: string): 'muted' | 'connecting' | 'audible' | undefined;
  toggle(id: string): void;
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
        if (input.direct || channel === null || !routed.available) return [];
        const source = catalog.sources.find(({ id }) => id === input.id);
        return source !== undefined && canCheckLiveInput(source, channel)
          ? [{ ...input, routed: source }]
          : [];
      })
    : [];
  const activeNdi = inputs.find(({ receiver }) => receiver !== undefined && receiver === listening);
  const routedActive = routed.audible || routed.pending ? routed.sourceId : undefined;
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
      routedActive !== undefined &&
      !inputs.some(({ id, routed }) => id === routedActive && routed)
    ) {
      routed.stop();
    }
  }, [inputs, routedActive, routed.stop, stopNative]);

  return {
    inputs,
    activeId: activeNdi?.id ?? routedActive,
    failure: routed.failure,
    stateOf(id) {
      const input = inputs.find((candidate) => candidate.id === id);
      if (input === undefined) return undefined;
      if (input.receiver !== undefined && input.receiver === listening) return 'audible';
      if (input.routed !== undefined && routed.sourceId === id) {
        if (routed.pending) return 'connecting';
        if (routed.audible) return 'audible';
      }
      return 'muted';
    },
    toggle(id) {
      const input = inputs.find((candidate) => candidate.id === id);
      if (input?.receiver !== undefined) {
        routed.stop();
        const receiver = input.receiver;
        owned.current = listening === receiver ? undefined : receiver;
        toggleNdiAudio(receiver);
      } else if (input?.routed !== undefined) {
        stopNative();
        if (routedActive === id) routed.stop();
        else routed.start(input.routed);
      }
    },
  };
}

export function usePreviewAudio(): PreviewAudioControls | null {
  return useContext(PreviewAudioContext);
}
