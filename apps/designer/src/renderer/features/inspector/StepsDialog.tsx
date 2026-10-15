import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import {
  AFTER_ZERO_LABELS,
  AFTER_ZERO_MODES,
  afterZeroOf,
  changePropertiesOf,
  type AfterZero,
  type CountdownSteps,
  type Element,
  type ElementChange,
  type ElementChangeProperty,
} from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { ActionMenu } from '../../ui/ActionMenu.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Tag } from '../../ui/Tag.js';
import { useAssets } from '../assets/useAssets.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import * as s from './StepsDialog.css.js';
import {
  addAtZero,
  addStep,
  atMsOf,
  changeCountLabel,
  changesAt,
  clockAnywhere,
  closeCanEnd,
  defaultChange,
  deleteStep,
  duplicateStep,
  governedElements,
  moveStep,
  presetSteps,
  PROPERTY_LABELS,
  stepGroup,
  stepIssues,
  stepName,
  STEPS_PRESET_LABEL,
  dialogTokens,
  DEFAULT_STEP_NAME,
  thresholdLabel,
  thresholdParts,
  withChanges,
  type GovernedElement,
  type StepToken,
} from './countdown-steps.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-H` — **A COUNTDOWN'S STEPS, EDITED IN ONE TIDY PLACE.** The Inspector
 * keeps a summary; this dialog holds every editor:
 *
 * - the header: the countdown's name, After zero, the preset, and a REHEARSE strip that shows a step
 *   on the canvas while the dialog is open (the page's own rehearsal — the Preview's path);
 * - the steps as a list — Before pinned at the top, At zero pinned between the steps before zero and
 *   after it — selected to edit, reordered by a drag handle or ↑ / ↓ on it, each with a `⋯` menu of
 *   WORDS (`Duplicate step`, `Delete step`): no bare trash icon whose object has to be guessed;
 * - the selected step in short lines (name; when; transition) and its changes as a TABLE
 *   (`Element | Property | Value | ⋯`), filtered to one element when opened from that element.
 *
 * Every edit is applied at once and is ONE undo step (`Ctrl+Z` works with the dialog open); a
 * destructive one says so in a notice with its own Undo. Same records as before — the behaviour on
 * air does not change. A draft the schema refuses (a threshold out of order) is kept and its row
 * marked; nothing invalid is stored.
 */

const EMPTY: CountdownSteps = { steps: [] };

/** Write steps to the countdown — ONE undo step — when the schema accepts them. */
export function commitSteps(clockId: string, steps: CountdownSteps): boolean {
  if (stepIssues(steps).size > 0) return false;
  designerStore.runAsSingleHistoryEntry(() => {
    // The countdown may live in a composition enclosing the one open (the element's door).
    designerStore.updateElementAnywhere(clockId, { steps } as Partial<Element>);
  });
  return true;
}

const tokenKey = (token: StepToken): string => (token === 'before' ? 'b' : String(token));

const elementLabel = (g: GovernedElement): string => [...g.path, g.element.name].join(' › ');

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

