import { useState, useSyncExternalStore } from 'react';
import type { LiveSourceDeclaration } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import {
  commitSourceAssignments,
  currentSourceAssignments,
  currentSourceCatalog,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import { appliedPlateSources } from './livePlates.js';

/**
 * 🔴 **`SOURCE-DEFAULTS-20` — THE TEMPLATE'S SOURCE DEFAULTS, BEHIND A LINK.**
 *
 * This is a RELOCATION, not a new capability. The same values were editable inline in the
 * Inspector's LIVE PLATES section, under the heading _"The DEFAULT every row using this
 * template starts from."_ — a per-plate select list that occupied a permanent slice of a
 * 396 px panel. The reference does not put it in the panel: it is a link in the section head
 * that opens a dialog, and that is what this is.
 *
 * **Nothing about the data changes.** Same store, same channel, same `(template, plate)` key,
 * same refusal.
 *
 * ── 🔴 THE SCOPE, ESTABLISHED BEFORE THE TITLE WAS WRITTEN ──────────────────
 *
 * The reference titles its dialog `Channel N · source defaults` and says the defaults apply to
 * the template ON THE ACTIVE CHANNEL. **Ours are not per channel, and the title must not say
 * they are.** `TemplateSourceAssignmentSchema` is `{ templateId, plateId, sourceId, fit? }` —
 * there is no channel field — and `validateSourceAssignments` keys uniqueness on
 * `templateId` + `plateId`. The module header says it in words: _"per template, per PLATE …
 * The operator assigns once, per template."_
 *
 * ⚠ So a `Channel 2` in this title would be a surface LYING ABOUT SCOPE, and the operator
 * would set a default on one channel expecting the other to be untouched. Making it truly
 * per-channel would add a field to a persisted, validated schema and cross the IPC contract —
 * out of scope by §2's own instruction — so the dialog is titled for the scope we HAVE and the
 * subtitle names the TEMPLATE, which is the thing the value actually belongs to.
 *
 * ── WHAT THIS DIALOG MAY NOT DO ─────────────────────────────────────────────
 *
 * 🔴 It sends NOTHING to CasparCG. An assignment is read when a row is TAKEN; it never
 * re-composites a graphic already on the channel, and a row that has been taken has FROZEN
 * this value (`caspar-runtime.ts` `#frozenAssignments`) so the edit reaches it at its next
 * take and never inside a switch. Golden rule 10: this is a configuration verb, and the footer
 * says so where the operator can read it.
 *
 * 🔴 Row overrides are a DIFFERENT LEVEL and are untouched. The resolution chain is the row's
 * emergency patch, then the row's per-look input, then this default; writing here cannot reach
 * either of the two above it.
 */
export function TemplateDefaultsDialog({
  open,
  onClose,
  templateId,
  templateName,
  plates,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  /** For the subtitle — the operator's word for this template, isolated like every name. */
  templateName: string;
  /** The template's DECLARED plates, in declaration order. */
  plates: readonly LiveSourceDeclaration[];
}): JSX.Element | null {
  useSyncExternalStore(subscribeSources, sourcesVersion);
  /*
    The edit is LOCAL to this dialog and committed by its own button — it does not ride the
    Inspector's draft store. That is deliberate and it is the whole point of the move: the
    value is TEMPLATE-wide, so staging it beside a ROW's field edits would put an
    installation-level change into a row's Update, which is the scope confusion the inline
    block's own header warned about. `Cancel` therefore discards by closing, with nothing
    staged anywhere.
  */
  const [draft, setDraft] = useState<ReadonlyMap<string, string> | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /*
    🔴 **CLOSING DISCARDS — and this had to be written down because the obvious spelling is
    wrong.** `open` only makes this component return `null`; the component itself stays
    MOUNTED, so `useState` survives a close. Handing `onClose` straight to Cancel and to the
    ✕ therefore left the abandoned edit in place, and the next open showed the operator the
    value they had just declined to save. Caught by the Cancel spec, which reopens and reads
    the box rather than trusting the press.

    ⚠ The refusal goes with it: a sentence about a value that is no longer staged is a
    sentence about nothing.
  */
  const close = (): void => {
    setDraft(null);
    setRefusal(null);
    onClose();
  };

  if (!open) return null;

  const catalog = currentSourceCatalog();
  const applied = appliedPlateSources(templateId, plates);
  const valueOf = (plateId: string): string => draft?.get(plateId) ?? applied.get(plateId) ?? '';
  const stage = (plateId: string, sourceId: string): void => {
    setDraft((prev) => {
      const next = new Map(prev ?? []);
      next.set(plateId, sourceId);
      return next;
    });
    // A new edit supersedes the last refusal's subject; leaving it up would pin a sentence
    // about a value the operator has already changed.
    setRefusal(null);
  };

  async function commit(): Promise<{ accepted: boolean }> {
    if (draft === null) return { accepted: true };
    /*
      🔴 **THE EXISTING ENTRY IS SPREAD, NOT REBUILT FROM THREE FIELDS.**

      `TemplateSourceAssignment` carries an optional `fit` — `C-028`'s operator fit-mode
      override — and a writer that reconstructs `{ templateId, plateId, sourceId }` DELETES it
      for every plate it touches. Nothing in the renderer writes `fit` today, so the loss
      would be latent rather than immediate, which is exactly the kind of defect that ships.
      Carrying the entry forward and overriding only `sourceId` is the same cost and cannot
      lose a field this dialog has never heard of.
    */
    const current = currentSourceAssignments();
    const mine = new Map(
      current.assignments.filter((a) => a.templateId === templateId).map((a) => [a.plateId, a]),
    );
    const untouched = current.assignments.filter(
      (a) => !(a.templateId === templateId && draft.has(a.plateId)),
    );
    const written = [...draft.entries()]
      // An empty value means NOT ASSIGNED, which REMOVES the entry rather than writing a
      // blank one — an assignment naming nothing is a state nothing downstream can read.
      .filter(([, sourceId]) => sourceId !== '')
      .map(([plateId, sourceId]) => ({ ...mine.get(plateId), templateId, plateId, sourceId }));
    const res = await commitSourceAssignments({ assignments: [...untouched, ...written] });
    if (res !== null) {
      /*
        🔴 REFUSED WITH A REASON, NEVER SILENTLY REWRITTEN (§6). The rule sentence and the
        bridge's own specifics are shown together in the dialog's message region, the staged
        values stay exactly as the operator left them, and the dialog stays open so the edit
        is still theirs to correct.
      */
      setRefusal(res.detail === undefined ? res.text : `${res.text} ${res.detail}`);
      return { accepted: false };
    }
    setDraft(null);
    onClose();
    return { accepted: true };
  }

  return (
    <Modal
      /*
        §2 — NO CHANNEL IN THIS TITLE. See the module header: the value is per TEMPLATE, and
        naming a channel over it would be a surface lying about its own scope.
      */
      title="Source defaults"
      ariaLabel="Source defaults"
      onClose={close}
      size="prose"
      /*
        🔴 THE SHARED FIXED FRAME, through the door `PLATES-AUDIO-11` §5 opened — one height
        expression (`--r-modal-h-frame`), not a second mechanism. The list of plates is what
        changes under the operator here: a template with three plates and one with one must
        not draw two different boxes, or the button he is aiming at moves with the template.
      */
      frame="fixed"
      {...(refusal !== null && { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={close}>
            Cancel
          </ModalAction>
          {/*
            ORDINARY PRIMARY. Saving a default destroys nothing and reaches no output, so it
            takes the plain primary treatment — red is for controls that destroy and for
            nothing else (`design.md` §29.2).
          */}
          <AsyncButton
            variant="primary"
            data-defaults-save=""
            disabled={draft === null}
            run={commit}
            onError={() => undefined}
          >
            Save defaults
          </AsyncButton>
        </>
      }
    >
      <div data-defaults-body="">
        {/*
          🔴 THE DRAWING'S SHAPE (gh3, owner 2026-09-14): an intro naming the template, one
          row per plate, and the timing line under them.

          ⚠ The drawing stacks each label ABOVE its box (`.field.full`); ours leads with it on
          the same line, on the owner's later call — «لیبل اینپوتها در خط جدا نباشه
          قبلش باشه بهتره» — so the dialog and the Inspector's own inputs read the same way.
        */}
        <p style={styles.intro} data-defaults-intro="">
          Edit the starting source mappings for{' '}
          <strong>
            <IsolatedName title={templateId}>{templateName}</IsolatedName>
          </strong>
          . These defaults apply to every row using this template; row overrides remain separate.
        </p>
        {plates.length === 0 ? (
          /*
            §3 — a template with NO plates SAYS WHY rather than showing an empty box. Not
            reachable from the Inspector today (the section carrying the link does not render
            for such a template), but a template can lose its plates under an open dialog
            through a re-import, and a blank panel would read as broken rather than as empty.
          */
          <p style={styles.empty} data-defaults-empty="">
            This template declares no live plates, so it has no sources to default.
          </p>
        ) : catalog.sources.length === 0 ? (
          <p style={styles.empty} data-defaults-no-catalog="">
            No sources are defined on this station yet — define them under Station setup ▸ Live
            sources first.
          </p>
        ) : (
          <>
            {plates.map((plate, i) => (
              <div key={plate.elementId} style={styles.field}>
                {/*
                  ⚠ **`Plate N` IS THE LABEL AND THE PLATE ID IS ON THE `title`** — golden rule
                  11, and the drawing agrees. `plate.sourceId` is the template AUTHOR's
                  identifier for a hole in a layout (`guest-1`); the operator reads a position.
                  The id is RELOCATED rather than deleted: it is what an author correlates
                  against, so it rides the hover.
                */}
                <label
                  htmlFor={`plate-default-${plate.sourceId}`}
                  style={styles.fieldLabel}
                  title={plate.sourceId}
                >
                  Plate {i + 1}
                </label>
                <select
                  id={`plate-default-${plate.sourceId}`}
                  className="cg-field"
                  style={styles.select}
                  aria-label={`Default source for ${plate.sourceId}`}
                  data-defaults-select={plate.sourceId}
                  value={valueOf(plate.sourceId)}
                  onChange={(e) => stage(plate.sourceId, e.target.value)}
                >
                  <option value="">— not assigned —</option>
                  {catalog.sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {/*
              §3 — WHAT IT CHANGES AND THAT NO PLAYOUT COMMAND IS SENT, in our words rather
              than the prototype's "Only the sample configuration changes here" — which is
              true of a demo and says nothing about a station.

              Golden rule 10 on the surface: this is a CONFIGURATION verb. It reaches no
              output at all, and a row that has already been taken keeps what it froze until
              its next take — the half an operator editing a live show needs to read.
            */}
            <p style={styles.foot} data-defaults-foot="">
              Applies to every row using this template, at its next take. No playout command is
              sent.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

const styles = {
  intro: {
    color: colors.textSecondary,
    fontSize: 'var(--r-text-md)',
    lineHeight: 1.5,
    margin: '0 0 var(--r-space-6)',
  },
  /*
   * 🔴 **LABEL BEFORE THE BOX, ON ONE LINE — owner, 2026-09-14:** «لیبل اینپوتها در خط
   * جدا نباشه قبلش باشه بهتره.»
   *
   * A two-column grid rather than a stack, and it is the shape that satisfies BOTH of the
   * owner's calls at once: the label LEADS on the same line, and `1fr` gives the box every
   * pixel the label does not take — which is what «تمام صفحه کن مثل gh2» asked for. A
   * label stacked above (the drawing's `.field.full`) spends a whole line per field, and in a
   * panel this tall that is the space the move was made to reclaim.
   *
   * ⚠ The label column is `auto`: it takes the widest label and no more, so every box in the
   * section starts on the SAME vertical without anyone choosing a number.
   */
  field: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: 'var(--r-space-3)',
    alignItems: 'center',
    marginBottom: 'var(--r-space-3)',
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 'var(--r-text-sm)',
    fontWeight: 'var(--r-weight-medium)',
    whiteSpace: 'nowrap' as const,
  },
  select: { width: '100%' },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-md)', margin: 0 },
  foot: {
    margin: 'var(--r-space-6) 0 0',
    color: colors.textMuted,
    fontSize: 'var(--r-text-sm)',
    lineHeight: 1.5,
  },
} as const;
