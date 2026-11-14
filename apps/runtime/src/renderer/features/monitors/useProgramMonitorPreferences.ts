import { useCallback, useMemo, useState } from 'react';
import { PgmEngineSchema, type PgmEngine } from '@cg/shared-ipc';

export type ProgramDisplayMode = PgmEngine | 'both';
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
      display: display === 'both' ? display : (PgmEngineSchema.safeParse(display).data ?? 'A'),
      audio: PgmEngineSchema.safeParse(audio).data ?? 'follow',
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
  readonly audioEngine: PgmEngine | null;
  readonly layout: ProgramPictureLayout;
  setDisplay(mode: ProgramDisplayMode): void;
  setAudio(choice: ProgramAudioChoice): void;
  setLayout(layout: ProgramPictureLayout): void;
}

export function useProgramMonitorPreferences(
  currentPrimary: PgmEngine | null,
): ProgramMonitorPreferences {
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
