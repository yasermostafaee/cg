import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  VALUE_RULE_COMPARATORS,
  colorPropertiesOf,
  matchingValueRules,
  numberFieldAllowedValues,
  numberFieldValueAlias,
  type DynamicField,
  type Element,
  type Scene,
  type ValueRule,
  type ValueRuleComparator,
  type ValueRuleEffect,
  type ValueRuleScalar,
  type ValueRuleSet,
} from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { useAssets } from '../assets/useAssets.js';
import { ImageChoicePicker } from '../fields/ImageChoicePicker.js';
import { useImageAssetUrls } from '../fields/useImageAssetUrls.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { Modal, ModalButton } from '../shell/Modal.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField, TextField } from './controls.js';
import { docOf } from './countdown-steps.js';
import * as s from './ValueRulesSection.css.js';

const COMPARATOR_LABELS: Record<ValueRuleComparator, string> = {
  '=': 'equals',
  '!=': 'does not equal',
  '<': 'less than',
  '<=': 'at most',
  '>': 'greater than',
  '>=': 'at least',
  between: 'between',
};

const EFFECT_LABELS: Record<ValueRuleEffect['property'], string> = {
  visible: 'visibility',
  textColor: 'text color',
  backgroundColor: 'background color',
  fill: 'fill color',
  stroke: 'stroke color',
  image: 'picture',
};

type ScalarField = Extract<
  DynamicField,
  { type: 'text' | 'multiline' | 'number' | 'select' | 'color' }
>;

interface ImageChoice {
  key: string;
  label: string;
  source: 'project' | 'shared';
  assetId: string;
  thumbnailUrl?: string;
}

function scalarFields(fields: readonly DynamicField[]): ScalarField[] {
  return fields.filter(
    (field): field is ScalarField =>
      field.type === 'text' ||
      field.type === 'multiline' ||
      field.type === 'number' ||
      field.type === 'select' ||
      field.type === 'color',
  );
}

function defaultOf(field: ScalarField): ValueRuleScalar {
  return field.default;
}

function conditionFor(
  comparator: ValueRuleComparator,
  value: ValueRuleScalar,
): ValueRule['condition'] {
  return comparator === 'between' ? { comparator, min: value, max: value } : { comparator, value };
}

function scalarOrder(left: ValueRuleScalar, right: ValueRuleScalar): number {
  if (typeof left !== typeof right || left === right) return 0;
  return left < right ? -1 : 1;
}

function defaultColour(element: Element, property: ValueRuleEffect['property']): string {
  if (property === 'textColor' && 'color' in element && typeof element.color === 'string') {
    return element.color;
  }
  if (property === 'stroke' && 'stroke' in element) {
    const stroke = element.stroke;
    if (stroke !== undefined && typeof stroke.color === 'string') return stroke.color;
  }
  if (property === 'fill' && 'fill' in element) {
    const fill = element.fill;
    if (fill?.kind === 'solid') return fill.color;
  }
  return '#ffffff';
}

