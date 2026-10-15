import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  AFTER_ZERO_LABELS,
  AFTER_ZERO_MODES,
  afterZeroOf,
  changePropertiesOf,
  playoutOf,
  type AfterZero,
  type ClockElement,
  type CountdownSteps,
  type Element,
  type ElementChange,
  type ElementChangeProperty,
  type Scene,
} from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Tag } from '../../ui/Tag.js';
import { useAssets } from '../assets/useAssets.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import {
  atMsOf,
  changeChipText,
  changesAt,
  countdownsGoverning,
  defaultChange,
  docOf,
  governedElements,
  nextStepName,
  presetSteps,
  PROPERTY_LABELS,
  STEPS_PRESET_LABEL,
  stepIssues,
  thresholdLabel,
  thresholdParts,
  withChanges,
  type DocId,
  type GovernedElement,
} from './countdown-steps.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-B` / `-D` / `-E` — **A COUNTDOWN'S STEPS, from both doors.**
 *
 * - The countdown's own Inspector ({@link CountdownStepsSection}) lists every step — Before, the
 *   thresholds, At zero, steps after zero — each with its name, threshold, transition and its
 *   CHANGES ("this element → this property → this value"), plus what the countdown does after zero.
 * - An element's Inspector ({@link ElementStepsSection}) shows, per countdown that can change it,
 *   every step in order with THIS element's changes as chips, editable there.
 *
 * Both edit the SAME change records on the countdown — there is no second copy. No explanatory prose:
 * labels, values and facts; the long form lives in `title`s.
 */

function stepsOf(element: ClockElement): CountdownSteps {
  return element.steps ?? { steps: [] };
}

/** Write steps to the countdown when the schema accepts them; the caller keeps a draft otherwise. */
function commitSteps(clockId: string, steps: CountdownSteps): void {
  if (stepIssues(steps).size > 0) return;
  // The countdown may live in the composition enclosing the one open (the element's door).
  designerStore.updateElementAnywhere(clockId, { steps } as Partial<Element>);
}

/** The picture choices, project and shared, encoded `source:assetId`. */
function useImageChoices(): { options: string[]; labels: string[] } {
  const project = useAssets().filter((a) => a.kind === 'image');
  const shared = useSharedImages();
  const strip = (f: string): string =>
    f.lastIndexOf('.') === -1 ? f : f.slice(0, f.lastIndexOf('.'));
  return {
    options: [
      ...project.map((a) => `project:${a.assetId}`),
      ...shared.map((a) => `shared:${a.assetId}`),
    ],
    labels: [
      ...project.map((a) => `${strip(a.filename)} (project)`),
      ...shared.map((a) => `${strip(a.filename)} (shared)`),
    ],
  };
}