export function StepsDialog({
  clockId,
  initialFilter,
  onClose,
}: {
  clockId: string;
  /** Opened from an element: the changes table shows that element's changes. */
  initialFilter?: string;
  onClose: () => void;
}): JSX.Element | null {
  const scene = useDesignerSelector((st) => st.scene);
  const rehearsal = useDesignerSelector((st) => st.stepRehearsal);
  const found = scene === null ? undefined : clockAnywhere(scene, clockId);
  const storedJson = JSON.stringify(found?.clock.steps ?? EMPTY);
  const [draft, setDraft] = useState<CountdownSteps>(
    () => JSON.parse(storedJson) as CountdownSteps,
  );
  // An undo (or any change from outside) reloads the working copy.
  useEffect(() => setDraft(JSON.parse(storedJson) as CountdownSteps), [storedJson]);
  // Closing hands the canvas back to live.
  useEffect(() => () => designerStore.setStepRehearsal(null), []);
  const gone = scene !== null && found === undefined;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  const [filter, setFilter] = useState(initialFilter ?? '');
  const [selected, setSelected] = useState<StepToken | null>(() => {
    const tokens = dialogTokens(draft);
    const mine =
      initialFilter === undefined
        ? undefined
        : tokens.find((t) => changesAt(draft, t).some((c) => c.elementId === initialFilter));
    return mine ?? (draft.steps.length > 0 ? 0 : 'before');
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [focusHandle, setFocusHandle] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusHandle === null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-step="${String(focusHandle)}"] [data-step-handle]`)
      ?.focus();
    setFocusHandle(null);
  }, [focusHandle]);

  if (scene === null || found === undefined) return null;
  const { clock, doc } = found;
  const targets = governedElements(scene, doc);
  const tokens = dialogTokens(draft);
  const current: StepToken =
    selected !== null && tokens.includes(selected)
      ? selected
      : draft.steps.length > 0
        ? 0
        : 'before';
  const issues = stepIssues(draft);
  const afterZero = afterZeroOf(clock.afterZero);

  const edit = (next: CountdownSteps, message?: string): void => {
    setDraft(next);
    setNotice(commitSteps(clock.id, next) ? (message ?? null) : null);
  };

  const close = (): void => {
    designerStore.setStepRehearsal(null);
    onClose();
  };

  const move = (from: number, to: number): void => {
    const next = moveStep(draft, from, to);
    if (next === draft) return;
    edit(next);
    if (current === from) setSelected(to);
    setFocusHandle(to);
  };

  return (
    <Modal
      title="Steps"
      ariaLabel={`Steps of ${clock.name}`}
      onClose={close}
      width="min(960px, 96vw)"
      footer={
        <ModalButton variant="primary" onClick={close} title="Close — every change is already made">
          Done
        </ModalButton>
      }
    >
      <div data-testid="steps-dialog" className={s.head}>
        <span className={s.clockName} data-testid="steps-dialog-clock">
          <bdi>{clock.name}</bdi>
        </span>
        <div className={s.grow}>
          <SelectField
            label="after zero"
            value={afterZero}
            options={AFTER_ZERO_MODES}
            labels={AFTER_ZERO_MODES.map((m) => AFTER_ZERO_LABELS[m])}
            onCommit={(v: AfterZero) =>
              designerStore.updateElementAnywhere(clock.id, {
                afterZero: v === 'hold' ? undefined : v,
              } as Partial<Element>)
            }
          />
        </div>
        <Button
          variant="secondary"
          data-testid="steps-preset"
          title="Three steps; each turns the countdown's own digits yellow, orange, red"
          onClick={() => {
            setSelected(0);
            edit(presetSteps(clock.id));
          }}
        >
          {STEPS_PRESET_LABEL}
        </Button>
      </div>
      {afterZero === 'close' && !closeCanEnd(scene, doc, clock) && (
        <Tag
          data-testid="after-zero-close-fact"
          title="Only a content-driven hold that this countdown drives can be ended by it"
        >
          Hold is not content-driven — the graphic stays
        </Tag>
      )}

      <div className={s.strip} role="group" aria-label="Rehearse" data-testid="steps-rehearse">
        <span className={s.stripLabel}>rehearse</span>
        <Button
          size="sm"
          variant="ghost"
          selected={rehearsal === null}
          aria-pressed={rehearsal === null}
          data-rehearse="live"
          onClick={() => designerStore.setStepRehearsal(null)}
        >
          Live
        </Button>
        {tokens.map((token) => {
          const on = rehearsal?.clockId === clock.id && rehearsal.step === token;
          return (
            <Button
              key={tokenKey(token)}
              size="sm"
              variant="ghost"
              selected={on}
              aria-pressed={on}
              data-rehearse={tokenKey(token)}
              onClick={() => designerStore.setStepRehearsal({ clockId: clock.id, step: token })}
            >
              <bdi>{stepName(draft, token)}</bdi>
            </Button>
          );
        })}
      </div>

      <div className={s.columns}>
        <div className={s.listColumn}>
          <ul ref={listRef} className={s.list} aria-label="Steps" data-testid="steps-list">
            {tokens.map((token) => (
              <StepRow
                key={tokenKey(token)}
                steps={draft}
                token={token}
                selected={token === current}
                invalid={issues.has(token === 'before' ? 'before' : `steps.${String(token)}`)}
                onSelect={() => setSelected(token)}
                onMove={move}
                onDuplicate={() => {
                  if (token === 'before') return;
                  const next = duplicateStep(draft, token);
                  if (next === null) {
                    setNotice(
                      `No whole second is free after “${stepName(draft, token)}” for a copy.`,
                    );
                    return;
                  }
                  edit(next);
                  setSelected(token + 1);
                }}
                onDelete={() => {
                  const name = stepName(draft, token);
                  edit(
                    deleteStep(draft, token),
                    token === 'before' ? 'Cleared the default.' : `Deleted step “${name}”.`,
                  );
                }}
              />
            ))}
          </ul>
          <div className={s.addRow}>
            <Button
              variant="secondary"
              size="sm"
              data-testid="steps-add"
              onClick={() => {
                const added = addStep(draft);
                edit(added.steps);
                setSelected(added.index);
              }}
            >
              <Icon icon={Plus} size={14} /> Add step
            </Button>
            {!draft.steps.some((st) => st.atMs === 0) && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="steps-add-zero"
                onClick={() => {
                  const added = addAtZero(draft);
                  edit(added.steps);
                  setSelected(added.index);
                }}
              >
                <Icon icon={Plus} size={14} /> At zero
              </Button>
            )}
          </div>
        </div>

        <div className={s.editor} data-testid="step-editor">
          {current === null ? (
            <Tag>no steps</Tag>
          ) : (
            <StepEditor
              steps={draft}
              token={current}
              clockId={clock.id}
              targets={targets}
              filter={filter}
              issue={issues.get(current === 'before' ? 'before' : `steps.${String(current)}`)}
              onFilter={setFilter}
              onEdit={edit}
            />
          )}
        </div>
      </div>

      {notice !== null && (
        <div role="status" className={s.notice} data-testid="steps-notice">
          <span>{notice}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              designerStore.undo();
              setNotice(null);
            }}
          >
            Undo
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** One row of the step list: handle (or the pinned gap), the step, its `⋯` menu. */
function StepRow({
  steps,
  token,
  selected,
  invalid,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}: {
  steps: CountdownSteps;
  token: StepToken;
  selected: boolean;
  invalid: boolean;
  onSelect: () => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [drop, setDrop] = useState(false);
  const name = stepName(steps, token);
  const group = stepGroup(steps, token);
  const index = token === 'before' ? -1 : token;
  const atMs = token === 'before' ? null : (steps.steps[token]?.atMs ?? null);
  const threshold = atMs === null ? 'before the first step' : thresholdLabel(atMs);
  const meta = [
    ...(threshold !== null && threshold !== name ? [threshold] : []),
    changeCountLabel(changesAt(steps, token).length),
  ].join(' · ');
  const sameGroup = (to: number): boolean => group !== null && stepGroup(steps, to) === group;

  const onHandleKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (sameGroup(to)) onMove(index, to);
  };

  return (
    <li
      data-step={tokenKey(token)}
      data-step-invalid={invalid ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-drop={drop ? 'true' : 'false'}
      aria-current={selected ? 'true' : undefined}
      className={s.row}
      onDragOver={(e: DragEvent) => {
        if (group === null) return;
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(e: DragEvent) => {
        setDrop(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from) && sameGroup(from)) {
          e.preventDefault();
          onMove(from, index);
        }
      }}
    >
      {group === null ? (
        <span className={s.pin} aria-hidden />
      ) : (
        <Control
          variant="ghost"
          size="sm"
          draggable
          data-step-handle
          aria-label={`Move step “${name}”`}
          title={`Move step “${name}” — drag, or ↑ / ↓`}
          onDragStart={(e: DragEvent) => {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onKeyDown={onHandleKey}
        >
          <Icon icon={GripVertical} size={14} />
        </Control>
      )}
      <Button
        variant="bare"
        className={s.rowMain}
        data-testid={`steps-row-${tokenKey(token)}`}
        onClick={onSelect}
      >
        <bdi>{name}</bdi>
        <span className={s.meta}>{meta}</span>
      </Button>
      {token === 'before' && steps.before === undefined ? (
        // The default changes nothing yet: there is nothing to clear.
        <span className={s.pin} aria-hidden />
      ) : (
        <ActionMenu
          label={`Actions for step “${name}”`}
          testId={`steps-row-menu-${tokenKey(token)}`}
          items={
            token === 'before'
              ? [
                  {
                    label: 'Clear default',
                    ariaLabel: `Clear default “${name}”`,
                    onSelect: onDelete,
                  },
                ]
              : [
                  ...(group !== null
                    ? [
                        {
                          label: 'Duplicate step',
                          ariaLabel: `Duplicate step “${name}”`,
                          onSelect: onDuplicate,
                        },
                      ]
                    : []),
                  { label: 'Delete step', ariaLabel: `Delete step “${name}”`, onSelect: onDelete },
                ]
          }
        />
      )}
    </li>
  );
}

/** The selected step: name, when, transition — one line each — and its changes as a table. */
function StepEditor({
  steps,
  token,
  clockId,
  targets,
  filter,
  issue,
  onFilter,
  onEdit,
}: {
  steps: CountdownSteps;
  token: StepToken;
  clockId: string;
  targets: readonly GovernedElement[];
  filter: string;
  issue: string | undefined;
  onFilter: (elementId: string) => void;
  onEdit: (next: CountdownSteps, message?: string) => void;
}): JSX.Element {
  const key = tokenKey(token);
  const step = token === 'before' ? undefined : steps.steps[token];
  const transition = token === 'before' ? steps.before?.transition : step?.transition;
  const kind = transition?.kind ?? 'fade';
  const changes = changesAt(steps, token);
  const shown = changes
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => filter === '' || change.elementId === filter);

  const patch = (p: { name?: string; atMs?: number; transition?: typeof transition }): void => {
    if (token === 'before') {
      onEdit({
        ...steps,
        before: { ...(steps.before ?? { name: DEFAULT_STEP_NAME, changes: [] }), ...p },
      });
      return;
    }
    onEdit({ ...steps, steps: steps.steps.map((st, j) => (j === token ? { ...st, ...p } : st)) });
  };
  const setChanges = (next: ElementChange[], message?: string): void =>
    onEdit(withChanges(steps, token, next), message);

  // With no filter a new change starts on the COUNTDOWN ITSELF, its text colour first — the change a
  // step is most often for (the preset's), and how the default colours are chosen.
  const addTarget =
    filter === ''
      ? (targets.find((g) => g.element.id === clockId) ?? targets[0])?.element
      : targets.find((g) => g.element.id === filter)?.element;
  const freeProperty = (el: Element | undefined): ElementChangeProperty | undefined => {
    if (el === undefined) return undefined;
    const used = new Set(changes.filter((c) => c.elementId === el.id).map((c) => c.property));
    const free = changePropertiesOf(el).filter((p) => p !== 'image' && !used.has(p));
    return free.includes('textColor') ? 'textColor' : free[0];
  };
  const addProperty = freeProperty(addTarget);
  const parts = step === undefined ? null : thresholdParts(step.atMs);

  return (
    <>
      <TextField
        label="name"
        value={token === 'before' ? (steps.before?.name ?? DEFAULT_STEP_NAME) : (step?.name ?? '')}
        resetKey={`${clockId}-${key}`}
        onCommit={(name) => patch({ name })}
      />
      {step !== undefined && parts !== null && step.atMs === 0 && (
        <div className={s.line}>
          <Tag>At zero</Tag>
        </div>
      )}
      {step !== undefined && parts !== null && step.atMs !== 0 && (
        <div className={s.line} data-testid="step-when">
          <div className={s.grow}>
            <NumberField
              label="when"
              value={parts.value}
              min={1}
              step={1}
              onCommit={(v) => patch({ atMs: atMsOf(v, parts.unit, parts.side) })}
            />
          </div>
          <div className={s.narrow}>
            <SelectField
              bare
              label="unit"
              value={parts.unit}
              options={['min', 's'] as const}
              labels={['min', 's']}
              onCommit={(unit) => patch({ atMs: atMsOf(parts.value, unit, parts.side) })}
            />
          </div>
          <div className={s.grow}>
            <SelectField
              bare
              label="side"
              value={parts.side}
              options={['before', 'after'] as const}
              labels={['or less remain', 'after zero']}
              onCommit={(side) => patch({ atMs: atMsOf(parts.value, parts.unit, side) })}
            />
          </div>
        </div>
      )}
      <div className={s.line} data-testid="step-transition">
        <div className={s.grow}>
          <SelectField
            label="transition"
            value={kind}
            options={['fade', 'cut'] as const}
            labels={['Fade', 'Cut']}
            onCommit={(k) =>
              patch({ transition: k === 'cut' ? { kind: 'cut' } : { kind: 'fade', ms: 300 } })
            }
          />
        </div>
        {kind === 'fade' && (
          <div className={s.narrow}>
            <NumberField
              bare
              label="fade"
              value={transition?.kind === 'fade' ? transition.ms : 300}
              min={1}
              max={10000}
              step={50}
              suffix="ms"
              onCommit={(ms) =>
                patch({ transition: { kind: 'fade', ms: Math.max(1, Math.round(ms)) } })
              }
            />
          </div>
        )}
      </div>
      {issue !== undefined && (
        <p className={dds.warn} data-step-issue={key}>
          {issue}
        </p>
      )}

      <div className={s.tableHead}>
        <span>Changes</span>
        <div className={s.grow}>
          <SelectField
            bare
            label="element filter"
            value={filter}
            options={['', ...targets.map((g) => g.element.id)]}
            labels={['All elements', ...targets.map(elementLabel)]}
            onCommit={onFilter}
          />
        </div>
      </div>
      <table className={s.table} data-testid="step-changes">
        <thead>
          <tr>
            <th className={s.th}>Element</th>
            <th className={s.th}>Property</th>
            <th className={s.th}>Value</th>
            <th className={`${s.th} ${s.actionsCol}`} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ change, index }) => (
            <ChangeRow
              key={`${key}:${String(index)}`}
              rowKey={`${key}:${String(index)}`}
              change={change}
              targets={targets}
              onChange={(next) => setChanges(changes.map((c, k) => (k === index ? next : c)))}
              onRemove={(label) =>
                setChanges(
                  changes.filter((_, k) => k !== index),
                  `Deleted change: ${label}.`,
                )
              }
            />
          ))}
        </tbody>
      </table>
      <div className={s.line}>
        <Button
          variant="secondary"
          size="sm"
          data-testid="steps-add-change"
          disabled={addTarget === undefined || addProperty === undefined}
          title={
            addTarget !== undefined && addProperty === undefined
              ? 'Every property of this element already has a change in this step'
              : undefined
          }
          onClick={() => {
            if (addTarget === undefined || addProperty === undefined) return;
            setChanges([...changes, defaultChange(addTarget.id, addProperty)]);
          }}
        >
          <Icon icon={Plus} size={14} /> Add change
        </Button>
      </div>
    </>
  );
}

/** ONE change as a table row: element, property (only what the kind owns), value, `⋯`. */
function ChangeRow({
  change,
  targets,
  rowKey,
  onChange,
  onRemove,
}: {
  change: ElementChange;
  targets: readonly GovernedElement[];
  rowKey: string;
  onChange: (next: ElementChange) => void;
  onRemove: (label: string) => void;
}): JSX.Element {
  const images = useImageChoices();
  const governed = targets.find((t) => t.element.id === change.elementId);
  const target = governed?.element;
  const owned: ElementChangeProperty[] =
    target === undefined
      ? [change.property]
      : changePropertiesOf(target).filter((p) => p !== 'image' || images.options.length > 0);
  const missing = target === undefined;
  const name = governed === undefined ? '(missing element)' : elementLabel(governed);
  const label = `${name} · ${PROPERTY_LABELS[change.property]}`;
  // `-F` — on a composition instance, show / hide plays its own entrance / exit.
  const instance = target?.type === 'composition';

  return (
    <tr data-change={rowKey} data-change-missing={missing ? 'true' : 'false'}>
      <td className={s.td}>
        <SelectField
          bare
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
      </td>
      <td className={s.td}>
        <SelectField
          bare
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
      </td>
      <td className={s.td}>
        {change.property === 'visible' && (
          <SelectField
            bare
            label="value"
            value={change.value ? 'show' : 'hide'}
            options={['hide', 'show'] as const}
            labels={instance ? ['Hide (exit)', 'Show (entrance)'] : ['Hide', 'Show']}
            onCommit={(v) => onChange({ ...change, value: v === 'show' })}
          />
        )}
        {change.property === 'blink' && (
          <SelectField
            bare
            label="value"
            value={change.value ? 'on' : 'off'}
            options={['on', 'off'] as const}
            labels={['On', 'Off']}
            onCommit={(v) => onChange({ ...change, value: v === 'on' })}
          />
        )}
        {change.property === 'opacity' && (
          <NumberField
            bare
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
            bare
            label="value"
            value={change.value}
            resetKey={rowKey}
            onCommit={(value) => onChange({ ...change, value } as ElementChange)}
          />
        )}
        {change.property === 'image' && (
          <SelectField
            bare
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
      </td>
      <td className={s.td}>
        <ActionMenu
          label={`Actions for change: ${label}`}
          testId={`change-menu-${rowKey}`}
          items={[
            {
              label: 'Delete change',
              ariaLabel: `Delete change: ${label}`,
              onSelect: () => onRemove(label),
            },
          ]}
        />
      </td>
    </tr>
  );
}

/**
 * The ONE Steps dialog, mounted at the app root: both Inspector doors open it through the store
 * (`openStepsDialog`), so an undo — which clears the selection and swaps the Inspector — never
 * closes it. A countdown that an undo removes closes it.
 */
export function StepsDialogHost(): JSX.Element | null {
  const open = useDesignerSelector((st) => st.stepsDialog);
  if (open === null) return null;
  return (
    <StepsDialog
      key={`${open.clockId}|${open.filter ?? ''}`}
      clockId={open.clockId}
      {...(open.filter === null ? {} : { initialFilter: open.filter })}
      onClose={() => designerStore.closeStepsDialog()}
    />
  );
}
