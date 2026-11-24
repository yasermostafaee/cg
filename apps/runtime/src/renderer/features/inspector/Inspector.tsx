import { localeDirection, useLanguages, useUiText } from '../../i18n/locale.js';
import { localizeEngineWording, useEngineName } from '../../ui/engineWording.js';
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { useLink } from '../../hooks/useLink.js';
import { useFixedSlots } from '../../hooks/useFixedLayers.js';
import { useOperatorNames } from '../../hooks/useOperatorNames.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import {
  aggregateHasFields,
  authoredFileDelimiter,
  authoredFileFormat,
  bridgeTextSourcePath,
  fieldAllowsFileSource,
  fieldDigitsOf,
  fieldTypeTakesFileSource,
  fieldUsesFileOnly,
  isFieldNamespace,
  numberFieldAllowedValues,
  numberFieldValueLabel,
  isOnAirStatus,
  operatorFieldError,
  lockedBridgeTextSourcePath,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValue,
  type FieldValues,
  type ImageFit,
  type StackItemState,
} from '@cg/shared-schema';
import {
  activeLookOf,
  controlLiveLayoutFieldDefaults,
  templateFocusTarget,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { airStateVisual, colors, cssVars } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { AutoGrowTextarea } from '../../ui/AutoGrowTextarea.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { Icon } from '../../ui/Icon.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Panel } from '../../ui/Panel.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { EDITOR_DIR } from '../../ui/editorTextDirection.js';
import { writeFieldText } from '../../ui/fieldDigitsInput.js';
import { displayLabel, templateDisplayName } from '../library/templateName.js';
import { layerDetail } from '../stack/layerLabel.js';
import { BackupStatus } from '../layers/BackupStatus.js';
import { plateLabelOf, takeRefusalLine, TakeRefusalText } from '../layers/takeRefusalLine.js';
import { currentSourceCatalog } from '../sources/sourceStore.js';
import { appliedPositionOf, defaultPositionOf } from '../stack/defaultPositionStore.js';
import {
  REHEARSE_STATE_COLOR,
  REHEARSE_STATE_WORD,
  rehearseOwnsStateWord,
} from '../layers/rowState.js';
import { grantedFileSourcePaths } from './fileSourceGrants.js';
import {
  detachUngrantedSources,
  fromFileState,
  fromFileVersion,
  subscribeFromFile,
} from './fromFileStore.js';
import { FromFileControl } from './FromFileControl.js';
import { FieldDescription } from './FieldDescription.js';
import { ListFieldEditor } from './ListFieldEditor.js';
import { ImageFieldControl } from './ImageFieldControl.js';
import { CountdownTargetField } from './CountdownTargetField.js';
import { SequenceRowsEditor, sequenceRowsPageSets } from './SequenceRowsEditor.js';
import { BookBlock } from '../book/BookBlock.js';
import { bookTitle } from '../book/bookFacts.js';
import { bookOf, type RowBook } from '../layers/bookOf.js';
import { LivePlatesSection } from './LivePlatesSection.js';
import { LooksBindingsSection } from './LooksBindingsSection.js';
import { retainedLookFields, type RetainedLookFields } from './retainedLookOwnership.js';
import { indexSharedFrameTitles, type SharedFrameTitleIndex } from './sharedFrameTitles.js';
import { TimingSection } from './TimingSection.js';
import { appliedPlateSources } from './livePlates.js';
import { boundChannelOf, itemChannelOf } from '../channels/itemChannel.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { PositionPicker } from './PositionPicker.js';
import { LiveFrameAdjustments } from './LiveFrameAdjustments.js';
import { Tag } from '../../ui/Tag.js';
import {
  draftsVersion,
  previewLookPin,
  setPreviewLookPin,
  effectiveValue,
  isFieldDirty,
  isItemDirty,
  stageField,
  stageFieldBatch,
  subscribeDrafts,
  unstageField,
  unstageFieldBatch,
  valueAt,
  type FieldPath,
} from './draftStore.js';
import {
  formatNumberLike,
  parseLocalizedNumber,
  readLocalizedNumber,
  writeFieldDigits,
} from '@cg/text-shaping';

/** The shared field class, plus the dirty accent (border only — no layout shift). */
function fieldClass(dirty: boolean): string {
  return dirty ? 'cg-field is-dirty' : 'cg-field';
}

/**
 * How many characters of the template id are enough to tell two of them apart.
 * Six of a UUID is comfortably distinguishing and short enough to read at a
 * glance beside a name.
 */
const ID_STUB_LENGTH = 6;

/**
 * What a `color` field shows when the template gave it no value. It is the
 * OPERATOR'S DATA, not this console's chrome, which is why it is a plain constant
 * here rather than a `--r-*` token — see the note at its use.
 */
const DEFAULT_COLOR_FIELD_VALUE = '#FFFFFF';

/**
 * ⭐ R-040's CLASS, ARRIVING ON A SECOND SURFACE — a display label derived from a
 * non-unique human name, with the unique key present but hidden.
 *
 * The owner's report: two imported templates both render as `seghab` and cannot
 * be told apart. `templateDisplayName` prefers the imported FILE name, and two
 * packages can perfectly well arrive from files called the same thing; the
 * `templateId` that separates them is on the heading's `title` attribute, which
 * is to say nowhere an operator looks.
 *
 * ⚠ SAME CLASS, DIFFERENT ROOT CAUSE, and the distinction is the point. R-040 was
 * `sequenceItemNamespace` colliding two same-named sequence ELEMENTS inside ONE
 * template's field tree; this is two same-named TEMPLATES. Neither fix reaches
 * the other, so this one is recorded ON R-040 rather than folded into it. (R-040 is
 * fixed in `@cg/shared-schema` by the same shape — a stub only on a collision —
 * and rendered by {@link GroupHeadingText}.)
 *
 * The stub appears ONLY when it is earning its place — when another template in
 * this browser's registry shares the display name. A suffix on every heading
 * would be noise on the overwhelmingly common single-template case, and noise is
 * what makes the real signal unreadable.
 */
function templateIdStub(templateId: string): string {
  return templateId.slice(0, ID_STUB_LENGTH);
}

/** Rich editors get the entire row when the Inspector's value column is too narrow. */
function needsWideEditor(kind: DynamicField['type'] | 'unknown', field: DynamicField | null) {
  return (
    kind === 'multiline' ||
    kind === 'list' ||
    kind === 'image' ||
    (field?.type === 'text' && field.countdown !== undefined)
  );
}

interface Props {
  item: StackItemState | null;
  /** Apply the item's staged draft as one atomic `stack.update` (the round-trip). */
  onApply: (itemId: string) => Promise<{ accepted: boolean }>;
  /** Discard the item's staged draft, reverting to applied values. */
  onDiscard: (itemId: string) => void;
  /**
   * Close the Inspector. Openness is DERIVED from the selection, so this deselects
   * rather than hiding a still-selected row — the two can never disagree.
   */
  onClose?: (() => void) | undefined;
  /**
   * `B-156` — is this row REHEARSING? Threaded from the caller, which already reads the
   * canonical `isRehearsing(rehearsals, itemId)` for the row's own picker, so the Inspector's
   * look badge and the row's `PVW LOOK` label answer to ONE derivation rather than two that
   * agree until they do not.
   */
  rehearsing?: boolean | undefined;
  previewOnly?: boolean | undefined;
  disclosures?: {
    layerDetails: { open: boolean; toggle: () => void };
    position: { open: boolean; toggle: () => void };
    timing: { open: boolean; toggle: () => void };
  };
}

