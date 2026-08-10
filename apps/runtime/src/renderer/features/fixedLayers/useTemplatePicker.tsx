import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { liveSourceCarrierState, unassignedPlateIds, type TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { useConfirm } from '../../ui/useDialog.js';
import { reportCommandSuccess } from '../status/commandFeedback.js';
import {
  currentSourceAssignments,
  forgetTemplateAssignments,
  sourcesVersion,
  subscribeSources,
} from '../sources/sourceStore.js';
import { templateDisplayName } from '../library/templateName.js';

/**
 * R-021 stage 3 — the template picker, shaped like `useConfirm`: a
 * promise-returning `pickTemplate()` plus the dialog element to render. That
 * shape is what lets the whole choose-then-load flow be ONE `RowAction` whose
 * `run` resolves when the operator has chosen — so the button and its
 * context-menu twin share the affordance by construction, instead of the menu
 * needing its own copy of "open a picker, then load".
 *
 * ── §6 — IT IS WHAT A ROW'S `LOAD` OPENS NOW ────────────────────────────────
 *
 * It used to be reachable only through a context-menu entry called LOAD FROM
 * LIBRARY, while `LOAD` went straight to a file chooser. The Library no longer
 * exists as a surface — R-028 folded it into the stack — so a control naming it
 * pointed at nothing the operator could see, and the menu entry went.
 *
 * DELETING THE ENTRY WITHOUT MOVING THE PICKER WOULD HAVE DELETED THREE
 * CAPABILITIES, which is why the picker moved rather than followed: re-using an
 * already-imported template, R-005's remove-a-template (this is the only list it
 * has), and simply SEEING what this browser holds. The entry was one entry point,
 * not the picker's reason to exist.
 *
 * So `LOAD` opens this, and IMPORT IS AN OPTION INSIDE IT rather than the whole of
 * it. That is the part that cannot be dropped: on a fresh install the list is
 * empty, and a picker whose only advice is "import a .vcg first" while being the
 * one thing standing between the operator and importing would be a dead end.
 * `pickTemplate` therefore has THREE outcomes, not two — a template, `'import'`,
 * or a dismissal — and the caller owns the file chain exactly as before.
 *
 * The list is pulled at OPEN time rather than subscribed: it is browser-local
 * (B-085) and the dialog is short-lived, so a snapshot taken when it opens is
 * exactly what the operator is choosing from.
 *
 * A dismissal (Cancel / Escape / backdrop, all of which route through the
 * Modal's safe path) resolves `null`, which the caller reports as the
 * operator's own "no": no success flash, no error toast.
 *
 * R-028 part B — this dialog is the ONLY template list in the product, so
 * R-005's library deletion lives here too. The bridge stays authoritative for the
 * refusal (refuse-while-referenced) and the wording is surfaced verbatim.
 *
 * ── 🔴 A9 — TWO THINGS THIS SURFACE GOT WRONG, BOTH MEASURED ────────────────
 *
 * **1. The refusal was invisible.** A template still referenced by a row is
 * refused `in-use` by the bridge (`caspar-runtime.ts` `templateRemove`, and the
 * mock's twin), and this dialog reported that through `reportCommandError` — the
 * COMMAND TOAST, which is `zIndex: 50` while `Modal`'s backdrop is `zIndex: 1000`
 * (`ui/Modal.tsx:58`, `features/status/CommandToast.tsx:15`). The refusal was
 * rendered UNDERNEATH the dialog that produced it, so pressing the button did
 * nothing and said nothing.
 *
 * ⚠ **THAT IS GENERIC, NOT THIS BUTTON'S.** Any `reportCommandError` raised while
 * a modal is open is behind it. Every refusal THIS dialog can produce now goes to
 * the dialog's OWN pinned message region instead; the toast is kept only for the
 * SUCCESS line, which is a statement about a dialog the operator is about to
 * leave rather than a reason they must read.
 *
 * **2. Why it looked live-source-specific.** It is not, and the mechanism says
 * why it looked it: a template with live plates is on a row BY CONSTRUCTION —
 * binding its plates requires selecting it, which requires loading it — so it is
 * the one that meets `in-use`, while templates that were only imported delete
 * freely. Clearing a row does not remove its item (that is CLEAR, and the item
 * stays on the row by design); the row's own REMOVE is what frees it.
 *
 * ── A9 — AND THE TWO VERBS NO LONGER SHARE ONE WORD ────────────────────────
 *
 * The ROW's `REMOVE` takes a template off THAT ROW; this one deletes it from the
 * STATION'S library, for every row, undoable only by re-importing the file. This
 * one is renamed, because it is the one whose meaning surprises — the row's verb
 * is accurate for what it does and its own confirm already names the row it acts
 * on (`LayerRow.tsx`, "Remove “X” from Layer 95?"). Renaming the row's word as
 * well would churn the layer table's fixed verb column (sized to "REMOVE",
 * `layerTable.ts:41`) and every spec that presses it, for no additional clarity
 * once the pair reads differently.
 */

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    maxHeight: '40vh',
    overflowY: 'auto' as const,
  },
  row: { display: 'flex', flexDirection: 'column' as const, alignItems: 'stretch' },
  rowActions: { display: 'flex', gap: '0.35rem', alignItems: 'center' },
  meta: { fontSize: '0.75rem', color: colors.textMuted },
  /**
   * D-137 / C-015 — the re-import notice. AMBER (`pending`), not the muted meta
   * grey it sits beside: amber is this palette's ATTENTION role — the one it
   * already carries for OCCUPIED / UNKNOWN / UNCONFIRMED — and an unreadable
   * carrier is exactly an UNKNOWN. Not red, which means error and destructive
   * intent only: nothing is broken, the answer is simply not recorded yet.
   */
  stale: { fontSize: '0.75rem', color: colors.pending },
  /**
   * D-137 / C-015 — the same ATTENTION amber, for the same kind of statement:
   * the template is fine, the work on it is not finished. A plate with no source
   * refuses its take, so the row names WHICH plates rather than only that some
   * exist — "2 plates need a source" sends the operator hunting.
   */
  unassigned: { fontSize: '0.75rem', color: colors.pending },
  empty: { fontSize: '0.85rem', color: colors.textMuted, margin: 0 },
} as const;

