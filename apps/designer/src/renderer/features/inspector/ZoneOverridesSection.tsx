import { Plus, Trash2 } from 'lucide-react';
import type { Element, ZoneColor, ZoneOverride } from '@cg/shared-schema';
import { zoneColorTargets, type ZoneSlot } from '@cg/template-runtime/zone-css';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, SelectField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import { ZoneKeyPicker } from './ClockZonesSection.js';
import { enclosingZoneKeys, enclosingZonePalette, unmatchedZoneKeys } from './zone-scope.js';

/** The operator-facing word for each slot. */
const SLOT_LABEL: Record<ZoneSlot, string> = {
  textColor: 'text',
  backgroundColor: 'background',
  fill: 'fill',
  stroke: 'stroke',
};

type SlotChoice = 'none' | 'zone' | 'own';

/**
 * 🔴 `D-141` 5.5 (`add-azan-countdown` design §7.2) — **AN ELEMENT'S COLOURS PER ZONE.**
 *
 * - Shown ONLY when a zoned countdown encloses the composition being edited — in it, or in any
 *   composition (or the root) that instances it. With none, an override could only be inert, and a
 *   control that does nothing is worse than no control.
 * - Only the slots the element's kind OWNS, through the runtime's own `zoneColorTargets` (the one
 *   map the compiler uses), so the Designer cannot offer a slot the page would ignore. A Live
 *   Source is never offered one: on air it owns none (`D-137` §9).
 * - Each slot: nothing, the zone's own colour (its swatch shown, resolved), or an explicit colour.
 * - 🔴 5.7 — a key no enclosing countdown defines is named, PER KEY, with the keys that ARE there.
 *   Non-blocking: nothing is refused, and on air the element simply keeps its authored colours.
 */
export function ZoneOverridesSection({ element }: { element: Element }): JSX.Element | null {
  const scene = useDesignerSelector((s) => s.scene);
  const activeCompositionId = useDesignerSelector((s) => s.activeCompositionId);
  if (scene === null || element.type === 'video-placeholder' || element.type === 'audio')
    return null;
  const keys = enclosingZoneKeys(scene, activeCompositionId);
  if (keys.length === 0) return null;
  const slots = zoneColorTargets(element).map((t) => t.slot);
  if (slots.length === 0) return null;

  const palette = enclosingZonePalette(scene, activeCompositionId);
  const overrides = element.zoneOverrides ?? [];
  const unmatched = new Set(unmatchedZoneKeys(element, keys));
  const write = (next: ZoneOverride[]): void => {
    designerStore.updateElement(element.id, {
      zoneOverrides: next.length === 0 ? undefined : next,
    } as Partial<Element>);
  };
  const setRow = (i: number, row: ZoneOverride | null): void =>
    write(
      row === null
        ? overrides.filter((_, j) => j !== i)
        : overrides.map((o, j) => (j === i ? row : o)),
    );
  const firstFree = keys.find((k) => !overrides.some((o) => o.zone === k));
  const firstSlot = slots[0];

  return (
    <CollapseSection title="Zone colours" defaultExpanded>
      <div data-testid="zone-overrides">
        <p className={dds.hint}>Zones here: {keys.join(', ')}</p>
        {overrides.map((override, i) => (
          <div key={`${String(i)}-${override.zone}`} data-zone-override={override.zone}>
            <ZoneKeyPicker
              label="in zone"
              value={override.zone}
              resetKey={`${element.id}-override-${String(i)}`}
              onCommit={(zone) => {
                // Keys are unique per element (the schema's rule): a key already used is not taken.
                if (overrides.some((o, j) => j !== i && o.zone === zone)) return;
                setRow(i, { ...override, zone });
              }}
            />
            {slots.map((slot) => {
              const value: ZoneColor | undefined = override[slot];
              const choice: SlotChoice =
                value === undefined ? 'none' : value === 'zone' ? 'zone' : 'own';
              const zoneColour = palette.get(override.zone);
              return (
                <div key={slot} data-zone-slot={slot}>
                  <SelectField
                    label={SLOT_LABEL[slot]}
                    value={choice}
                    options={['none', 'zone', 'own'] as const}
                    labels={['—', 'zone colour', 'own colour']}
                    onCommit={(next) => {
                      const rest = Object.fromEntries(
                        Object.entries(override).filter(([k]) => k !== slot),
                      ) as ZoneOverride;
                      const row: ZoneOverride =
                        next === 'none'
                          ? rest
                          : {
                              ...override,
                              [slot]: next === 'zone' ? 'zone' : (zoneColour ?? '#ffffff'),
                            };
                      const anySlot = slots.some((s) => row[s] !== undefined);
                      setRow(i, anySlot ? row : null);
                    }}
                  />
                  {choice === 'zone' && zoneColour !== undefined && (
                    <ColorField
                      label="resolves to"
                      value={zoneColour}
                      resetKey={`${element.id}-${String(i)}-${slot}`}
                      withheld="The zone’s own colour — set on the countdown."
                      onCommit={() => undefined}
                    />
                  )}
                  {choice === 'own' && typeof value === 'string' && (
                    <ColorField
                      label="colour"
                      value={value}
                      resetKey={`${element.id}-${String(i)}-${slot}`}
                      onCommit={(hex) => setRow(i, { ...override, [slot]: hex })}
                    />
                  )}
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove zone colours for ${override.zone}`}
              onClick={() => setRow(i, null)}
            >
              <Icon icon={Trash2} size={14} />
            </Button>
            {unmatched.has(override.zone) && (
              <p className={dds.warn} data-zone-unmatched={override.zone}>
                “{override.zone}” matches no zone of the countdown — this colour will not change.
                Its zones are: {keys.join(', ')}.
              </p>
            )}
          </div>
        ))}
        <Button
          variant="secondary"
          data-testid="zone-overrides-add"
          disabled={firstFree === undefined || firstSlot === undefined}
          onClick={() => {
            if (firstFree === undefined || firstSlot === undefined) return;
            write([...overrides, { zone: firstFree, [firstSlot]: 'zone' } as ZoneOverride]);
          }}
        >
          <Icon icon={Plus} size={14} /> Add a zone
        </Button>
      </div>
    </CollapseSection>
  );
}
