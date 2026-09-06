import { describe, expect, it } from 'vitest';
import type { FixedLayerBank, TemplateInfo } from '@cg/shared-ipc';
import { operatorRowName } from '../src/renderer/ui/operatorNaming.js';

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
  low: { start: 1, count: 9 },
};

const TEMPLATE: TemplateInfo = {
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  name: 'comp1',
  sourceFileName: '3ghab.vcg',
  templateType: 'custom',
  fields: [],
};

const TEMPLATES = new Map([[TEMPLATE.templateId, TEMPLATE]]);

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
    // The plant's real state: `low.aliases` is absent, so layer 9 is `Bed 1`.
    const name = operatorRowName(
      { itemId: 'item-1', templateId: TEMPLATE.templateId, slot: { channel: 1, layer: 9 } },
      BANK,
      TEMPLATES,
    );
    expect(name.names).toEqual(['Bed 1', '3ghab']);
    expect(name.layer).toBe('1-9');
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