/** ONE change: element (unless fixed), property (only what the kind owns), value, remove. */
function ChangeRow({
  change,
  targets,
  fixedElement,
  rowKey,
  onChange,
  onRemove,
}: {
  change: ElementChange;
  targets: readonly GovernedElement[];
  fixedElement: boolean;
  rowKey: string;
  onChange: (next: ElementChange) => void;
  onRemove: () => void;
}): JSX.Element {
  const images = useImageChoices();
  const target = targets.find((t) => t.element.id === change.elementId)?.element;
  const owned: ElementChangeProperty[] =
    target === undefined
      ? [change.property]
      : changePropertiesOf(target).filter((p) => p !== 'image' || images.options.length > 0);
  const elementLabel = (g: GovernedElement): string => [...g.path, g.element.name].join(' › ');
  const missing = target === undefined;

  return (
    <div data-change={rowKey} data-change-missing={missing ? 'true' : 'false'}>
      {!fixedElement && (
        <SelectField
          label="element"
          value={change.elementId}
          options={
            missing
              ? [change.elementId, ...targets.map((t) => t.element.id)]
              : targets.map((t) => t.element.id)
          }
          labels={
            missing
              ? ['(missing element)', ...targets.map(elementLabel)]
              : targets.map(elementLabel)
          }
          onCommit={(elementId) => {
            const el = targets.find((t) => t.element.id === elementId)?.element;
            if (el === undefined) return;
            const props = changePropertiesOf(el);
            const property = props.includes(change.property) ? change.property : props[0];
            if (property === undefined) return;
            onChange(
              property === change.property
                ? ({ ...change, elementId } as ElementChange)
                : defaultChange(elementId, property),
            );
          }}
        />
      )}
      <SelectField
        label="property"
        value={change.property}
        options={owned}
        labels={owned.map((p) => PROPERTY_LABELS[p])}
        onCommit={(property) => {
          if (property === 'image') {
            const first = images.options[0];
            if (first === undefined) return;
            const i = first.indexOf(':');
            onChange({
              elementId: change.elementId,
              property: 'image',
              value: {
                source: first.slice(0, i) as 'project' | 'shared',
                assetId: first.slice(i + 1),
              },
            });
            return;
          }
          onChange(defaultChange(change.elementId, property));
        }}
      />
      {change.property === 'visible' && (
        <SelectField
          label="value"
          value={change.value ? 'show' : 'hide'}
          options={['hide', 'show'] as const}
          labels={['Hide', 'Show']}
          onCommit={(v) => onChange({ ...change, value: v === 'show' })}
        />
      )}
      {change.property === 'blink' && (
        <SelectField
          label="value"
          value={change.value ? 'on' : 'off'}
          options={['on', 'off'] as const}
          labels={['On', 'Off']}
          onCommit={(v) => onChange({ ...change, value: v === 'on' })}
        />
      )}
      {change.property === 'opacity' && (
        <NumberField
          label="value"
          value={Math.round(change.value * 100)}
          min={0}
          max={100}
          step={5}
          suffix="%"
          onCommit={(v) => onChange({ ...change, value: Math.min(100, Math.max(0, v)) / 100 })}
        />
      )}
      {(change.property === 'textColor' ||
        change.property === 'backgroundColor' ||
        change.property === 'fill' ||
        change.property === 'stroke') && (
        <ColorField
          label="value"
          value={change.value}
          resetKey={rowKey}
          onCommit={(value) => onChange({ ...change, value } as ElementChange)}
        />
      )}
      {change.property === 'image' && (
        <SelectField
          label="value"
          value={`${change.value.source}:${change.value.assetId}`}
          options={images.options}
          labels={images.labels}
          onCommit={(encoded) => {
            const i = encoded.indexOf(':');
            onChange({
              ...change,
              value: {
                source: encoded.slice(0, i) as 'project' | 'shared',
                assetId: encoded.slice(i + 1),
              },
            });
          }}
        />
      )}
      <Button variant="ghost" size="sm" aria-label="Remove change" onClick={onRemove}>
        <Icon icon={Trash2} size={14} />
      </Button>
    </div>
  );
}

/** Whether Close the graphic can close it: a content-driven hold this countdown drives. */
function closeCanEnd(scene: Scene, doc: DocId, clock: ClockElement): boolean {
  const source = doc === null ? scene : (scene.compositions?.find((c) => c.id === doc) ?? scene);
  const playout = playoutOf(source as Scene);
  return (
    playout.holdSource === 'content-driven' &&
    playout.mode !== 'manual' &&
    playout.mode !== 'static' &&
    clock.drivesHold !== false
  );
}

/**
 * 🔴 The countdown's Steps — keyed on the stored steps, so an undo (or any outside change) reloads
 * the working copy. A draft the schema refuses is kept and its row marked; nothing invalid is stored.
 */
export function CountdownStepsSection({ element }: { element: ClockElement }): JSX.Element {
  const stored = JSON.stringify(element.steps ?? null);
  return (
    <CollapseSection title="Steps" defaultExpanded>
      <StepsEditor key={`${element.id}:${stored}`} element={element} />
    </CollapseSection>
  );
}

