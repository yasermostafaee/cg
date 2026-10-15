import {
  AFTER_ZERO_LABELS,
  AFTER_ZERO_MODES,
  afterZeroOf,
  changePropertiesOf,
  type AfterZero,
  type ClockElement,
  type CountdownSteps,
  type Element,
  type ElementChange,
} from '@cg/shared-schema';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Tag } from '../../ui/Tag.js';
import { CollapseSection } from './CollapseSection.js';
import { SelectField } from './controls.js';
import * as s from './StepsDialog.css.js';
import {
  changeChipText,
  changeCountLabel,
  changesAt,
  closeCanEnd,
  countdownsGoverning,
  docOf,
  stepName,
  stepTokens,
  thresholdLabel,
  type StepToken,
} from './countdown-steps.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-B` / `-D` / `-E` / `-H` — **A COUNTDOWN'S STEPS, from both
 * doors — as a SUMMARY.** Every editor lives in the Steps dialog (`StepsDialog`); the Inspector shows
 * what is in force and opens it:
 *
 * - on the countdown ({@link CountdownStepsSection}): After zero, one line per step
 *   (`30 min · ≤ 30 min · 1 change`) and `Edit steps…`;
 * - on an element a step changes ({@link ElementStepsSection}): one line per step that changes it, with
 *   the change as a chip (a colour's own swatch shown), and `Edit in steps…`, which opens the same
 *   dialog filtered to this element.
 *
 * Both open the SAME records on the countdown — there is no second copy. No explanatory prose.
 */

const COLOR_PROPERTIES = new Set(['textColor', 'backgroundColor', 'fill', 'stroke']);

const tokenKey = (token: StepToken): string => (token === 'before' ? 'b' : String(token));

/** `30 min · ≤ 30 min · 1 change`; a threshold equal to the name (At zero) is said once. */
function stepLineMeta(steps: CountdownSteps, token: StepToken): string {
  const name = stepName(steps, token);
  const at = token === 'before' ? null : (steps.steps[token]?.atMs ?? null);
  const threshold = at === null ? null : thresholdLabel(at);
  return [
    ...(threshold !== null && threshold !== name ? [threshold] : []),
    changeCountLabel(changesAt(steps, token).length),
  ].join(' · ');
}

/** A change as the Inspector shows it: its chip, a colour with its own swatch. */
export function ChangeChip({ change }: { change: ElementChange }): JSX.Element {
  return (
    <Tag>
      {COLOR_PROPERTIES.has(change.property) && typeof change.value === 'string' && (
        <span aria-hidden className={s.swatch} style={{ background: change.value }} />
      )}
      {changeChipText(change)}
    </Tag>
  );
}

/** 🔴 The countdown's Steps: After zero, the summary, `Edit steps…`. */
export function CountdownStepsSection({ element }: { element: ClockElement }): JSX.Element {
  const scene = useDesignerSelector((st) => st.scene);
  const steps = element.steps ?? { steps: [] };
  const doc = scene === null ? null : (docOf(scene, element.id) ?? null);
  const afterZero = afterZeroOf(element.afterZero);
  return (
    <CollapseSection title="Steps" defaultExpanded>
      <div data-testid="countdown-steps">
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
        <ul className={s.summary} data-testid="steps-summary">
          {stepTokens(steps).map((token) => (
            <li key={tokenKey(token)} className={s.summaryLine} data-step-line={tokenKey(token)}>
              <bdi>{stepName(steps, token)}</bdi> <span>· {stepLineMeta(steps, token)}</span>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          data-testid="steps-edit"
          onClick={() => designerStore.openStepsDialog(element.id)}
        >
          Edit steps…
        </Button>
      </div>
    </CollapseSection>
  );
}

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §1 / `-H` — the ELEMENT's door to the same change records: one
 * section per countdown that can change it, titled with the countdown's name, one line per step that
 * changes THIS element, and `Edit in steps…`. The countdown's name jumps to the countdown.
 */
export function ElementStepsSection({ element }: { element: Element }): JSX.Element | null {
  const scene = useDesignerSelector((st) => st.scene);
  if (scene === null || changePropertiesOf(element).length === 0) return null;
  const governing = countdownsGoverning(scene, element.id);
  if (governing.length === 0) return null;
  return (
    <>
      {governing.map(({ clock }) => (
        <CountdownForElement key={clock.id} clock={clock} element={element} />
      ))}
    </>
  );
}

function CountdownForElement({
  clock,
  element,
}: {
  clock: ClockElement;
  element: Element;
}): JSX.Element {
  const steps = clock.steps ?? { steps: [] };
  const lines = stepTokens(steps)
    .map((token) => ({
      token,
      mine: changesAt(steps, token).filter((c) => c.elementId === element.id),
    }))
    .filter(({ mine }) => mine.length > 0);
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
        <ul className={s.summary}>
          {lines.map(({ token, mine }) => {
            const at = token === 'before' ? null : (steps.steps[token]?.atMs ?? null);
            return (
              <li
                key={tokenKey(token)}
                className={s.summaryLine}
                data-element-step={tokenKey(token)}
              >
                <bdi>{at === null ? stepName(steps, token) : thresholdLabel(at)}</bdi>
                <span>·</span>
                {mine.map((change, ci) => (
                  <span
                    key={`${tokenKey(token)}:${String(ci)}`}
                    data-element-change={`${tokenKey(token)}:${String(ci)}`}
                  >
                    <ChangeChip change={change} />
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
        <Button
          variant="secondary"
          data-testid="element-steps-edit"
          onClick={() => designerStore.openStepsDialog(clock.id, element.id)}
        >
          Edit in steps…
        </Button>
      </div>
    </CollapseSection>
  );
}
