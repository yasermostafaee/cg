import { useEffect } from 'react';
import { pruneDrafts, type StackPruneInput } from '../features/inspector/draftStore.js';
import { pruneFromFile, restoreFromFileAttachments } from '../features/inspector/fromFileStore.js';
import { useStackSnapshot } from './useStack.js';

/**
 * Stack-lifecycle housekeeping: drop per-item state for items that have left the
 * stack, and restore the file attachments a previous session persisted.
 *
 * WHY THIS IS A HOOK OF ITS OWN, called from `App` and nowhere else.
 *
 * It used to be an effect inside `LayersPanel`. That is stack housekeeping living
 * in a component with an unrelated MOUNT LIFETIME, and the two came apart exactly
 * where you would expect once you say it out loud: `App` unmounts that panel on a
 * monitor fullscreen (`!monitorFocused`) and on an Inspector fullscreen
 * (`showWorkspace`). On remount the effect ran against the bootstrap snapshot —
 * `[]`, because nothing had arrived yet — read every item as "no longer on the
 * stack", and DELETED every draft the operator had staged. `pruneFromFile` rode
 * the same pass, so file attachments went too. No undo, and nothing on screen to
 * say it had happened.
 *
 * `App` is the one component that is mounted for the life of the page, so the
 * housekeeping now runs once per real snapshot rather than once per mount of a
 * view. The readiness guard in `pruneDrafts` is kept as well — the placement stops
 * this instance, the guard stops the class.
 *
 * THE THREE STEPS STAY IN ONE PASS (B-113): they need exactly one thing, the set
 * of item ids really on the stack, and running the restore apart from the prune is
 * how a restore lands a moment before the prune that would have rejected it,
 * flashing file names onto rows that no longer exist.
 */
export function useStackHousekeeping(): void {
  const { items, ready } = useStackSnapshot();

  useEffect(() => {
    // The bootstrap window is NOT "the stack is empty". Both prunes refuse this
    // shape outright; the restore is skipped with it because restoring against an
    // unknown stack would attach files to rows we cannot confirm exist.
    const snapshot: StackPruneInput = ready
      ? { ready: true, liveItemIds: new Set(items.map((i) => i.itemId)) }
      : { ready: false };
    pruneDrafts(snapshot);
    pruneFromFile(snapshot);
    // Idempotent: an already-attached field is left alone, so re-running on every
    // stack change costs nothing. It refuses the not-ready shape itself — its own
    // `pruneAttachments` deletes from DURABLE storage, so it is the one with the
    // worst blast radius of the three.
    void restoreFromFileAttachments(snapshot);
  }, [items, ready]);
}
