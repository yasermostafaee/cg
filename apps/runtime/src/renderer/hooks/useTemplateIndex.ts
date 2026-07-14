import { useEffect, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';

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
 */
export function useTemplateIndex(
  templateIds: readonly string[],
): ReadonlyMap<string, TemplateInfo> {
  const [index, setIndex] = useState<ReadonlyMap<string, TemplateInfo>>(new Map());
  // The identity of the referenced set — a stable string, so the effect re-runs on a NEW
  // template rather than on every stack publish (status flips, OSC ticks) that keeps the
  // same set.
  const referenced = [...new Set(templateIds)].sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(referenced.split('|').filter((id) => id !== ''));
    void window.cg.templates.list().then((list) => {
      if (cancelled) return;
      setIndex(new Map(list.filter((t) => wanted.has(t.templateId)).map((t) => [t.templateId, t])));
    });
    return () => {
      cancelled = true;
    };
  }, [referenced]);

  return index;
}
