import { useState } from 'react';
import type { AnimatableProperty, Element, TextElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { effectiveColorAt, effectiveNumberAt } from '../timeline/keyframe-helpers.js';
import { KeyframeDot } from './keyframe-diamond.js';
import { applyFillModeChange } from './fill-commit.js';
import { hasSizeKeyframes, switchTextToAutoSize, switchTextToFixedSize } from './sizing-commit.js';
import { SizingAutoConfirmModal } from './SizingAutoConfirmModal.js';
import { CollapseSection } from './CollapseSection.js';
import { FillField } from './FillPopover.js';
import { FontFamilySelect } from './FontFamilySelect.js';
import { AlignButtonGroup, H_ALIGN_OPTIONS, V_ALIGN_OPTIONS } from './AlignButtonGroup.js';
import { RealtimeNumberInput } from './controls.js';
import { TextSettingsButton } from './TextSettingsPopover.js';
import { cx } from '../../cx.js';
import { Button } from '../../ui/Button.js';
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
 * D-051 — the keyframe diamond on each row comes from the shared `KeyframeDot`,
 * which renders iff the central field registry marks the property keyframe-able for
 * this element: text colour / background (solid only), font size, line height, and
 * letter spacing get a diamond; font-family and the alignment groups never do.
 */

interface Props {
  element: TextElement;
  currentFrame?: number;
  selectedKeyframe?: { elementId: string; property: AnimatableProperty; frame: number } | null;
}

export function TextStyleSection({
  element,
  currentFrame = 0,
  selectedKeyframe = null,
}: Props): JSX.Element {
  const id = element.id;
  const sizingValue = element.fitMode === 'fixed' ? 'fixed' : 'auto';
  // D-046 — guard the switch TO auto when the element has size keyframes (they
  // become content-driven, so they're removed on confirm). No modal otherwise.
  const [confirmAuto, setConfirmAuto] = useState(false);
  const onSizingChange = (v: string): void => {
    if (v === 'fixed') {
      // D-046 §E — commit the current measured hug size once (no snap-back).
      switchTextToFixedSize(element);
      return;
    }
    if (element.fitMode === 'autosize') return; // already auto — no-op
    if (hasSizeKeyframes(element)) setConfirmAuto(true);
    else switchTextToAutoSize([id]);
  };
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
    <>
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
              onChange={onSizingChange}
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
                // B-014 — gradient text colour isn't keyframe-able; drop the orphaned
                // text.color track in the same undo step.
                applyFillModeChange(element, 'text.color', {
                  colorFill: f,
                } as unknown as Partial<Element>);
              }
            }}
            trailing={KeyframeDot(element, 'text.color', currentFrame, selectedKeyframe)}
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
                // B-014 — gradient background isn't keyframe-able; drop the orphaned
                // backgroundColor track in the same undo step.
                applyFillModeChange(element, 'backgroundColor', {
                  backgroundFill: f,
                } as unknown as Partial<Element>);
              }
            }}
            trailing={KeyframeDot(element, 'backgroundColor', currentFrame, selectedKeyframe)}
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

          {/* D-048 — font-weight moved into the "More text options" popover (with font
            style), replacing the D-044 inline control. See TextSettingsButton below. */}

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

          {/* Alignment row — D-045: the shared AlignButtonGroup (this group is the model the
            ticker / clock / sequence inspectors now reuse). 'justify' stays schema-only and
            is never exposed here. Both groups are non-keyframable (updateElement, no diamond). */}
          <div className={s.alignmentRow}>
            <AlignButtonGroup
              ariaLabel="Horizontal alignment"
              current={element.align}
              options={H_ALIGN_OPTIONS}
              onChange={(align) => designerStore.updateElement(id, { align } as Partial<Element>)}
            />
            <AlignButtonGroup
              ariaLabel="Vertical alignment"
              current={verticalAlign}
              options={V_ALIGN_OPTIONS}
              // D-060 §D — vertical-align has no slack when the box hugs content, so it is
              // disabled (shown, inert) while sizing is Auto; horizontal stays enabled (it
              // positions shorter lines in a multi-line box). The stored value is untouched.
              disabled={sizingValue === 'auto'}
              onChange={(v) =>
                designerStore.updateElement(id, { verticalAlign: v } as unknown as Partial<Element>)
              }
            />
            <span className={s.alignSpacer} />
            <TextSettingsButton element={element} />
          </div>
        </div>
      </CollapseSection>
      {confirmAuto && (
        <SizingAutoConfirmModal
          count={1}
          onConfirm={() => {
            switchTextToAutoSize([id]);
            setConfirmAuto(false);
          }}
          onCancel={() => setConfirmAuto(false)}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────
//                          Sub-components
// ────────────────────────────────────────────────────────────────────────

export function TogglePair<T extends string>({
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
