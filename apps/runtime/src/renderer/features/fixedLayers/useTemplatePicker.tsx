import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Layers,
  LayoutTemplate,
  Rows3,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  describeReferencePlace,
  liveSourceCarrierState,
  referenceRowName,
  requiredBankFor,
  unassignedPlateIds,
  type FixedLayerBank,
  type TemplateInfo,
  type TemplateReference,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction, type ModalMessage } from '../../ui/Modal.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { useConfirm } from '../../ui/useDialog.js';
import { pickFile } from '../../ui/pickFile.js';
import { importVcgToStation } from './fixedSlotLoad.js';
import { requestRowFocus } from '../layers/rowFocus.js';
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
 * `pickTemplate` therefore has FOUR outcomes, not two — a template, `'import'`
 * (open the OS chooser), a DROPPED file, or a dismissal — and the caller owns the
 * import chain exactly as before.
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
 * ── `RUNTIME-REDESIGN-01` PHASE 8 — THE LOOK IS `01`'s, THE CONTRACT IS UNCHANGED ──
 *
 * `01-template-picker.html` as rendered: a search box over three kind chips, then a list
 * of rows — a thumbnail, the name over a meta line with its badges — and a footer sentence
 * beside the actions (`LIBRARY_PX`, `design.md` §15.3). What is NOT adopted, and why:
 *
 *   - ⭐ ~~its SELECT-THEN-`Load into` flow~~ — **REVERSED BY THE OWNER, 2026-09-09,
 *     `RUNTIME-REPAIR-05`.** This note argued that the row's one press IS the load and that
 *     the aside therefore had nothing to describe. The owner saw the built picker and decided
 *     otherwise: the picker is TWO dialogs, a row is SELECTED, and the footer commits it. The
 *     count that argument leaned on was wrong too — nine spec files reach `app.loadTemplate`,
 *     not twenty, and all nine go through ONE fixture method (§22.1).
 *   - its `Into` destination select: this dialog's door is the row, so the destination is
 *     fixed. It is now NAMED in the aside as well as the title (below), which is what that
 *     select exists to tell the operator.
 *
 * ── `RUNTIME-REPAIR-04` — THE FRAME, THE ASIDE AND `Manage`, WHICH THIS NOTE USED TO REFUSE ──
 *
 * Measured by opening `#template-dialog` at 1280 x 800: the picker wears the OUTER `.modal`
 * family's BASE width (1120, `--r-modal-w-library`) with a `776px 342px` split, and its
 * `Manage` control opens a management list that REPLACES the selection layout entirely.
 *
 * Two of the three refusals above are withdrawn, and the third is sharpened rather than
 * repeated. The aside is NOT a column of categories or filters — it is a read-out of the
 * SELECTED template (a preview, `Type / Looks / Text fields / Availability`, a compatibility
 * notice), so adopting it whole means adopting select-then-load, which is the contract
 * question `design.md` §15.1 filed to the owner and did not answer. What this column carries
 * instead is what the product genuinely knows while the list is open: the DESTINATION the
 * picker was opened from, and the drop zone — which the audit found sitting below the fold at
 * the foot of the list.
 *
 * `Manage` is where the owner's decided-but-unbuilt item lands (`design.md` §18.4): the red
 * `Delete from station` is OFF THE ROW. Its behaviour, its confirm and its refusal path are
 * untouched — this moved a control, it did not re-decide what the control does.
 *
 * `02-template-import.html`'s import dialog is theatre by its own disclaimer ("Simulated
 * checks"); the product's import is `importVcgFile` → `verify → unpack → runtimeShortfall →
 * render`, and it is untouched. The one honest interaction `02` has — DROP A PACKAGE — is
 * adopted: a `.vcg` dropped anywhere on this dialog resolves the pick with the File and the
 * caller runs THE SAME chain the OS chooser feeds. Nothing is checked here first, not even
 * the extension: the chain's own `verify` is the one gate, and a second one in front of it
 * would be a place for the two to disagree.
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
  /*
    `B-212` — the places a refused deletion named, one line each with its remedy
    beside it. Rendered in the BODY, under the list, because the pinned message region
    is strings by contract (see `ModalMessage`) and a remedy is a control.
  */
  references: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--r-space-1)',
    marginTop: 'var(--r-space-3)',
    paddingTop: 'var(--r-space-2)',
    borderTop: '1px solid var(--r-border)',
    fontSize: 'var(--r-text-sm)',
  },
  reference: {
    display: 'flex',
    gap: 'var(--r-space-2)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
 * names its sources (Station setup ▸ Live sources), and the two are joined by a
 * deliberate action in the Inspector's Live plates. This row is where the operator
 * finds out that action is still owed — before the take refuses, which is the other
 * place they would find out.
 *
 * It also covers the DELETION case with no extra state: retiring a source drops
 * the assignments it orphaned, so those plates simply read as needing one again.
 */
const UNASSIGNED_TITLE =
  'These live plates have no source yet. Define the sources in Station setup ▸ Live sources, then ' +
  'assign one to each plate in the Inspector — until then this template refuses its take, naming ' +
  'the plate.';

/**
 * Phase 8 — the reference's footer sentence, and it is TRUE of this product: a fixed-row
 * LOAD is list-only on the bridge (`fixedSlotLoad.ts` — no adopt-`CLEAR`, no `CG ADD`), and
 * PLAY is the row's first wire contact. Golden rule 10 in one line, where the operator
 * reads it.
 */
const FOOT_INFO = 'Loading prepares the row. Use Play when you’re ready to go on air.';

/**
 * `RUNTIME-REPAIR-04` — the management view's own footer sentence.
 *
 * The reference says _"Deleting affects the station library. Templates in use are protected in
 * this demo."_ The second half is FALSE here and is not adopted: nothing is "protected" by this
 * surface at all. The BRIDGE refuses a template a row still references and names the places
 * (`B-212`), which is a refusal the operator can act on rather than a control they cannot press.
 */
const MANAGE_FOOT_INFO =
  'A row still holding a template must be cleared with its own REMOVE first.';

/**
 * 🔴 `RUNTIME-REPAIR-05` §3 — THE ROW'S ONE REFUSAL, IN ONE PLACE, SAID THREE WAYS.
 *
 * There is exactly ONE condition under which a template cannot go onto a row:
 * `requiredBankFor(template) !== accepts` — the same predicate the bridge refuses on, so the
 * surface and the wire cannot disagree about what is offerable. (`Re-import required` and
 * `Needs a source: …` are CAUTIONS: they warn, they have never blocked a load, and they still
 * do not.)
 *
 * It used to be said once, as a two-line paragraph under the row — which is the Designer's own
 * root cause in miniature: prose explaining what could be expressed as state. Now the SAME
 * strings are read by three surfaces at three depths:
 *
 *   the CHIP    on the row      — four words, the state
 *   the TOOLTIP on the row      — the whole sentence, one hover away (golden rule 11)
 *   the ASIDE   when selected   — the whole sentence, unmissable, beside a disabled primary
 *
 * One source, so a later edit cannot make the hover and the aside say different things about
 * the same refusal.
 */
const REFUSAL = {
  /** The row is a BED row and the template is not a bed. */
  low: {
    chip: 'Requires an operator row',
    title: 'Bed rows sit below the live plates',
    text:
      'This row is a graphics bed — it sits below the live plates, so only a template that ' +
      'declares plates belongs on it. Load this one onto an operator row.',
  },
  /** The row is an OPERATOR row and the template declares plates. */
  high: {
    chip: 'Requires a bed row',
    title: 'This template belongs on a bed row',
    text:
      'This template declares live plates, so it is a graphics bed and must sit below them. ' +
      'Load it onto one of the bed rows at the bottom of the list.',
  },
} as const;

/** What the aside says when the selection CAN go onto this row — the reference's own pair. */
const COMPATIBLE = {
  title: 'Ready for this row',
  text: 'Loading prepares the row. It stays off air until you press Play.',
} as const;

/** The reference's three kind chips, keyed by the bank a template belongs on. */
type KindFilter = 'all' | 'graphic' | 'bed';
const KIND_CHIPS: readonly { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All templates' },
  { key: 'graphic', label: 'Graphics' },
  { key: 'bed', label: 'Graphics beds' },
];

/** `requiredBankFor` in the operator's words: a low-bank template is a graphics bed. */
function kindOf(template: TemplateInfo): 'graphic' | 'bed' {
  return requiredBankFor(template) === 'low' ? 'bed' : 'graphic';
}

/**
 * `RUNTIME-REPAIR-04` — WHERE this pick is going, for the aside's destination card.
 *
 * The reference draws `Destination · Layer 5` over `Graphic row · Empty` at the top of its
 * detail column, and it is the one block there that does not depend on a selection. Every
 * field is something `LayerRow` already has in hand at the moment it opens the picker, so
 * nothing here is derived, fetched or guessed.
 */
export interface PickDestination {
  /** The row's name as the Layers table gives it — golden rule 11, the operator's word. */
  rowName: string;
  /** `channel-layer`, kept in the sentence: `R-028` — the number is how a layer is cleared by hand. */
  coord: string;
  /** The template the row holds today, if any. Its NAME, never its id. */
  holding: string | null;
}

interface PickRequest {
  title: string;
  templates: readonly TemplateInfo[];
  destination: PickDestination | null;
  /**
   * `single-clock-look-switch` — which half of the bank the row asking belongs to, so a
   * template the bridge would refuse (`wrong-bank`) is shown REFUSED here instead of being
   * offered and then bounced.
   *
   * The surface and the bridge read the SAME `requiredBankFor`, so they cannot disagree
   * about what is offerable. The template is still LISTED — a template that vanished from
   * the picker would leave the operator with no way to see why — it just cannot be chosen.
   */
  accepts: 'low' | 'high';
}

/**
 * What the operator chose: a template, or nothing.
 *
 * ⭐ `RUNTIME-REPAIR-05` — IT USED TO HAVE FOUR ANSWERS AND NOW HAS TWO. `'import'`
 * and `{ importFile }` were the picker asking its CALLER to run an import chain,
 * because the chain needed the row's hidden file input and its slot. Importing is
 * now a station act in its own dialog, with no row in it: it registers a package
 * and hands it back here to be SELECTED, and the load is the operator's next,
 * separate press. So the caller has one thing to do with the answer — load it —
 * and there is no second path through which a row can be bound.
 */
export type TemplateChoice = TemplateInfo | null;

export function useTemplatePicker(): {
  pickTemplate: (
    title: string,
    accepts: 'low' | 'high',
    destination?: PickDestination,
  ) => Promise<TemplateChoice>;
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
  /*
    `B-212` — WHERE the items that refused a deletion are, so the dialog can offer the
    way there. _"2 stack item(s) still use this template — remove them (or Remove All)
    first."_ was read on 2026-09-04 by an operator whose rows all said EMPTY (the two
    items sat on layers 60 and 61, which no row shows); the sentence's only concrete
    remedy was the sweeping one, and it was taken. A refusal that withholds the precise
    remedy while naming the destructive one is steering toward it.

    Now each place gets its own line under the list: a ROW gets "Show <row>" (close
    this, scroll there, select it); a layer no row shows gets a confirm-gated removal
    of THAT item alone. Neither mentions Remove All.
  */
  const [references, setReferences] = useState<readonly TemplateReference[]>([]);
  /*
    The bank, so a reference is named as the Layers table names its row — the same
    `referenceRowName` / `describeReferencePlace` the bridge's sentence was built with.

    PULLED AT THE MOMENT OF THE REFUSAL, not subscribed. This hook is mounted by every
    `LayerRow`, and a bank subscription here would be thirty subscriptions for a dialog
    that needs the value only while it is naming places — the first cut did exactly that,
    and seven unrelated row suites went red on a bridge stub with no `fixedLayers`. The
    template list beside it is pulled at open time for the same reason. Offline the pull
    is refused (R-006) and resolves to `null`: the places are then named as CasparCG
    names them, which is still somewhere the operator can find.
  */
  const [bank, setBank] = useState<FixedLayerBank | null>(null);
  /*
    Phase 8 — the reference's search and kind filter. Session state of the dialog: both
    reset when it opens, because a filter left over from the last row's pick would hide
    templates from this one without saying so.
  */
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  /** Phase 8 — a package is being dragged over the dialog; lights the drop zone. */
  const [dragging, setDragging] = useState(false);
  /*
    `RUNTIME-REPAIR-04` — the `Manage` view, and HOW MANY ROWS hold each template.

    The count is pulled when the view opens, not subscribed: this hook is mounted by every
    `LayerRow`, and a stack subscription here would be thirty of them for a number that is
    read while one short-lived list is on screen. It is the same reason the template list and
    the bank are pulled rather than subscribed (see `bank`).

    ⚠ IT IS INFORMATION, NEVER A GATE. The reference DISABLES its Delete for a template in
    use; this console does not, and must not. `window.cg.stack.snapshot()` can legitimately
    answer `[]` inside the `B-092` bootstrap window, and a control disabled on that would
    refuse a lawful deletion with nothing the operator could do about it. The BRIDGE decides
    — it refuses `in-use` and names the places, and `B-212` turns each into a remedy.
  */
  const [manage, setManage] = useState(false);
  const [usage, setUsage] = useState<ReadonlyMap<string, number>>(new Map());
  /*
    🔴 `RUNTIME-REPAIR-05` — THE SELECTION. The owner reversed the one-press contract
    after seeing the built picker: a row is now SELECTED, the aside reads the selection out,
    and the footer's primary commits it.

    ⚠ The refusal did not move with the press, only its PLACE did. `requiredBankFor` is
    still the one predicate, still the same one the bridge refuses on; a template the row
    cannot take is still listed, still chipped, and is now also SELECTABLE — so the operator
    can read the full reason in the aside instead of meeting a control that does nothing. What
    stops the load is `loadable`, guarding the ONE commit path every gesture goes through.
  */
  const [selected, setSelected] = useState<TemplateInfo | null>(null);
  /*
    The station-level IMPORT dialog. It registers a package and loads nothing; on success the
    operator lands back here with the new template selected, one press from the row.
  */
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<ModalMessage | null>(null);
  /** A package DROPPED on either dialog, waiting for the operator to confirm the import. */
  const [staged, setStaged] = useState<File | null>(null);
  /** This dialog's OWN hidden `.vcg` input — the row's is no longer in the import path. */
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  const pickTemplate = useCallback(
    async (
      title: string,
      accepts: 'low' | 'high',
      destination?: PickDestination,
    ): Promise<TemplateChoice> => {
      const templates = await window.cg.templates.list();
      return new Promise<TemplateChoice>((resolve) => {
        resolver.current = resolve;
        setQuery('');
        setKind('all');
        setDragging(false);
        // The management view is never what a LOAD opens on — the door is always the list.
        setManage(false);
        setUsage(new Map());
        // A selection is per-opening: the row that asked last time is not this row.
        setSelected(null);
        setImportOpen(false);
        setImportMessage(null);
        setStaged(null);
        setRequest({ title, templates, accepts, destination: destination ?? null });
      });
    },
    [],
  );

  /**
   * Open the management view, with the usage counts the stack already answers for.
   *
   * A failure to read the stack is NOT a failure to open: the counts are a courtesy line under
   * each name, and withholding the whole surface because one of them is unknown would hide the
   * only place a template can be deleted. An unknown count simply does not claim a number.
   */
  const openManage = useCallback(async (): Promise<void> => {
    setMessage(null);
    setReferences([]);
    setManage(true);
    /*
      ⚠ `try`, not `.catch` — a bridge whose `stack` has no `snapshot` at all throws
      SYNCHRONOUSLY, and a rejection handler never sees it. That is not hypothetical here: this
      hook is mounted by every `LayerRow`, so it meets every stub any row suite installs, and an
      earlier cut of this file took seven unrelated suites red by assuming a channel was there.
    */
    let items: readonly { templateId: string }[] = [];
    try {
      items = await window.cg.stack.snapshot();
    } catch {
      items = [];
    }
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.templateId, (counts.get(item.templateId) ?? 0) + 1);
    setUsage(counts);
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
      setReferences([]);
      try {
        const res = await window.cg.templates.remove({ templateId: template.templateId });
        if (!res.ok) {
          // IN THE DIALOG, not the toast. The entry is still listed, because it
          // is still there — the two together are the honest report.
          setMessage({
            role: 'refusal',
            text: res.message ?? 'The template could not be deleted.',
          });
          // `B-212` — and the places, each with its remedy, under the list. The bank is
          // read now, for these names; see the note at `bank`.
          setBank(await window.cg.fixedLayers.config().catch(() => null));
          setReferences(res.references ?? []);
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
    setReferences([]);
    setDragging(false);
    setManage(false);
    setSelected(null);
    setImportOpen(false);
    setImportMessage(null);
    setStaged(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(choice);
  }, []);

  /**
   * `B-212` — the precise remedy for an item NO ROW SHOWS: remove that one item, after
   * a confirm that names its layer and says what removing it does. This is the
   * alternative to Remove All, which is what the old sentence left the operator with.
   */
  const removeReference = useCallback(
    async (reference: TemplateReference): Promise<void> => {
      const place = describeReferencePlace(reference, bank);
      const ok = await confirm({
        title: 'Remove that item?',
        body:
          `The item ${place} is not on any row this station shows. Removing it clears its ` +
          `layer — if it is on air, it comes off — and frees the template. No row is touched.`,
        confirmLabel: 'Remove item',
        tone: 'remove',
      });
      if (!ok) return;
      try {
        const res = await window.cg.stack.remove({ itemId: reference.itemId });
        if (!res.accepted) {
          /*
            ⚠ This read `stack.remove answers a bare accepted; there is no code to quote` —
            and that stopped being true when `R-017` added `errorCode` to the response
            (`stack.ts` records the history). So the refusal said only that something could
            not be removed, on the one path where the reason is the whole point: an item on
            air is refused, and the operator needs to be told to take it off air first.

            `errorCodeMessage` maps the code to the ONE canonical sentence
            (`REMOVE_ON_AIR_REASON`), with our own placing as the detail.
          */
          setMessage({
            role: 'refusal',
            text: errorCodeMessage(res.errorCode) ?? `The item ${place} could not be removed.`,
            detail: `The item ${place}.`,
          });
          return;
        }
        setReferences((current) => current.filter((r) => r.itemId !== reference.itemId));
        setMessage({
          role: 'notice',
          text: `Removed the item ${place}. Press Delete from station again to delete the template.`,
        });
      } catch (err) {
        setMessage({
          role: 'refusal',
          text: err instanceof Error ? err.message : 'The item could not be removed.',
        });
      }
    },
    [bank, confirm],
  );

  /*
    Phase 8 — `02`'s drop zone, on the WHOLE dialog body. `dragover` must be cancelled or the
    browser refuses the drop; the file, whatever it is, goes to the caller's chain untouched
    (see the module note — the chain's `verify` is the one gate).
  */
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    // Leaving a CHILD fires this too; only a leave of the body itself dims the zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }, []);
  /*
    ⭐ `RUNTIME-REPAIR-05` — A DROP NO LONGER RESOLVES THE PICK. It used to hand the file back
    to `LayerRow`, which imported it and bound it to the row in one gesture. Importing is a
    STATION act now, so a dropped package opens the Import dialog with the file already staged:
    the operator confirms the import, lands back on the list with the new template selected, and
    the load is a separate press. The bytes take the identical path either way —
    `importVcgToStation` → `importVcgFile` → `verify → unpack → B-196 → render` — so nothing
    about what is refused changed with the gesture that starts it.
  */
  const onDrop = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file === undefined) return;
    setStaged(file);
    setImportMessage(null);
    setImportOpen(true);
  }, []);

  /**
   * Can THIS template go onto THIS row? The one predicate, asked once.
   *
   * ⚠ Every gesture that could commit a load asks this same function — the footer's primary,
   * `Enter`, and a double-click. `B-161`'s lesson one layer up: a decision gated at two places
   * is a decision that will eventually be made twice, differently.
   */
  const loadable = useCallback(
    (template: TemplateInfo | null): boolean =>
      template !== null && request !== null && requiredBankFor(template) === request.accepts,
    [request],
  );

  /** Commit the selection. The ONE path out of this dialog with a template in it. */
  const commit = useCallback(
    (template: TemplateInfo | null): void => {
      if (!loadable(template)) return;
      settle(template);
    },
    [loadable, settle],
  );

  /**
   * `Enter` commits the selection, exactly as the footer's primary does.
   *
   * On the LIST rather than on a row, so it works whether focus sits on the row the operator
   * just clicked or on the search box they filtered with — and it routes through `commit`,
   * so a refused template is refused here for the same reason and by the same call.
   */
  const onListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== 'Enter' || e.defaultPrevented) return;
      if (selected === null || !loadable(selected)) return;
      e.preventDefault();
      commit(selected);
    },
    [commit, loadable, selected],
  );

  /**
   * Import a package into the STATION. Registers; loads nothing.
   *
   * On success the operator is returned to the list with the new template SELECTED, so the
   * next press is the load — which is the whole reason the two dialogs are worth splitting:
   * the import is over, and what happens to a row is still the operator's separate decision.
   */
  const runImport = useCallback(async (pick: () => Promise<File | null>): Promise<void> => {
    setImportBusy(true);
    setImportMessage(null);
    try {
      const template = await importVcgToStation(pick);
      // The operator dismissed the OS dialog: their own "no", not a failure.
      if (template === null) return;
      const templates = await window.cg.templates.list();
      setRequest((current) => (current === null ? null : { ...current, templates }));
      setSelected(template);
      setStaged(null);
      setImportOpen(false);
      setManage(false);
    } catch (err) {
      /*
          IN THE IMPORT DIALOG'S OWN MESSAGE REGION. `importVcgFile` throws the operator-facing
          sentence naming the file (`“x.vcg” failed verification…`); reporting it to the command
          toast would render it UNDER this dialog's backdrop, which is the A9 defect one surface
          over. The package registered nothing, so the list behind is still true.
        */
      setImportMessage({
        role: 'refusal',
        text: err instanceof Error ? err.message : 'The package could not be imported.',
      });
    } finally {
      setImportBusy(false);
    }
  }, []);

  /** Open the Import dialog on an empty slate — the `Import a .vcg…` control's own press. */
  const openImport = useCallback((): void => {
    setStaged(null);
    setImportMessage(null);
    setImportOpen(true);
  }, []);

  const pickerDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        /*
          `RUNTIME-REPAIR-05` §3 — eleven words to five. It read "Choose a template already on
          this station, or import a .vcg package." — half of which advertised a control that
          has since moved to its own dialog. A sub-line is not the place to enumerate the
          doors on the surface below it.
        */
        subtitle="Choose a template for this row."
        /* `REPAIR-03` B, audit row 98 — the reference draws a 42 px emblem in this head. */
        emblem={LayoutTemplate}
        size="library"
        onClose={() => settle(null)}
        {...(message !== null ? { message } : {})}
        footer={
          <>
            {/*
              THE REFERENCE'S FOOTER SENTENCE — true of this product (see `FOOT_INFO`), on
              the surface where the operator is about to press the control it qualifies.
            */}
            <span className="cg-tpl-foot-info" data-template-foot-info="">
              {manage ? MANAGE_FOOT_INFO : FOOT_INFO}
            </span>
            {/*
              CANCEL FIRST IN DOM ORDER, like every other dialog. The row is
              right-aligned, so first-in-DOM is LEFTMOST and the primary action
              lands in the same corner it does everywhere else.

              It was last, and it was a `ghost` — no fill, no border, muted text,
              which reads as a line of static text rather than a control. `cancel`
              resolves to `neutral`: neutral must not mean invisible.
            */}
            {!manage && (
              <ModalAction actionRole="cancel" onClick={() => settle(null)}>
                Cancel
              </ModalAction>
            )}
            {/*
              §6 — IMPORT LIVES IN HERE, and it is not a convenience.

              `LOAD` opens this dialog, so if importing were not offered inside it
              the operator on a fresh install would meet an empty list telling him
              to import a `.vcg` with no way to do so. On a station with nothing
              loaded yet it is the only control that can do anything, which is
              exactly what makes it this dialog's PRIMARY — it now carries that
              weight through its role rather than through being placed first. The
              reference paints it quiet beside a `Load into` primary; with the row's
              press being the load, this is the one primary left.

              ⭐ SUPERSEDED, `RUNTIME-REPAIR-05`: import has its own dialog and its own door on
              the tools row, so the footer's one primary is the LOAD — below.
            */}
            {manage ? (
              /*
                `RUNTIME-REPAIR-04` — the reference swaps its footer's PRIMARY for this while its
                management view is up, and the swap is the point: the way out of a destructive
                surface should be the most obvious control on it.
              */
              <ModalAction
                actionRole="primary"
                onClick={() => {
                  setManage(false);
                  setMessage(null);
                  setReferences([]);
                }}
              >
                Back to selection
              </ModalAction>
            ) : (
              /*
                🔴 `RUNTIME-REPAIR-05` — THE PRIMARY IS THE LOAD, and it is the reference's own
                footer (`Load into Layer 5`). It names the row in the OPERATOR'S word rather than
                the drawing's layer number (golden rule 11): the row the picker was opened from
                is `Bed 1` or an alias, and that is what the destination card beside it says too.

                Disabled until a template is selected AND that template can go onto this row —
                the same `loadable` the keyboard and the double-click ask. `Import a .vcg…` has
                left this bar for the search row, where the reference puts its own `Manage`.
              */
              <ModalAction
                actionRole="primary"
                disabled={!loadable(selected)}
                data-template-commit=""
                onClick={() => commit(selected)}
              >
                Load onto {request.destination?.rowName ?? 'this row'}
              </ModalAction>
            )}
          </>
        }
      >
        <div
          className="cg-tpl-body"
          data-template-body=""
          /*
            A package dropped ANYWHERE on this dialog opens Import with it staged, which is
            why the handlers are on the body and not on a zone. `data-template-dragging` is
            what says so while the file is in the air — without it the whole dialog is a drop
            target that gives no sign of being one.
          */
          data-template-dragging={dragging ? 'true' : 'false'}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {manage ? (
            <ManageView
              templates={request.templates}
              usage={usage}
              onDelete={(t) => void deleteTemplate(t)}
            >
              {/*
                `B-212` — WHERE the items are, each with the way there. A row the operator can
                see gets "Show <row>"; a layer no row shows gets the one-item removal. The
                sentence above names them; these are the remedies it used to withhold.

                `RUNTIME-REPAIR-04` — rendered INSIDE the management view, because that is now
                the only surface a deletion can be refused from. It is the same block, moved
                with the control whose refusal it explains.
              */}
              {references.length > 0 && (
                <div style={styles.references} data-in-use-references="">
                  {references.map((reference) => {
                    const rowName = referenceRowName(reference, bank);
                    const slot = reference.slot;
                    const place = describeReferencePlace(reference, bank);
                    return (
                      <div
                        key={reference.itemId}
                        style={styles.reference}
                        data-in-use-reference={reference.itemId}
                      >
                        <span>{place}</span>
                        {rowName !== null && slot !== undefined ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              // Close first, then ask the table to go there: the picker sits
                              // over the list, and a scroll under a backdrop is not a remedy.
                              settle(null);
                              requestRowFocus(slot.layer);
                            }}
                          >
                            Show {rowName}
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            aria-label={`Remove the item ${place}`}
                            onClick={() => void removeReference(reference)}
                          >
                            Remove item
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ManageView>
          ) : (
            /*
              `RUNTIME-REPAIR-04` — the reference's `.template-layout`: a main column that reads
              the list DOWN, and a 342 px aside beside it. The aside is fixed and the main
              column takes the rest, which is the drawing's own arrangement.
            */
            <div className="cg-tpl-layout" data-template-layout="">
              <div className="cg-tpl-main">
                {request.templates.length === 0 ? (
                  /*
                    The reference's `.empty` shape (a title over a sentence) carrying the app's
                    own sentence — it names the control that ends the emptiness rather than a
                    panel that no longer exists (§6).
                  */
                  <div className="cg-tpl-empty" data-template-empty="">
                    <h3>Nothing on this station yet</h3>
                    <p>Import a .vcg package to begin.</p>
                    <Button variant="primary" onClick={openImport}>
                      <Icon icon={FileUp} size={14} />
                      Import a .vcg…
                    </Button>
                  </div>
                ) : (
                  <PickerList
                    request={request}
                    query={query}
                    onQuery={setQuery}
                    kind={kind}
                    onKind={setKind}
                    unassigned={unassigned}
                    selected={selected}
                    onSelect={setSelected}
                    onCommit={commit}
                    onKeyDown={onListKeyDown}
                    onManage={() => void openManage()}
                    onImport={openImport}
                  />
                )}
              </div>
              <aside className="cg-tpl-aside" data-template-aside="" aria-label="Destination">
                {request.destination !== null && (
                  <div className="cg-tpl-dest" data-template-destination="">
                    <span className="cg-tpl-dest__icon" aria-hidden="true">
                      <Icon icon={Layers} size={18} />
                    </span>
                    <span className="cg-tpl-dest__text">
                      <span className="cg-tpl-dest__name">
                        Destination · <bdi>{request.destination.rowName}</bdi>
                      </span>
                      {/*
                        `R-028` — the real coordinate stays in the sentence, because this is
                        where an operator finds the layer they may have to clear by hand.
                      */}
                      <span className="cg-tpl-dest__meta">
                        {request.accepts === 'low' ? 'Graphics bed row' : 'Operator row'} · on{' '}
                        {request.destination.coord}
                      </span>
                      <span className="cg-tpl-dest__meta">
                        {request.destination.holding === null ? (
                          'Empty — nothing loaded on it.'
                        ) : (
                          <>
                            Holding <bdi>{request.destination.holding}</bdi>. Loading replaces it.
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                )}
                {/*
                  🔴 `RUNTIME-REPAIR-05` — THE SELECTION, READ OUT. This is the half of the
                  reference's aside `REPAIR-04` argued away for want of a selection to describe;
                  the owner has since made the selection real, so it is built.

                  The order is the reference's: what it IS, then whether it can go here. The
                  VERDICT is last because it is the thing the operator acts on — and when it is
                  a refusal it carries the whole sentence, not the chip, because this is the one
                  place there is room for it.
                */}
                {selected === null ? (
                  <p className="cg-tpl-aside__hint" data-template-aside-hint="">
                    Choose a template to see its details.
                  </p>
                ) : (
                  <div className="cg-tpl-pick" data-template-selected={selected.templateId}>
                    <p className="cg-tpl-pick__eyebrow">Selected template</p>
                    {/* Golden rule 11 — the operator's word in the sentence, the id on the title. */}
                    <bdi className="cg-tpl-pick__name" title={selected.templateId}>
                      {templateDisplayName(selected)}
                    </bdi>
                    <dl className="cg-tpl-kv">
                      <dt>Type</dt>
                      <dd>{kindOf(selected) === 'bed' ? 'Graphics bed' : selected.templateType}</dd>
                      <dt>Text fields</dt>
                      <dd>{String(selected.fields.length)}</dd>
                      <dt>Looks</dt>
                      <dd>{String(selected.liveSources?.looks?.length ?? 0)}</dd>
                      <dt>Live plates</dt>
                      <dd>{String(selected.liveSources?.sources.length ?? 0)}</dd>
                    </dl>
                    {(() => {
                      const ok = loadable(selected);
                      const refusal = REFUSAL[request.accepts];
                      return (
                        <div
                          className={ok ? 'cg-tpl-verdict' : 'cg-tpl-verdict cg-tpl-verdict--warn'}
                          data-template-verdict={ok ? 'ok' : 'refused'}
                        >
                          <span className="cg-tpl-verdict__icon" aria-hidden="true">
                            <Icon icon={ok ? CheckCircle2 : AlertTriangle} size={16} />
                          </span>
                          <span>
                            <strong>{ok ? COMPATIBLE.title : refusal.title}</strong>
                            <span>{ok ? COMPATIBLE.text : refusal.text}</span>
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
        {/*
          The dialog's OWN `.vcg` input. It used to be the ROW's, because the row owned the
          import chain; import is a station act now, so the control and its input live together.
        */}
        <input
          ref={fileRef}
          type="file"
          accept=".vcg"
          hidden
          data-template-file-input=""
          aria-hidden="true"
        />
        <ImportDialog
          open={importOpen}
          busy={importBusy}
          staged={staged}
          message={importMessage}
          onChooseFile={() => {
            const input = fileRef.current;
            if (input !== null) void runImport(() => pickFile(input));
          }}
          onImportStaged={() => {
            const file = staged;
            if (file !== null) void runImport(() => Promise.resolve(file));
          }}
          onStage={(file) => {
            setStaged(file);
            setImportMessage(null);
          }}
          onClose={() => {
            setImportOpen(false);
            setStaged(null);
            setImportMessage(null);
          }}
        />
        {confirmDialog}
      </Modal>
    );

  return { pickTemplate, pickerDialog };
}

/**
 * 🔴 `RUNTIME-REPAIR-05` §2B — THE IMPORT DIALOG, WHICH REGISTERS AND LOADS NOTHING.
 *
 * The reference ships this as a `<dialog>` of its own — `#import-dialog`, 750 px wide, a head
 * band, a drop zone with `Choose file` as a PRIMARY inside it, and a footer carrying only
 * `Cancel`. Measured at 1280 × 800 by opening it (`02-template-import.html`,
 * `data-start="import"`); it is a separate dialog ELEMENT, not a mode of the picker, which is
 * what the owner asked for.
 *
 * ⚠ WHAT IS NOT TAKEN, and it is the same refusal `§15.3` recorded. The reference's three-step
 * rail (`Choose package · Review · Complete`) is THEATRE by its own disclaimer — _"Files
 * selected here are not uploaded or imported"_, and its Review step lists `Simulated checks`.
 * This one runs the product's real chain, whose verdict is a refusal sentence naming the file.
 * A rail with two steps this product resolves in one call would be furniture that lies.
 *
 * ⭐ AND ITS FOOTER SENTENCE IS NOW TRUE HERE. The reference writes _"Importing does not load a
 * row or take it on air."_ — `§15.1` recorded that as FALSE of this product, because the
 * picker's import WAS the row's load. It is false no longer: this dialog registers to the
 * station and binds nothing, so the drawing's own sentence is adopted, verbatim, at last.
 */
