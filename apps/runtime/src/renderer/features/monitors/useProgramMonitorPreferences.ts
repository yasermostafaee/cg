import { useCallback, useMemo, useState } from 'react';
import type { PgmEngine } from '@cg/shared-ipc';

export type ProgramDisplayMode = 'A' | 'B' | 'both';
export type ProgramAudioChoice = 'follow' | PgmEngine;
export type ProgramPictureLayout = 'horizontal' | 'vertical';

const STORAGE_KEY = 'cg.runtime.pgm-monitor.v1';

interface StoredPreferences {
  readonly display?: ProgramDisplayMode;
  readonly audio?: ProgramAudioChoice;
  readonly layout?: ProgramPictureLayout;
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
      display: display === 'B' || display === 'both' ? display : 'A',
      audio: audio === 'A' || audio === 'B' ? audio : 'follow',
      layout: layout === 'vertical' ? 'vertical' : 'horizontal',
    };
  } catch {
    return { display: 'A', audio: 'follow', layout: 'horizontal' };
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
  readonly layout: ProgramPictureLayout;
  setDisplay(mode: ProgramDisplayMode): void;
  setAudio(choice: ProgramAudioChoice): void;
  setLayout(layout: ProgramPictureLayout): void;
}

export function useProgramMonitorPreferences(currentPrimary: PgmEngine): ProgramMonitorPreferences {
  const [stored, setStored] = useState(read);
  const update = useCallback((next: Required<StoredPreferences>): void => {
    setStored(next);
    write(next);
  }, []);
  const display = stored.display;
  const audio = stored.audio;
  const layout = stored.layout;
  const audioEngine = audio === 'follow' ? currentPrimary : audio;
  return useMemo(
    () => ({
      display,
      audio,
      audioEngine,
      layout,
      setDisplay: (mode: ProgramDisplayMode) => update({ ...stored, display: mode }),
      setAudio: (choice: ProgramAudioChoice) => update({ ...stored, audio: choice }),
      setLayout: (next: ProgramPictureLayout) => update({ ...stored, layout: next }),
    }),
    [audio, audioEngine, display, layout, stored, update],
  );
}
