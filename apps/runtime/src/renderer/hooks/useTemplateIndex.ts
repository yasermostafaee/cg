import { useEffect, useMemo, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { useLink } from './useLink.js';

/**
 * 🔴 `CHANNEL-TEMPLATES-01` — one template a surface needs, and the channel whose list names it.
 * `channel` undefined: a row on no channel, which reads the station-wide entry.
 */
export interface TemplateRef {
  readonly templateId: string;
  readonly channel: number | undefined;
}

/**
 * 🔴 `CHANNEL-TEMPLATES-01` — **A TEMPLATE AS ONE CHANNEL LISTS IT.** Each channel has its own
 * list, and two channels may list one template at two versions — so a lookup names the channel,
 * and `get(id)` alone does not compile: a reader that forgot the channel would silently read
 * another channel's fields, looks or name.
 */
export interface TemplateIndex {
  get(templateId: string, channel: number | undefined): TemplateInfo | undefined;
}

const STATION = 'station';
const listKey = (channel: number | undefined): string =>
  channel === undefined ? STATION : String(channel);

/**
 * `templateId` → `TemplateInfo` for the templates the stack currently references, as each one's
 * own channel lists it.
 *
 * R-004 shipped the display label in the Library only; the stack row and the Inspector kept
 * printing the raw `templateId`. A `StackItemState` carries no label (and must not —
 * `templateId` stays the sole identity), so the only way to name a row is to join it against
 * the registry. That join lives here, once for the whole list, instead of in each row.
 *
 * The index re-lists whenever the SET of referenced ids changes — exactly the moment a row
 * could be showing a template the index has never seen (a fresh import, then Load) — AND on
 * every `templates.onChanged` push (R-028: the bridge owns the catalogue, so another
 * browser's re-import under a new name must rename this browser's rows too).
 *
 * B-080 — it also re-lists on every transition into a usable link (kept as a cheap safety net
 * for the mock, which re-seeds per load).
 *
 * B-085 — the registry is now browser-local: `templates.list()` reads local state and never
 * rejects, so the former `if (link === 'disconnected') return` guard is GONE. Stack rows now
 * resolve their template names even while disconnected, instead of falling back to the raw
 * `templateId` / "Unnamed template".
 *
 * `CHANNEL-TEMPLATES-01` — one pull PER CHANNEL the references name (and one station-wide pull
 * for any row on no channel): a row on channel 1 is named from channel 1's list even while
 * channel 2 lists a newer version of the same template.
 */
export function useTemplateIndex(refs: readonly TemplateRef[]): TemplateIndex {
  const [lists, setLists] = useState<ReadonlyMap<string, ReadonlyMap<string, TemplateInfo>>>(
    new Map(),
  );
  const link = useLink();
  // The identity of the referenced set — a stable string, so the effect re-runs on a NEW
  // template (or a template on a NEW channel) rather than on every stack publish (status
  // flips, OSC ticks) that keeps the same set.
  const referenced = [...new Set(refs.map((r) => `${listKey(r.channel)}\u0000${r.templateId}`))]
    .sort()
    .join('|');

  useEffect(() => {
    let cancelled = false;
    const wanted = new Map<string, Set<string>>();
    for (const entry of referenced.split('|')) {
      if (entry === '') continue;
      const [key = STATION, templateId = ''] = entry.split('\u0000');
      const ids = wanted.get(key) ?? new Set<string>();
      ids.add(templateId);
      wanted.set(key, ids);
    }
    const pull = (): void => {
      void Promise.all(
        [...wanted.entries()].map(async ([key, ids]) => {
          const list = await window.cg.templates.list(
            key === STATION ? undefined : { channel: Number(key) },
          );
          return [
            key,
            new Map(list.filter((t) => ids.has(t.templateId)).map((t) => [t.templateId, t])),
          ] as const;
        }),
      ).then(
        (pulled) => {
          if (cancelled) return;
          setLists(new Map(pulled));
        },
        () => {
          // The link dropped mid-round-trip; reconnecting re-runs this effect.
        },
      );
    };
    pull();
    // R-028 (o1) — the catalogue push says something changed; a re-pull keeps ONE data path
    // (list()) rather than a second ingestion route — and reads each channel's own list.
    const off = window.cg.templates.onChanged(() => pull());
    return () => {
      cancelled = true;
      off();
    };
  }, [referenced, link]);

  // One identity per pull, so a consumer holding the index in a dependency list re-runs when a
  // list changes and not on every render.
  return useMemo<TemplateIndex>(
    () => ({
      get: (templateId, channel) => {
        // A channel whose list was pulled answers for itself — including "not on this channel".
        if (channel !== undefined && lists.has(listKey(channel))) {
          return lists.get(listKey(channel))?.get(templateId);
        }
        /*
          No channel — or one no reference asked this index to pull, which is UNKNOWN rather than
          "not listed": the station-wide pull when one was made, else the lowest channel pulled
          that lists it — the station-wide reading's own rule, over what this index holds.
        */
        const station = lists.get(STATION)?.get(templateId);
        if (station !== undefined) return station;
        const channels = [...lists.keys()]
          .filter((k) => k !== STATION)
          .sort((a, b) => Number(a) - Number(b));
        for (const key of channels) {
          const hit = lists.get(key)?.get(templateId);
          if (hit !== undefined) return hit;
        }
        return undefined;
      },
    }),
    [lists],
  );
}