function ImportDialog({
  open,
  busy,
  staged,
  message,
  onChooseFile,
  onImportStaged,
  onStage,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  staged: File | null;
  message: ModalMessage | null;
  onChooseFile: () => void;
  onImportStaged: () => void;
  onStage: (file: File) => void;
  onClose: () => void;
}): JSX.Element | null {
  const [over, setOver] = useState(false);
  if (!open) return null;
  return (
    <Modal
      title="Import a template"
      subtitle="Add a .vcg package to this station."
      emblem={FileUp}
      size="import"
      layer="sub"
      onClose={onClose}
      {...(message !== null ? { message } : {})}
      footer={
        <>
          <span className="cg-tpl-foot-info" data-import-foot-info="">
            Importing does not load a row or put anything on air.
          </span>
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          {staged !== null && (
            <ModalAction actionRole="primary" disabled={busy} onClick={onImportStaged}>
              Import “{staged.name}”
            </ModalAction>
          )}
        </>
      }
    >
      <div
        className="cg-tpl-drop"
        data-import-drop=""
        data-template-drop-active={over ? 'true' : 'false'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file !== undefined) onStage(file);
        }}
      >
        <span className="cg-tpl-drop__icon">
          <Icon icon={Upload} size={22} />
        </span>
        <h3>Choose a .vcg package</h3>
        <p>
          {staged === null
            ? 'Drop it here, or browse your files.'
            : `Ready to import “${staged.name}”.`}
        </p>
        {/*
          `Choose file` INSIDE the zone — audit row 111, which `§15.3` argued away while
          `Import a .vcg…` was the only import control and a second one would have been a second
          door to one act. With import in its own dialog this IS that dialog's act, and the
          reference paints it exactly here, as a primary.
        */}
        <Button variant="primary" disabled={busy} onClick={onChooseFile}>
          <Icon icon={FileUp} size={14} />
          Choose file
        </Button>
      </div>
    </Modal>
  );
}

