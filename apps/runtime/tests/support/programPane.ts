import type { PgmAudio } from '../../src/renderer/hooks/usePgmAudio.js';
import type { ProgramMonitorPreferences } from '../../src/renderer/features/monitors/useProgramMonitorPreferences.js';

/**
 * `PLAYOUT-FEATURES-01` E — what a PROGRAM pane rendered on its own needs beyond its props: its sound
 * (off, the default), and the one bridge surface its meter reads (`window.cg.meters`, with no readings —
 * the meter sits at the floor). A pane test that sets up no bridge at all gets exactly this much.
 */
export const SOUND_OFF: PgmAudio = { on: false, status: 'off', toggle: () => undefined };

export const PRIMARY_MONITOR_PREFERENCES: ProgramMonitorPreferences = {
  display: 'A',
  audio: 'follow',
  audioEngine: 'A',
  setDisplay: () => undefined,
  setAudio: () => undefined,
};

export function stubMeters(): void {
  const w = window as unknown as { cg?: Record<string, unknown> };
  w.cg ??= {};
  w.cg['meters'] ??= { onReading: () => () => undefined };
}
