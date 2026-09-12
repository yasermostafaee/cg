import { useEffect, useSyncExternalStore } from 'react';
import { Notice } from '../../ui/Notice.js';
import { reportCommandSuccess } from './commandFeedback.js';
import { clearRefusal, getRefusal, onRefusal, raiseRefusal } from './refusalStore.js';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA R §4 — **THE REFUSAL SURFACE, WHICH IS NOT A TOAST.**
 *
 * The owner's defect (b): a refusal "hides itself so quickly the operator has no chance to
 * read it." It was being rendered by `CommandToast`, whose auto-dismiss is correct for a
 * confirmation and wrong for this. Every rule below is one of §4's, and each is a property
 * this component has rather than a timer it lacks:
 *
 *   (a) PERSISTS   — there is no timer in this file or in `refusalStore`. It goes when the
 *                    operator dismisses it, or when the store is cleared.
 *   (b) DISMISSIBLE — a real control with a real accessible name, not a click-anywhere.
 *   (c) DOES NOT COVER THE CONSOLE — it is IN FLOW, in `main`'s banner region, beside the
 *                    connection and raster banners. It pushes the workspace down instead of
 *                    lying over it, so a refusal about a row can never hide that row nor the
 *                    control that resolves it. That is also the reference's own shape: its
 *                    `.notice` family is an in-flow block, and it has NO error toast at all.
 *   (d) COALESCES  — `refusalStore` keys by sentence; five presses are one banner and a
 *                    count.
 *   (e) ASSERTIVE  — `Notice`'s `alert` default, which is `role="alert"`. Toasts are polite;
 *                    this one interrupts, and it never takes focus to do it.
 *
 * ── THE COLOUR, AND A CONFLICT THAT IS REPORTED RATHER THAN SETTLED HERE ────
 *
 * It uses the canonical `Notice` `refusal` role, which is AMBER. `Notice`'s own header
 * records why, with measurements: `colors.alarmFill` is a BACKGROUND in this palette and reads
 * 2.08:1 used as a foreground, and the file states outright that "red means error or
 * destructive intent, and a refusal is neither — it is the palette's ATTENTION case, which is
 * amber". DELTA 11 §2's grammar says `red = a refusal`. Those disagree, one of them is
 * measured, and DELTA R §4(f) says not to invent a new red — so this reuses the existing
 * decision and the disagreement is in the report for the owner to settle.
 */
/*
 * 🔴 AN E2E SEAM, GATED ON `CG_E2E` — the same convention `MockRuntime`'s `CG_E2E_ORPHAN`,
 * `CG_E2E_OWNED_OCCUPANCY` and `CG_E2E_FIXED_BANK` seeds already use in this app.
 *
 * ⚠ WHY A SEAM RATHER THAN DRIVING A REAL REFUSAL. Every refusal this surface exists for is
 * raised by the BRIDGE — a multi-box collision, a plate with no source, a layer another
 * system owns — and the offline mock accepts the commands a spec can reach, so there is no
 * deterministic way to make one from the UI. The alternative was to assert the surface
 * against a refusal that only appears in a race, which is a flaky spec pretending to be a
 * strict one.
 *
 * It cannot fire in production: without `CG_E2E` the property is never assigned, and it is
 * assigned to nothing but `raiseRefusal`, which is exported anyway. It adds no behaviour —
 * it only makes an existing entry point reachable from a test.
 */
function armE2ESeam(): void {
  const w = window as unknown as {
    CG_E2E?: boolean;
    CG_TEST_REFUSE?: (m: string) => void;
    CG_TEST_SUCCEED?: (m: string) => void;
  };
  if (w.CG_E2E !== true) return;
  w.CG_TEST_REFUSE = (m: string) => {
    raiseRefusal(m);
  };
  w.CG_TEST_SUCCEED = (m: string) => {
    reportCommandSuccess(m);
  };
}

export function RefusalBanner(): JSX.Element | null {
  const refusal = useSyncExternalStore(onRefusal, getRefusal, getRefusal);
  useEffect(armE2ESeam, []);
  if (refusal === null) return null;

  /*
    The count rides the SENTENCE, not a badge: "(3 times)" after the text is read in the same
    pass as the refusal itself, where a separate chip is a second thing to notice. It appears
    only from the second press — "(1 times)" on a first refusal would be noise, and the
    plural is spelled rather than computed from a bare `s` because "1 time" never renders.
  */
  const text =
    refusal.count > 1 ? `${refusal.message} (${String(refusal.count)} times)` : refusal.message;

  return (
    <div className="cg-refusal" data-refusal="" data-refusal-count={String(refusal.count)}>
      {/*
        🔴 ADDENDUM A §A2 — THE DISMISS IS THE NOTICE'S, not a sibling of it.

        The first cut put a `Button` next to the `Notice`, and the owner found both defects
        that produces at once: the control sat OUTSIDE the banner's box, on the page ground,
        and it wore the page's default ink rather than the message's. Passing `onDismiss` puts
        it inside the box in the message's own colour, and every other caller of `Notice` gets
        the same treatment for free — which is what "fix it on the component" means.
      */}
      <Notice
        noticeRole="refusal"
        text={text}
        {...(refusal.detail !== null ? { detail: refusal.detail } : {})}
        onDismiss={clearRefusal}
        dismissLabel="Dismiss this refusal"
      />
    </div>
  );
}
