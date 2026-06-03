import type { AnimatableProperty, Element, TextElement } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore, useDesignerStore } from '../../state/store.js';
import { KeyframeIndicator } from '../timeline/KeyframeIndicator.js';
import { hasKeyframeAt, keyframeVariantFor } from '../timeline/keyframe-helpers.js';
import { CollapseSection } from './CollapseSection.js';
import { RealtimeNumberInput } from './controls.js';

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

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Inter',
  'Vazirmatn',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
] as const;

interface Props {
  element: TextElement;
  currentFrame?: number;
  selectedKeyframe?:
    | { elementId: string; property: AnimatableProperty; frame: number }
    | null;
}

const styles = {
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    padding: '0.1rem 0',
  },
  labeledRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    alignItems: 'center',
    gap: '0.4rem',
  },
  label: {
    color: colors.textMuted,
    fontSize: '0.7rem',
  },
  toggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    overflow: 'hidden' as const,
  },
  toggleOption: {
    padding: '0.2rem 0',
    background: 'transparent',
    color: colors.textMuted,
    border: 'none',
    fontSize: '0.72rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  toggleOptionActive: {
    background: colors.accent,
    color: '#000',
    fontWeight: 700,
  },
  colorRow: {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    alignItems: 'center',
    gap: '0.4rem',
  },
  colorChip: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '0.35rem',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    padding: '0.1rem 0.35rem',
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: '0.18rem',
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  swatchTransparent: {
    backgroundImage:
      'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888),' +
      'linear-gradient(45deg, #888 25%, transparent 25%, transparent 75%, #888 75%, #888)',
    backgroundSize: '6px 6px',
    backgroundPosition: '0 0, 3px 3px',
    backgroundColor: '#fff',
  },
  hexInput: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: '0.05rem 0',
    fontSize: '0.72rem',
    fontVariantNumeric: 'tabular-nums' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  colorInputHidden: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
    border: 'none',
    padding: 0,
    background: 'transparent',
  },
  fontSelect: {
    background: colors.panelMuted,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    padding: '0.25rem 0.5rem',
    fontSize: '0.78rem',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  chipIcon: {
    color: colors.textMuted,
    fontSize: '0.7rem',
    fontWeight: 600,
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  chipInput: {
    background: 'transparent',
    color: colors.text,
    border: 'none',
    outline: 'none',
    padding: '0.05rem 0',
    fontSize: '0.72rem',
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  pairRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.3rem',
    alignItems: 'center',
  },
  alignmentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    paddingTop: '0.15rem',
  },
  alignGroup: {
    display: 'flex',
    background: colors.panelMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    overflow: 'hidden' as const,
  },
  alignButton: {
    width: 24,
    height: 22,
    background: 'transparent',
    color: colors.textMuted,
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.7rem',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alignButtonActive: {
    background: colors.accent,
    color: '#000',
  },
  alignSpacer: { flex: 1 },
  gearButton: {
    width: 22,
    height: 22,
    background: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.22rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: 0,
  },
} as const;

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

function animPoint(
  element: TextElement,
  property: AnimatableProperty,
  currentFrame: number,
  selectedKeyframe:
    | { elementId: string; property: AnimatableProperty; frame: number }
    | null,
  read: (el: TextElement) => number | string,
): JSX.Element {
  const variant = keyframeVariantFor(element, property, currentFrame, selectedKeyframe);
  return (
    <KeyframeIndicator
      variant={variant}
      onClick={() => {
        if (hasKeyframeAt(element, property, currentFrame)) {
          designerStore.removeKeyframe(element.id, property, currentFrame);
        } else {
          designerStore.upsertKeyframe(element.id, property, currentFrame, read(element));
        }
      }}
      ariaLabel={`Toggle keyframe for ${property} at frame ${String(currentFrame)}`}
    />
  );
}

