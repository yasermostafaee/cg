import { describe, expect, it } from 'vitest';
import {
  liveSourceCarrierState,
  TemplateInfoSchema,
  type TemplateInfo,
} from '../src/channels/templates.js';

/**
 * D-137 / C-015 phase 2 — the Live Source CARRIER on `TemplateInfo`.
 *
 * Two properties are pinned here, and they pull in opposite directions on
 * purpose:
 *
 *  1. The BLOCK is optional, because `TemplateInfo` is re-parsed at bridge boot
 *     from persisted JSON (`PersistedTemplateSchema`) and a record that fails
 *     that parse is SKIPPED — a newly-required top-level field would empty every
 *     station's library on the first boot after upgrade.
 *  2. `defaultPosition` INSIDE the block is required, because the bridge appends
 *     the position query only when an operator override exists; without a carried
 *     authored default it would resolve a different origin from the page and the
 *     composited live box would land where the transparent hole is not.
 */

const base: TemplateInfo = {
  templateId: 'tpl-1',
  templateType: 'lower-third',
  fields: [],
};

const carrier = {
  resolution: { width: 1920, height: 1080 },
  defaultPosition: { anchor: 'center' as const, offset: { x: 0, y: 0 } },
  sources: [],
};

describe('TemplateInfoSchema — the Live Source carrier', () => {
  it('parses a template with NO carrier (the pre-carrier persisted record)', () => {
    const parsed = TemplateInfoSchema.parse(base);
    expect(parsed.liveSources).toBeUndefined();
  });

  it('parses a carrier with an empty sources array', () => {
    expect(
      TemplateInfoSchema.parse({ ...base, liveSources: carrier }).liveSources?.sources,
    ).toEqual([]);
  });

  it('REFUSES a carrier with no defaultPosition — the on-air term is not optional', () => {
    const { defaultPosition: _dropped, ...withoutPosition } = carrier;
    expect(TemplateInfoSchema.safeParse({ ...base, liveSources: withoutPosition }).success).toBe(
      false,
    );
  });

  it('REFUSES a carrier with no resolution', () => {
    const { resolution: _dropped, ...withoutResolution } = carrier;
    expect(TemplateInfoSchema.safeParse({ ...base, liveSources: withoutResolution }).success).toBe(
      false,
    );
  });

  it('REFUSES a declaration whose source id names a device', () => {
    const bad = {
      ...carrier,
      sources: [
        {
          elementId: 'el-1',
          sourceId: 'route://1-1',
          rect: { x: 0, y: 0, width: 10, height: 10 },
          dynamic: false,
          keyDynamic: false,
        },
      ],
    };
    expect(TemplateInfoSchema.safeParse({ ...base, liveSources: bad }).success).toBe(false);
  });
});

describe('liveSourceCarrierState', () => {
  it('reads an ABSENT block as unknown, never as none', () => {
    expect(liveSourceCarrierState(base)).toBe('unknown');
  });

  it('reads a present, empty block as none', () => {
    expect(liveSourceCarrierState({ liveSources: carrier })).toBe('none');
  });

  it('reads a populated block as declared', () => {
    expect(
      liveSourceCarrierState({
        liveSources: {
          ...carrier,
          sources: [
            {
              elementId: 'el-1',
              sourceId: 'guest-1',
              rect: { x: 0, y: 0, width: 640, height: 360 },
              dynamic: false,
              keyDynamic: false,
            },
          ],
        },
      }),
    ).toBe('declared');
  });
});
