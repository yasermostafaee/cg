import type { AnimatableProperty, Element, TextElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import { effectiveColorAt, effectiveNumberAt } from '../timeline/keyframe-helpers.js';
import { KeyframeDot } from './keyframe-diamond.js';
import { CollapseSection } from './CollapseSection.js';
import { FillField } from './FillPopover.js';
import { FontFamilySelect } from './FontFamilySelect.js';
import { RealtimeNumberInput } from './controls.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import * as s from './TextStyleSection.css.js';

/**
 * D-010-pic-5 — the Text section in the right Inspector. Custom layout
 * (not built from the generic NumberField / ColorField primitives)
 * because the reference uses dedicated widgets:
 *
 *   Sizing                [ Auto | Fixed ]
 *   Auto Squeeze          [ Yes  | No    ]
 *   Text Wrap             [ Yes  | No    ]
 *   Text Color    █ 000000 ◇
 *   Background    ⣿ FFFFFF ◇
 *   [ Arial ▾ ]
 *   tT 72                 ◇
 *   ↕ 1.2  ◇ | VA 0       ◇
 *   [⫷][☰][⫸]   [▭][▭][▭]   ⚙
 *
 * The point icons are empty (◇) on every row — the underlying
 * properties aren't in AnimatableProperty yet, but the visual matches
 * the screenshot.
 */

interface Props {
  element: TextElement;
  currentFrame?: number;
  selectedKeyframe?: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

function point(label: string): JSX.Element {
  return (
    <KeyframeIndicator
      variant="empty"
      onClick={() => {
        /* colour properties not yet animatable */
      }}
      ariaLabel={`${label} — animation not yet supported`}
    />
  );
}

export function TextStyleSection({
  element,
  currentFrame = 0,
  selectedKeyframe = null,
}: Props): JSX.Element {
  const id = element.id;
  const sizingValue = element.fitMode === 'fixed' ? 'fixed' : 'auto';
  const wrapValue = element.wrap === false ? 'no' : 'yes';
  const squeezeValue = element.autoSqueeze === true ? 'yes' : 'no';
  const verticalAlign = element.verticalAlign ?? 'top';
  // Evaluated-at-playhead values so animated text fields reflect the canvas and a
  // colour edit's result shows immediately (B-005/B-006).
  const textColor = effectiveColorAt(element, 'text.color', currentFrame, element.color);
  const bgColor = effectiveColorAt(
    element,
    'backgroundColor',
    currentFrame,
    element.backgroundColor ?? '#FFFFFF00',
  );
  const fontSize = effectiveNumberAt(element, 'font.size', currentFrame, element.font.size);
  const lineHeight = effectiveNumberAt(
    element,
    'font.lineHeight',
    currentFrame,
    element.font.lineHeight,
  );
  const letterSpacing = effectiveNumberAt(
    element,
    'font.letterSpacing',
    currentFrame,
    element.font.letterSpacing,
  );

  return (
    <CollapseSection title="Text" defaultExpanded>
      <div className={s.body}>
        {/* Sizing */}
        <div className={s.labeledRow}>
          <span className={s.label}>Sizing</span>
          <TogglePair
            value={sizingValue}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'fixed', label: 'Fixed' },
            ]}
            onChange={(v) =>
              designerStore.updateElement(id, {
                fitMode: v === 'fixed' ? 'fixed' : 'autosize',
              } as unknown as Partial<Element>)
            }
          />
        </div>

        {/* Auto Squeeze */}
        <div className={s.labeledRow}>
          <span className={s.label}>Auto Squeeze</span>
          <TogglePair
            value={squeezeValue}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            onChange={(v) =>
              designerStore.updateElement(id, {
                autoSqueeze: v === 'yes',
              } as unknown as Partial<Element>)
            }
          />
        </div>

        {/* Text Wrap */}
        <div className={s.labeledRow}>
          <span className={s.label}>Text Wrap</span>
          <TogglePair
            value={wrapValue}
            options={[
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ]}
            onChange={(v) =>
              designerStore.updateElement(id, {
                wrap: v === 'yes',
              } as unknown as Partial<Element>)
            }
          />
        </div>

        {/* Text Color — solid or gradient (gradient renders via background-clip). */}
        <FillField
          label="Text Color"
          labelWidth={90}
          value={element.colorFill ?? { kind: 'solid', color: textColor }}
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                colorFill: undefined,
              } as unknown as Partial<Element>);
              designerStore.commitAnimatable(id, 'text.color', f.color);
            } else {
              designerStore.updateElement(id, { colorFill: f } as unknown as Partial<Element>);
            }
          }}
          trailing={
            element.colorFill === undefined || element.colorFill.kind === 'solid'
              ? KeyframeDot(element, 'text.color', currentFrame, selectedKeyframe)
              : point('text color')
          }
        />

        {/* Background — solid or gradient text-box background. */}
        <FillField
          label="Background"
          labelWidth={90}
          value={element.backgroundFill ?? { kind: 'solid', color: bgColor }}
          onChange={(f) => {
            if (f.kind === 'solid') {
              designerStore.updateElement(id, {
                backgroundFill: undefined,
              } as unknown as Partial<Element>);
              designerStore.commitAnimatable(id, 'backgroundColor', f.color);
            } else {
              designerStore.updateElement(id, { backgroundFill: f } as unknown as Partial<Element>);
            }
          }}
          trailing={
            element.backgroundFill === undefined
              ? KeyframeDot(element, 'backgroundColor', currentFrame, selectedKeyframe)
              : point('background')
          }
        />

        {/* Font family dropdown (shared with the Ticker inspector) */}
        <FontFamilySelect
          className={s.fontSelect}
          value={element.font.family}
          onCommit={(family) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family },
            } as Partial<Element>)
          }
        />

        {/* Font size (full-width chip with tT icon) */}
        <div className="cg-field">
          <span className={s.chipIcon} aria-hidden>
            tT
          </span>
          <RealtimeNumberInput
            className={s.chipInput}
            value={fontSize}
            step={1}
            min={1}
            onCommit={(n) => {
              if (n > 0) designerStore.commitAnimatable(id, 'font.size', n);
            }}
            ariaLabel="Font size"
          />
          {KeyframeDot(element, 'font.size', currentFrame, selectedKeyframe)}
        </div>

        {/* Line height + Letter spacing side-by-side */}
        <div className={s.pairRow}>
          <div className="cg-field">
            <span className={s.chipIcon} aria-hidden title="Line height">
              ↕
            </span>
            <RealtimeNumberInput
              className={s.chipInput}
              value={lineHeight}
              step={0.05}
              min={0.1}
              onCommit={(n) => {
                if (n > 0) designerStore.commitAnimatable(id, 'font.lineHeight', n);
              }}
              ariaLabel="Line height"
            />
            {KeyframeDot(element, 'font.lineHeight', currentFrame, selectedKeyframe)}
          </div>
          <div className="cg-field">
            <span className={s.chipIcon} aria-hidden title="Letter spacing">
              VA
            </span>
            <RealtimeNumberInput
              className={s.chipInput}
              value={letterSpacing}
              step={0.01}
              onCommit={(n) => designerStore.commitAnimatable(id, 'font.letterSpacing', n)}
              ariaLabel="Letter spacing"
            />
            {KeyframeDot(element, 'font.letterSpacing', currentFrame, selectedKeyframe)}
          </div>
        </div>

        {/* Alignment row */}
        <div className={s.alignmentRow}>
          {/* Horizontal align (uses existing `align` field) */}
          <div className={s.alignGroup} role="group" aria-label="Horizontal alignment">
            {(['start', 'center', 'end'] as const).map((opt) => {
              const active = element.align === opt;
              return (
                <Control
                  key={opt}
                  variant="bare"
                  className={cx(s.alignButton, active && s.alignButtonActive)}
                  onClick={() =>
                    designerStore.updateElement(id, { align: opt } as Partial<Element>)
                  }
                  aria-label={`Align ${opt}`}
                  aria-pressed={active}
                  title={`Align ${opt}`}
                >
                  {opt === 'start' ? '⫷' : opt === 'center' ? '☰' : '⫸'}
                </Control>
              );
            })}
          </div>
          {/* Vertical align */}
          <div className={s.alignGroup} role="group" aria-label="Vertical alignment">
            {(['top', 'middle', 'bottom'] as const).map((opt) => {
              const active = verticalAlign === opt;
              return (
                <Control
                  key={opt}
                  variant="bare"
                  className={cx(s.alignButton, active && s.alignButtonActive)}
                  onClick={() =>
                    designerStore.updateElement(id, {
                      verticalAlign: opt,
                    } as unknown as Partial<Element>)
                  }
                  aria-label={`Vertical ${opt}`}
                  aria-pressed={active}
                  title={`Vertical ${opt}`}
                >
                  {opt === 'top' ? '⤒' : opt === 'middle' ? '⇳' : '⤓'}
                </Control>
              );
            })}
          </div>
          <span className={s.alignSpacer} />
          <Control
            variant="bare"
            className={s.gearButton}
            aria-label="More text options"
            title="More text options"
          >
            ⚙
          </Control>
        </div>
      </div>
    </CollapseSection>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                          Sub-components
// ────────────────────────────────────────────────────────────────────────

function TogglePair<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly [{ value: T; label: string }, { value: T; label: string }];
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className={s.toggle} role="group">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            variant="bare"
            className={cx(s.toggleOption, active && s.toggleOptionActive)}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