export function TextStyleSection({
  element,
  currentFrame = 0,
  selectedKeyframe = null,
}: Props): JSX.Element {
  const id = element.id;
  // D-011 — project-asset fonts merged into the dropdown after the built-ins.
  const { scene } = useDesignerStore();
  const sceneFonts = scene?.fonts ?? [];
  const sizingValue = element.fitMode === 'fixed' ? 'fixed' : 'auto';
  const wrapValue = element.wrap === false ? 'no' : 'yes';
  const squeezeValue = element.autoSqueeze === true ? 'yes' : 'no';
  const verticalAlign = element.verticalAlign ?? 'top';

  return (
    <CollapseSection title="Text" defaultExpanded>
      <div style={styles.body}>
        {/* Sizing */}
        <div style={styles.labeledRow}>
          <span style={styles.label}>Sizing</span>
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
        <div style={styles.labeledRow}>
          <span style={styles.label}>Auto Squeeze</span>
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
        <div style={styles.labeledRow}>
          <span style={styles.label}>Text Wrap</span>
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

        {/* Text Color */}
        <ColorChip
          label="Text Color"
          color={element.color}
          transparent={false}
          onCommit={(color) => designerStore.commitAnimatable(id, 'text.color', color)}
          ariaLabel="text color"
          trailing={animPoint(element, 'text.color', currentFrame, selectedKeyframe, (el) => el.color)}
        />

        {/* Background */}
        <ColorChip
          label="Background"
          color={element.backgroundColor ?? '#FFFFFF'}
          transparent={element.backgroundColor === undefined}
          onCommit={(backgroundColor) =>
            designerStore.commitAnimatable(id, 'backgroundColor', backgroundColor)
          }
          ariaLabel="background color"
          trailing={animPoint(
            element,
            'backgroundColor',
            currentFrame,
            selectedKeyframe,
            (el) => el.backgroundColor ?? '#FFFFFF',
          )}
        />

        {/* Font family dropdown */}
        <select
          style={styles.fontSelect}
          value={element.font.family}
          onChange={(e) =>
            designerStore.updateElement(id, {
              font: { ...element.font, family: e.target.value },
            } as Partial<Element>)
          }
          aria-label="Font family"
        >
          {FONT_FAMILIES.includes(element.font.family as (typeof FONT_FAMILIES)[number]) ||
          sceneFonts.some((f) => f.family === element.font.family) ? null : (
            <option value={element.font.family}>{element.font.family}</option>
          )}
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
          {sceneFonts.length > 0 && (
            <optgroup label="Project fonts">
              {sceneFonts.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.bundledPath ?? f.family}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Font size (full-width chip with tT icon) */}
        <div className="cg-field">
          <span style={styles.chipIcon} aria-hidden>
            tT
          </span>
          <RealtimeNumberInput
            style={styles.chipInput}
            value={element.font.size}
            step={1}
            min={1}
            onCommit={(n) => {
              if (n > 0) designerStore.commitAnimatable(id, 'font.size', n);
            }}
            ariaLabel="Font size"
          />
          {animPoint(element, 'font.size', currentFrame, selectedKeyframe, (el) => el.font.size)}
        </div>

        {/* Line height + Letter spacing side-by-side */}
        <div style={styles.pairRow}>
          <div className="cg-field">
            <span style={styles.chipIcon} aria-hidden title="Line height">
              ↕
            </span>
            <RealtimeNumberInput
              style={styles.chipInput}
              value={element.font.lineHeight}
              step={0.05}
              min={0.1}
              onCommit={(n) => {
                if (n > 0) designerStore.commitAnimatable(id, 'font.lineHeight', n);
              }}
              ariaLabel="Line height"
            />
            {animPoint(element, 'font.lineHeight', currentFrame, selectedKeyframe, (el) => el.font.lineHeight)}
          </div>
          <div className="cg-field">
            <span style={styles.chipIcon} aria-hidden title="Letter spacing">
              VA
            </span>
            <RealtimeNumberInput
              style={styles.chipInput}
              value={element.font.letterSpacing}
              step={0.01}
              onCommit={(n) => designerStore.commitAnimatable(id, 'font.letterSpacing', n)}
              ariaLabel="Letter spacing"
            />
            {animPoint(element, 'font.letterSpacing', currentFrame, selectedKeyframe, (el) => el.font.letterSpacing)}
          </div>
        </div>

        {/* Alignment row */}
        <div style={styles.alignmentRow}>
          {/* Horizontal align (uses existing `align` field) */}
          <div style={styles.alignGroup} role="group" aria-label="Horizontal alignment">
            {(['start', 'center', 'end'] as const).map((opt) => {
              const active = element.align === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  style={
                    active
                      ? { ...styles.alignButton, ...styles.alignButtonActive }
                      : styles.alignButton
                  }
                  onClick={() => designerStore.updateElement(id, { align: opt } as Partial<Element>)}
                  aria-label={`Align ${opt}`}
                  aria-pressed={active}
                  title={`Align ${opt}`}
                >
                  {opt === 'start' ? '⫷' : opt === 'center' ? '☰' : '⫸'}
                </button>
              );
            })}
          </div>
          {/* Vertical align */}
          <div style={styles.alignGroup} role="group" aria-label="Vertical alignment">
            {(['top', 'middle', 'bottom'] as const).map((opt) => {
              const active = verticalAlign === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  style={
                    active
                      ? { ...styles.alignButton, ...styles.alignButtonActive }
                      : styles.alignButton
                  }
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
                </button>
              );
            })}
          </div>
          <span style={styles.alignSpacer} />
          <button
            type="button"
            style={styles.gearButton}
            aria-label="More text options"
            title="More text options"
          >
            ⚙
          </button>
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
    <div style={styles.toggle} role="group">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            style={active ? { ...styles.toggleOption, ...styles.toggleOptionActive } : styles.toggleOption}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ColorChip({
  label,
  color,
  transparent,
  onCommit,
  ariaLabel,
  trailing,
}: {
  label: string;
  color: string;
  transparent: boolean;
  onCommit: (hex: string) => void;
  ariaLabel: string;
  trailing?: JSX.Element;
}): JSX.Element {
  const swatchStyle = {
    ...styles.swatch,
    ...(transparent ? styles.swatchTransparent : { background: color }),
  };
  return (
    <div style={styles.colorRow}>
      <span style={styles.label}>{label}</span>
      <div style={styles.colorChip}>
        <span style={swatchStyle} title="Pick a colour">
          <input
            type="color"
            value={color}
            onChange={(e) => onCommit(e.target.value.toUpperCase())}
            style={styles.colorInputHidden}
            aria-label={ariaLabel}
          />
        </span>
        <input
          style={styles.hexInput}
          type="text"
          defaultValue={color.replace(/^#/, '').toUpperCase()}
          onBlur={(e) => {
            const v = e.target.value.trim();
            const hex = v.startsWith('#') ? v : `#${v}`;
            if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) onCommit(hex.toUpperCase());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          key={`${label}-${color}`}
        />
        {trailing ?? point(ariaLabel)}
      </div>
    </div>
  );
}
