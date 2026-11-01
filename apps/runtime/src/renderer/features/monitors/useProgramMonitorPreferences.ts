import { useCallback, useMemo, useState } from 'react';
import type { PgmEngine } from '@cg/shared-ipc';

export type ProgramDisplayMode = 'A' | 'B' | 'both';
export type ProgramAudioChoice = 'follow' | PgmEngine;

const STORAGE_KEY = 'cg.runtime.pgm-monitor.v1';

interface StoredPreferences {
  readonly display?: ProgramDisplayMode;
  readonly audio?: ProgramAudioChoice;
}

function read(): Required<StoredPreferences> {
  try {
    const parsed = JSON.parse(
      globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}',
    ) as StoredPreferences;
    const display = parsed.display;
    const audio = parsed.audio;
    return {
      display: display === 'B' || display === 'both' ? display : 'A',
      audio: audio === 'A' || audio === 'B' ? audio : 'follow',
    };
  } catch {
    return { display: 'A', audio: 'follow' };
  }
}

function write(value: Required<StoredPreferences>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A console that cannot persist still works for this session.
  }
}

export interface ProgramMonitorPreferences {
  readonly display: ProgramDisplayMode;
  readonly audio: ProgramAudioChoice;
  readonly audioEngine: PgmEngine;
  setDisplay(mode: ProgramDisplayMode): void;
  setAudio(choice: ProgramAudioChoice): void;
}

export function useProgramMonitorPreferences(
  backupAvailable: boolean,
  currentPrimary: PgmEngine,
): ProgramMonitorPreferences {
  const [stored, setStored] = useState(read);
  const update = useCallback((next: Required<StoredPreferences>): void => {
    setStored(next);
    write(next);
  }, []);
  const display = backupAvailable ? stored.display : 'A';
  const audio = backupAvailable ? stored.audio : stored.audio === 'B' ? 'follow' : stored.audio;
  const audioEngine = audio === 'follow' ? currentPrimary : audio;
  return useMemo(
    () => ({
      display,
      audio,
      audioEngine: backupAvailable || audioEngine === 'A' ? audioEngine : 'A',
      setDisplay: (mode: ProgramDisplayMode) => update({ ...stored, display: mode }),
      setAudio: (choice: ProgramAudioChoice) => update({ ...stored, audio: choice }),
    }),
    [audio, audioEngine, backupAvailable, display, stored, update],
  );
}