const styles = {
  // Panel bounds the scrollport between the header and the commit footer.
  scroll: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: 'var(--r-space-3)',
    minHeight: 0,
    flex: 1,
    overflowY: 'auto' as const,
  },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-md)' },
  /**
   * The id stub that separates two same-named templates. Muted and lighter than
   * the name: it is a DISAMBIGUATOR, not part of what the template is called,
   * and rendering it at the name's weight would read as a longer name.
   */
  titleStub: { color: colors.textMuted, fontWeight: 400 },
  /*
   * NO `max-width` HERE, AND NONE IS TO BE ADDED. Owner instruction, recorded
   * because a cap looks like an improvement to anyone who meets this panel cold:
   * «این یک پنله که عرض دیفالتش کوچیکه و این حالت فول اسکرینشه. وقتی اپراتور فول
   * اسکرین میکنه یعنی میخواد که اینپوتها بزرگتر باشن.» The panel's default width
   * is narrow; FULLSCREEN IS THE REQUEST FOR BIGGER INPUTS, so capping the
   * content would defeat the control the operator just pressed. Fields fill the
   * panel. What made the full-width layout look broken was never the width — it
   * was the item controls drifting apart inside it (see `ListFieldEditor`).
   */
  // The footer is a separate row of Panel's flex body.
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: 'var(--r-insp-foot-gap)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    flexShrink: 0,
    background: colors.panelMuted,
    borderTop: `1px solid ${cssVars['--r-border-strong']}`,
    boxShadow: cssVars['--r-insp-foot-shadow'],
    padding: 'var(--r-insp-foot-pad)',
  },
  /*
   * THE FIELD HEADER — the authored name in PRIMARY ink, the binding key beside
   * it as secondary.
   *
   * They used to compete: the label rendered in the MUTED ink at body size and
   * the key was not shown at all, so a template whose author left the label
   * unset printed its raw key as the only thing an operator had, in the same
   * weight as everything around it. The operator thinks in the authored NAME;
   * the key is for whoever wrote the template. So the name takes the primary ink
   * and the key drops to the faintest at 11px — present for whoever needs to
   * correlate a value with a binding, and out of the way for whoever does not.
   */
  fieldLabel: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--r-space-1)',
    minWidth: 0,
    overflowWrap: 'anywhere' as const,
  },
  // 13px (owner) — a notch under the body scale, so a field's NAME sits between
  // the panel's content text and the 11px binding key beside it.
  fieldName: { color: colors.text, fontWeight: 500, fontSize: '13px' },
  // B-067 — a nested composition's fields, indented under the instance's label.
  group: {
    marginTop: 'var(--r-space-2)',
    paddingInlineStart: 'var(--r-space-2)',
    borderInlineStart: `2px solid ${colors.border}`,
  },
  groupHeading: {
    fontSize: 'var(--r-text-xs)',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    // `R-037` — no `text-transform: uppercase`: it made an authored name (`Rotator`) read as a
    // system constant (`ROTATOR`), which is the very thing the heading's naming fix removes.
    margin: '0 0 var(--r-space-1)',
  },
  /** `FIELD-FIXES-01` B — a refused take's line, in the error WORD's ink, as the file error is. */
  refusal: { fontSize: 'var(--r-text-sm)', color: colors.errorText, margin: 0 },
  /** `ROUTE-PLATES-01` C4 — the backup line: a state fact, not an error, so in the muted ink. */
} as const;

/**
 * §7 — THE IDENTITY BLOCK'S METADATA, as CHIPS.
 *
 * Status, layer, channel and server used to be two loose prose lines under the
 * title (`Status: loaded`, `layer 10 · channel 1 · srv`). Two sentences read as an
 * afterthought; four chips read as a STATUS LINE, which is what they are — and it
 * is the line an operator comes to the Inspector to reconcile against what
 * CasparCG reports.
 *
 * THE WORDS ARE UNCHANGED, deliberately. `dev-offline-polish` owns wording, states
 * and gating; this pass owns appearance. The chip labels are the same words
 * `layerDetail` prints, the status value is the same `item.status` string with the
 * same `(pending)` suffix, and the no-layer case still says exactly "no layer"
 * rather than being reworded into "none".
 */
function MetaChip({
  label,
  value,
  dotColor,
}: {
  /** Omitted where the value names itself — the status word and the server name. */
  label?: string;
  value: string;
  /**
   * The STATE's colour, or omitted for a chip that carries no state.
   *
   * A colour rather than a boolean, so the only way to get a dot is to have a
   * state colour in hand — a dot that is merely decorative is unrepresentable.
   */
  dotColor?: string;
}): JSX.Element {
  return (
    <Tag className="cg-meta-chip">
      {/*
        THE DOT CARRIES THE STATE'S OWN COLOUR — owner's call, and it supersedes
        the constant sky dot that stood here.

        The colour comes from `airStateVisual`, the SAME function the layer table's
        state mark reads, so this is the same colour by CONSTRUCTION rather than by
        a matching hex — the owner sets those state colours and they must not drift
        apart when he changes one.

        THIS IS A THIRD PLACE THE AIR HUE CAN APPEAR, and `theme.ts` says the air
        colour lives on the layer rows and the status bar's indicator "and NOWHERE
        else". That sentence is now one place out of date rather than wrong: the
        Inspector shows exactly ONE item, the one the operator has selected, and its
        status is the same fact the row is already showing in the same colour. It is
        not a second, independently-derived claim — which is what the rule exists to
        prevent — it is the same claim, from the same source, about the same item.

        The dot is never alone: the chip prints the status WORD beside it, so the
        hue is reinforcement and not the signal, exactly as on the row.
      */}
      {dotColor !== undefined && (
        <span className="cg-meta-chip__dot" style={{ background: dotColor }} aria-hidden="true" />
      )}
      {label !== undefined && <span className="cg-meta-chip__label">{label}</span>}
      <span className="cg-meta-chip__value">{value}</span>
    </Tag>
  );
}

/**
 * Inspector pane (Phase 6 §4 / R-003). Fields now STAGE locally: every edit
 * writes to the per-item draft store, and NOTHING reaches the bridge on change,
 * blur, or Enter. The item's staged field-set is applied as one atomic
 * `stack.update` by the Update control (here + the stack row); Discard reverts
 * drafts to the last applied values. Drafts are keyed by item and survive
 * selection switches.
 *
 * Field metadata is fetched via `templates.get` on selection change; if the
 * registry doesn't know the template we fall back to type inference so the
 * inspector is never empty.
 */
