import { useSyncExternalStore } from 'react';
import {
  inAnyLayerBand,
  isInCgBands,
  type ClearedOutsideLayer,
  type OrphanLayer,
} from '@cg/shared-ipc';

/**
 * 🔴 `FIELD-FIXES-01` L — **WHICH OF ANOTHER SYSTEM'S LAYERS A CHANNEL'S NOTICE SPEAKS FOR, AND
 * WHEN THE OPERATOR HAS HEARD IT.** The ONE place the rule lives: the notice strips
 * (`OrphanLayersBanner`) and the strip's mark (`orphanWarningChannels`) both read it.
 *
 * - **Below CG's bands** (1–49, `isInCgBands`) a producer that is not ours is the Playout's, and
 *   NORMAL: its playlist plays on a low layer practically all the time. No notice and no mark; the
 *   Station layers tab lists it, as it always has. (The owner's channel 1 carried a permanent blue
 *   notice for layer 1-5.)
 * - **Inside CG's bands** (50 and up) it is a real conflict: the notice and the mark stand, and each
 *   strip — the graphic one and the video one (`R-015`'s split, {@link isOrphanedGraphic}) — is
 *   DISMISSIBLE. A dismissal records what that strip showed, as `layer:producer`; the strip returns
 *   when it holds anything else — a NEW layer, or a DIFFERENT producer on a layer — and not
 *   because something left it or was seen again (a bridge restart re-observes the same set).
 *
 * ⚠ The dismissal is this BROWSER's (`localStorage`, guarded): hearing a notice is a fact about the
 * person at this console, not about the station. It survives a reload.
 *
 * `B-292` (`RELEASE-091-01` DELTA B) adds two things the owner asked for in this family: a CLEAR on
 * every listed layer inside the three bands, whatever its producer ({@link offersClear}), and a third
 * strip for a layer of OURS that something else cleared ({@link noticedClearedOutside}).
 */

/**
 * `R-015` — an orphaned GRAPHIC (an html producer): the alert strip, with its Clear. Anything else
 * is another system's output — video, a feed — and never offers one ("not html" fails safe).
 */
export function isOrphanedGraphic(o: OrphanLayer): boolean {
  return o.producer === 'html';
}

/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B3) — **DOES A LISTED LAYER CARRY A CLEAR?** An orphaned
 * graphic always has (`R-009`); anything else only inside the three bands (50–99,
 * `inAnyLayerBand`) — the bridge's own `layers.clear` rule, read here rather than copied, so the
 * button and the door cannot disagree about a layer. A plate another station or a lost ledger left in
 * our bands had no surface that could clear it; above the bands the row still offers none.
 */
export function offersClear(o: OrphanLayer): boolean {
  return isOrphanedGraphic(o) || inAnyLayerBand(o.layer);
}

/**
 * `B-292` — what one strip's CLEAR ALL LISTED sends: its listed layers inside the three bands, one
 * `layers.clear` each. Never a layer outside 50–99 (an orphaned graphic above them keeps its own row's
 * Clear, and only that), and never a channel-wide `CLEAR`.
 */
export function clearAllListed(items: readonly OrphanLayer[]): OrphanLayer[] {
  return items.filter((o) => inAnyLayerBand(o.layer));
}

/** The two strips a channel's notice is shown in. */
export type ForeignStrip = 'graphic' | 'video';

function stripOf(o: OrphanLayer): ForeignStrip {
  return isOrphanedGraphic(o) ? 'graphic' : 'video';
}

/** The foreign items a notice speaks for: those inside CG's bands. */
export function inBandForeign(orphans: readonly OrphanLayer[]): OrphanLayer[] {
  return orphans.filter((o) => isInCgBands(o.layer));
}

/** One item as a dismissal remembers it. */
function itemKey(o: OrphanLayer): string {
  return `${String(o.layer)}:${o.producer}`;
}

/** A dismissal's key: one strip of one channel. */
function dismissalKey(channel: number, strip: ForeignStrip): string {
  return `${String(channel)}:${strip}`;
}

/** One strip's in-band items on one channel. */
export function stripItems(
  orphans: readonly OrphanLayer[],
  channel: number,
  strip: ForeignStrip,
): OrphanLayer[] {
  return inBandForeign(orphans).filter((o) => o.channel === channel && stripOf(o) === strip);
}

/** What a strip shows, as a dismissal records it: `''` when it shows nothing. */
export function stripFingerprint(items: readonly OrphanLayer[]): string {
  return [...new Set(items.map(itemKey))].sort().join(' ');
}

/** Dismissed strips (`"2:video" → "90:ffmpeg 91:ffmpeg"`). */
export type ForeignDismissals = Readonly<Record<string, string>>;

