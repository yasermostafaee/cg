import { useSyncExternalStore } from 'react';
import { DEFAULT_STATION_SETUP_SECTION, type StationSetupSection } from './sections.js';

/**
 * `STATION-SETUP-02` — WHO OPENS STATION SETUP, AND AT WHICH SECTION.
 *
 * Five surfaces used to open five dialogs from five pieces of local state: the status bar
 * (SERVERS, SOURCES), the Layers panel's Configure, the Inspector's delimiter gear. They now
 * open ONE dialog at a named section, and the request lives here rather than in `App`'s
 * state so a control deep in the Inspector can raise it without a prop threaded through
 * every layer between — the same reason `sourceStore` and `delimiterStore` are modules.
 *
 * A request carries a `requestId` so that pressing SOURCES while the dialog is already open
 * at Servers is a NEW request (the dialog switches to that TAB), rather than a no-op on a
 * boolean that is already true.
 */

export interface StationSetupRequest {
  readonly open: boolean;
  readonly section: StationSetupSection;
  /** Increments on every open request, so a repeat at another section is observable. */
  readonly requestId: number;
}

let state: StationSetupRequest = {
  open: false,
  section: DEFAULT_STATION_SETUP_SECTION,
  requestId: 0,
};
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** Open the dialog at `section` (a deep link), or bring it to that section if already open. */
export function openStationSetup(
  section: StationSetupSection = DEFAULT_STATION_SETUP_SECTION,
): void {
  state = { open: true, section, requestId: state.requestId + 1 };
  emit();
}

export function closeStationSetup(): void {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = (): StationSetupRequest => state;

export function useStationSetupRequest(): StationSetupRequest {
  return useSyncExternalStore(subscribe, read, read);
}

/** Test seam — back to closed, with the counter reset. */
export function __resetStationSetupForTest(): void {
  state = { open: false, section: DEFAULT_STATION_SETUP_SECTION, requestId: 0 };
  emit();
}
