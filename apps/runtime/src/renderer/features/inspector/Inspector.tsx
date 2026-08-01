import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { useLink } from '../../hooks/useLink.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import {
  aggregateHasFields,
  isFieldNamespace,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValue,
  type FieldValues,
  type StackItemState,
} from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { airStateVisual, colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { AutoGrowTextarea } from '../../ui/AutoGrowTextarea.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Panel } from '../../ui/Panel.js';
import { EDITOR_DIR } from '../../ui/editorTextDirection.js';
import { templateDisplayName } from '../library/templateName.js';
import { layerDetail } from '../stack/layerLabel.js';
import { FromFileControl } from './FromFileControl.js';
import { ListFieldEditor } from './ListFieldEditor.js';
import { PositionPicker } from './PositionPicker.js';
import {
  draftsVersion,
  effectiveValue,
  isFieldDirty,
  isItemDirty,
  stageField,
  subscribeDrafts,
  valueAt,
  type FieldPath,
} from './draftStore.js';

/** The shared field class, plus the dirty accent (border only — no layout shift). */
function fieldClass(dirty: boolean): string {
  return dirty ? 'cg-field is-dirty' : 'cg-field';
}

/**
 * Which field kinds need the panel's FULL width, with their label stacked above.
 *
 * Text-carrying kinds do; scalar kinds (boolean, number, colour, select) have a small
 * intrinsic width and stay in the compact two-column row, which is denser and easier
 * to scan. The split is by KIND rather than by width alone because it is right at
 * EVERY width — a 160px value column was never enough for a Persian headline, no
 * matter how wide the screen it sat on. `controls.css` adds a container query on top
 * of this, collapsing even the compact rows once the panel itself runs out of room.
 */
function isWideKind(kind: DynamicField['type'] | 'unknown'): boolean {
  return kind === 'text' || kind === 'multiline' || kind === 'list' || kind === 'image';
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
}

const styles = {
  /**
   * The Inspector's SCROLLING body. The panel chrome (border, background,
   * header, and the fullscreen affordance) comes from `Panel` now — this is only
   * the content that scrolls inside it. `Panel` clips, which is what finally
   * bounds this scroll (see `layout.ts`: the page never scrolls, panels do).
   */
  scroll: {
    display: 'flex',
    flexDirection: 'column' as const,
    // No BOTTOM padding: the sticky commit bar owns the space down there, and a
    // container pad would sit BELOW the stuck bar (sticky offsets resolve against
    // the padding box), leaving a stripe of scrolling content under it.
    padding: 'var(--r-space-6) var(--r-space-4) 0',
    minHeight: 0,
    flex: 1,
    overflowY: 'auto' as const,
  },
  empty: { color: colors.textMuted, fontSize: 'var(--r-text-md)' },
  title: {
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1.35,
    margin: '0 0 var(--r-space-3)',
    overflowWrap: 'anywhere' as const,
  },
  /** The item's own headline, under the template name — content, not metadata. */
  contentTitle: {
    color: colors.text,
    fontSize: 'var(--r-text-md)',
    margin: '0 0 var(--r-space-3)',
  },
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
  /*
   * THE COMMIT BAR — sticky to the BOTTOM of the scrolling body (owner request).
   *
   * Why the bottom rather than the top. The field list is the long part of this
   * panel, and the operator's sequence is "edit a field, then apply". With a
   * scrolled list the Update button used to be somewhere above the viewport, so
   * committing meant scrolling back up to find it — on a live graphic, under time
   * pressure. A footer keeps it one glance and one click away wherever the list is
   * scrolled to, and it leaves the identity block (template name, status, layer)
   * intact at the top instead of covering it.
   *
   * `marginTop: auto` pins it past the end of short content; `position: sticky`
   * holds it while the content is long. The negative horizontal margin plus
   * matching padding let the background bleed to the panel edges so scrolled text
   * cannot appear beside the bar.
   *
   * `flexWrap`: at a narrow panel width the three children would push the row wider
   * than the panel; they wrap onto a second line instead.
   */
  actions: {
    display: 'flex',
    // CENTRED (owner request). Everything else about this bar — the sticky
    // behaviour, the padding, the top border, the raised background and the DOM
    // position — is unchanged and load-bearing; see the block comment above.
    justifyContent: 'center',
    gap: 'var(--r-space-3)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    position: 'sticky' as const,
    bottom: 0,
    marginTop: 'auto',
    zIndex: 1,
    // RAISED, matching the panel bar at the other end — the two pieces of chrome
    // that are not content read as the same kind of thing.
    background: colors.panelMuted,
    borderTop: `1px solid ${colors.border}`,
    marginInline: 'calc(var(--r-space-4) * -1)',
    padding: 'var(--r-space-3) var(--r-space-4)',
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
  fieldKey: { color: colors.textMuted, fontSize: '11px', opacity: 0.75 },
  // B-067 — a nested composition's fields, indented under the instance's label.
  group: {
    marginTop: 'var(--r-space-3)',
    paddingInlineStart: 'var(--r-space-2)',
    borderInlineStart: `2px solid ${colors.border}`,
  },
  groupHeading: {
    fontSize: 'var(--r-text-xs)',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    margin: '0 0 var(--r-space-1)',
  },
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
    <span className="cg-meta-chip">
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
    </span>
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
export function Inspector({ item, onApply, onDiscard, onClose }: Props): JSX.Element {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
  // THE SECOND HOP — Update reaches air, so it needs CasparCG. Editing does not.
  const casparReach = useCasparReach();
  const linkDown = useLink() === 'disconnected';
  /**
   * …and it names the RIGHT HOP, like every other refused verb. Apply used to say
   * "CasparCG cannot be reached" whenever health was absent — which is also what a
   * DEAD BRIDGE looks like from here, so the one control the operator reaches for
   * after typing an edit sent him to the wrong machine.
   */
  const applyRefusal = casparRefusalReason(linkDown, casparReach);
  // Re-render on any draft change so dirty markers + the draft-or-applied
  // values stay live (a push to `item` also re-renders via props).
  useSyncExternalStore(subscribeDrafts, draftsVersion);

  useEffect(() => {
    if (item === null) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    // B-085 — `templates.get` is browser-local now, so this resolves offline. The
    // rejection handler is kept as a guard so a failed lookup can NEVER become an
    // unhandled promise rejection: on failure we keep `info` null and the
    // Inspector falls back to type-inferred fields rather than throwing.
    window.cg.templates.get({ templateId: item.templateId }).then(
      (resolved) => {
        if (!cancelled) setInfo(resolved);
      },
      () => {
        if (!cancelled) setInfo(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (item === null) {
    return (
      <Panel id="inspector" as="aside" title="INSPECTOR" ariaLabel="Inspector" onClose={onClose}>
        <div className="cg-inspector-body" style={styles.scroll}>
          <p style={styles.empty}>Select a stack item to inspect its fields.</p>
        </div>
      </Panel>
    );
  }

  const itemId = item.itemId;
  const schema = info?.fields ?? null;
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
   *    `sequenceItemNamespace`.
   */
  const groups = (info?.groups ?? []).filter((g) => aggregateHasFields(g.aggregate));
  // The schema-less fallback (registry doesn't know the template) stays FLAT: with no
  // schema there are no namespaces to infer, so every top-level VALUE is a field.
  const inferredRows: { field: DynamicField | null; key: string }[] = Object.keys(item.fields)
    .filter((key) => !isFieldNamespace(item.fields[key]))
    .map((key) => ({ field: null, key }));
  const hasSchema = (schema !== null && schema.length > 0) || groups.length > 0;
  const rootFields: { field: DynamicField | null; key: string }[] = hasSchema
    ? (schema ?? []).map((f) => ({ field: f, key: f.id }))
    : inferredRows;

  const dirty = isItemDirty(itemId, item.fields);
  const isEmpty = rootFields.length === 0 && groups.length === 0;

  // R-004 — the header names the template. The `TemplateInfo` was already in hand here and
  // its label was dropped on the floor in favour of the raw `templateId`. The id is a
  // correlation key, not a label: tooltip only, never text.
  const rawTitle = item.fields['title'];
  const contentTitle = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  const label = info !== null ? templateDisplayName(info) : 'Unnamed template';

  return (
    <Panel id="inspector" as="aside" title="INSPECTOR" ariaLabel="Inspector" onClose={onClose}>
      <div style={styles.scroll}>
        <h3 style={styles.title} title={item.templateId}>
          {label}
        </h3>
        {contentTitle !== '' && <div style={styles.contentTitle}>{contentTitle}</div>}
        {/* ALWAYS SHOWN, including the no-layer case: "no layer" is not an absence of
          information, it is the answer to "why is this not on air?". The old line rendered
          only when a slot existed, so it went blank exactly when the operator was trying to
          diagnose that — and the chips keep that property. The words are `layerDetail`'s
          own; only the shape changes. */}
        <div className="cg-meta-chips">
          {/* The status word names itself, so it carries no label — only the dot
              that marks it as the state among the coordinates. */}
          <MetaChip
            value={`${item.status}${item.pending ? ' (pending)' : ''}`}
            dotColor={airStateVisual(item.status, item.pending).color}
          />
          {item.slot === undefined ? (
            <MetaChip value={layerDetail(undefined)} />
          ) : (
            <>
              <MetaChip label="layer" value={String(item.slot.layer)} />
              <MetaChip label="channel" value={String(item.slot.channel)} />
              {/* The server name names itself too. */}
              <MetaChip value={item.slot.server} />
            </>
          )}
        </div>
        {/* R-011 — per-item on-air position; keyed so item switches re-seed. */}
        <PositionPicker key={`pos-${itemId}`} item={item} />
        {/* `cg-inspector-section` carries the shared rhythm — the heading's rule,
            its tracking, and the largest gap in the gradient beneath it. Same
            class as POSITION, so the two sections cannot drift apart. */}
        <div className="cg-inspector-section">
          <h2>FIELDS</h2>
          {isEmpty ? (
            <p style={styles.empty}>No fields.</p>
          ) : (
            <>
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
                />
              ))}
              {groups.map((group) => (
                <FieldGroup
                  key={`${itemId}-${group.name}`}
                  group={group}
                  path={[group.name]}
                  item={item}
                  applied={item.fields}
                />
              ))}
            </>
          )}
        </div>
        {/* THE COMMIT BAR, LAST IN THE DOM — not merely last visually.
          A sticky footer could have been achieved with flex `order` while leaving this
          block up beside the title, but DOM order is TAB order: that would have put
          Update and Discard ahead of the fields they apply, so a keyboard operator
          would reach the commit before the thing being committed. Fields first, then
          commit, matches both the reading order and the actual sequence of the task. */}
        {/* The class carries only the CONTROLS' height (32px, the panel's primary
            action), so Update and Discard cannot come out at two heights from two
            variants — `accent` takes its height from padding, `neutral` carries a
            36px floor meant for the layer table's header. Same defect the field
            footers had. Layout stays in `styles.actions`. */}
        <div className="cg-inspector-actions" style={styles.actions}>
          {/* Apply stays enabled even with nothing staged — re-sending unchanged
            values is the operator's documented B-048 recovery path. */}
          {/* #334 — feedback goes to the command TOAST, never pinned inline in the panel.
            `applyDraft` (the shared apply behind this button AND the stack row's UPDATE)
            already routes any failure to the toast with its own B-070 wording, so this
            no-op only SUPPRESSES the button's duplicate INLINE error — it does not
            re-report (which would double-toast) or change the wording. Exactly what
            `StackRow`'s UPDATE does, for exactly this reason. */}
          {/* PLAY'S VARIANT, BY THE OWNER'S EXPLICIT CALL — «رنگ دکمه update مثل
            دکمه play بشه». `variant="play"` rather than a copied hex or a new
            token: ONE source, so the two buttons cannot drift apart.

            This supersedes C-012's retirement of the air hue on this control, and
            the history is kept because it is emphatic and a future reader will
            meet it: an outlined `--r-onair` UPDATE was removed on the rule that a
            transmission colour may never sit on an affordance.

            WHY THE RULE SURVIVES BEING APPLIED THE OTHER WAY. The palette already
            distinguishes the two things by SHAPE, not only by hue:

              - a FILLED GREEN BUTTON is an ACTION THAT REACHES AIR. PLAY has been
                exactly that since C-012 and is the only one until now.
              - the AIR CLAIM is a state MARK — coloured text and an icon in a
                table cell, next to the word ON AIR. It is never a filled button.

            So Update joining PLAY does not add a new meaning; it puts a second
            member in a class that already existed and already reads correctly, and
            the two are truthfully alike — PLAY takes a graphic to air, Update
            pushes a change to one that is already there.

            THE CONSTRAINT THAT REMAINS ABSOLUTE: this may not spread to anything
            that is not an action reaching air, and the air hue may still never be
            worn by a state mark outside the layer rows and the status bar. It is
            `--r-onair` via the shared class and must stay that way — a hand-copied
            green here would be the drift the owner's "use PLAY's token" forbids.

            §3's sky `accent` remains for `Apply position` and `Add item`, which do
            NOT reach air, so the two classes stay legible: sky = the action this
            surface exists to perform; green = the action that reaches air. */}
          {/*
            GATED ON CASPARCG, exactly as the ROW's UPDATE is — and found by the
            adversarial review of that change rather than by a test.

            This button and the row's verb call the SAME `applyDraft`, so gating
            one and not the other is the label-and-action-in-two-places class
            again, one surface along: the row would say the command cannot go
            while the Inspector still offered it. `update()` sends `CG UPDATE`
            when a producer is resident (measured), so it needs CasparCG.

            EDITING STAYS AVAILABLE. Only the APPLY is gated — the operator can go
            on typing with the playout machine off, the edit stays a draft, and it
            reaches air when the link returns. That is the whole point of the
            offline surface, and gating the fields instead would destroy it.
          */}
          <AsyncButton
            variant="commit"
            aria-label="Apply staged edits"
            disabled={applyRefusal !== undefined}
            {...(applyRefusal !== undefined ? { title: applyRefusal } : {})}
            run={() => onApply(itemId)}
            onError={() => undefined}
          >
            Update
          </AsyncButton>
          {/* NEUTRAL IS NOT INVISIBLE. This was a `ghost` — transparent fill,
            transparent border, muted text — and it read as a line of static text
            rather than a control. Removing COLOUR from a control never removes its
            need for an AFFORDANCE: it still owes a visible boundary, a hover state
            and a focus ring. `neutral` is the variant that carries all three without
            a hue. See the `--ghost` warning in `controls.css`.

            …AND NEITHER IS DISABLED, which is the half that was still missing.
            `neutral:disabled` used to drop BOTH its fill and its border, so this
            control vanished for exactly as long as there was nothing staged to
            discard — i.e. every moment before the operator's first edit, which is
            when they are learning where things are. An operator who cannot find how
            to ABANDON an edit presses Update to get out of the panel, which is the
            opposite of what they wanted and reaches air. `--neutral:disabled` keeps
            its boundary now (`controls.css`); the row verbs' bare-glyph disabled
            shape is untouched, because there a column of peers makes it legible. */}
          <Button
            variant="neutral"
            aria-label="Discard staged edits"
            disabled={!dirty}
            onClick={() => onDiscard(itemId)}
          >
            Discard
          </Button>
          {dirty && <DraftChip label="unapplied edits" />}
        </div>
      </div>
    </Panel>
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
}: {
  group: CompositionFieldGroup;
  path: FieldPath;
  item: StackItemState;
  applied: FieldValues;
}): JSX.Element {
  const itemId = item.itemId;
  return (
    <section style={styles.group} aria-label={`${group.label ?? group.name} fields`}>
      <h3 style={styles.groupHeading}>{group.label ?? group.name}</h3>
      {group.aggregate.fields.map((f) => (
        <FieldEditor
          key={`${itemId}-${[...path, f.id].join('/')}`}
          field={f}
          path={[...path, f.id]}
          item={item}
          applied={valueAt(applied, [...path, f.id])}
        />
      ))}
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
}: {
  field: DynamicField | null;
  path: FieldPath;
  item: StackItemState;
  applied: FieldValue | undefined;
}): JSX.Element {
  const itemId = item.itemId;
  // The control's accessible name stays the FIELD id (not the full path): the operator
  // sees it inside its group, and the group's own label carries the namespace.
  const fieldId = path[path.length - 1] ?? '';
  const label = field?.label ?? fieldId;
  const value = effectiveValue(itemId, path, applied);
  const kind = field?.type ?? inferKind(value);
  const dirty = isFieldDirty(itemId, path, applied);
  const stage = (next: FieldValue): void => stageField(itemId, path, next);
  // R-018 — text-carrying fields can source their value from a text file.
  const fromFileKind =
    kind === 'text' || kind === 'multiline' || kind === 'list' ? kind : undefined;
  // Built ONCE and placed in one of two spots (see below), so the two placements
  // cannot drift into two differently-configured controls.
  const fromFile =
    fromFileKind === undefined ? null : (
      <FromFileControl item={item} path={path} kind={fromFileKind} fieldId={fieldId} />
    );
  return (
    <div className={isWideKind(kind) ? 'cg-field-row--wide' : 'cg-field-row'}>
      {/*
        THE AUTHORED NAME IS PRIMARY; THE BINDING KEY IS SECONDARY — and the key is
        printed ONLY when it differs from the name. A template whose author set no
        label falls back to the key, and rendering both would print the same string
        twice at two sizes, which is noise dressed as hierarchy.
      */}
      <span style={styles.fieldLabel}>
        <span style={styles.fieldName}>{label}</span>
        {label !== fieldId && (
          <span style={styles.fieldKey} title={fieldId}>
            {fieldId}
          </span>
        )}
        {dirty && (
          <span className="cg-dirty-dot" aria-label={`${fieldId} has unapplied edits`}>
            ●
          </span>
        )}
      </span>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--r-space-2)', minWidth: 0 }}
      >
        <FieldControl
          kind={kind}
          field={field}
          value={value}
          fieldId={fieldId}
          dirty={dirty}
          onStage={stage}
          {...(fromFileKind !== undefined ? { fromFile } : {})}
        />
        {/* A LIST field's from-file control is rendered INSIDE the editor, beside
            "Add item" on the field's one footer row (see `ListFieldEditor`'s
            `footer` slot). Every other kind renders it here, beneath the control.
            The difference is not cosmetic bookkeeping: a list is the only kind
            with a second footer control to share a row with. */}
        {fromFileKind !== undefined && kind !== 'list' && fromFile}
      </div>
    </div>
  );
}

function FieldControl({
  kind,
  field,
  value,
  fieldId,
  dirty,
  onStage,
  fromFile,
}: {
  kind: DynamicField['type'] | 'unknown';
  field: DynamicField | null;
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
  /** Only a LIST consumes this — it shares its footer row with "Add item". */
  fromFile?: ReactNode;
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
    return <NumberField value={value} fieldId={fieldId} dirty={dirty} onStage={onStage} />;
  }
  if (kind === 'color') {
    const v = typeof value === 'string' ? value : '#FFFFFF';
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
  if (kind === 'image') {
    // Image fields ship as { assetId }; kept as a plain text field on the
    // assetId (the asset library picker lands later).
    const v =
      typeof value === 'object' && value !== null && 'assetId' in value
        ? String((value as { assetId: string }).assetId)
        : '';
    return (
      <input
        className={fieldClass(dirty)}
        type="text"
        dir={EDITOR_DIR}
        value={v}
        placeholder="asset id"
        onChange={(e) => onStage({ assetId: e.target.value })}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'multiline') {
    const v = typeof value === 'string' ? value : '';
    // Grows with its CONTENT (wrapped height, not newline count) — see
    // `AutoGrowTextarea`. `is-dirty` still rides the class, so the amber
    // unapplied-edit border is unchanged.
    return (
      <AutoGrowTextarea
        className={dirty ? 'is-dirty' : undefined}
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'list') {
    // R-003 — the structured list editor stages its ops (no remount key).
    return <ListFieldEditor fieldId={fieldId} value={value} onStage={onStage} footer={fromFile} />;
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
      value={v}
      onChange={(e) => onStage(e.target.value)}
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
 */
function NumberField({
  value,
  fieldId,
  dirty,
  onStage,
}: {
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
}): JSX.Element {
  const external = typeof value === 'number' ? String(value) : '';
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    // Keep the in-progress text if it already represents the new value; else
    // reseed from outside (push / discard / apply changed the applied value).
    const parsed = Number(text);
    const represents = text.trim() !== '' && Number.isFinite(parsed) && parsed === value;
    if (!represents) setText(external);
  }
  // R-020 — the shared NumericInput (type="text" under the hood) so Persian /
  // Arabic-Indic digits are accepted and commit as Latin. `step`/`min`/`max`
  // are not rendered any more: on the old `type="number"` they only drove the
  // spinner and the :invalid style — the staged value was never clamped.
  // `scrub` — drag horizontally or press ↑/↓ to adjust, the Designer's feel (owner
  // request). `step: 1` with Shift for tenths and Ctrl/Cmd for tens; no min/max,
  // because a dynamic field's range is not declared here (R-020 removed the old
  // `step`/`min`/`max` rendering precisely because they never clamped the value).
  return (
    <NumericInput
      className={fieldClass(dirty)}
      decimal
      scrub={{ step: 1 }}
      value={text}
      onValueChange={(raw) => {
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) {
          setSeen(n); // our own edit — don't let the resync reseed over it
          onStage(n);
        }
      }}
      aria-label={fieldId}
    />
  );
}

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