function defaultEffect(
  element: Element,
  property: ValueRuleEffect['property'],
  images: readonly ImageChoice[],
): ValueRuleEffect {
  if (property === 'visible') {
    return { elementId: element.id, property, value: true };
  }
  if (property === 'image') {
    const image = images[0];
    if (image !== undefined) {
      return {
        elementId: element.id,
        property,
        value: { assetId: image.assetId, source: image.source },
      };
    }
    return { elementId: element.id, property: 'visible', value: true };
  }
  return { elementId: element.id, property, value: defaultColour(element, property) };
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function splitImageKey(key: string): Pick<ImageChoice, 'source' | 'assetId'> | undefined {
  const colon = key.indexOf(':');
  const source = key.slice(0, colon);
  const assetId = key.slice(colon + 1);
  if ((source !== 'project' && source !== 'shared') || colon < 1 || assetId === '')
    return undefined;
  return { source, assetId };
}

/** D-139 — ordered value rules; the first matching rule wins per target property. */
export function ValueRulesSection({
  element,
  scene,
}: {
  element: Element;
  scene: Scene;
}): JSX.Element | null {
  if (element.type === 'audio' || element.type === 'video-placeholder') return null;

  const doc = docOf(scene, element.id);
  const scopedDoc =
    doc === null ? scene : scene.compositions?.find((composition) => composition.id === doc);
  const fields = scalarFields(scopedDoc?.fields ?? []);
  const stored = element.valueRules;

  if (fields.length === 0 && stored === undefined) return null;
  if (element.type === 'image') {
    return <ImageValueRulesSection element={element} fields={fields} />;
  }
  return <ValueRulesEditor element={element} fields={fields} images={[]} />;
}

function ImageValueRulesSection({
  element,
  fields,
}: {
  element: Element;
  fields: readonly ScalarField[];
}): JSX.Element {
  const project = useAssets().filter((asset) => asset.kind === 'image');
  const shared = useSharedImages();
  const imageUrls = useImageAssetUrls();
  const images: ImageChoice[] = [
    ...project.map((asset) => ({
      key: `project:${asset.assetId}`,
      label: `${asset.filename} (project)`,
      source: 'project' as const,
      assetId: asset.assetId,
      ...(imageUrls[asset.assetId] === undefined ? {} : { thumbnailUrl: imageUrls[asset.assetId] }),
    })),
    ...shared.map((asset) => ({
      key: `shared:${asset.assetId}`,
      label: `${asset.filename} (shared)`,
      source: 'shared' as const,
      assetId: asset.assetId,
      ...(imageUrls[asset.assetId] === undefined ? {} : { thumbnailUrl: imageUrls[asset.assetId] }),
    })),
  ];
  return <ValueRulesEditor element={element} fields={fields} images={images} />;
}

function ValueRulesEditor({
  element,
  fields,
  images,
}: {
  element: Element;
  fields: readonly ScalarField[];
  images: readonly ImageChoice[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const stored = element.valueRules;
  // A stored rule set owns its exact input. If that field is missing, never fall through to the
  // first unrelated field: the author must see the broken reference until deletion cleanup removes
  // the rules or they explicitly choose a new input.
  const selectedField =
    stored === undefined ? fields[0] : fields.find((field) => field.id === stored.input.fieldId);
  const set: ValueRuleSet | undefined =
    stored ??
    (selectedField === undefined
      ? undefined
      : { input: { kind: 'field', fieldId: selectedField.id }, rules: [] });
  const ruleCount = set?.rules.length ?? 0;
  const hasRules = ruleCount > 0;
  const activeMarker = hasRules ? (
    <span className={s.activeMarker} data-testid="value-rules-active">
      <span className={s.activeDot} aria-hidden="true" />
      {ruleCount} active
    </span>
  ) : undefined;
  const properties: ValueRuleEffect['property'][] = [
    'visible',
    ...colorPropertiesOf(element),
    ...(element.type === 'image' && images.length > 0 ? (['image'] as const) : []),
  ];
  const active =
    selectedField === undefined || set === undefined
      ? []
      : matchingValueRules(set, defaultOf(selectedField));

  const commit = (next: ValueRuleSet | undefined): void => {
    designerStore.updateElement(element.id, { valueRules: next } as Partial<Element>);
  };

  if (set === undefined || selectedField === undefined) {
    return (
      <>
        <CollapseSection title="Value rules" defaultExpanded trailing={activeMarker}>
          <div
            className={`${s.summary}${hasRules ? ` ${s.summaryActive}` : ''}`}
            data-testid="value-rules-summary"
          >
            <span className={hasRules ? s.statusActive : s.status}>
              {hasRules ? 'Rules active · ' : ''}The input field is missing.
            </span>
            <Button
              variant="secondary"
              size="sm"
              data-testid="value-rules-open"
              onClick={() => setOpen(true)}
            >
              Edit rules…
            </Button>
          </div>
        </CollapseSection>
        {open && (
          <Modal
            title={`Value rules · ${element.name}`}
            onClose={() => setOpen(false)}
            width="min(760px, 95vw)"
            maxHeight="90vh"
            footer={<ModalButton onClick={() => setOpen(false)}>Done</ModalButton>}
          >
            <div className={s.stack} data-testid="value-rules">
              <span className={s.status}>The input field is missing.</span>
              <Button variant="secondary" size="sm" onClick={() => commit(undefined)}>
                Remove rules
              </Button>
            </div>
          </Modal>
        )}
      </>
    );
  }

  const patchRule = (index: number, next: ValueRule): void =>
    commit({ ...set, rules: set.rules.map((rule, i) => (i === index ? next : rule)) });

  return (
    <>
      <CollapseSection title="Value rules" defaultExpanded trailing={activeMarker}>
        <div
          className={`${s.summary}${hasRules ? ` ${s.summaryActive}` : ''}`}
          data-testid="value-rules-summary"
        >
          <span className={hasRules ? s.statusActive : s.status}>
            {set.rules.length === 0
              ? 'No rules'
              : `Rules active · ${String(set.rules.length)} rule${set.rules.length === 1 ? '' : 's'} · first match per effect`}
          </span>
          <Button
            variant="secondary"
            size="sm"
            data-testid="value-rules-open"
            onClick={() => setOpen(true)}
          >
            Edit rules…
          </Button>
        </div>
      </CollapseSection>
      {open && (
        <Modal
          title={`Value rules · ${element.name}`}
          onClose={() => setOpen(false)}
          width="min(760px, 95vw)"
          maxHeight="90vh"
          footer={<ModalButton onClick={() => setOpen(false)}>Done</ModalButton>}
        >
          <div className={s.stack} data-testid="value-rules">
            <SelectField
              label="input"
              value={selectedField.id}
              options={fields.map((field) => field.id)}
              labels={fields.map((field) => field.label || field.id)}
              onCommit={(fieldId) => {
                const nextField = fields.find((field) => field.id === fieldId);
                if (nextField === undefined) return;
                const value = defaultOf(nextField);
                commit({
                  input: { kind: 'field', fieldId },
                  rules: set.rules.map((rule) => ({
                    ...rule,
                    condition: conditionFor(rule.condition.comparator, value),
                  })),
                });
              }}
            />
            <span className={s.status} data-testid="value-rules-status">
              Default value ·{' '}
              {active.length === 0
                ? 'authored appearance'
                : `rule${active.length === 1 ? '' : 's'} ${active.map(({ index }) => index + 1).join(', ')}`}
            </span>
            <ol className={s.list} aria-label="Value rules">
              {set.rules.map((rule, index) => (
                <li key={String(index)} className={s.rule} data-rule-index={String(index)}>
                  <div className={s.ruleHead}>
                    <span className={s.ruleTitle}>Rule {index + 1}</span>
                    <Control
                      size="sm"
                      aria-label={`Move rule ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => commit({ ...set, rules: move(set.rules, index, index - 1) })}
                    >
                      <Icon icon={ArrowUp} size={14} />
                    </Control>
                    <Control
                      size="sm"
                      aria-label={`Move rule ${index + 1} down`}
                      disabled={index === set.rules.length - 1}
                      onClick={() => commit({ ...set, rules: move(set.rules, index, index + 1) })}
                    >
                      <Icon icon={ArrowDown} size={14} />
                    </Control>
                    <Control
                      size="sm"
                      aria-label={`Delete rule ${index + 1}`}
                      onClick={() =>
                        commit({ ...set, rules: set.rules.filter((_, i) => i !== index) })
                      }
                    >
                      <Icon icon={Trash2} size={14} />
                    </Control>
                  </div>
                  <div className={s.condition}>
                    <SelectField
                      bare
                      label={`Rule ${index + 1} comparison`}
                      value={rule.condition.comparator}
                      options={VALUE_RULE_COMPARATORS}
                      labels={VALUE_RULE_COMPARATORS.map((operator) => COMPARATOR_LABELS[operator])}
                      onCommit={(comparator) =>
                        patchRule(index, {
                          ...rule,
                          condition: conditionFor(comparator, defaultOf(selectedField)),
                        })
                      }
                    />
                    <ConditionValue
                      rule={rule}
                      field={selectedField}
                      onChange={(condition) => patchRule(index, { ...rule, condition })}
                    />
                  </div>
                  <SelectField
                    label="effect"
                    value={rule.effect.property}
                    options={
                      properties.includes(rule.effect.property)
                        ? properties
                        : [rule.effect.property, ...properties]
                    }
                    labels={
                      properties.includes(rule.effect.property)
                        ? properties.map((property) => EFFECT_LABELS[property])
                        : [
                            `${EFFECT_LABELS[rule.effect.property]} (unavailable)`,
                            ...properties.map((property) => EFFECT_LABELS[property]),
                          ]
                    }
                    onCommit={(property) =>
                      patchRule(index, {
                        ...rule,
                        effect: defaultEffect(element, property, images),
                      })
                    }
                  />
                  <EffectValue
                    effect={rule.effect}
                    images={images}
                    onChange={(effect) => patchRule(index, { ...rule, effect })}
                  />
                </li>
              ))}
            </ol>
            <div className={s.actions}>
              <Button
                variant="secondary"
                size="sm"
                data-testid="value-rule-add"
                onClick={() =>
                  commit({
                    ...set,
                    rules: [
                      ...set.rules,
                      {
                        condition: conditionFor('=', defaultOf(selectedField)),
                        effect: defaultEffect(element, properties[0] ?? 'visible', images),
                      },
                    ],
                  })
                }
              >
                <Icon icon={Plus} size={14} /> Add rule
              </Button>
              {stored !== undefined && (
                <Button variant="ghost" size="sm" onClick={() => commit(undefined)}>
                  Remove rules
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function ConditionValue({
  rule,
  field,
  onChange,
}: {
  rule: ValueRule;
  field: ScalarField;
  onChange: (condition: ValueRule['condition']) => void;
}): JSX.Element {
  const between = rule.condition.comparator === 'between' ? rule.condition : undefined;
  const value =
    between?.min ?? (rule.condition.comparator === 'between' ? '' : rule.condition.value);
  const max = between?.max;
  const single = (next: ValueRuleScalar): void => {
    if (between !== undefined) {
      onChange({
        ...between,
        min: next,
        max: scalarOrder(next, between.max) > 0 ? next : between.max,
      });
      return;
    }
    if (rule.condition.comparator !== 'between') {
      onChange({ ...rule.condition, value: next });
    }
  };
  return (
    <div className={s.stack}>
      <ScalarValueField label="value" field={field} value={value} onChange={single} />
      {max !== undefined && (
        <ScalarValueField
          label="maximum"
          field={field}
          value={max}
          onChange={(next) => {
            if (between === undefined) return;
            onChange({
              ...between,
              min: scalarOrder(next, between.min) < 0 ? next : between.min,
              max: next,
            });
          }}
        />
      )}
    </div>
  );
}

function ScalarValueField({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: ScalarField;
  value: ValueRuleScalar;
  onChange: (value: ValueRuleScalar) => void;
}): JSX.Element {
  if (field.type === 'number') {
    const allowedValues = numberFieldAllowedValues(field);
    if (allowedValues !== undefined) {
      const current = Number(value);
      const missing = !allowedValues.includes(current);
      const values = missing ? [current, ...allowedValues] : allowedValues;
      return (
        <SelectField
          bare
          label={label}
          value={String(current)}
          options={values.map(String)}
          labels={values.map((candidate) => {
            if (missing && candidate === current) return `${String(candidate)} (unavailable)`;
            return numberFieldValueAlias(field, candidate) ?? String(candidate);
          })}
          onCommit={(next) => onChange(Number(next))}
        />
      );
    }
    return (
      <NumberField
        bare
        label={label}
        value={Number(value)}
        min={field.min}
        max={field.max}
        step={field.step}
        onCommit={onChange}
      />
    );
  }
  if (field.type === 'select') {
    const current = String(value);
    const missing = !field.options.some((option) => option.value === current);
    return (
      <SelectField
        bare
        label={label}
        value={current}
        options={
          missing
            ? [current, ...field.options.map((option) => option.value)]
            : field.options.map((option) => option.value)
        }
        labels={
          missing
            ? [`${current} (unavailable)`, ...field.options.map((option) => option.label)]
            : field.options.map((option) => option.label)
        }
        onCommit={onChange}
      />
    );
  }
  if (field.type === 'color') {
    return <ColorField bare label={label} value={String(value)} onCommit={onChange} />;
  }
  return <TextField bare label={label} value={String(value)} onCommit={onChange} />;
}

function EffectValue({
  effect,
  images,
  onChange,
}: {
  effect: ValueRuleEffect;
  images: readonly ImageChoice[];
  onChange: (effect: ValueRuleEffect) => void;
}): JSX.Element {
  if (effect.property === 'visible') {
    return (
      <SelectField
        label="value"
        value={effect.value ? 'show' : 'hide'}
        options={['show', 'hide'] as const}
        labels={['Show', 'Hide']}
        onCommit={(value) => onChange({ ...effect, value: value === 'show' })}
      />
    );
  }
  if (effect.property === 'image') {
    const current = `${effect.value.source}:${effect.value.assetId}`;
    return (
      <ImageChoicePicker
        label="picture"
        value={current}
        allowEmpty={false}
        choices={images.map((image) => ({
          value: image.key,
          label: image.label,
          ...(image.thumbnailUrl === undefined ? {} : { thumbnailUrl: image.thumbnailUrl }),
        }))}
        currentThumbnailUrl={images.find((image) => image.key === current)?.thumbnailUrl}
        onChange={(key) => {
          const image = splitImageKey(key);
          if (image !== undefined) onChange({ ...effect, value: image });
        }}
      />
    );
  }
  return (
    <ColorField
      label="value"
      value={effect.value}
      resetKey={`${effect.elementId}:${effect.property}`}
      onCommit={(value) => onChange({ ...effect, value })}
    />
  );
}
