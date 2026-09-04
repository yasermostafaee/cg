import { describe, expect, it } from 'vitest';
import {
  TemplatesRemoveChannel,
  describeReferencePlace,
  describeTemplateReferences,
  referenceRowName,
  type FixedLayerBank,
} from '../src/index.js';

/**
 * `B-212` — the `in-use` refusal names WHERE each item is, in the operator's words.
 *
 * Pinned on the incident's own bank and the incident's own two items: on 2026-09-04
 * the refusal said "2 stack item(s) … remove them (or Remove All) first" to an
 * operator whose rows all read EMPTY, because the two items sat on CasparCG layers
 * 60 and 61 — layers no row shows. The old sentence's only concrete remedy was the
 * destructive one, and it was taken.
 */

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '99': 'لوگوی اصلی' },
  low: { start: 1, count: 9 },
};

describe('describeTemplateReferences', () => {
  it('names a bank row as the Layers table names it — alias first, else the default', () => {
    expect(
      describeTemplateReferences(
        [
          { itemId: 'a', slot: { channel: 1, layer: 9 } },
          { itemId: 'b', slot: { channel: 1, layer: 99 } },
        ],
        BANK,
      ),
    ).toBe(
      '2 stack item(s) still use this template — on the row “Bed 1” (layer 9), on the row “لوگوی اصلی” (layer 99). Remove those items first.',
    );
  });

  it('names a layer outside the bank as CasparCG names it, and says it is not a row', () => {
    // THE INCIDENT: layers 60 and 61, dynamic slots outside both halves of the bank.
    expect(
      describeTemplateReferences(
        [
          { itemId: 'a', slot: { channel: 1, layer: 60 } },
          { itemId: 'b', slot: { channel: 1, layer: 61 } },
        ],
        BANK,
      ),
    ).toBe(
      "2 stack item(s) still use this template — on CasparCG layer 60, which is not one of this station's rows, on CasparCG layer 61, which is not one of this station's rows. Remove those items first.",
    );
  });

  it('says so when an item holds no layer at all', () => {
    expect(describeTemplateReferences([{ itemId: 'a' }], BANK)).toBe(
      '1 stack item(s) still use this template — on the stack with no layer bound. Remove that item first.',
    );
  });

  it('never mentions Remove All — the sweeping remedy is not the one to steer toward', () => {
    const text = describeTemplateReferences(
      [{ itemId: 'a', slot: { channel: 1, layer: 60 } }, { itemId: 'b' }],
      BANK,
    );
    expect(text).not.toMatch(/remove all/i);
    // …and keeps the fragment every surface and spec matches on.
    expect(text).toMatch(/still use this template/);
  });

  it('with no bank known (the disconnected browser), names every layer as CasparCG does', () => {
    expect(describeReferencePlace({ itemId: 'a', slot: { channel: 1, layer: 9 } }, null)).toBe(
      "on CasparCG layer 1-9, which is not one of this station's rows",
    );
  });
});

describe('referenceRowName', () => {
  it('is the row name for a bank layer and null for anything the surface cannot scroll to', () => {
    expect(referenceRowName({ itemId: 'a', slot: { channel: 1, layer: 9 } }, BANK)).toBe('Bed 1');
    expect(referenceRowName({ itemId: 'a', slot: { channel: 1, layer: 60 } }, BANK)).toBeNull();
    expect(referenceRowName({ itemId: 'a' }, BANK)).toBeNull();
    expect(referenceRowName({ itemId: 'a', slot: { channel: 1, layer: 9 } }, null)).toBeNull();
  });
});

describe('templates.remove carries the references', () => {
  it('accepts a refusal with references, and one without (older bridge)', () => {
    expect(
      TemplatesRemoveChannel.response.parse({
        ok: false,
        reason: 'in-use',
        message: 'x',
        references: [{ itemId: 'a', slot: { channel: 1, layer: 60 } }, { itemId: 'b' }],
      }).references,
    ).toHaveLength(2);
    expect(
      TemplatesRemoveChannel.response.parse({ ok: false, reason: 'in-use', message: 'x' })
        .references,
    ).toBeUndefined();
  });
});