/**
 * 🔴 `RUNTIME-REPAIR-04` — THE MANAGEMENT VIEW, and the only place a template is deleted.
 *
 * `design.md` §18.4: the owner decided the red `Delete from station` comes OFF THE ROW, and
 * bound its destination to this view. The reason is the console it runs on — a destructive
 * control repeated down every row of a list is one mis-aimed press away from deleting a
 * template while something is on air, and the reference has no destructive control on a row
 * at all.
 *
 * It REPLACES the selection layout rather than sitting beside it, as the reference's does: the
 * operator is either choosing a template or maintaining the list, never both at once.
 *
 * ⚠ The counts are a line of information under a name. They do not disable anything — see
 * the note at `usage` for why this console does not follow the drawing there.
 */
function ManageView({
  templates,
  usage,
  onDelete,
  children,
}: {
  templates: readonly TemplateInfo[];
  usage: ReadonlyMap<string, number>;
  onDelete: (t: TemplateInfo) => void;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="cg-tpl-manage" data-template-manage="">
      {/*
        §3 — thirty words to thirteen. What was cut is not information the operator loses:
        the CONFIRM names the scope, the cascade and the re-import, at the moment of the act
        and where it cannot be missed. A standing paragraph restating a confirm is prose
        explaining what the confirm expresses.
      */}
      <p className="cg-tpl-manage__note" data-template-manage-note="">
        Deleting removes a template from this station, for every browser. It cannot be undone.
      </p>
      {[...templates].reverse().map((t) => {
        const label = templateDisplayName(t);
        const used = usage.get(t.templateId) ?? 0;
        return (
          <div className="cg-tpl-manage-row" key={t.templateId} data-manage-template={t.templateId}>
            <span className="cg-tpl-thumb" aria-hidden="true">
              <Icon icon={kindOf(t) === 'bed' ? Rows3 : LayoutTemplate} size={22} />
            </span>
            <span className="cg-tpl-manage-row__text">
              {/* Golden rule 11 — the operator's word in the sentence, the id on the `title`. */}
              <bdi className="cg-tpl-manage-row__name" title={t.templateId}>
                {label}
              </bdi>
              <span className="cg-tpl-manage-row__use" data-manage-usage={String(used)}>
                {used === 0 ? 'Not on any row' : `Used by ${count(used, 'row')}`}
              </span>
            </span>
            <Button
              variant="danger"
              className="cg-tpl-delete"
              aria-label={`Delete ${label} from this station`}
              onClick={() => onDelete(t)}
            >
              <Icon icon={Trash2} size={14} />
              Delete from station
            </Button>
          </div>
        );
      })}
      {children}
    </div>
  );
}