function StepsEditor({ element }: { element: ClockElement }): JSX.Element {
  const scene = useDesignerSelector((s) => s.scene);
  const [draft, setDraft] = useState<CountdownSteps>(() => stepsOf(element));
  const doc = scene === null ? null : (docOf(scene, element.id) ?? null);
  const targets = scene === null ? [] : governedElements(scene, doc);
  const issues = stepIssues(draft);

  const edit = (next: CountdownSteps): void => {
    setDraft(next);
    commitSteps(element.id, next);
  };
  const editStep = (i: number, patch: Partial<CountdownSteps['steps'][number]>): void =>
    edit({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const afterZero = afterZeroOf(element.afterZero);
  const hasAtZero = draft.steps.some((s) => s.atMs === 0);
  const firstTarget = targets[0]?.element;

  const changesBlock = (token: 'before' | number): JSX.Element => {
    const changes = changesAt(draft, token);
    const tokenKey = token === 'before' ? 'b' : String(token);
    return (
      <div>
        {changes.map((change, ci) => (
          <ChangeRow
            key={`${tokenKey}:${String(ci)}`}
            rowKey={`${tokenKey}:${String(ci)}`}
            change={change}
            targets={targets}
            fixedElement={false}
            onChange={(next) =>
              edit(
                withChanges(
                  draft,
                  token,
                  changes.map((c, k) => (k === ci ? next : c)),
                ),
              )
            }
            onRemove={() =>
              edit(
                withChanges(
                  draft,
                  token,
                  changes.filter((_, k) => k !== ci),
                ),
              )
            }
          />
        ))}
        <Button
          variant="ghost"
          size="sm"
          data-testid={`steps-add-change-${tokenKey}`}
          disabled={firstTarget === undefined}
          onClick={() => {
            if (firstTarget === undefined) return;
            const used = new Set(
              changes.filter((c) => c.elementId === firstTarget.id).map((c) => c.property),
            );
            const property = changePropertiesOf(firstTarget).find(
              (p) => p !== 'image' && !used.has(p),
            );
            if (property === undefined) return;
            edit(withChanges(draft, token, [...changes, defaultChange(firstTarget.id, property)]));
          }}
        >
          <Icon icon={Plus} size={14} /> Change
        </Button>
      </div>
    );
  };

  const transitionFields = (
    token: 'before' | number,
    transition: CountdownSteps['steps'][number]['transition'],
  ): JSX.Element => {
    const kind = transition?.kind ?? 'fade';
    const set = (next: CountdownSteps['steps'][number]['transition']): void => {
      if (token === 'before') {
        edit({
          ...draft,
          before: { ...(draft.before ?? { name: 'Before', changes: [] }), transition: next },
        });
      } else editStep(token, { transition: next });
    };
    return (
      <>
        <SelectField
          label="transition"
          value={kind}
          options={['fade', 'cut'] as const}
          labels={['Fade', 'Cut']}
          onCommit={(k) => set(k === 'cut' ? { kind: 'cut' } : { kind: 'fade', ms: 300 })}
        />
        {kind === 'fade' && (
          <NumberField
            label="fade"
            value={transition?.kind === 'fade' ? transition.ms : 300}
            min={1}
            max={10000}
            step={50}
            suffix="ms"
            onCommit={(ms) => set({ kind: 'fade', ms: Math.max(1, Math.round(ms)) })}
          />
        )}
      </>
    );
  };

  return (
    <div data-testid="countdown-steps">
      <Button
        variant="secondary"
        data-testid="steps-preset"
        title="Three steps; each turns the countdown's own digits yellow, orange, red"
        onClick={() => {
          designerStore.runAsSingleHistoryEntry(() => {
            designerStore.updateElement(element.id, {
              steps: presetSteps(element.id),
            } as Partial<Element>);
          });
        }}
      >
        {STEPS_PRESET_LABEL}
      </Button>

      <SelectField
        label="after zero"
        value={afterZero}
        options={AFTER_ZERO_MODES}
        labels={AFTER_ZERO_MODES.map((m) => AFTER_ZERO_LABELS[m])}
        onCommit={(v: AfterZero) =>
          designerStore.updateElement(element.id, {
            afterZero: v === 'hold' ? undefined : v,
          } as Partial<Element>)
        }
      />
      {afterZero === 'close' && scene !== null && !closeCanEnd(scene, doc, element) && (
        <Tag
          data-testid="after-zero-close-fact"
          title="Only a content-driven hold that this countdown drives can be ended by it"
        >
          Hold is not content-driven — the graphic stays
        </Tag>
      )}

      <SelectField
        label="before"
        value={draft.before === undefined ? 'off' : 'on'}
        options={['off', 'on'] as const}
        labels={['Off', 'On']}
        onCommit={(v) =>
          edit(
            v === 'on'
              ? { ...draft, before: { name: 'Before', changes: [] } }
              : { steps: draft.steps },
          )
        }
      />
      {draft.before !== undefined && (
        <div data-step="before">
          <TextField
            label="name"
            value={draft.before.name}
            resetKey={`${element.id}-before`}
            onCommit={(name) =>
              edit({ ...draft, before: { ...(draft.before ?? { changes: [] }), name } })
            }
          />
          {transitionFields('before', draft.before.transition)}
          {changesBlock('before')}
        </div>
      )}

      {draft.steps.map((step, i) => {
        const issue = issues.get(`steps.${String(i)}`);
        const parts = thresholdParts(step.atMs);
        const atZero = step.atMs === 0;
        return (
          <div
            key={String(i)}
            data-step={String(i)}
            data-step-invalid={issue === undefined ? 'false' : 'true'}
          >
            <TextField
              label="name"
              value={step.name}
              resetKey={`${element.id}-step-${String(i)}`}
              onCommit={(name) => editStep(i, { name })}
            />
            {atZero ? (
              <Tag>At zero</Tag>
            ) : (
              <>
                <NumberField
                  label="when"
                  value={parts.value}
                  min={1}
                  step={1}
                  onCommit={(v) => editStep(i, { atMs: atMsOf(v, parts.unit, parts.side) })}
                />
                <SelectField
                  label="unit"
                  value={parts.unit}
                  options={['min', 's'] as const}
                  labels={['min', 's']}
                  onCommit={(unit) => editStep(i, { atMs: atMsOf(parts.value, unit, parts.side) })}
                />
                <SelectField
                  label="side"
                  value={parts.side}
                  options={['before', 'after'] as const}
                  labels={['or less remain', 'after zero']}
                  onCommit={(side) => editStep(i, { atMs: atMsOf(parts.value, parts.unit, side) })}
                />
              </>
            )}
            {transitionFields(i, step.transition)}
            {changesBlock(i)}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove step ${step.name}`}
              onClick={() => edit({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}
            >
              <Icon icon={Trash2} size={14} />
            </Button>
            {issue !== undefined && (
              <p className={dds.warn} data-step-issue={String(i)}>
                {issue}
              </p>
            )}
          </div>
        );
      })}

      <Button
        variant="secondary"
        data-testid="steps-add"
        onClick={() => {
          const positive = draft.steps.filter((s) => s.atMs > 0);
          const last = positive[positive.length - 1]?.atMs;
          const atMs =
            last === undefined ? 600_000 : Math.max(1000, Math.floor(last / 2 / 1000) * 1000);
          // A new threshold sits before zero, after the last positive one — keep the order.
          const steps = [...draft.steps];
          const at = steps.findIndex((s) => s.atMs < atMs);
          const step = { name: nextStepName(draft), atMs, changes: [] };
          if (at === -1) steps.push(step);
          else steps.splice(at, 0, step);
          edit({ ...draft, steps });
        }}
      >
        <Icon icon={Plus} size={14} /> Step
      </Button>
      {!hasAtZero && (
        <Button
          variant="secondary"
          data-testid="steps-add-zero"
          onClick={() => {
            const steps = [...draft.steps];
            const at = steps.findIndex((s) => s.atMs < 0);
            const step = { name: 'At zero', atMs: 0, changes: [] };
            if (at === -1) steps.push(step);
            else steps.splice(at, 0, step);
            edit({ ...draft, steps });
          }}
        >
          <Icon icon={Plus} size={14} /> At zero
        </Button>
      )}
    </div>
  );
}

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §1 — the ELEMENT's door to the same change records: one section
 * per countdown that can change it, titled with the countdown's name, every step in order with
 * THIS element's changes as chips (a colour's own swatch shown), `+ Change`, and a dimmed line for a
 * step that changes nothing here. The countdown's name jumps to the countdown.
 */
export function ElementStepsSection({ element }: { element: Element }): JSX.Element | null {
  const scene = useDesignerSelector((s) => s.scene);
  if (scene === null || changePropertiesOf(element).length === 0) return null;
  const governing = countdownsGoverning(scene, element.id);
  if (governing.length === 0) return null;
  return (
    <>
      {governing.map(({ clock, doc }) => (
        <CountdownForElement
          key={clock.id}
          clock={clock}
          element={element}
          targets={governedElements(scene, doc)}
        />
      ))}
    </>
  );
}

function CountdownForElement({
  clock,
  element,
  targets,
}: {
  clock: ClockElement;
  element: Element;
  targets: readonly GovernedElement[];
}): JSX.Element {
  const steps = stepsOf(clock);
  const tokens: ('before' | number)[] = [
    ...(steps.before !== undefined ? (['before'] as const) : []),
    ...steps.steps.map((_, i) => i),
  ];
  const update = (token: 'before' | number, mine: ElementChange[]): void => {
    const others = changesAt(steps, token).filter((c) => c.elementId !== element.id);
    commitSteps(clock.id, withChanges(steps, token, [...others, ...mine]));
  };
  const freeProperty = (token: 'before' | number): ElementChangeProperty | undefined => {
    const used = new Set(
      changesAt(steps, token)
        .filter((c) => c.elementId === element.id)
        .map((c) => c.property),
    );
    return changePropertiesOf(element).find((p) => p !== 'image' && !used.has(p));
  };
  return (
    <CollapseSection
      title={`Steps of ${clock.name}`}
      titleNode={
        <span data-testid="element-steps-title">
          Steps of <bdi>{clock.name}</bdi>
        </span>
      }
      defaultExpanded
    >
      <div data-testid="element-steps" data-countdown={clock.id}>
        <Button
          variant="ghost"
          size="sm"
          data-testid="element-steps-jump"
          title="Select the countdown"
          onClick={() => designerStore.setSelection([clock.id])}
        >
          <bdi>{clock.name}</bdi>
        </Button>
        {tokens.map((token) => {
          const label =
            token === 'before'
              ? (steps.before?.name ?? 'Before')
              : `${steps.steps[token]?.name ?? ''} · ${thresholdLabel(steps.steps[token]?.atMs ?? 0)}`;
          const mine = changesAt(steps, token).filter((c) => c.elementId === element.id);
          const tokenKey = token === 'before' ? 'b' : String(token);
          return (
            <div
              key={tokenKey}
              data-element-step={tokenKey}
              data-element-step-empty={mine.length === 0 ? 'true' : 'false'}
              className={mine.length === 0 ? dds.hint : undefined}
            >
              <bdi>{label}</bdi>
              {mine.map((change, ci) => (
                <span
                  key={`${tokenKey}:${String(ci)}`}
                  data-element-change={`${tokenKey}:${String(ci)}`}
                >
                  <Tag>
                    {(change.property === 'textColor' ||
                      change.property === 'backgroundColor' ||
                      change.property === 'fill' ||
                      change.property === 'stroke') && (
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          background: change.value,
                        }}
                      />
                    )}{' '}
                    {changeChipText(change)}
                  </Tag>
                  <ChangeRow
                    change={change}
                    targets={targets}
                    fixedElement
                    rowKey={`${clock.id}:${tokenKey}:${String(ci)}`}
                    onChange={(next) =>
                      update(
                        token,
                        mine.map((c, k) => (k === ci ? next : c)),
                      )
                    }
                    onRemove={() =>
                      update(
                        token,
                        mine.filter((_, k) => k !== ci),
                      )
                    }
                  />
                </span>
              ))}
              {freeProperty(token) !== undefined && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`element-steps-add-${tokenKey}`}
                  onClick={() => {
                    const property = freeProperty(token);
                    if (property !== undefined)
                      update(token, [...mine, defaultChange(element.id, property)]);
                  }}
                >
                  <Icon icon={Plus} size={14} /> Change
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </CollapseSection>
  );
}
