import { useMemo, useSyncExternalStore } from 'react';
import { PgmEngineSchema, type PgmEngine } from '@cg/shared-ipc';

export type ProgramDisplayMode = PgmEngine | 'both';
export type ProgramAudioChoice = 'follow' | PgmEngine;
export type ProgramPictureLayout = 'horizontal' | 'vertical';
export type ProgramMeterMode = 'selected' | 'all';

const STORAGE_KEY = 'cg.runtime.pgm-monitor.v1';

interface StoredPreferences {
  readonly display?: ProgramDisplayMode;
  readonly audio?: ProgramAudioChoice;
  readonly layout?: ProgramPictureLayout;
  readonly showMeter?: boolean;
  readonly meterMode?: ProgramMeterMode;
}

function read(): Required<StoredPreferences> {
  try {
    const parsed = JSON.parse(
      globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}',
    ) as StoredPreferences;
    const display = parsed.display;
    const audio = parsed.audio;
    const layout = parsed.layout;
    return {
      display: display === 'both' ? display : (PgmEngineSchema.safeParse(display).data ?? 'A'),
      audio: PgmEngineSchema.safeParse(audio).data ?? 'follow',
      layout: layout === 'vertical' ? 'vertical' : 'horizontal',
      showMeter: parsed.showMeter !== false,
      meterMode: parsed.meterMode === 'all' ? 'all' : 'selected',
    };
  } catch {
    return {
      display: 'A',
      audio: 'follow',
      layout: 'horizontal',
      showMeter: true,
      meterMode: 'selected',
    };
  }
}

function write(value: Required<StoredPreferences>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A console that cannot persist still works for this session.
  }
}

let snapshot: Required<StoredPreferences> | undefined;
const listeners = new Set<() => void>();

function currentPreferences(): Required<StoredPreferences> {
  snapshot ??= read();
  return snapshot;
}

function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) snapshot = undefined;
  };
}

/** Each setter merges against the latest shared value, including consecutive updates in one action. */
function updatePreferences(patch: StoredPreferences): void {
  snapshot = { ...currentPreferences(), ...patch };
  write(snapshot);
  for (const listener of listeners) listener();
}

export interface ProgramMonitorPreferences {
  readonly display: ProgramDisplayMode;
  readonly audio: ProgramAudioChoice;
  readonly audioEngine: PgmEngine | null;
  readonly layout: ProgramPictureLayout;
  readonly showMeter: boolean;
  readonly meterMode: ProgramMeterMode;
  setDisplay(mode: ProgramDisplayMode): void;
  setAudio(choice: ProgramAudioChoice): void;
  setLayout(layout: ProgramPictureLayout): void;
  setShowMeter(show: boolean): void;
  setMeterMode(mode: ProgramMeterMode): void;
}

export function useProgramMonitorPreferences(
  currentPrimary: PgmEngine | null,
): ProgramMonitorPreferences {
  const stored = useSyncExternalStore(subscribePreferences, currentPreferences, currentPreferences);
  const { display, audio, layout, showMeter, meterMode } = stored;
  const audioEngine = audio === 'follow' ? currentPrimary : audio;
  return useMemo(
    () => ({
      display,
      audio,
      audioEngine,
      layout,
      showMeter,
      meterMode,
      setDisplay: (mode: ProgramDisplayMode) => updatePreferences({ display: mode }),
      setAudio: (choice: ProgramAudioChoice) => updatePreferences({ audio: choice }),
      setLayout: (next: ProgramPictureLayout) => updatePreferences({ layout: next }),
      setShowMeter: (show: boolean) => updatePreferences({ showMeter: show }),
      setMeterMode: (mode: ProgramMeterMode) => updatePreferences({ meterMode: mode }),
    }),
    [audio, audioEngine, display, layout, showMeter, meterMode],
  );
}
