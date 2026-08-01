import { useEffect, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { useLink } from './useLink.js';

/**
 * `templateId` → `TemplateInfo` for the templates the stack currently references.
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
 */
export function useTemplateIndex(
  templateIds: readonly string[],
): ReadonlyMap<string, TemplateInfo> {
  const [index, setIndex] = useState<ReadonlyMap<string, TemplateInfo>>(new Map());
  const link = useLink();
  // The identity of the referenced set — a stable string, so the effect re-runs on a NEW
  // template rather than on every stack publish (status flips, OSC ticks) that keeps the
  // same set.
  const referenced = [...new Set(templateIds)].sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(referenced.split('|').filter((id) => id !== ''));
    const pull = (): void => {
      void window.cg.templates.list().then(
        (list) => {
          if (cancelled) return;
          setIndex(
            new Map(list.filter((t) => wanted.has(t.templateId)).map((t) => [t.templateId, t])),
          );
        },
        () => {
          // The link dropped mid-round-trip; reconnecting re-runs this effect.
        },
      );
    };
    pull();
    // R-028 (o1) — the catalogue push carries the full list already; a re-pull
    // keeps ONE data path (list()) rather than a second ingestion route.
    const off = window.cg.templates.onChanged(() => pull());
    return () => {
      cancelled = true;
      off();
    };
  }, [referenced, link]);

  return index;
}
