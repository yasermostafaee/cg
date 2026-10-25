import { describe, expect, it } from 'vitest';
import { BrandKitSchema } from '../src/schema.js';

const valid = {
  schemaVersion: 1,
  id: 'station-one',
  name: 'Station One',
  motion: 'news',
  targets: [{ key: 'hd', width: 1920, height: 1080 }],
  colors: {
    primary: { value: '#123456', source: 'brand' },
    plate: {
      value: '#101820E6',
      source: 'derived',
      derivedFrom: 'primary',
      note: 'measured support plate',
    },
  },
  fonts: {
    display: {
      path: './font.woff2',
      family: 'Display',
      weight: 700,
      style: 'normal',
      licenseConfirmed: true,
      licenseNote: 'licensed for broadcast embedding',
    },
  },
  assets: { logo: { kind: 'image', sourcePath: './logo.svg' } },
  brandbookNotes: [],
  references: [],
};

describe('BrandKitSchema', () => {
  it('accepts explicit brand/derived colours, licensed fonts and a vector logo', () => {
    expect(BrandKitSchema.parse(valid).id).toBe('station-one');
  });

  it('refuses an unconfirmed font licence', () => {
    const kit = structuredClone(valid);
    kit.fonts.display.licenseConfirmed = false;
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
  });

  it('refuses a raster-only logo and a dangling derived colour', () => {
    const kit = structuredClone(valid);
    kit.assets.logo.sourcePath = './logo.png';
    kit.colors.plate.derivedFrom = 'missing';
    const result = BrandKitSchema.safeParse(kit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
        expect.arrayContaining(['assets.logo.sourcePath', 'colors.plate.derivedFrom']),
      );
    }
  });

  it('requires a render derivative for AI/EPS logo masters', () => {
    const kit = structuredClone(valid) as typeof valid & {
      assets: { logo: { kind: string; sourcePath: string; renderPath?: string } };
    };
    kit.assets.logo.sourcePath = './logo.ai';
    expect(BrandKitSchema.safeParse(kit).success).toBe(false);
    kit.assets.logo.renderPath = './logo.svg';
    expect(BrandKitSchema.safeParse(kit).success).toBe(true);
  });
});
