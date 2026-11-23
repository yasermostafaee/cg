import { describe, expect, it } from 'vitest';
import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import {
  defaultLayerDisplayName,
  operatorRowName,
  plateDisplayName,
  sourceDisplayName,
} from '../src/renderer/ui/operatorNaming.js';

/**
 * `B-232` — THE COMPOSITION, pinned on the plant's own values.
 *
 * `placeName`, `templateName` and `shortId` keep their specs in `auditFormat.test.ts`,
 * which reaches them through the re-export; what is asserted here is the thing that is
 * new — how the three are put together into one row's worth of naming, and which of the
 * results is allowed to carry a coordinate.
 */

/**
 * Read off the station's own `bridge-fixed-layers.json` on 2026-09-06, including the fact
 * that matters most: `low.aliases` is ABSENT there. The bed rows have no operator names,
 * which is why the notice correctly showed `Bed 1` for layer 9 and «زیرنویس اصلی» for 98.
 */
const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '98': 'زیرنویس اصلی', '99': 'لوگوی اصلی' },
  low: { start: 50, count: 9 },
};

const TEMPLATE: TemplateInfo = {
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  name: 'comp1',
  sourceFileName: '3ghab.vcg',
  templateType: 'custom',
  fields: [],
};

const TEMPLATES = new Map([[TEMPLATE.templateId, TEMPLATE]]);

describe('live source names', () => {
  const id = 'e506e319-6e68-4603-a5f4-290b21616250';

  it('uses the declared plate number instead of the internal plate id', () => {
    const plateId = `frame-${id}`;
    expect(plateDisplayName(plateId, [{ sourceId: 'studio' }, { sourceId: plateId }])).toBe(
      'Plate 2',
    );
  });

  it('prefers the authored focus alias, then title, then the layout plate number', () => {
    const plateId = 'frame-' + id;
    expect(
      plateDisplayName(plateId, undefined, {
        frames: [{ id: plateId, title: 'Main studio', focusAlias: 'Studio' }],
      }),
    ).toBe('Studio');
    expect(
      plateDisplayName(plateId, undefined, { frames: [{ id: plateId, title: 'Main studio' }] }),
    ).toBe('Main studio');
    expect(plateDisplayName(plateId, undefined, { frames: [{ id: plateId, title: '' }] })).toBe(
      'Plate 1',
    );
  });

  it('keeps authored source names and replaces opaque input and media UUIDs', () => {
    expect(sourceDisplayName('استودیو')).toBe('استودیو');
    expect(sourceDisplayName(id, 'input')).toBe('Input');
    expect(sourceDisplayName(`md-${id}`, 'media')).toBe('Media');
    expect(sourceDisplayName(undefined, 'media')).toBe('Media');
  });
});

describe('operatorRowName', () => {
  it('names the ROW first and what it was SHOWING second', () => {
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 99 } },
      BANK,
      TEMPLATES,
    );
    expect(name.names).toEqual(['لوگوی اصلی', '3ghab']);
  });

  it('🔴 never puts an id in the names — that is the whole defect', () => {
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 98 } },
      BANK,
      TEMPLATES,
    );
    expect(name.names.join(' ')).not.toContain('e506e319');
    expect(name.names.join(' ')).not.toContain('item-1');
  });

  it('keeps every id it has on the title instead', () => {
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 99 } },
      BANK,
      TEMPLATES,
    );
    expect(name.title).toBe(`template ${TEMPLATE.templateId} · item item-1`);
  });

  it('falls back to the default row name for a bed the operator has not aliased', () => {
    // The plant's real state: `low.aliases` is absent, so layer 58 is `Live layer 58` (D3h: the real layer).
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 58 } },
      BANK,
      TEMPLATES,
    );
    expect(name.names).toEqual(['Live layer 58', '3ghab']);
    expect(name.layer).toBe('1-58');
  });

  it('localizes generated names by channel and preserves persisted names verbatim', () => {
    const labels: Readonly<Record<string, string>> = {
      'Layer {layer}': 'لایهٔ {layer}',
      'Live layer {layer}': 'لایهٔ زنده {layer}',
    };
    const translate: Parameters<typeof defaultLayerDisplayName>[2] = (source, values) =>
      (labels[source] ?? source).replace('{layer}', '\u2068' + String(values?.layer) + '\u2069');
    const second = { ...BANK, channel: 2, aliases: { '99': 'Layer 99' } };

    expect(defaultLayerDisplayName(BANK, 96, translate)).toBe('لایهٔ 96');
    expect(defaultLayerDisplayName(BANK, 58, translate)).toBe('لایهٔ زنده 58');
    expect(
      operatorRowName({ slot: { channel: 2, layer: 99 } }, [BANK, second], TEMPLATES, translate),
    ).toMatchObject({ names: ['Layer 99'], layer: '2-99' });
    expect(
      operatorRowName({ slot: { channel: 2, layer: 98 } }, [BANK, second], TEMPLATES, translate),
    ).toMatchObject({ names: ['لایهٔ 98'], layer: '2-98' });
    expect(
      operatorRowName({ slot: { channel: 1, layer: 98 } }, [BANK, second], TEMPLATES, translate),
    ).toMatchObject({ names: ['زیرنویس اصلی'], layer: '1-98' });
  });

  it('keeps the real coordinate beside a named row', () => {
    const name = operatorRowName({ slot: { channel: 1, layer: 99 } }, BANK, TEMPLATES);
    expect(name.layer).toBe('1-99');
  });

  it('does NOT repeat the coordinate when the place already carries it', () => {
    // Out of both halves of the bank: `placeName` says `layer 60 (not a row)`, so a
    // second `1-60` beside it would say the number twice.
    const name = operatorRowName({ slot: { channel: 1, layer: 60 } }, BANK, TEMPLATES);
    expect(name.names).toEqual(['layer 60 (not a row)']);
    expect(name.layer).toBeNull();
  });

  it('has no coordinate to show when the record names no layer', () => {
    const name = operatorRowName({ templateId: TEMPLATE.templateId }, BANK, TEMPLATES);
    expect(name.names).toEqual(['3ghab']);
    expect(name.layer).toBeNull();
  });

  it('names what it can when the registry no longer holds the template', () => {
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 99 } },
      BANK,
      new Map(),
    );
    expect(name.names).toEqual(['لوگوی اصلی']);
  });

  it('falls back to a SHORTENED id only when there is no name to be had, never a blank', () => {
    /*
      A row with no slot and an unknown template can be named by nothing else. An ugly
      handle beats an empty bullet — the operator can at least search the log with it —
      and it is the shortened form, never the raw UUID.
    */
    const name = operatorRowName({ templateId: TEMPLATE.templateId }, BANK, new Map());
    expect(name.names).toEqual(['e506e319…']);
  });

  it('with no bank declared yet, still names the template rather than nothing', () => {
    // The boot window: the bank snapshot has not landed. Nothing invents a row name.
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 99 } },
      null,
      TEMPLATES,
    );
    expect(name.names).toEqual(['layer 1-99 (not a row)', '3ghab']);
    expect(name.layer).toBeNull();
  });
});
