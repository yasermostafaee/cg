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
 * There is no `templates.onChanged` event to subscribe to, so the index re-lists whenever the
 * SET of referenced ids changes. That is exactly the moment a row could be showing a template
 * the index has never seen — a fresh import, then Load.
 *
 * B-080 — it also re-lists on every transition into a usable link. This hook has no publish
 * channel to fall back on, so a list refused at mount (the bridge was still down: R-006 mounts
 * DISCONNECTED and refuses reads) would otherwise leave every row printing its raw
 * `templateId` until the referenced SET happened to change.
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
    if (link === 'disconnected') return;
    let cancelled = false;
    const wanted = new Set(referenced.split('|').filter((id) => id !== ''));
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
    return () => {
      cancelled = true;
    };
  }, [referenced, link]);

  return index;
}