/**
 * D-137 / C-015 — what the operator is told when a template's Live Source carrier
 * is ABSENT (`liveSourceCarrierState` → `'unknown'`).
 *
 * ABSENT IS NOT "NONE", AND THIS ROW IS WHERE THAT DISTINCTION BECOMES VISIBLE.
 * A template imported before the carrier existed carries no statement about its
 * holes at all — the scene is discarded after import and the bridge parses no
 * HTML, so nothing left in the product can answer the question. Reading that
 * silence as "this template has no Live Sources" would take a template with real
 * holes on air with nothing composited behind them: a black rectangle where a
 * guest should be, with no error anywhere, because the hole is transparent by
 * design.
 *
 * So the row says what is true — the answer is unknown and a re-import is what
 * produces it — rather than filling the gap with the comfortable assumption.
 */
const STALE_CARRIER_LABEL = 'Re-import required';
const STALE_CARRIER_TITLE =
  'This template was imported before Live Sources were recorded, so the runtime cannot tell ' +
  'whether it has any. Re-import the .vcg to record them — until then a Live Source in it ' +
  'would be left with nothing behind it on air.';

/**
 * D-137 / C-015 — what the operator is told when a template has live plates that
 * no source is assigned to.
 *
 * A FRESHLY IMPORTED TEMPLATE HAS ALL OF THEM, and that is the ordinary state
 * rather than a fault: the author names plates for the layout, the installation
 * names its sources, and the two are joined by a deliberate action in Live
 * sources. This row is where the operator finds out that action is still owed —
 * before the take refuses, which is the other place they would find out.
 *
 * It also covers the DELETION case with no extra state: retiring a source drops
 * the assignments it orphaned, so those plates simply read as needing one again.
 */
