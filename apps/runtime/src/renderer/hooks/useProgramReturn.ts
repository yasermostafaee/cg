import { useCallback, useEffect, useRef, useState } from 'react';
import type { PgmReturnStatus } from '@cg/shared-ipc';
import type { Unsubscribe } from '../../shared/runtime-bridge.js';
import { useBridgeSnapshot } from './useBridgeSnapshot.js';
import { useLink } from './useLink.js';

/**
 * What the PROGRAM pane may say about its return, in three values and no more:
 *
 * - `live` — the bridge reports frames arriving for this channel over a live link. The ONLY
 *   value in which a picture may be shown.
 * - `stalled` — the feed is connected and has stopped delivering frames. The last frame is
 *   stale; showing it would be a frozen frame dressed as live.
 * - `none` — connecting, unreachable, unavailable, test mode, a link that is down: there is no
 *   return signal this console can vouch for.
 */
export type ProgramSignal = 'live' | 'stalled' | 'none';

export interface ProgramReturn {
  /**
   * The URL to request the picture from for THIS mount, or `null` to request nothing. A new
   * value is a new request: it changes after the link comes back and after a failed request.
   */
  readonly src: string | null;
  readonly signal: ProgramSignal;
  /** The picture's request failed: ask again, after a growing delay. */
  readonly onError: () => void;
}

const NOTHING_WATCHED: readonly PgmReturnStatus[] = [];

const fetchStatus = (): Promise<readonly PgmReturnStatus[]> => window.cg.pgmReturn.status();

const subscribeStatus = (handler: (next: readonly PgmReturnStatus[]) => void): Unsubscribe =>
  window.cg.pgmReturn.onStatusChanged(handler);

/** A failed picture request is asked again after 2 s, 4 s, 8 s … up to 30 s. */
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30_000;

/**
 * 🔴 `C-016` — **THE PROGRAMME RETURN FOR THE CHANNEL ON SCREEN**, for the PROGRAM pane.
 *
 * `channel` is `null` whenever the pane is not showing a picture — no bank yet, or PROGRAM
 * folded away — and then nothing is requested. The picture itself is requested by the pane's
 * `<img>`, and THAT request is what the bridge counts as "watched": the hook only decides the
 * URL, so the request lives exactly as long as the element does.
 *
 * ⚠ **The state is the BRIDGE's, and nothing here infers it.** The browser cannot see a stall
 * in an `<img>`; the relay sees every frame and publishes `pgmReturn.status-changed`. A signal
 * derived here from `load`/`error` events would be a second, weaker opinion about the same feed.
 */
export function useProgramReturn(channel: number | null): ProgramReturn {
  const link = useLink();
  const live = link === 'live';
  const statuses = useBridgeSnapshot(fetchStatus, subscribeStatus, NOTHING_WATCHED);
  const state = channel === null ? undefined : statuses.find((s) => s.channel === channel)?.state;
  const base = channel === null ? null : window.cg.pgmReturn.feedUrl(channel);

  const [mount, setMount] = useState(0);
  const retries = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    A request made over a link that then dropped died with the bridge (the relay is served by the
    same process). Ask again when the link COMES BACK — a transition, never on first mount, where
    the one request is already the right one.
  */
  const wasLive = useRef(live);
  useEffect(() => {
    if (live && !wasLive.current) setMount((m) => m + 1);
    wasLive.current = live;
  }, [live]);

  // A live state proves the picture is being served, so the next failure starts from the base.
  useEffect(() => {
    if (state === 'live') retries.current = 0;
  }, [state]);

  useEffect(
    () => () => {
      if (retry.current !== null) clearTimeout(retry.current);
    },
    [],
  );

  const onError = useCallback(() => {
    if (retry.current !== null) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** retries.current, RETRY_MAX_MS);
    retries.current++;
    retry.current = setTimeout(() => {
      retry.current = null;
      setMount((m) => m + 1);
    }, delay);
  }, []);

  // The mount number rides the query so each request is its own resource, never a cached one.
  const src = base === null || !live ? null : `${base}?v=${String(mount)}`;
  const signal: ProgramSignal =
    !live || state === undefined
      ? 'none'
      : state === 'live'
        ? 'live'
        : state === 'stalled'
          ? 'stalled'
          : 'none';
  return { src, signal, onError };
}