/** Does a template answer the search? Its display name and its type, case-folded. */
function matchesQuery(template: TemplateInfo, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return true;
  return `${templateDisplayName(template)} ${template.templateType}`
    .toLocaleLowerCase()
    .includes(q);
}

/** `N look`/`N looks`, `N plate`/`N plates` — the reference's meta counts, from the carrier. */
function count(n: number, one: string): string {
  return `${String(n)} ${one}${n === 1 ? '' : 's'}`;
}

function PickerList({
  request,
  query,
  onQuery,
  kind,
  onKind,
  unassigned,
  selected,
  onSelect,
  onCommit,
  onKeyDown,
  onManage,
  onImport,
}: {
  request: PickRequest;
  query: string;
  onQuery: (q: string) => void;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  unassigned: (t: TemplateInfo) => string[];
  selected: TemplateInfo | null;
  onSelect: (t: TemplateInfo) => void;
  onCommit: (t: TemplateInfo) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onManage: () => void;
  onImport: () => void;
}): JSX.Element {
  // Newest first: the template the operator most recently imported is the one they
  // are looking for. Then the search, then the kind chip.
  const shown = [...request.templates]
    .reverse()
    .filter((t) => matchesQuery(t, query))
    .filter((t) => kind === 'all' || kindOf(t) === kind);
  return (
    <>
      <div className="cg-tpl-tools">
        <label className="cg-tpl-search">
          <Icon icon={Search} size={16} />
          <input
            type="search"
            className="cg-field"
            placeholder="Search templates…"
            aria-label="Search templates"
            autoComplete="off"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
        {/*
          `RUNTIME-REPAIR-05` — IMPORT MOVED HERE, out of the footer, because the footer's one
          primary is now the LOAD. The two station-level doors sit together at the end of the
          tools row, where the reference puts its own `Manage`: bring a package IN, and manage
          what is already here. Neither is about the row this dialog was opened from.
        */}
        <Button
          variant="neutral"
          className="cg-tpl-manage-btn"
          data-template-import-open=""
          onClick={onImport}
        >
          Import a .vcg…
        </Button>
        <Button
          variant="neutral"
          className="cg-tpl-manage-btn"
          data-template-manage-open=""
          onClick={onManage}
        >
          Manage
        </Button>
      </div>
      <div className="cg-tpl-filter" role="group" aria-label="Template kind">
        {KIND_CHIPS.map((chip) => (
          <Button
            key={chip.key}
            variant="neutral"
            active={kind === chip.key}
            aria-pressed={kind === chip.key}
            data-template-filter={chip.key}
            onClick={() => onKind(chip.key)}
          >
            {chip.label}
          </Button>
        ))}
      </div>
      {/*
        `Enter` commits from anywhere in this column — see `onListKeyDown`. It is on the LIST
        rather than on a row so it still works when focus is in the search box the operator
        just filtered with, which is where it usually is.
      */}
      <div className="cg-tpl-list" data-template-list="" onKeyDown={onKeyDown}>
        {shown.length === 0 ? (
          /* The reference's own words for a search that found nothing. */
          <div className="cg-tpl-empty" data-template-empty="search">
            <h3>No templates found</h3>
            <p>Try another search.</p>
          </div>
        ) : (
          shown.map((t) => (
            <PickerRow
              key={t.templateId}
              template={t}
              accepts={request.accepts}
              unassigned={unassigned(t)}
              isSelected={selected?.templateId === t.templateId}
              onSelect={() => onSelect(t)}
              onCommit={() => onCommit(t)}
            />
          ))
        )}
      </div>
    </>
  );
}