/** Does this strip of this channel stand: an in-band item on it that was not dismissed? */
export function stripShown(
  orphans: readonly OrphanLayer[],
  channel: number,
  strip: ForeignStrip,
  dismissals: ForeignDismissals,
): boolean {
  const heard = new Set(
    (dismissals[dismissalKey(channel, strip)] ?? '').split(' ').filter((k) => k !== ''),
  );
  return stripItems(orphans, channel, strip).some((o) => !heard.has(itemKey(o)));
}

/** The in-band items the notice shows now: every item of every strip that stands. */
export function noticedForeign(
  orphans: readonly OrphanLayer[],
  dismissals: ForeignDismissals,
): OrphanLayer[] {
  return inBandForeign(orphans).filter((o) =>
    stripShown(orphans, o.channel, stripOf(o), dismissals),
  );
}

/** The channels whose notice stands — the strip's mark (`orphanWarningChannels`). */
export function foreignNoticeChannels(
  orphans: readonly OrphanLayer[],
  dismissals: ForeignDismissals,
): number[] {
  return [...new Set(noticedForeign(orphans, dismissals).map((o) => o.channel))];
}

// ── the dismissals, in this browser ───────────────────────────────────────────────────────────

const KEY = 'cg.runtime.foreign-notice.dismissed.v1';
const listeners = new Set<() => void>();

function read(): ForeignDismissals {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw === null || raw === undefined) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

let current: ForeignDismissals = read();

function write(next: ForeignDismissals): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a dismissal that cannot be kept lasts this page, which is still a dismissal */
  }
  for (const listener of [...listeners]) listener();
}

/** `dismissals`, with one strip of each channel dismissed for what it shows now. */
export function dismissedStrip(
  dismissals: ForeignDismissals,
  orphans: readonly OrphanLayer[],
  strip: ForeignStrip,
): ForeignDismissals {
  const next: Record<string, string> = { ...dismissals };
  for (const channel of new Set(inBandForeign(orphans).map((o) => o.channel))) {
    const items = stripItems(orphans, channel, strip);
    if (items.length > 0) next[dismissalKey(channel, strip)] = stripFingerprint(items);
  }
  return next;
}

/** Dismiss one strip of each channel it shows, for what it shows now — in this browser. */
export function dismissForeignStrip(orphans: readonly OrphanLayer[], strip: ForeignStrip): void {
  write(dismissedStrip(current, orphans, strip));
}

// ── `B-292` — the layers cleared outside CG Control: the same family, the same store ──────────────

/**
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B1) — **A LAYER THIS STATION HELD ON AIR THAT SOMETHING ELSE
 * CLEARED** is said in this family's third strip — _"Layer 60 on CH 2 was cleared outside CG
 * Control"_ — and is dismissed the same way: per channel, remembered in this browser, until the strip
 * holds something the dismissal did not record. Each clear is its own news, so an item is recorded
 * with WHEN the bridge learned it: the same layer cleared again later brings the strip back.
 */
function clearedItemKey(e: ClearedOutsideLayer): string {
  return `${String(e.layer)}@${e.at}`;
}

function clearedDismissalKey(channel: number): string {
  return `${String(channel)}:cleared`;
}

/** The cleared-outside items the notice shows now: those on channels whose strip stands. */
export function noticedClearedOutside(
  cleared: readonly ClearedOutsideLayer[],
  dismissals: ForeignDismissals,
): ClearedOutsideLayer[] {
  const standing = new Set(
    [...new Set(cleared.map((e) => e.channel))].filter((channel) => {
      const heard = new Set(
        (dismissals[clearedDismissalKey(channel)] ?? '').split(' ').filter((k) => k !== ''),
      );
      return cleared.some((e) => e.channel === channel && !heard.has(clearedItemKey(e)));
    }),
  );
  return cleared.filter((e) => standing.has(e.channel));
}

/** `dismissals`, with the cleared-outside strip of each channel dismissed for what it shows now. */
export function dismissedClearedOutside(
  dismissals: ForeignDismissals,
  cleared: readonly ClearedOutsideLayer[],
): ForeignDismissals {
  const next: Record<string, string> = { ...dismissals };
  for (const channel of new Set(cleared.map((e) => e.channel))) {
    next[clearedDismissalKey(channel)] = [
      ...new Set(cleared.filter((e) => e.channel === channel).map(clearedItemKey)),
    ]
      .sort()
      .join(' ');
  }
  return next;
}

/** Dismiss the cleared-outside strip of each channel it shows — in this browser. */
export function dismissClearedOutside(cleared: readonly ClearedOutsideLayer[]): void {
  write(dismissedClearedOutside(current, cleared));
}

/** The dismissals, as React state. */
export function useForeignDismissals(): ForeignDismissals {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}

/** Test seam: re-read storage, as a reload would. */
export function __reloadForeignDismissalsForTest(): void {
  current = read();
  for (const listener of [...listeners]) listener();
}
