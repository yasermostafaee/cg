import type { FieldValue, FieldValues, StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { timingPatchToSend } from './timingToSend.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { commitSourceAssignments, currentSourceAssignments } from '../sources/sourceStore.js';
import { defaultPositionOf } from '../stack/defaultPositionStore.js';
import { isPositionLocked } from './PositionPicker.js';
import { recordSentPasses } from './timingSent.js';
import {
  buildApplyPayload,
  buildLookBindingsPayload,
  buildOverlayPayload,
  clearPositionDraft,
  clearTimingDraft,
  clearStagedLookBindingsMatching,
  clearStagedMatching,
  clearStagedPlatesMatching,
  isPositionDirty,
  offsetNumber,
  positionDraftOf,
  singleFieldOverlay,
  snapshotDraft,
  snapshotLookBindingDraft,
  snapshotPlateDraft,
  stageField,
  timingDraftOf,
  type FieldPath,
} from './draftStore.js';

/**
 * R-003 — apply an item's staged draft as ONE atomic `stack.update`: the
 * complete field-set (applied values with drafts overlaid). On an accepted
 * apply, ONLY the fields that were actually sent (and are unchanged since) are
 * cleared — a field the operator staged DURING the in-flight round-trip
 * survives instead of being silently dropped. A rejected update (e.g. the link
 * is down) keeps every edit staged. Errors surface via the same command-feedback
 * channel the stack intents use — never swallowed, never shown optimistically.
 * Sending with nothing staged re-sends the applied values (the B-048 workaround).
 */
export function applyDraft(
  item: StackItemState,
  /**
   * 🔴 `PASSES-CYCLE-ONLY-26` §A1.2 — the TEMPLATE's playout, because what timing a press may
   * send depends on it. Threaded rather than looked up here: this module is deliberately free
   * of stores it does not own, and the caller already holds the template index.
   *
   * `undefined` is a real answer — an old import states no mode — and admits no timing.
   */
  playout?: TemplateInfo['playout'] | undefined,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  const sent = snapshotDraft(item.itemId);
  const plates = snapshotPlateDraft(item.itemId);
  /*
    🔴 **BM-2 §4.1 — THE PER-LOOK BINDINGS RIDE THE FIELD UPDATE, IN ONE CALL.**

    They are not a second write and must never become one. The operator's action is one press
    carrying both halves — change `l-2`'s input AND fix its caption — and the bridge applies
    the bindings, reconciles the fills and only then tells the page, so a refused binding
    refuses the whole update. Looping the per-plate writer (`swapLiveSource`) over the staged
    set is what this replaces: it could land three texts and not the fourth input, which is a
    wrong graphic on air that nothing reports.

    ⚠ **The TEMPLATE ASSIGNMENT below is still its own call, and that is not a hole in the
    atomicity.** It is a different LEVEL with a different blast radius — every row using the
    template — and a different timing, and folding a template-wide edit into one row's update
    would be the scope confusion §3.4 exists to stop. What §4.1 requires to be atomic is what
    reaches AIR on THIS row, and that is exactly what travels in the one call.
  */
  const lookBindings = snapshotLookBindingDraft(item.itemId);
  const bindingsPayload =
    lookBindings.size === 0
      ? undefined
      : buildLookBindingsPayload(item.itemId, item.lookSourceOverride);
  const fields = (): Promise<{ accepted: boolean; errorCode?: string | undefined }> =>
    sendUpdate(
      item,
      sent,
      buildApplyPayload(item.itemId, item.fields),
      bindingsPayload,
      lookBindings,
    );
  /*
    🔴 **THE POSITION RIDES THE SAME PRESS — owner, 2026-09-14.** `Apply position` is gone;
    UPDATE commits the row's whole draft, text and placement together.

    ⚠ **IT IS STILL `stack.setPosition`, ITS OWN CHANNEL.** No wire, no IPC schema and no
    payload changed — what moved is which CONTROL fires it. Folding a position into the
    `stack.update` field-set would send the template a field it never declared, which is the
    reason `positionDrafts` is a separate map in the first place, and that reason is intact.

    🔴 **AND IT IS NOT SENT ON A LOCKED ROW, which preserves the refusal rather than
    weakening it.** `setPosition` is refused while the row is on air (`R-011`), and the boxes
    are disabled for exactly as long. But a draft staged OFF air survives a take — drafts
    outlive selection changes by design — so an UPDATE pressed after that take would fire a
    command the bridge is bound to refuse and drag the whole press down with it, reporting a
    failed update to an operator whose text edit was accepted. Asking the SAME predicate the
    picker disables its boxes with (`isPositionLocked`) means the two can never disagree
    about who is locked, and no refusal CONDITION moves.
  */
  const position = (): Promise<boolean> => sendPosition(item);
  /*
    🔴 **AND THE TIMING RIDES THE SAME PRESS — `DELTA B4`.** It was committed on BLUR, which
    made looking away from the box a command toward air; it is a draft now, and this is where
    the draft is spent.

    ⚠ **IT IS STILL `stack.set-pass-timing`, ITS OWN CHANNEL — the answer to B4's question.**
    It does NOT ride the field update's `CG UPDATE`: it is a SEPARATE `CG UPDATE` carrying only
    `__cg.timing`, sent immediately before the fields, exactly as the position is sent on
    `stack.setPosition`. Folding it into the field payload would mean this renderer composing
    `__cg` itself — a reserved key the BRIDGE owns and strips — and would make one wire message
    answer to two owners. No wire, no IPC schema and no payload shape moved for B4.
  */
  const timing = (): Promise<boolean> => sendTiming(item, playout);
  /*
    PLATES FIRST, and it is not arbitrary: the assignment reaches NOTHING on air (it is read at
    the next take), while `stack.update` reaches the graphic on the channel now. Doing the
    harmless halves first means a refused one cannot leave a half-applied on-air change behind
    it. The FIELDS are therefore always last.

    EVERY half runs regardless, and the verdict is the AND of them: a refused assignment must
    not silently discard a field edit the operator also staged, and a refused field update must
    not make an accepted assignment look rejected. Each half clears only its OWN staged
    entries, on its own success.

    ⚠ The chain is a fold rather than nested `.then`s because a fourth half made the nesting
    the place a mistake would hide. It is the SAME sequence and the SAME verdict: each half
    awaits the one before it, and `ok` can only ever go from true to false.
  */
  const preflight: (() => Promise<boolean>)[] = [
    ...(plates.size === 0 ? [] : [(): Promise<boolean> => sendPlateAssignments(item, plates)]),
    position,
    timing,
  ];
  return preflight
    .reduce<
      Promise<boolean>
    >((prior, half) => prior.then((ok) => half().then((mine) => ok && mine)), Promise.resolve(true))
    .then((ok) => fields().then((res) => (ok ? res : { ...res, accepted: false })));
}

/**
 * Send the item's staged TIMING, if it has one that states a value.
 *
 * Resolves `true` when there was nothing to do as well as when the send was accepted — the
 * caller ANDs it into the press's verdict, and "no timing staged" must not read as a refusal.
 * The draft is cleared only on ACCEPTANCE, exactly as a field's and a position's are: a refused
 * count stays staged, the dirty mark stays up, and the operator's number is still theirs.
 *
 * 🔴 **OFF AIR THIS SENDS ZERO AMCP AND THAT IS THE POINT (golden rule 10).** The call is still
 * made — the bridge RECORDS the intent so the next take carries it (`#sendAdd`) — but
 * `setPassTiming` gates its wire send on `#ownsLiveSeats`, so a row that owns no live seats
 * produces no `CG UPDATE`, no `PLAY` and no fill. The console does not decide that; it asks the
 * one predicate that already owns the question, which is why there is no second spelling of
 * "is this row live" on this side of the seam.
 *
 * ⚠ A HALF-TYPED DRAFT SENDS NOTHING RATHER THAN A GUESS. `timingPassesOf` answers `undefined`
 * for anything that is not a whole count, so `"tw"` left in the box when UPDATE is pressed
 * carries no `passes` member at all — it is not rewritten to a number, and it does not fail the
 * press. What refuses bad text with a reason is the CONTROL, at the moment it is typed.
 */
function sendTiming(
  item: StackItemState,
  playout: TemplateInfo['playout'] | undefined,
): Promise<boolean> {
  const draft = timingDraftOf(item.itemId);
  if (draft === undefined) return Promise.resolve(true);
  /*
    🔴 `PASSES-CYCLE-ONLY-26` §A1.2 — **THE DIFF COMES FROM THE ONE BUILDER, GATE AND ALL.**

    It used to be computed inline here. It moved to `timingToSend.ts` because PVW needs the
    same decision (`effectiveTimingFor` is its sibling, behind the same gate), and two places
    deciding what timing may leave this console is the shape this tree keeps paying for.

    `undefined` now covers BOTH "nothing differs from what is applied" and "this template does
    not admit pass timing at all", and the draft is dropped either way: in the first case it has
    become a restatement of the truth rather than an edit, and in the second it is a value the
    operator can no longer see or change. Leaving either staged would keep a dirty chip up over
    a row with nothing outstanding — the panel disagreeing with itself.
  */
  const patch = timingPatchToSend(playout, item);
  if (patch === undefined) {
    clearTimingDraft(item.itemId);
    return Promise.resolve(true);
  }
  return window.cg.stack.setPassTiming({ itemId: item.itemId, ...patch }).then(
    (res) => {
      if (res.ok) {
        clearTimingDraft(item.itemId);
        // `DELTA A2` — stamped only on ACCEPTANCE, so the line can never time a send the
        // bridge refused. It is what this console did, and it stays true from then on.
        if (patch.passes !== undefined) recordSentPasses(item.itemId);
        return true;
      }
      /*
        `setPassTiming` answers with a SENTENCE of its own (unlike `setPosition`, which carries
        a reason code), so it is reported as written rather than re-worded here: the bridge
        knows whether CasparCG refused the command or the row left the stack, and this side
        does not.
      */
      reportCommandError(res.message ?? 'The timing change was not accepted.');
      return false;
    },
    (err: unknown) => {
      reportCommandError(err instanceof Error ? err.message : 'The timing change failed.');
      return false;
    },
  );
}

/**
 * Send the item's staged POSITION, if it has one that differs from what is applied.
 *
 * Resolves `true` when there was nothing to do as well as when the send was accepted — the
 * caller ANDs it into the press's verdict, and "no position staged" must not read as a
 * refusal. The staged value is cleared only on acceptance, exactly as a field's is: a
 * refused move stays staged, the dirty mark stays up, and the operator's placement is still
 * theirs to retry.
 */
function sendPosition(item: StackItemState): Promise<boolean> {
  const draft = positionDraftOf(item.itemId);
  if (draft === undefined) return Promise.resolve(true);
  const applied = item.position ?? defaultPositionOf(item.templateId);
  if (!isPositionDirty(item.itemId, applied)) return Promise.resolve(true);
  // See the note at the call site: a locked row is left alone rather than refused.
  if (isPositionLocked(item)) return Promise.resolve(true);
  return window.cg.stack
    .setPosition({
      itemId: item.itemId,
      position: {
        anchor: draft.anchor,
        offset: { x: offsetNumber(draft.x), y: offsetNumber(draft.y) },
      },
    })
    .then(
      (res) => {
        if (res.ok) {
          clearPositionDraft(item.itemId);
          return true;
        }
        /*
          `setPosition`'s answer carries a REASON CODE and no sentence of its own (unlike
          `stack.update`), so the wording comes from the same `errorCodeMessage` table the
          old `Apply position` button read — the message the operator saw before this move
          is the message they see now.
        */
        reportCommandError(errorCodeMessage(res.reason) ?? 'The position was not accepted.');
        return false;
      },
      (err: unknown) => {
        reportCommandError(err instanceof Error ? err.message : 'The position could not be sent.');
        return false;
      },
    );
}

/**
 * 🔴 `TIMING-BUILD-21` §2(c) — the assignment rebuild, SPREADING each prior entry.
 *
 * This was an exhaustive three-key object literal (`{ templateId, plateId, sourceId }`) and it
 * ATE THE OPERATOR'S `fit` OVERRIDE. The shape is the same silent-drop site as the runtime's
 * four-key playout literal: the entries being rewritten are first filtered OUT of `rest`, then
 * rebuilt here, so every key the rebuild does not name is dropped — with no compiler error,
 * because `fit` is optional.
 *
 * The symptom is quiet and late: an operator sets a plate's fit mode, later re-points that plate
 * at a different source, and the fit silently reverts to the author's. Spreading the prior
 * assignment carries `fit` — and any key added to `TemplateSourceAssignmentSchema` after today.
 *
 * ⚠ Exported as a pure function so the guard can test the REAL rebuild rather than a
 * re-derivation of it. The three named keys stay AFTER the spread: they are this call's subject
 * and must win over whatever the prior entry said.
 */
export function nextPlateAssignments<
  T extends { templateId: string; plateId: string; sourceId: string },
>(current: readonly T[], templateId: string, plates: ReadonlyMap<string, string>): T[] {
  const rest = current.filter((a) => !(a.templateId === templateId && plates.has(a.plateId)));
  const priorOf = (plateId: string): T | undefined =>
    current.find((a) => a.templateId === templateId && a.plateId === plateId);
  const added = [...plates.entries()]
    .filter(([, sourceId]) => sourceId !== '')
    .map(([plateId, sourceId]) => {
      const prior = priorOf(plateId);
      // A plate that HAS a prior entry keeps every key of it, with this call's three winning.
      // A plate with none is a brand-new assignment: the three keys are all there is, and
      // inventing any other would be worse than omitting it.
      return prior === undefined
        ? ({ templateId, plateId, sourceId } as T)
        : { ...prior, templateId, plateId, sourceId };
    });
  return [...rest, ...added];
}

/**
 * D-137 / C-015 — write the item's staged plate assignments through
 * `sources.set-assignments`.
 *
 * ⚠ TEMPLATE-LEVEL, so the payload is built from the assignments IN FORCE with
 * this template's staged plates overlaid — never from the item's own view alone.
 * An empty staged value means "not assigned", which REMOVES the entry rather than
 * writing a blank one: an assignment naming nothing is a state nothing downstream
 * can read.
 */
function sendPlateAssignments(
  item: StackItemState,
  plates: ReadonlyMap<string, string>,
): Promise<boolean> {
  const next = nextPlateAssignments(
    currentSourceAssignments().assignments,
    item.templateId,
    plates,
  );
  return commitSourceAssignments({ assignments: next }).then((refusal) => {
    if (refusal === null) {
      clearStagedPlatesMatching(item.itemId, plates);
      return true;
    }
    // The same command-feedback channel every other refusal on this surface
    // uses — never swallowed, never shown optimistically. The staged plates
    // stay staged, exactly as a rejected field update keeps its drafts.
    reportCommandError(refusal.text);
    return false;
  });
}

/**
 * R-018 — apply ONE field's value now, through the SAME `stack.update` path
 * the Update button uses. The value is STAGED first, so a rejected/failed
 * update keeps it as a draft (dirty marker shows) exactly like a hand edit;
 * on acceptance only THIS field's staged entry clears. Other fields ride along
 * at their APPLIED values — a from-file reload never carries the operator's
 * unrelated staged edits to air.
 */
export function applyFieldValue(
  item: StackItemState,
  path: FieldPath,
  value: FieldValue,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  stageField(item.itemId, path, value);
  const sent = singleFieldOverlay(path, value);
  return sendUpdate(item, sent, buildOverlayPayload(item.fields, sent));
}

/** The ONE wire call + feedback path behind both apply flavors above. */
function sendUpdate(
  item: StackItemState,
  sent: FieldValues,
  fields: FieldValues,
  lookBindings?: Record<string, Record<string, string>> | undefined,
  sentBindings?: ReadonlyMap<string, ReadonlyMap<string, string>> | undefined,
): Promise<{ accepted: boolean; errorCode?: string | undefined }> {
  return window.cg.stack
    .update({
      itemId: item.itemId,
      fields,
      mergeMode: 'merge',
      ...(lookBindings !== undefined && { lookBindings }),
    })
    .then(
      (res) => {
        if (res.accepted) clearStagedMatching(item.itemId, sent);
        /*
        🔴 §4.4 — CLEARED ONLY ON ACCEPTANCE, and only what was actually sent. A refused batch
        leaves EVERY staged edit staged: the operator's composition is still theirs to retry,
        and the dirty chip still says so. Clearing on refusal is how an unapplied edit becomes
        an edit nobody knows was lost.
      */
        if (res.accepted && sentBindings !== undefined)
          clearStagedLookBindingsMatching(item.itemId, sentBindings);
        // B-070 — say WHY. An update onto a producerless slot is no longer
        // refused at all (the bridge commits it), so a refusal that reaches here
        // is a real one and must name its cause, not just "not accepted".
        // BM-2 — the refusal's OWN sentence wins when it has one: a binding refusal names the
        // two frames and the look, and no fixed code can carry that.
        else
          reportCommandError(
            res.message ?? errorCodeMessage(res.errorCode) ?? 'Update was not accepted.',
          );
        return res;
      },
      (err: unknown) => {
        reportCommandError(err instanceof Error ? err.message : 'Update failed.');
        throw err instanceof Error ? err : new Error('Update failed.');
      },
    );
}
