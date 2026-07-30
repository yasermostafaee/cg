import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  isFieldNamespace,
  type CompositionFieldGroup,
  type DynamicField,
  type FieldValue,
  type FieldValues,
  type StackItemState,
} from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { DraftChip } from '../../ui/DraftChip.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Panel } from '../../ui/Panel.js';
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

interface Props {
  item: StackItemState | null;
  /** Apply the item's staged draft as one atomic `stack.update` (the round-trip). */
  onApply: (itemId: string) => Promise<{ accepted: boolean }>;
  /** Discard the item's staged draft, reverting to applied values. */
  onDiscard: (itemId: string) => void;
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
    padding: '0.75rem 1rem',
    gap: '0.5rem',
    minHeight: 0,
    flex: 1,
    overflowY: 'auto' as const,
  },
  heading: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    margin: 0,
  },
  empty: { color: colors.textMuted, fontSize: '0.9rem' },
  title: { fontSize: '1.1rem', fontWeight: 700, margin: 0, overflowWrap: 'anywhere' as const },
  meta: { color: colors.textMuted, fontSize: '0.85rem' },
  actions: { display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '0.5rem',
    padding: '0.25rem 0',
    fontSize: '0.9rem',
    alignItems: 'center',
  },
  fieldLabel: { color: colors.textMuted, fontWeight: 500, display: 'flex', gap: '0.3rem' },
  // B-067 — a nested composition's fields, indented under the instance's label.
  group: {
    marginTop: '0.5rem',
    paddingInlineStart: '0.5rem',
    borderInlineStart: `2px solid ${colors.border}`,
  },
  groupHeading: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: colors.textMuted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    margin: '0 0 0.25rem',
  },
} as const;

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
export function Inspector({ item, onApply, onDiscard }: Props): JSX.Element {
  const [info, setInfo] = useState<TemplateInfo | null>(null);
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
      <Panel id="inspector" as="aside" title="INSPECTOR" ariaLabel="Inspector">
        <div style={styles.scroll}>
          <p style={styles.empty}>Select a stack item to inspect its fields.</p>
        </div>
      </Panel>
    );
  }

  const itemId = item.itemId;
  const schema = info?.fields ?? null;
  const groups = info?.groups ?? [];
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
    <Panel id="inspector" as="aside" title="INSPECTOR" ariaLabel="Inspector">
      <div style={styles.scroll}>
        <h3 style={styles.title} title={item.templateId}>
          {label}
        </h3>
        {contentTitle !== '' && <div style={styles.meta}>{contentTitle}</div>}
        <div style={styles.meta}>
          Status: {item.status}
          {item.pending ? ' (pending)' : ''}
        </div>
        {/* Always shown, including the empty case: "no layer" is not an absence of
          information, it is the answer to "why is this not on air?". The old line rendered
          only when a slot existed, so it went blank exactly when the operator was trying to
          diagnose that. */}
        <div style={styles.meta}>{layerDetail(item.slot)}</div>
        <div style={styles.actions}>
          {/* Apply stays enabled even with nothing staged — re-sending unchanged
            values is the operator's documented B-048 recovery path. */}
          {/* #334 — feedback goes to the command TOAST, never pinned inline in the panel.
            `applyDraft` (the shared apply behind this button AND the stack row's UPDATE)
            already routes any failure to the toast with its own B-070 wording, so this
            no-op only SUPPRESSES the button's duplicate INLINE error — it does not
            re-report (which would double-toast) or change the wording. Exactly what
            `StackRow`'s UPDATE does, for exactly this reason. */}
          {/* NEUTRAL, and this supersedes C-012's on-air outline for UPDATE.
            C-012 gave this button the on-air hue to say "this reaches air". That
            reasoning is retired: colour in this build belongs to STATE, not to
            affordances — the row's state mark and the badges own it, and every verb
            beside this one already went neutral. An outlined air-hue UPDATE put a
            transmission colour on a control, which is the one thing the palette may
            not do. The reasoning is unchanged by on-air having moved from red to
            green: do NOT re-introduce colour here to signal importance. What UPDATE
            reaches is said by the panel it sits in and by the toast it raises. */}
          <AsyncButton
            variant="neutral"
            aria-label="Apply staged edits"
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
            a hue. See the `--ghost` warning in `controls.css`. */}
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
        {/* R-011 — per-item on-air position; keyed so item switches re-seed. */}
        <PositionPicker key={`pos-${itemId}`} item={item} />
        <div
          style={{
            marginTop: '0.5rem',
            borderTop: `1px solid ${colors.border}`,
            paddingTop: '0.5rem',
          }}
        >
          <h2 style={styles.heading}>FIELDS</h2>
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
      {group.aggregate.groups.map((child) => (
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
  return (
    <div style={styles.fieldRow}>
      <span style={styles.fieldLabel}>
        {label}
        {dirty && (
          <span className="cg-dirty-dot" aria-label={`${fieldId} has unapplied edits`}>
            ●
          </span>
        )}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <FieldControl
          kind={kind}
          field={field}
          value={value}
          fieldId={fieldId}
          dirty={dirty}
          onStage={stage}
        />
        {fromFileKind !== undefined && (
          <FromFileControl item={item} path={path} kind={fromFileKind} fieldId={fieldId} />
        )}
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
}: {
  kind: DynamicField['type'] | 'unknown';
  field: DynamicField | null;
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
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
        value={v}
        placeholder="asset id"
        onChange={(e) => onStage({ assetId: e.target.value })}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'multiline') {
    const v = typeof value === 'string' ? value : '';
    return (
      <textarea
        className={fieldClass(dirty)}
        style={{ minHeight: 60 }}
        value={v}
        onChange={(e) => onStage(e.target.value)}
        aria-label={fieldId}
      />
    );
  }
  if (kind === 'list') {
    // R-003 — the structured list editor stages its ops (no remount key).
    return <ListFieldEditor fieldId={fieldId} value={value} onStage={onStage} />;
  }
  // Default: text input (controlled — stages on change, no blur/Enter commit).
  const v = typeof value === 'string' ? value : value === undefined ? '' : String(value);
  return (
    <input
      className={fieldClass(dirty)}
      type="text"
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
  return (
    <NumericInput
      className={fieldClass(dirty)}
      decimal
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