function PickerRow({
  template: t,
  accepts,
  unassigned: needsSource,
  isSelected,
  onSelect,
  onCommit,
}: {
  template: TemplateInfo;
  accepts: 'low' | 'high';
  unassigned: string[];
  isSelected: boolean;
  onSelect: () => void;
  onCommit: () => void;
}): JSX.Element {
  const label = templateDisplayName(t);
  const carrier = liveSourceCarrierState(t);
  const templateKind = kindOf(t);
  // `single-clock-look-switch` — the SAME predicate the bridge refuses on.
  const wrongBank = requiredBankFor(t) !== accepts;
  const looks = t.liveSources?.looks?.length ?? 0;
  const plates = t.liveSources?.sources.length ?? 0;
  return (
    <div
      className="cg-tpl-row"
      data-template-id={t.templateId}
      data-template-kind={templateKind}
      data-template-incompatible={wrongBank ? 'true' : 'false'}
      data-template-selected={isSelected ? 'true' : 'false'}
      {...(wrongBank ? { 'data-wrong-bank': '' } : {})}
    >
      {/*
        🔴 `RUNTIME-REPAIR-05` — THE ROW SELECTS; THE FOOTER LOADS. A double-click commits,
        for the operator who already knows which template they want; both routes go through the
        SAME `commit`, so a template this row cannot take is refused identically by either.

        ⚠ The row is NOT disabled when the bank is wrong, and that is deliberate rather than a
        relaxation. It used to be, and a disabled control is a control that cannot tell you why:
        the reason sat in a two-line paragraph beneath it. Selecting it now puts the whole
        sentence in the aside, with the footer's primary disabled — which is the reference's own
        arrangement, and it refuses on exactly the predicate it refused on before.
      */}
      <Button
        variant="ghost"
        className="cg-tpl-row__load"
        aria-label={`Select ${label}`}
        aria-pressed={isSelected}
        title={wrongBank ? REFUSAL[accepts].text : t.templateId}
        onClick={onSelect}
        onDoubleClick={onCommit}
      >
        <span className="cg-tpl-thumb" aria-hidden="true">
          <Icon icon={templateKind === 'bed' ? Rows3 : LayoutTemplate} size={22} />
        </span>
        <span className="cg-tpl-text">
          <bdi className="cg-tpl-name">{label}</bdi>
          <span className="cg-tpl-meta">
            <span>{templateKind === 'bed' ? 'Graphics bed' : t.templateType}</span>
            <span aria-hidden="true">·</span>
            <span>{count(t.fields.length, 'field')}</span>
            {looks > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{count(looks, 'look')}</span>
              </>
            )}
            {plates > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{count(plates, 'plate')}</span>
              </>
            )}
            {/*
              THE REASON, on the row, beside the control it disabled — the reference's
              warn badge with its own short words; the app's sentence, which carries the
              remedy, stays beneath (`cg-tpl-reason`).
            */}
            {wrongBank && <span className="cg-tag cg-tag--warn">{REFUSAL[accepts].chip}</span>}
            {/*
              D-137 / C-015 — said on the row, not hidden behind a hover.
              `data-live-sources` carries the state machine-readably so the
              E2E asserts the STATE rather than the wording.
            */}
            {carrier === 'unknown' ? (
              <span
                className="cg-tag cg-tag--warn"
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
                className="cg-tag cg-tag--warn"
                data-plates-unassigned={needsSource.join(',')}
                title={UNASSIGNED_TITLE}
              >
                Needs a source: {needsSource.join(', ')}
              </span>
            )}
          </span>
        </span>
      </Button>
      {/*
        🔴 THE TWO-LINE PARAGRAPH IS GONE. It said, under every refused row, what the chip
        already says in four words — the Designer's own root cause: explaining in prose what
        can be expressed as state. The sentence itself was not deleted; it moved to the two
        places that have room for it, and `REFUSAL` is the one source all three read.

        Rows were ~160 px tall when it applied, so two and a half fitted where the reference
        fits five. `data-wrong-bank` stays on the row that carries the state, because that is
        what the tests assert and what a later reader will grep for.
      */}
    </div>
  );
}
