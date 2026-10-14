import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ClockElement, ClockZones, Element } from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import {
  AZAN_PRESET,
  ZONE_KEYS,
  definedZoneKeys,
  isCanonicalZoneKey,
  overrideKeyUses,
  presetClockOverrides,
} from './zone-scope.js';

/**
 * 🔴 `D-141` 5.6 (`add-azan-countdown` design §6, owner-closed) — **THE ZONE-KEY PICKER.** The four
 * canonical keys and a `Custom…` escape. Custom is a DISPLAY state, not a stored value: a stored key
 * that is not one of the four loads as Custom with its string intact, and the picker never rewrites
 * or rejects it — the schema stays free-form, and so does this.
 */
export function ZoneKeyPicker({
  label,
  value,
  onCommit,
  resetKey,
}: {
  label: string;
  value: string;
  onCommit: (key: string) => void;
  resetKey: string;
}): JSX.Element {
  const [customOpen, setCustomOpen] = useState(false);
  const shown = isCanonicalZoneKey(value) && !customOpen ? value : 'custom';
  return (
    <>
      <SelectField
        label={label}
        value={shown}
        options={[...ZONE_KEYS, 'custom'] as const}
        labels={[...ZONE_KEYS, 'Custom…']}
        onCommit={(choice) => {
          if (choice === 'custom') {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          if (choice !== value) onCommit(choice);
        }}
      />
      {shown === 'custom' && (
        <TextField
          label="custom key"
          ariaLabel={`${label} custom key`}
          value={value}
          resetKey={resetKey}
          onCommit={(raw) => {
            const key = raw.trim();
            if (key !== '' && key !== value) onCommit(key);
          }}
        />
      )}
    </>
  );
}

/** The editor's working copy: minutes as typed, rows in authored order. */
interface DraftStep {
  minutes: number;
  key: string;
  color: string;
}
export interface ZoneDraft {
  base: { key: string; color: string } | null;
  steps: DraftStep[];
}

export function draftOf(zones: ClockZones | undefined): ZoneDraft {
  return {
    base: zones?.base === undefined ? null : { ...zones.base },
    steps: (zones?.steps ?? []).map((s) => ({
      minutes: s.atOrBelowMs / 60_000,
      key: s.key,
      color: s.color,
    })),
  };
}

/** The zones a VALID draft stores; `undefined` when it has no step (zones off). */
export function zonesOf(draft: ZoneDraft): ClockZones | undefined {
  if (draft.steps.length === 0) return undefined;
  return {
    ...(draft.base === null ? {} : { base: draft.base }),
    steps: draft.steps.map((s) => ({
      atOrBelowMs: Math.round(s.minutes * 60_000),
      key: s.key,
      color: s.color,
    })),
  };
}

/**
 * 🔴 `D-141` 5.2 — **THE OFFENDING ROW, AND ONLY IT.** The schema's two rules (thresholds strictly
 * decreasing; keys unique across base and steps) checked per row, so the row that breaks one is
 * marked and every other row stays as it is. A draft with any issue is never stored: the store keeps
 * the last valid zones while the author fixes the row.
 */
export function zoneDraftIssues(draft: ZoneDraft): {
  base?: string;
  steps: (string | undefined)[];
} {
  const seen = new Set<string>();
  let base: string | undefined;
  if (draft.base !== null) {
    if (draft.base.key.trim() === '') base = 'Needs a zone key.';
    seen.add(draft.base.key);
  }
  const steps = draft.steps.map((step, i) => {
    const above = draft.steps[i - 1];
    if (!Number.isFinite(step.minutes) || step.minutes < 0) return 'Not a time.';
    if (
      above !== undefined &&
      Math.round(step.minutes * 60_000) >= Math.round(above.minutes * 60_000)
    ) {
      return `Must be below ${formatMinutes(above.minutes)}, the step above.`;
    }
    if (step.key.trim() === '') return 'Needs a zone key.';
    if (seen.has(step.key)) return `“${step.key}” is already a zone above.`;
    seen.add(step.key);
    return undefined;
  });
  return { ...(base !== undefined && { base }), steps };
}

function formatMinutes(minutes: number): string {
  return `${String(Math.round(minutes * 100) / 100)} min`;
}

function hasIssues(issues: ReturnType<typeof zoneDraftIssues>): boolean {
  return issues.base !== undefined || issues.steps.some((i) => i !== undefined);
}

/**
 * 🔴 `D-141` 5.3 — **THE AZAN PRESET, ONE UNDO ENTRY.** Base green and three steps at 60 / 30 / 10
 * minutes, AND the clock's own text taking each zone's colour, so the preset yields a countdown that
 * visibly changes rather than one configured and inert. Exported for the test that counts the undo.
 */
export function applyAzanPreset(element: ClockElement): void {
  designerStore.runAsSingleHistoryEntry(() => {
    designerStore.updateElement(element.id, {
      zones: AZAN_PRESET,
      zoneOverrides: presetClockOverrides(element.zoneOverrides),
    } as Partial<Element>);
  });
}

/**
 * `D-141` 5.2 — the zones editor, on a countdown clock: the preset, an optional base zone, and an
 * ordered list of steps (at or below N minutes remaining → zone key → colour), validated per row.
 * Keyed on the stored zones, so an undo (or any outside change) reloads the working copy.
 */
export function ClockZonesSection({ element }: { element: ClockElement }): JSX.Element {
  const stored = JSON.stringify(element.zones ?? null);
  return (
    <CollapseSection title="Zones" defaultExpanded>
      <ZonesEditor key={`${element.id}:${stored}`} element={element} />
    </CollapseSection>
  );
}

function ZonesEditor({ element }: { element: ClockElement }): JSX.Element {
  const [draft, setDraft] = useState<ZoneDraft>(() => draftOf(element.zones));
  const scene = useDesignerSelector((s) => s.scene);
  const activeCompositionId = useDesignerSelector((s) => s.activeCompositionId);
  const issues = zoneDraftIssues(draft);

  const edit = (next: ZoneDraft): void => {
    setDraft(next);
    if (hasIssues(zoneDraftIssues(next))) return;
    designerStore.updateElement(element.id, { zones: zonesOf(next) } as Partial<Element>);
  };
  const editStep = (i: number, patch: Partial<DraftStep>): void =>
    edit({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, by: -1 | 1): void => {
    const steps = [...draft.steps];
    const [row] = steps.splice(i, 1);
    if (row === undefined) return;
    steps.splice(i + by, 0, row);
    edit({ ...draft, steps });
  };

  /*
    §7.3 — the editor's half of the unmatched-key warning: an override key used inside this
    composition's reach that NO countdown anywhere defines. A rename shows here the moment it is made.
  */
  const orphans =
    scene === null
      ? []
      : (() => {
          const defined = definedZoneKeys(scene);
          return [...overrideKeyUses(scene, activeCompositionId)].filter(([k]) => !defined.has(k));
        })();

  const lastMinutes = draft.steps[draft.steps.length - 1]?.minutes;
  return (
    <div data-testid="clock-zones">
      <Button
        variant="secondary"
        data-testid="zones-azan-preset"
        onClick={() => applyAzanPreset(element)}
      >
        Azan preset (60 / 30 / 10)
      </Button>
      <SelectField
        label="base zone"
        value={draft.base === null ? 'off' : 'on'}
        options={['off', 'on'] as const}
        onCommit={(v) =>
          edit({ ...draft, base: v === 'on' ? { key: 'normal', color: '#00c853' } : null })
        }
      />
      {draft.base !== null && (
        <div data-zone-base="">
          <ZoneKeyPicker
            label="base key"
            value={draft.base.key}
            resetKey={`${element.id}-base`}
            onCommit={(key) =>
              edit({ ...draft, base: { ...(draft.base ?? { color: '#00c853' }), key } })
            }
          />
          <ColorField
            label="base colour"
            value={draft.base.color}
            resetKey={`${element.id}-base`}
            onCommit={(color) =>
              edit({ ...draft, base: { ...(draft.base ?? { key: 'normal' }), color } })
            }
          />
          {issues.base !== undefined && <p className={dds.warn}>{issues.base}</p>}
        </div>
      )}
      {draft.steps.map((step, i) => (
        <div
          key={`${String(i)}-${step.key}`}
          data-zone-step={String(i)}
          data-zone-invalid={issues.steps[i] === undefined ? 'false' : 'true'}
        >
          <NumberField
            label="at or below"
            value={step.minutes}
            step={1}
            min={0}
            suffix="min"
            onCommit={(minutes) => editStep(i, { minutes })}
          />
          <ZoneKeyPicker
            label="zone"
            value={step.key}
            resetKey={`${element.id}-step-${String(i)}`}
            onCommit={(key) => editStep(i, { key })}
          />
          <ColorField
            label="colour"
            value={step.color}
            resetKey={`${element.id}-step-${String(i)}`}
            onCommit={(color) => editStep(i, { color })}
          />
          <div className={dds.hint}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move zone ${step.key} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <Icon icon={ArrowUp} size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move zone ${step.key} down`}
              disabled={i === draft.steps.length - 1}
              onClick={() => move(i, 1)}
            >
              <Icon icon={ArrowDown} size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove zone ${step.key}`}
              onClick={() => edit({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
            >
              <Icon icon={Trash2} size={14} />
            </Button>
          </div>
          {issues.steps[i] !== undefined && (
            <p className={dds.warn} data-zone-issue={String(i)}>
              {issues.steps[i]}
            </p>
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        data-testid="zones-add-step"
        onClick={() =>
          edit({
            ...draft,
            steps: [
              ...draft.steps,
              {
                minutes: lastMinutes === undefined ? 10 : Math.max(0, Math.floor(lastMinutes / 2)),
                key:
                  ZONE_KEYS.find(
                    (k) => !draft.steps.some((s) => s.key === k) && draft.base?.key !== k,
                  ) ?? '',
                color: '#d50000',
              },
            ],
          })
        }
      >
        <Icon icon={Plus} size={14} /> Add step
      </Button>
      {draft.steps.length === 0 && (
        <p className={dds.hint}>No steps: this countdown has no zones.</p>
      )}
      {orphans.map(([key, count]) => (
        <p key={key} className={dds.warn} data-zone-orphan={key}>
          “{key}” is used by zone colours on {count} element{count === 1 ? '' : 's'}, but no
          countdown defines it — they will not change.
        </p>
      ))}
    </div>
  );
}