const UNASSIGNED_TITLE =
  'These live plates have no source yet. Open Live sources to assign one to each — until then ' +
  'this template refuses its take, naming the plate.';

interface PickRequest {
  title: string;
  templates: readonly TemplateInfo[];
}

/**
 * What the operator chose.
 *
 * `'import'` is a real answer, not an error path: "none of these — I want to bring
 * in a new `.vcg`". It is returned rather than handled here because the import
 * chain needs the ROW's hidden file input and its exact slot, both of which belong
 * to the caller (see `LayerRow`).
 */
export type TemplateChoice = TemplateInfo | 'import' | null;

export function useTemplatePicker(): {
  pickTemplate: (title: string) => Promise<TemplateChoice>;
  pickerDialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const resolver = useRef<((choice: TemplateChoice) => void) | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  /**
   * A9 — the dialog's OWN message region. A refusal reported to the command
   * toast is rendered under this modal's backdrop and never read; this is where
   * a reason the operator must act on has to land.
   */
  const [message, setMessage] = useState<ModalMessage | null>(null);
  // D-137 / C-015 — SUBSCRIBED, unlike the template list beside it, because the
  // assignments are bridge-owned and a second console can bind a plate while
  // this dialog is open. The list is browser-local, so a snapshot is right for
  // it and wrong for this.
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const unassigned = useCallback(
    (template: TemplateInfo): string[] =>
      unassignedPlateIds(
        currentSourceAssignments(),
        template.templateId,
        (template.liveSources?.sources ?? []).map((s) => s.sourceId),
      ),
    [],
  );

  const pickTemplate = useCallback(async (title: string): Promise<TemplateChoice> => {
    const templates = await window.cg.templates.list();
    return new Promise<TemplateChoice>((resolve) => {
      resolver.current = resolve;
      setRequest({ title, templates });
    });
  }, []);

  /**
   * R-005, re-homed. The BRIDGE decides whether a removal is allowed (it
   * refuses while any row still references the template) and supplies the
   * operator-facing reason; this only asks, then re-lists.
   */
  const deleteTemplate = useCallback(
    async (template: TemplateInfo): Promise<void> => {
      const label = templateDisplayName(template);
      const bound = currentSourceAssignments().assignments.filter(
        (a) => a.templateId === template.templateId,
      ).length;
      const ok = await confirm({
        title: `Delete “${label}” from this station?`,
        // §6 — the word "library" named a panel that no longer exists. What is
        // true, and what the operator needs to know, is the SCOPE: this is not a
        // local tidy-up, it deletes the template everywhere.
        //
        // A9 — …and the FALLOUT, named rather than discovered: the plate bindings
        // go with it, because an assignment to an entry that no longer exists is
        // state with nothing left that refers to it.
        body:
          `“${label}” is deleted for every browser. This cannot be undone — the .vcg must be ` +
          `re-imported.` +
          (bound > 0
            ? ` Its ${String(bound)} plate binding${bound === 1 ? '' : 's'} ${bound === 1 ? 'is' : 'are'} deleted with it.`
            : '') +
          ` A row still holding it must be cleared with the row's own REMOVE first.`,
        confirmLabel: 'Delete from station',
        tone: 'remove',
      });
      if (!ok) return;
      setMessage(null);
      try {
        const res = await window.cg.templates.remove({ templateId: template.templateId });
        if (!res.ok) {
          // IN THE DIALOG, not the toast. The entry is still listed, because it
          // is still there — the two together are the honest report.
          setMessage({
            role: 'refusal',
            text: res.message ?? 'The template could not be deleted.',
          });
          return;
        }
        // The bindings go ONLY after the owner confirmed the removal. A refused
        // deletion must leave them exactly where they were.
        const refusal = await forgetTemplateAssignments(template.templateId);
        reportCommandSuccess(`Deleted “${label}”.`);
        if (refusal !== null) {
          setMessage({
            role: 'notice',
            text: `“${label}” was deleted, but its plate bindings could not be cleared.`,
            detail: refusal.text,
          });
        }
        const templates = await window.cg.templates.list();
        setRequest((current) => (current === null ? null : { ...current, templates }));
      } catch (err) {
        setMessage({
          role: 'refusal',
          text: err instanceof Error ? err.message : 'The template could not be deleted.',
        });
      }
    },
    [confirm],
  );

  const settle = useCallback((choice: TemplateChoice): void => {
    setRequest(null);
    setMessage(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(choice);
  }, []);

  const pickerDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        onClose={() => settle(null)}
        {...(message !== null ? { message } : {})}
        footer={
          <>
            {/*
              CANCEL FIRST IN DOM ORDER, like every other dialog. The row is
              right-aligned, so first-in-DOM is LEFTMOST and the primary action
              lands in the same corner it does everywhere else.

              It was last, and it was a `ghost` — no fill, no border, muted text,
              which reads as a line of static text rather than a control. `cancel`
              resolves to `neutral`: neutral must not mean invisible.
            */}
            <ModalAction actionRole="cancel" onClick={() => settle(null)}>
              Cancel
            </ModalAction>
            {/*
              §6 — IMPORT LIVES IN HERE, and it is not a convenience.

              `LOAD` opens this dialog, so if importing were not offered inside it
              the operator on a fresh install would meet an empty list telling him
              to import a `.vcg` with no way to do so. On a station with nothing
              loaded yet it is the only control that can do anything, which is
              exactly what makes it this dialog's PRIMARY — it now carries that
              weight through its role rather than through being placed first.
            */}
            <ModalAction actionRole="primary" onClick={() => settle('import')}>
              Import a .vcg…
            </ModalAction>
          </>
        }
      >
        {request.templates.length === 0 ? (
          <p style={styles.empty}>
            No templates in this browser yet — <strong>Import a .vcg…</strong> to bring one in.
          </p>
        ) : (
          <div style={styles.list}>
            {/* Newest first: the template the operator most recently imported is
                the one they are looking for. */}
            {[...request.templates].reverse().map((t) => {
              const label = templateDisplayName(t);
              const carrier = liveSourceCarrierState(t);
              const needsSource = unassigned(t);
              return (
                <div key={t.templateId} style={styles.row} data-template-id={t.templateId}>
                  <div style={styles.rowActions}>
                    <Button
                      variant="secondary"
                      aria-label={`Load ${label} onto this layer`}
                      title={t.templateId}
                      onClick={() => settle(t)}
                    >
                      {label}
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={`Delete ${label} from this station`}
                      onClick={() => void deleteTemplate(t)}
                    >
                      Delete from station
                    </Button>
                  </div>
                  <span style={styles.meta}>{t.templateType}</span>
                  {/*
                    D-137 / C-015 — said on the row, not hidden behind a hover.
                    `data-live-sources` carries the state machine-readably so the
                    E2E asserts the STATE rather than the wording.
                  */}
                  {carrier === 'unknown' ? (
                    <span
                      style={styles.stale}
                      data-live-sources="unknown"
                      title={STALE_CARRIER_TITLE}
                    >
                      {STALE_CARRIER_LABEL}
                    </span>
                  ) : (
                    <span hidden data-live-sources={carrier} />
                  )}
                  {/*
                    D-137 / C-015 — the plates still owed a source, NAMED. The
                    count alone would be a number the operator then has to go and
                    resolve; the ids are what the assignment surface lists.
                  */}
                  {needsSource.length > 0 && (
                    <span
                      style={styles.unassigned}
                      data-plates-unassigned={needsSource.join(',')}
                      title={UNASSIGNED_TITLE}
                    >
                      Needs a source: {needsSource.join(', ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {confirmDialog}
      </Modal>
    );

  return { pickTemplate, pickerDialog };
}