export function Inspector({
  item,
  onApply,
  onDiscard,
  onClose,
  rehearsing,
  previewOnly,
  disclosures,
}: Props): JSX.Element {
  const localizeUi = useUiText();
  const feedbackDirection = localeDirection(useLanguages().feedback);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const layerDetailsOpen = disclosures?.layerDetails.open ?? detailsOpen;
  const layerDetailsId = useId();
  const [lookup, setLookup] = useState<{
    templateId: string;
    channel: number | undefined;
    info: TemplateInfo | null;
    retained: RetainedLookFields | null;
  } | null>(null);
  /**
   * Every template this browser holds — read ONLY to answer "does another
   * template share this one's display name?". Browser-local (B-085), so it
   * resolves offline and costs nothing.
   */
  const [siblings, setSiblings] = useState<readonly TemplateInfo[]>([]);
  // THE SECOND HOP — Update reaches air, so it needs CasparCG. Editing does not.
  const casparReach = useCasparReach();
  const link = useLink();
  const linkDown = link === 'disconnected';
  /**
   * …and it names the RIGHT HOP, like every other refused verb. Apply used to say
   * "CasparCG cannot be reached" whenever health was absent — which is also what a
   * DEAD BRIDGE looks like from here, so the one control the operator reaches for
   * after typing an edit sent him to the wrong machine.
   */
  const engineName = useEngineName();
  const applyRefusal = casparRefusalReason(linkDown, casparReach);
  /**
   * `RUNTIME-REDESIGN-01` Phase 6 (`R-061` (a)) — golden rule 11: the heading names the ROW in
   * the operator's words. Through the one composition (`operatorRowName`, fed by the bank and
   * the registry), never a label composed here; the ids ride on the heading's `title`.
   * Unconditional, like every hook: an empty ref list when nothing is selected.
   */
  const nameOf = useOperatorNames(
    item === null ? [] : [{ itemId: item.itemId, templateId: item.templateId, slot: item.slot }],
  );
  /**
   * WHICH ROW the item is on — the bank's own BINDING, which is what "the row I am editing"
   * means to the operator, with the item's playout `slot` as the first answer when it carries
   * one. The two agree on a bridge that sets `slot` at load; the offline mock binds a row
   * without writing `slot` on the item, and a heading that fell back to the template there
   * would be the same surface saying two different things on two backends.
   */
  const slots = useFixedSlots();
  const boundSlot =
    item === null ? undefined : slots.find((s) => s.binding?.itemId === item.itemId);
  const rowSlot =
    item?.slot ??
    (boundSlot === undefined ? undefined : { channel: boundSlot.channel, layer: boundSlot.layer });
  // `CHANNEL-SOURCES-01` — the row's channel, whose own Source defaults this panel reads.
  const { selected: selectedChannel } = useSelectedChannel();
  const itemChannel = itemChannelOf(item, slots, selectedChannel);
  /*
    `CHANNEL-TEMPLATES-01` — the channel whose LIST this row's template is read from: two channels
    may list one template at two versions, and the fields, looks and plates shown here must be the
    ones this row will take. A row on no channel reads the station-wide entry.
  */
  const templateChannel = boundChannelOf(item, slots);
  const templateId = item?.templateId;
  // Re-render on any draft change so dirty markers + the draft-or-applied
  // values stay live (a push to `item` also re-renders via props).
  useSyncExternalStore(subscribeDrafts, draftsVersion);

  useEffect(() => {
    if (templateId === undefined) {
      setLookup(null);
      return;
    }
    let cancelled = false;
    let generation = 0;
    const pull = (): void => {
      const request = ++generation;
      const current = (): boolean => !cancelled && request === generation;
      const publish = (
        info: TemplateInfo | null,
        retained: RetainedLookFields | null = null,
      ): void => {
        if (current()) setLookup({ templateId, channel: templateChannel, info, retained });
      };
      // The Bridge owns live metadata. The adapter can answer offline from the local copy.
      void window.cg.templates
        .get({
          templateId,
          ...(templateChannel !== undefined && { channel: templateChannel }),
        })
        .then(
          async (info) => {
            if (!current()) return;
            if (info?.templateId !== templateId) {
              publish(null);
              return;
            }
            const looks = info.liveSources?.looks ?? [];
            if (
              looks.length < 2 ||
              (info.sharedFrameTitles !== undefined &&
                looks.every((look) => look.instanceId !== undefined)) ||
              !(info.groups ?? []).some((group) => aggregateHasFields(group.aggregate)) ||
              typeof window.cg.templates.page !== 'function'
            ) {
              publish(info);
              return;
            }
            // Older Bridge schemas can omit field relationships, but keep the authored scene.
            // A browser-local fallback may be a different version than this catalogue response.
            const page = await window.cg.templates
              .page(templateId, templateChannel)
              .catch(() => null);
            const retained =
              page?.kind === 'page' && page.source === 'bridge'
                ? retainedLookFields(info, page.html)
                : null;
            publish(info, retained);
          },
          () => publish(null),
        )
        .catch(() => undefined);
      // Same guard, same reason: a failed lookup leaves the heading without its
      // disambiguator rather than throwing.
      void window.cg.templates
        .list(templateChannel === undefined ? undefined : { channel: templateChannel })
        .then(
          (list) => {
            if (current()) setSiblings(list);
          },
          () => {
            if (current()) setSiblings([]);
          },
        );
    };
    pull();
    // B-391 — re-importing the same template id updates the catalogue without replacing the
    // selected stack item. The Inspector therefore cannot wait for selection to change: refresh
    // its schema on the catalogue push so newly-authored Sequence file ownership takes effect now.
    const offChanged = window.cg.templates.onChanged(pull);
    return () => {
      cancelled = true;
      offChanged();
    };
  }, [templateId, templateChannel, link]);

  /*
   * `templates.get` resolves after selection.  During that gap React still owns
   * the previous response in `info`; it is valid data, but for a DIFFERENT row.
   * Never let that stale schema reach rendering.  In particular, a stale
   * `fileSource.bridgePath` would mount `FromFileControl` for the newly-selected
   * item and attach/read the previous template's workbook under the new item id.
   * That is how merely visiting weather, then football, produced a football
   * draft containing weather rows.
   */
  const currentLookup =
    lookup?.templateId === templateId && lookup?.channel === templateChannel ? lookup : null;
  const resolvedInfo = currentLookup?.info ?? null;

  /*
   * TEXT-FILE-OPT-01 — reconcile this item's file attachments against what its
   * template actually GRANTS. An attachment on a field whose grant the author turned
   * off is detached, durably, rather than left live behind a hidden control.
   *
   * 🔴 THE THREE CONDITIONS ON `known: true` ARE THE SAFETY, and each rules out a
   * different way of deleting on absent information rather than on a decision:
   *
   *   - `item !== null`   — nothing selected, nothing to reconcile.
   *   - `info !== null`   — the schema has NOT resolved. This is the state on every
   *     selection change (`info` starts null and is filled asynchronously) and the
   *     permanent state for a template the registry does not know. Every field looks
   *     un-granted from here, so acting on it would delete every attachment the
   *     operator has, on every selection — the `pruneDrafts`/`pruneFromFile` bootstrap
   *     class of bug (see `useStackHousekeeping`), one store over.
   *   - the ids MATCH — `info` is NOT cleared when `item` changes, so between
   *     selecting item B and B's `templates.get` resolving, `info` still holds item
   *     A's template. Reconciling B's attachments against A's grants would detach
   *     whatever A does not happen to grant. Nothing on screen would say why.
   *
   * Anything short of all three resolves to `{known: false}`, which deletes nothing.
   */
  useEffect(() => {
    detachUngrantedSources(
      item !== null && resolvedInfo !== null
        ? {
            known: true,
            itemId: item.itemId,
            grantedPaths: grantedFileSourcePaths({
              fields: resolvedInfo.fields,
              groups: resolvedInfo.groups ?? [],
            }),
          }
        : { known: false },
    );
  }, [item, resolvedInfo]);

  if (item === null) {
    return (
      <Panel
        id="inspector"
        as="aside"
        title={localizeUi('INSPECTOR')}
        ariaLabel={localizeUi('Inspector')}
        onClose={onClose}
      >
        <div className="cg-inspector-body" style={styles.scroll}>
          {/*
            🔴 `MODAL-CHROME-10` ADDENDUM C §C4(c), FOUND IN PASSING. It read _"Select a stack
            item"_. `stack item` is our word for `StackItemState` and it is not on the
            operator's screen anywhere — he selects a ROW. Found by the second sweep axis while
            taking the same vocabulary out of the deletion refusal; one defect, two surfaces.
          */}
          <p style={styles.empty}>{localizeUi('Select a row to inspect its fields.')}</p>
        </div>
      </Panel>
    );
  }

  const itemId = item.itemId;
  const schema = resolvedInfo?.fields ?? null;
  const lookCarrier = resolvedInfo?.liveSources;
  const looks = lookCarrier?.looks ?? [];
  const previewPin = previewLookPin(itemId);
  const programmeFocus =
    rehearsing === true
      ? templateFocusTarget(lookCarrier, resolvedInfo?.controlLiveLayout, item.activeLookId)
      : undefined;
  const editingLook =
    looks.find((look) => look.id === previewPin) ??
    (lookCarrier === undefined
      ? undefined
      : activeLookOf(lookCarrier, programmeFocus?.presetId ?? item.activeLookId));
  const legacyOwnership = currentLookup?.retained?.ownership;
  const instanceOf = (look: (typeof looks)[number]): string | undefined =>
    look.instanceId ?? legacyOwnership?.get(look.id);
  // Without complete ownership, every group remains available.
  const inactiveLookInstances = new Set(
    editingLook !== undefined && looks.every((look) => instanceOf(look) !== undefined)
      ? looks.filter((look) => look.id !== editingLook.id).map(instanceOf)
      : [],
  );
  /*
   * Only groups that CARRY a field, at any depth.
   *
   * The owner's report: `ROTATOR[0]`, `ROTATOR[1]`, `ROTATOR[2]` are headings that mean
   * nothing. Two different things were hiding behind that, and they get opposite answers:
   *
   *  - A group whose whole subtree declares NO field is a label over a void — nothing to
   *    edit under it, so it is pure noise and it is dropped here.
   *  - A group that DOES carry fields keeps its heading, because each stamped instance
   *    holds INDEPENDENT values (verified: its own `name` key, its own sub-object, and
   *    `@cg/template-runtime` applies each item's own namespace). Removing the grouping
   *    would print the same field label two or three times with no way to tell which
   *    instance is which. Those got a readable label instead — see
   *    `sequenceItemHeading` (`R-037`: `<composition> — item N`; `R-040`: a stub on a collision).
   */
  const fieldGroups = (resolvedInfo?.groups ?? []).filter((g) => aggregateHasFields(g.aggregate));
  const inheritedFields =
    resolvedInfo === null ? undefined : controlLiveLayoutFieldDefaults(resolvedInfo);
  const frameTitles = indexSharedFrameTitles(
    resolvedInfo?.sharedFrameTitles ?? currentLookup?.retained?.sharedFrameTitles ?? [],
    fieldGroups,
  );
  const visibleGroups = fieldGroups.filter((group) => !inactiveLookInstances.has(group.instanceId));
  const sequenceRowSets = sequenceRowsPageSets(visibleGroups);
  const combinedGroupNames = new Set(
    sequenceRowSets.flatMap((set) => set.pages.map((page) => page.name)),
  );
  const groups = visibleGroups.filter((group) => !combinedGroupNames.has(group.name));
  // The schema-less fallback (registry doesn't know the template) stays FLAT: with no
  // schema there are no namespaces to infer, so every top-level VALUE is a field.
  const inferredRows: { field: DynamicField | null; key: string }[] = Object.keys(item.fields)
    .filter((key) => !isFieldNamespace(item.fields[key]))
    .map((key) => ({ field: null, key }));
  const hasSchema = (schema !== null && schema.length > 0) || fieldGroups.length > 0;
  const rootFields: { field: DynamicField | null; key: string }[] = hasSchema
    ? (schema ?? []).map((f) => ({ field: f, key: f.id }))
    : inferredRows;

  // D-137 / C-015 — the plate drafts are the SAME draft state, so the commit bar
  // has to see them: an Update the operator cannot press, or a Discard that
  // reads as nothing-to-discard, would be the panel disagreeing with its own
  // controls about whether there is an unapplied edit.
  const templatePosition = defaultPositionOf(
    item.templateId,
    resolvedInfo?.liveSources?.defaultPosition,
  );
  const dirty = isItemDirty(
    itemId,
    item.fields,
    appliedPlateSources(
      item.templateId,
      resolvedInfo?.liveSources?.sources ?? [],
      itemChannel,
      resolvedInfo?.controlLiveLayout,
    ),
    // BM-2 — and the per-look composition, which stages here too and is the SAME fact.
    item.lookSourceOverride,
    /*
      🔴 …and the POSITION, since UPDATE commits it now (owner, 2026-09-14). The chip and
      the enabled verb both read this ONE function, so a staged move that did not answer here
      would leave the bar reporting itself clean with a placement still to send — and
      DISCARD, which now drops it, would throw it away with nothing having said it was there.
    */
    appliedPositionOf(item, templatePosition),
    /*
      🔴 …and the TIMING (`DELTA B4`). It stages like every other edit now and `Update` spends
      it, so the bar has to see it: a pass count staged against a bar reporting itself clean is
      an Update the operator cannot press and a Discard that reads as nothing to discard.
    */
    item.timingOverride,
  );
  const isEmpty = rootFields.length === 0 && groups.length === 0 && sequenceRowSets.length === 0;
  // `R-100` — the row's book (its first page list), turned beside that field.
  const rowBook = bookOf(resolvedInfo, item);

  // R-004 — the header names the template. The `TemplateInfo` was already in hand here and
  // its label was dropped on the floor in favour of the raw `templateId`. The id is a
  // correlation key, not a label: tooltip only, never text.
  const rawTitle = item.fields['title'];
  const contentTitle = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const label =
    (resolvedInfo !== null ? displayLabel(resolvedInfo) : null) ?? localizeUi('Unnamed template');
  // See `templateIdStub`: shown only when another template answers to the same
  // name, so the ordinary heading stays a name and nothing else.
  const ambiguous =
    resolvedInfo !== null &&
    siblings.filter((t) => templateDisplayName(t) === templateDisplayName(resolvedInfo)).length > 1;
  /**
   * The ROW's name for the heading — its alias or default (`Layer N` / `Bed N`) when it has a
   * slot in the bank; `operatorRowName`'s own fallback order otherwise (the template, then a
   * shortened id), so the heading is never empty. `names[0]` is that first choice by the
   * module's contract ("in reading order: WHICH ROW, then WHAT IT WAS SHOWING").
   */
  const rowName = nameOf({ itemId: item.itemId, templateId: item.templateId, slot: rowSlot });
  const heading = rowName.names[0] ?? label;
  /*
   * §3 — IS THIS ROW ON AIR? Read ONCE, here, and used by the commit control below for
   * BOTH its hue and its word, so the two can never describe different rows.
   */
  const onAir = isOnAirStatus(item);
  /*
   * §2 — THE ROW'S STATE, IN THE ROW'S WORDS. One evaluation of the canonical visual, one
   * ask of the canonical rehearse precedence; the chip below renders both.
   */
  const stateVisual = airStateVisual(item.status, item.pending);
  const onPvw = rehearseOwnsStateWord(item.status, item.pending, rehearsing === true);
  const stateWord = onPvw ? REHEARSE_STATE_WORD : stateVisual.label;
  const stateColor = onPvw ? REHEARSE_STATE_COLOR : stateVisual.color;

  return (
    <Panel
      id="inspector"
      as="aside"
      title={localizeUi('INSPECTOR')}
      ariaLabel={localizeUi('Inspector')}
      onClose={onClose}
    >
      {/*
        `cg-inspector-body` on THIS branch too. It was only on the empty branch above, so the
        container query `controls.css` writes against it (`@container inspector`) matched no
        field the operator could ever see — and the Phase 5 field-box rules scope to it.
      */}
      <div className="cg-inspector-body" style={styles.scroll}>
        <div className="cg-inspector-identity">
          <div className="cg-inspector-identity__summary">
            <button
              type="button"
              className="cg-inspector-disclosure"
              aria-label={localizeUi('Layer details')}
              aria-controls={layerDetailsId}
              aria-expanded={layerDetailsOpen}
              onClick={disclosures?.layerDetails.toggle ?? (() => setDetailsOpen((open) => !open))}
            >
              <Icon
                icon={layerDetailsOpen ? ChevronDown : ChevronRight}
                size={14}
                flipRtl={!layerDetailsOpen}
              />
            </button>
            <div className="cg-inspector-identity__names">
              <h3 title={rowName.title} data-inspector-heading="">
                <IsolatedName alignWithInterface>{heading}</IsolatedName>
                {heading === label && ambiguous && (
                  <span
                    style={styles.titleStub}
                    data-template-stub={templateIdStub(item.templateId)}
                  >
                    {' '}
                    · {templateIdStub(item.templateId)}
                  </span>
                )}
              </h3>
              {heading !== label && (
                <div title={label} data-inspector-template="">
                  <IsolatedName alignWithInterface>{label}</IsolatedName>
                  {ambiguous && (
                    <span
                      style={styles.titleStub}
                      data-template-stub={templateIdStub(item.templateId)}
                    >
                      {' '}
                      · {templateIdStub(item.templateId)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <MetaChip value={localizeUi(stateWord)} dotColor={stateColor} />
          </div>
          <div
            id={layerDetailsId}
            className="cg-inspector-identity__details"
            hidden={!layerDetailsOpen}
          >
            {contentTitle !== '' && (
              <div className="cg-inspector-identity__content-title">
                <IsolatedName alignWithInterface>{contentTitle}</IsolatedName>
              </div>
            )}
            <div className="cg-meta-chips">
              {item.slot === undefined ? (
                <MetaChip value={localizeUi(layerDetail(undefined))} />
              ) : (
                <>
                  <MetaChip label={localizeUi('layer')} value={String(item.slot.layer)} />
                  <MetaChip label={localizeUi('channel')} value={String(item.slot.channel)} />
                  <MetaChip value={localizeUi(item.slot.server)} />
                </>
              )}
            </div>
          </div>
        </div>
        {/*
          🔴 `FIELD-FIXES-01` B — A REFUSED TAKE, IN THE ROW'S OWN LINE: the same composition the
          row shows (`takeRefusalLine`), right under the state it explains, named with this
          heading's name. It stands until the bridge withdraws it (the row taken, or cleared).
        */}
        {item.takeRefusal !== undefined && (
          <p style={styles.refusal} data-inspector-take-refusal="" dir={feedbackDirection}>
            <TakeRefusalText
              line={takeRefusalLine(heading, item.takeRefusal, {
                // `PLAYOUT-SOURCES-01` §1.C — `Plate N`, and the entry as it stands now.
                plateLabel: plateLabelOf(resolvedInfo, item.takeRefusal.plateId),
                entry: currentSourceCatalog().sources.find(
                  (s) => s.id === item.takeRefusal?.sourceId,
                ),
                channel: rowSlot?.channel,
                engineName,
              })}
            />
          </p>
        )}
        <BackupStatus item={item} template={resolvedInfo} />
        {/* `TIMING-WIRE-22` §4 — the template's timing: `mode`/`hold` as FACTS, and the
            operator's passes/gap as controls. Renders nothing for a template imported before
            `TemplateInfo.playout` existed, rather than guessing what it does. */}
        <TimingSection item={item} info={resolvedInfo} disclosure={disclosures?.timing} />
        {/* R-011 — per-item on-air position; keyed so item switches re-seed. */}
        <PositionPicker
          key={`pos-${itemId}`}
          item={item}
          templatePosition={templatePosition}
          canReset={resolvedInfo !== null}
          disclosure={disclosures?.position}
          adjustments={
            lookCarrier !== undefined &&
            lookCarrier.sources.length > 0 && (
              <LiveFrameAdjustments
                item={item}
                live={lookCarrier}
                channel={itemChannel}
                rehearsing={rehearsing}
                previewLookId={previewPin}
                controlLiveLayout={resolvedInfo?.controlLiveLayout}
              />
            )
          }
        />
        {/* D-137 / C-015 — bind this template's live plates. Renders nothing at
            all for a template that declares none, which is most of them. */}
        <LivePlatesSection item={item} info={resolvedInfo} channel={itemChannel} />
        {/* BM-2 — the per-look inputs sit BELOW the default they fall back to, so the two
            levels read top-down in the order they resolve. */}
        <LooksBindingsSection
          item={item}
          info={resolvedInfo}
          rehearsing={rehearsing}
          previewOnly={previewOnly}
          channel={itemChannel}
          editingLook={editingLook}
          onEditLook={(lookId) => {
            setPreviewLookPin(itemId, lookId);
          }}
        />
        <div className="cg-inspector-section cg-inspector-fields">
          <h2>{localizeUi('Fields')}</h2>
          {isEmpty ? (
            <p style={styles.empty}>{localizeUi('No fields.')}</p>
          ) : (
            <>
              <div className="cg-inspector-fields__columns" aria-hidden="true">
                <span>{localizeUi('Field')}</span>
                <span>{localizeUi('Value')}</span>
              </div>
              {rootFields.map((row) => (
                // Key by item+path so switching stack items remounts the controls
                // (each re-seeds from the new item's draft-or-applied value) — no
                // uncontrolled DOM node is ever reused across items.
                <FieldEditor
                  key={`${itemId}-${row.key}`}
                  field={row.field}
                  path={[row.key]}
                  item={item}
                  applied={valueAt(item.fields, [row.key])}
                  book={rowBook?.fieldId === row.key ? rowBook : null}
                  bookName={resolvedInfo?.pageLists?.find((l) => l.fieldId === row.key)?.name}
                  bookFit={resolvedInfo?.pageLists?.find((l) => l.fieldId === row.key)?.fit}
                />
              ))}
              {sequenceRowSets.map((set) => (
                <SequenceRowsEditor key={set.sequenceId} item={item} set={set} />
              ))}
              {groups.map((group) => (
                <FieldGroup
                  key={`${itemId}-${group.name}`}
                  group={group}
                  path={[group.name]}
                  item={item}
                  applied={item.fields}
                  inheritedFields={inheritedFields}
                  frameTitles={frameTitles}
                  controlLayout={resolvedInfo?.controlLiveLayout !== undefined}
                />
              ))}
            </>
          )}
        </div>
      </div>
      {/* Keep commit controls after the editable fields in keyboard order. */}
      <footer className="cg-inspector-actions" data-inspector-actions="" style={styles.actions}>
        <Button
          variant="neutral"
          aria-label={localizeUi('Discard staged edits')}
          disabled={!dirty}
          onClick={() => onDiscard(itemId)}
        >
          {localizeUi('Discard')}
        </Button>
        <AsyncButton
          variant={onAir ? 'commit' : 'accent'}
          /*
            The accessible name keeps `Apply staged edits` as its opening words in both
            states — it is what every finder and every voice command already says — and
            GAINS the fact the colour carries, so a screen-reader operator is told the row
            is live by the control itself rather than only by the chip above it.
          */
          aria-label={
            onAir
              ? localizeUi('Apply staged edits to the on-air row')
              : localizeUi('Apply staged edits')
          }
          disabled={applyRefusal !== undefined}
          {...(applyRefusal !== undefined
            ? { title: localizeEngineWording(applyRefusal, engineName, localizeUi) }
            : {})}
          run={() => onApply(itemId)}
          onError={() => undefined}
          data-inspector-commit={onAir ? 'on-air' : 'off-air'}
        >
          {onAir ? localizeUi('Update on air') : localizeUi('Update')}
        </AsyncButton>

        {dirty && <DraftChip label={localizeUi('unapplied edits')} />}
      </footer>
    </Panel>
  );
}

/**
 * 🔴 `R-037` / `R-040` — a group's heading with EACH NAME IN ITS OWN ISOLATE (golden rule 11). A
 * sequence item reads `<composition> — item N`, plus ` · <stub>` only when two would collide; the
 * composition name is often Persian and `— item N` is LTR chrome, and joined into one isolate the
 * bidi algorithm would order them, not this line. A group without parts (a composition instance,
 * or a template imported before the parts existed) is one name, in one isolate, as before.
 */
export function GroupHeadingText({ group }: { group: CompositionFieldGroup }): JSX.Element {
  const localizeUi = useUiText();
  const parts = group.labelParts;
  if (parts === undefined) return <IsolatedName>{group.label ?? group.name}</IsolatedName>;
  return (
    <>
      <IsolatedName>{parts.name}</IsolatedName>
      {localizeUi(' — item {item}', { item: String(parts.item) })}
      {parts.stub !== undefined && (
        <>
          {' · '}
          <IsolatedName>{parts.stub}</IsolatedName>
        </>
      )}
    </>
  );
}

/**
 * B-067 — one nested composition instance's fields, under its namespace.
 *
 * The group's `name` is the STABLE namespace key the value object is addressed by (and the
 * one `@cg/template-runtime` resolves at render); `label` is what the operator reads. Two
 * instances of the same composition therefore stay independent, and two same-id fields in
 * different compositions never collide — each lives at its own path. Recurses to any depth.
 */
function FieldGroup({
  group,
  path,
  item,
  applied,
  inheritedFields,
  frameTitles,
  controlLayout,
}: {
  group: CompositionFieldGroup;
  path: FieldPath;
  item: StackItemState;
  applied: FieldValues;
  inheritedFields: FieldValues | undefined;
  frameTitles: SharedFrameTitleIndex;
  controlLayout: boolean;
}): JSX.Element {
  const localizeUi = useUiText();
  const itemId = item.itemId;
  return (
    <section
      style={styles.group}
      aria-label={localizeUi('{group} fields', { group: group.label ?? group.name })}
    >
      {/* Authored too — a composition's label comes from the template package. */}
      <h3 style={styles.groupHeading}>
        <GroupHeadingText group={group} />
      </h3>
      {group.aggregate.fields.map((field) => {
        const fieldPath = [...path, field.id];
        const titlePaths = frameTitles.get(JSON.stringify(fieldPath));
        const isPlateTitle =
          field.label === 'Title' &&
          (titlePaths !== undefined ||
            (controlLayout &&
              group.compositionId.startsWith('layout-frame-') &&
              field.id === 'title'));
        return (
          <FieldEditor
            key={`${itemId}-${fieldPath.join('/')}`}
            field={field}
            path={fieldPath}
            item={item}
            applied={valueAt(applied, fieldPath)}
            inheritedFields={inheritedFields}
            titlePaths={titlePaths}
            displayLabel={isPlateTitle ? localizeUi('Title') : undefined}
          />
        );
      })}
      {/* Same field-less filter as the root: a noise heading is noise at every depth. */}
      {group.aggregate.groups
        .filter((child) => aggregateHasFields(child.aggregate))
        .map((child) => (
          <FieldGroup
            key={`${itemId}-${[...path, child.name].join('/')}`}
            group={child}
            path={[...path, child.name]}
            item={item}
            applied={applied}
            inheritedFields={inheritedFields}
            frameTitles={frameTitles}
            controlLayout={controlLayout}
          />
        ))}
    </section>
  );
}

function FieldEditor({
  field,
  path,
  item,
  applied,
  book = null,
  bookName,
  bookFit,
  inheritedFields,
  titlePaths,
  displayLabel,
}: {
  field: DynamicField | null;
  path: FieldPath;
  item: StackItemState;
  applied: FieldValue | undefined;
  /** `R-100` — the row's book, when THIS field is its page list: it is turned in the book block. */
  book?: RowBook | null;
  /** `RUN-NEXT-VERSION-03` 1.4 — the book's sequence name (`TemplateInfo.pageLists[].name`). */
  bookName?: string | undefined;
  /** `RUN-NEXT-VERSION-03` delta A — the sequence's picture fit (`TemplateInfo.pageLists[].fit`). */
  bookFit?: ImageFit | undefined;
  inheritedFields?: FieldValues | undefined;
  titlePaths?: readonly FieldPath[] | undefined;
  displayLabel?: string | undefined;
}): JSX.Element {
  const localizeUi = useUiText();
  useSyncExternalStore(subscribeFromFile, fromFileVersion);
  const itemId = item.itemId;
  // The control's accessible name stays the FIELD id (not the full path): the operator
  // sees it inside its group, and the group's own label carries the namespace.
  const fieldId = path[path.length - 1] ?? '';
  // `RUN-NEXT-VERSION-03` 1.4 — a BOOK is headed by its name (the field's Title, else its sequence's
  // name), never by its field id.
  const isBook = field?.type === 'list' && field.pages === true;
  const label =
    displayLabel ??
    (isBook && field !== null
      ? bookTitle(field, bookName)
      : (field?.label ?? (fieldId === 'text' ? localizeUi('Text') : fieldId)));
  const inherited = valueAt(inheritedFields, path);
  const baseline = applied === undefined ? inherited : applied;
  const value = effectiveValue(itemId, path, baseline);
  const kind = field?.type ?? inferKind(value);
  const appliedAt = (target: FieldPath): FieldValue | undefined => {
    const saved = valueAt(item.fields, target);
    return saved === undefined ? valueAt(inheritedFields, target) : saved;
  };
  const affectedPaths = titlePaths ?? [path];
  const dirty = affectedPaths.some((target) =>
    isFieldDirty(itemId, target, valueAt(item.fields, target)),
  );
  const fieldRefusal =
    dirty && kind !== 'number' && field !== null ? operatorFieldError(field, value) : undefined;
  const unstage = (): void => {
    if (titlePaths === undefined) unstageField(itemId, path);
    else unstageFieldBatch(itemId, titlePaths);
  };
  const stage = (next: FieldValue): void => {
    // Returning to the displayed baseline must leave an inherited caption sparse.
    if (
      typeof inherited === 'string' &&
      affectedPaths.every((target) => appliedAt(target) === next)
    ) {
      unstage();
    } else if (titlePaths === undefined) {
      stageField(itemId, path, next);
    } else {
      stageFieldBatch(
        itemId,
        titlePaths.map((path) => ({ path, value: next })),
      );
    }
  };
  /*
   * R-018 + TEXT-FILE-OPT-01 — a field sources its value from a text file only when
   * its AUTHOR granted it one. The kind test is still the outer condition, but it is
   * no longer the WHOLE condition and it is no longer spelled here: gating on kind
   * alone is a decision about a TYPE, so it rendered this control identically under a
   * twelve-character `title` and under a four-hundred-word crawl — once per text /
   * multiline / list field on the template.
   *
   * Asked of the FIELD, never of `kind`. `kind` falls back to `inferKind(value)` when
   * the template schema has not resolved, and an inferred row was never authored, so
   * it can carry no grant — reading it here would be reading a guess as a decision.
   */
  const fromFileKind =
    field !== null &&
    !(isBook && item.managedBook !== undefined) &&
    fieldAllowsFileSource(field) &&
    fieldTypeTakesFileSource(field.type)
      ? field.type
      : undefined;
  const fileOnly = fieldUsesFileOnly(field);
  const authoredPath = bridgeTextSourcePath(field);
  const authoredDelimiter = authoredFileDelimiter(field);
  const authoredFormat = authoredFileFormat(field) ?? 'text';
  const lockedPath = lockedBridgeTextSourcePath(field);
  const listFileManaged =
    fromFileKind === 'list' && fileOnly && fromFileState(item.itemId, path) !== undefined;
  // Built ONCE and placed in one of two spots (see below), so the two placements
  // cannot drift into two differently-configured controls.
  const fromFile =
    fromFileKind === undefined ? null : (
      <FromFileControl
        item={item}
        path={titlePaths?.[0] ?? path}
        writePaths={titlePaths}
        kind={fromFileKind}
        fieldId={fieldId}
        {...(authoredPath !== undefined ? { authoredPath } : {})}
        {...(authoredDelimiter !== undefined ? { authoredDelimiter } : {})}
        authoredFormat={authoredFormat}
        {...(field?.type === 'list' && field.itemFields !== undefined
          ? { itemFields: field.itemFields }
          : {})}
        {...(field?.type === 'list' ? { value, maxItems: field.maxItems } : {})}
        fileOnly={fileOnly}
        lockFile={lockedPath !== undefined}
      />
    );
  return (
    <div
      className={needsWideEditor(kind, field) ? 'cg-field-row cg-field-row--wide' : 'cg-field-row'}
      data-field-editor={isBook ? 'book' : undefined}
    >
      {/*
        🔴 THE AUTHORED NAME IS THE HEADING; THE BINDING KEY IS ITS TOOLTIP (`RUN-NEXT-VERSION-03`
        1.4, golden rule 11). The key used to be printed beside the name whenever the two differed
        (`Target time targetTime`, `Sequence pages-el-1792581663991`) — an internal id in the sentence
        the operator reads. It is relocated, not deleted: a hover on the heading says it.
      */}
      <span style={styles.fieldLabel} title={label !== fieldId ? fieldId : undefined}>
        {/*
          The AUTHORED name is the template author's string, not this console's chrome — a
          Persian field label is the ordinary case here — so its characters are isolated and its
          BOX stays the LTR flex item it already was (`MODAL-CHROME-10` ADDENDUM B: a `<bdi>` made
          a flex item would flush its own text to the wrong side).
        */}
        <span style={styles.fieldName} data-field-heading={fieldId}>
          <IsolatedName alignWithInterface>{label}</IsolatedName>
        </span>
        <FieldDescription label={label} description={field?.description} />
        {dirty && (
          <span
            className="cg-dirty-dot"
            aria-label={localizeUi('{field} has unapplied edits', { field: label })}
          >
            ●
          </span>
        )}
      </span>
      <div className="cg-field-row__control">
        {isBook && field !== null && field.type === 'list' ? (
          // `RUN-NEXT-VERSION-03` 1.4 — a BOOK: one block — where its pages come from, whether they are
          // on the row, the pages around the current one, turning and loading.
          <BookBlock
            itemId={itemId}
            fieldId={fieldId}
            title={label}
            value={value}
            defaults={field.default}
            dirty={dirty}
            channel={item.slot?.channel}
            templateId={item.templateId}
            book={book}
            managedBook={item.managedBook}
            onStage={stage}
            applied={applied}
            onAir={isOnAirStatus(item)}
            fit={bookFit}
          />
        ) : (
          !fileOnly && (
            <FieldControl
              kind={kind}
              field={field}
              value={value}
              applied={applied}
              fieldId={fieldId}
              dirty={dirty}
              onStage={stage}
              onUnstage={unstage}
              templateId={item.templateId}
              channel={item.slot?.channel}
              {...(fromFileKind !== undefined ? { fromFile } : {})}
              listFileManaged={listFileManaged}
            />
          )
        )}
        {/* A LIST field's from-file control is rendered INSIDE the editor, beside
            "Add item" on the field's one footer row (see `ListFieldEditor`'s
            `footer` slot). Every other kind renders it here, beneath the control.
            The difference is not cosmetic bookkeeping: a list is the only kind
            with a second footer control to share a row with. */}
        {fromFileKind !== undefined && (kind !== 'list' || fileOnly) && fromFile}
        {fieldRefusal !== undefined && (
          <p style={styles.refusal} data-field-refusal={fieldId}>
            {fieldRefusal.line}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldControl({
  kind,
  field,
  value,
  applied,
  fieldId,
  dirty,
  onStage,
  onUnstage,
  fromFile,
  listFileManaged = false,
  templateId,
  channel,
}: {
  kind: DynamicField['type'] | 'unknown';
  field: DynamicField | null;
  value: FieldValue | undefined;
  /** The value on air for this field — what a withdrawn draft falls back to. */
  applied: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
  /** Withdraw this field's draft (`unstageField`). */
  onUnstage: () => void;
  /** Only a LIST consumes this — it shares its footer row with "Add item". */
  fromFile?: ReactNode;
  listFileManaged?: boolean;
  templateId: string;
  channel: number | undefined;
}): JSX.Element {
  if (kind === 'boolean') {
    const v = typeof value === 'boolean' ? value : false;
    return (
      <input
        type="checkbox"
        checked={v}
        onChange={(e) => onStage(e.target.checked)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'number') {
    return (
      <NumberField
        field={field}
        value={value}
        applied={applied}
        fieldId={fieldId}
        dirty={dirty}
        onStage={onStage}
        onUnstage={onUnstage}
      />
    );
  }
  if (kind === 'color') {
    // NOT CHROME, AND DELIBERATELY NOT A TOKEN (STATION-CHROME-01 §1): this is the
    // fallback VALUE of a template's own colour field — the operator's data, headed
    // for the graphic on air. A theme token here would put the console's palette
    // inside the broadcast, and would move the graphic the day the palette moved.
    const v = typeof value === 'string' ? value : DEFAULT_COLOR_FIELD_VALUE;
    return (
      <input
        type="color"
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'select' && field?.type === 'select') {
    const v = typeof value === 'string' ? value : field.default;
    return (
      <select
        className={fieldClass(dirty)}
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'image' && field?.type === 'image') {
    return (
      <ImageFieldControl
        field={field}
        value={value}
        ariaLabel={fieldId}
        dirty={dirty}
        templateId={templateId}
        channel={channel}
        onChange={(assetId) => {
          if (assetId === undefined) onUnstage();
          else onStage({ assetId });
        }}
      />
    );
  }
  // `FIELD-DIGITS-01` — a text or multiline field shows and stages its value in the field's
  // digits, written as each key lands (`as-typed`, and an unresolved schema, write nothing).
  const digits = fieldDigitsOf(field);
  if (kind === 'multiline') {
    const v = typeof value === 'string' ? value : '';
    // Grows with its CONTENT (wrapped height, not newline count) — see
    // `AutoGrowTextarea`. `is-dirty` still rides the class, so the amber
    // unapplied-edit border is unchanged.
    return (
      <AutoGrowTextarea
        className={dirty ? 'is-dirty' : undefined}
        value={writeFieldDigits(v, digits)}
        onChange={(e) => onStage(writeFieldText(e.currentTarget, field, e.nativeEvent))}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'list') {
    // R-003 — the structured list editor stages its ops (no remount key). `TEXT-DIGITS-01` — its
    // cells are typed in the list field's digits.
    return (
      <ListFieldEditor
        fieldId={fieldId}
        field={field}
        value={value}
        onStage={onStage}
        footer={fromFile}
        fileManaged={listFileManaged}
        templateId={templateId}
        channel={channel}
      />
    );
  }
  if (kind === 'text' && field?.type === 'text' && field.countdown !== undefined) {
    // `DELTA-RUN-NEXT-VERSION-01-C` — a field that sets a countdown's target (marked at import from
    // the template's own `clock-target` binding): the shared date and time control, staged through
    // the same `onStage` as the text box below, so Update sends the row's ordinary `CG UPDATE`.
    return (
      <CountdownTargetField
        field={field}
        countdown={field.countdown}
        value={value}
        fieldId={fieldId}
        dirty={dirty}
        onStage={onStage}
      />
    );
  }
  // Default: text input (controlled — stages on change, no blur/Enter commit).
  const v = typeof value === 'string' ? value : value === undefined ? '' : String(value);
  // `dir={EDITOR_DIR}` — the browser's first-strong-character rule, so a Persian
  // headline reads RTL while `@IRIBNEWS` stays LTR. Presentation only: it never
  // reaches the staged value or the scene. See `editorTextDirection`.
  return (
    <input
      className={fieldClass(dirty)}
      type="text"
      dir={EDITOR_DIR}
      value={writeFieldDigits(v, digits)}
      onChange={(e) => onStage(writeFieldText(e.currentTarget, field, e.nativeEvent))}
      aria-label={fieldId}
    />
  );
}

/**
 * A number field that STAGES on change while preserving in-progress text. It is
 * controlled by a local raw string (so "-", "1.", and "" survive) and NEVER
 * remounts on a keystroke — the text re-seeds only when the effective value
 * changes from OUTSIDE our own edits (a push, Discard, apply, or item switch),
 * via the standard "adjust state during render" pattern. This is the fix for
 * the review finding that the old frozen-key trick dropped focus on the first
 * digit and could diverge across same-id fields.
 *
 * 🔴 `PERSIAN-DIGITS-01` — **THE OPERATOR'S DIGITS STAY ON SCREEN; THE NUMBER GOES TO AIR.**
 *
 * - The text is the operator's, exactly as typed (`digits="as-typed"`): `۱۲٫۵` stays `۱۲٫۵`. It
 *   is READ through `@cg/text-shaping`'s one reader, and the staged value is the NUMBER — the wire
 *   contract of a `number` field is unchanged, so the template renders it through `String(n)`.
 * - Text that is not a number WITHDRAWS the draft (`unstageField`) instead of leaving the last
 *   parsing prefix staged. Measured before: `۱۲a` sent 12 and `۱٬۲۳۴` sent 1, with nothing on
 *   screen saying so. Now Update leaves this field exactly as it is on air.
 * - Incomplete numeric input stays local. Clearing a required value stages an empty draft, and a
 *   parsed number stages as typed so its authored limits can refuse the complete Update.
 *
 * `FIELD-DIGITS-01` — the box is written in the FIELD's digits (`fieldDigitsOf`): the author's set,
 * `latin` for a field that carries none (what air draws for it), and as typed only while the
 * template schema is unresolved. So what the operator sees is what the page draws. The reading,
 * the refusal and the staging above are unchanged; the value sent is still the number.
 */
function NumberField({
  field,
  value,
  applied,
  fieldId,
  dirty,
  onStage,
  onUnstage,
}: {
  field: DynamicField | null;
  value: FieldValue | undefined;
  applied: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
  onUnstage: () => void;
}): JSX.Element {
  const refusalId = useId();
  const digits = fieldDigitsOf(field);
  const [text, setText] = useState(typeof value === 'number' ? String(value) : '');
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    // Keep the in-progress text if it already represents the new value; else reseed from
    // outside (push / discard / apply changed the value) — in the digits the operator was
    // using, so a Discard on `۱۲` does not answer in Latin.
    const represents = typeof value === 'number' && parseLocalizedNumber(text) === value;
    if (!represents) setText(typeof value === 'number' ? formatNumberLike(value, text) : '');
  }
  // Shown in the field's digits whatever wrote `text` — a keystroke, a reseed, or a schema that
  // resolved after the box first rendered. The writer is idempotent and one-for-one.
  const shown = writeFieldDigits(text, digits, 'number');
  const reading = readLocalizedNumber(shown);
  const constraintRefusal =
    field?.type === 'number'
      ? reading.kind === 'number'
        ? operatorFieldError(field, reading.value)?.line
        : dirty && shown.trim() === ''
          ? operatorFieldError(field, '')?.line
          : undefined
      : undefined;
  const refusal = reading.kind === 'invalid' ? NOT_A_NUMBER : constraintRefusal;
  const refused = refusal !== undefined;
  // R-020 — the shared NumericInput (type="text" under the hood: a `type="number"` box drops
  // Persian digits before script sees them). `step`/`min`/`max` are not rendered: on the old
  // `type="number"` they only drove the spinner and the :invalid style — the staged value was
  // never clamped. `scrub` — drag horizontally or press ↑/↓ to adjust, the Designer's feel
  // (owner request). `step: 1` with Shift for tenths and Ctrl/Cmd for tens; no min/max, because
  // a dynamic field's range is not declared here.
  const allowedValues = field?.type === 'number' ? numberFieldAllowedValues(field) : undefined;
  if (field?.type === 'number' && allowedValues !== undefined) {
    return (
      <select
        className={fieldClass(dirty)}
        value={String(
          typeof value === 'number' && allowedValues.includes(value)
            ? value
            : (allowedValues[0] ?? field.default),
        )}
        aria-label={fieldId}
        onChange={(event) => onStage(Number(event.currentTarget.value))}
      >
        {allowedValues.map((choice) => (
          <option key={choice} value={choice}>
            {numberFieldValueLabel(field, choice)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <NumericInput
        className={fieldClass(dirty)}
        decimal
        allow="number"
        digits={digits}
        scrub={{ step: 1 }}
        value={shown}
        {...(refused ? { 'aria-invalid': true, 'aria-describedby': refusalId } : {})}
        onValueChange={(raw) => {
          setText(raw);
          const reading = readLocalizedNumber(raw);
          if (reading.kind === 'number') {
            setSeen(reading.value);
            onStage(reading.value);
          } else if (field?.required === true && raw.trim() === '') {
            setSeen('');
            onStage('');
          } else {
            // Keep in-progress input while the draft falls back to the applied value.
            setSeen(applied);
            onUnstage();
          }
        }}
        aria-label={fieldId}
      />
      {refused && (
        <p id={refusalId} className="cg-field-refusal" data-field-refusal="">
          {refusal}
        </p>
      )}
    </>
  );
}

/**
 * The one sentence a template number field says when its text can never be a number. It states
 * the fact and its consequence — the air is not touched — and nothing else.
 */
const NOT_A_NUMBER = 'Not a number — Update will not change it.';

function inferKind(value: FieldValue | undefined): DynamicField['type'] | 'unknown' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') {
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return 'color';
    return 'text';
  }
  if (typeof value === 'object' && value !== null && 'assetId' in value) return 'image';
  return 'unknown';
}
