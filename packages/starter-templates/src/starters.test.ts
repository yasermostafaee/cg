import { describe, expect, it } from 'vitest';
import { type Element, isPathKeyframeValue, SceneSchema } from '@cg/shared-schema';
import { getStarter, logoBugScene, STARTER_TEMPLATES, tickerScene } from './index.js';

/** The five D-119 starters, in landing-page order (the composite leads). */
const EXPECTED_IDS = ['irib-news', 'ticker', 'logo-bug', 'title', 'sequence'];

describe('starter templates', () => {
  it('every starter has a Zod-valid Scene', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(() => SceneSchema.parse(s.scene), `${s.id} parses`).not.toThrow();
    }
  });

  it('the catalog is exactly the D-119 set, in order', () => {
    expect(STARTER_TEMPLATES.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('getStarter returns the matching starter by id', () => {
    expect(getStarter('ticker')?.id).toBe('ticker');
    expect(getStarter('nope')).toBeNull();
  });

  it('no starter carries the "New" badge (owner decision, D-119)', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(s.isNew, `${s.id} must not set isNew`).toBeUndefined();
    }
  });

  it('every starter has at least one bound field', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(s.scene.bindings.length, `${s.id} has bindings`).toBeGreaterThan(0);
    }
  });

  it('every starter seeds the Vazirmatn asset font and references it', () => {
    for (const s of STARTER_TEMPLATES) {
      const fontAsset = (s.assets ?? []).find((a) => a.kind === 'font');
      expect(fontAsset, `${s.id} seeds a font`).toBeDefined();
      const family = `asset-${fontAsset?.key ?? ''}`;
      expect(
        s.scene.fonts.some((f) => f.family === family),
        `${s.id} fonts[] references ${family}`,
      ).toBe(true);
    }
  });

  it('every starter follows the two-comp structure with a real playout lifecycle', () => {
    for (const s of STARTER_TEMPLATES) {
      // Entry (exported-for-now) comp: full-frame, out-point + mode.
      const entry = s.scene.compositions?.find((c) => c.id === s.scene.entryCompositionId);
      expect(entry, `${s.id} has an entry composition`).toBeDefined();
      expect(entry?.resolution, `${s.id} entry comp is full-frame`).toEqual({
        width: 1920,
        height: 1080,
      });
      expect(entry?.lifecycle?.outPoint, `${s.id} has an out-point`).toBeGreaterThan(0);
      expect(entry?.playout?.mode, `${s.id} has a playout mode`).toBeDefined();

      // On-air footprint comp: recorded via the `onair:<compId>` scene tag,
      // smaller than the frame, carrying its own lifecycle + playout.
      const onairTag = s.scene.metadata.tags?.find((t) => t.startsWith('onair:'));
      expect(onairTag, `${s.id} records its on-air footprint comp`).toBeDefined();
      const onair = s.scene.compositions?.find((c) => c.id === onairTag?.slice('onair:'.length));
      expect(onair, `${s.id} on-air comp exists`).toBeDefined();
      expect(
        (onair?.resolution.width ?? 0) * (onair?.resolution.height ?? 0),
        `${s.id} on-air comp is smaller than the frame`,
      ).toBeLessThan(1920 * 1080);
      expect(onair?.lifecycle?.outPoint, `${s.id} on-air comp has an out-point`).toBeGreaterThan(0);
      expect(onair?.playout?.mode, `${s.id} on-air comp has a playout mode`).toBeDefined();
      // The entry comp's outro must outlast the on-air comp's stop-exit so the
      // root never settles (hides the stage) before the graphic's exit ends.
      const entryOutro = (entry?.frameRange.out ?? 0) - (entry?.lifecycle?.outPoint ?? 0);
      const onairOutro = (onair?.frameRange.out ?? 0) - (onair?.lifecycle?.outPoint ?? 0);
      expect(entryOutro, `${s.id} entry outro outlasts the on-air exit`).toBeGreaterThan(
        onairOutro,
      );
    }
  });

  it('ticker: content-driven crawl bound to a list data key, manual hold', () => {
    const main = tickerScene.compositions?.find((c) =>
      c.layers.some((l) => l.children.some((el) => el.type === 'ticker')),
    );
    const crawl = main?.layers[0]?.children.find((el) => el.type === 'ticker');
    expect(crawl).toBeDefined();
    if (crawl?.type !== 'ticker') return;
    expect(crawl.direction).toBe('rtl');
    expect(crawl.repeat).toBe('infinite');
    expect(crawl.items.length).toBeGreaterThan(0);

    const listBinding = tickerScene.bindings.find((b) => b.target.kind === 'ticker-items');
    expect(listBinding?.target.kind === 'ticker-items' && listBinding.target.elementId).toBe(
      crawl.id,
    );
    const listField = tickerScene.fields.find((f) => f.id === listBinding?.fieldId);
    expect(listField?.type).toBe('list');

    expect(main?.playout?.mode).toBe('manual');
    // The authored exit lives AFTER the out-point.
    expect(main?.lifecycle?.outPoint).toBeLessThan(main?.frameRange.out ?? 0);
  });

  it('logo-bug: loop-cycle sting with a whole-shape path morph', () => {
    // The sting loop lives on the nested on-air comp (a parent loop-cycle
    // would NOT replay nested keyframes — child controllers loop themselves).
    const main = logoBugScene.compositions?.find((c) =>
      c.layers.some((l) => l.children.some((el) => el.type === 'path')),
    );
    expect(main?.playout).toMatchObject({
      mode: 'loop-cycle',
      holdSource: 'timed',
      repeat: 'infinite',
    });
    expect(main?.playout?.holdMs).toBeGreaterThanOrEqual(5000);

    const mark = main?.layers[0]?.children.find((el) => el.type === 'path');
    expect(mark).toBeDefined();
    if (mark?.type !== 'path') return;
    const pathTrack = mark.animation?.tracks.path;
    expect(pathTrack).toBeDefined();
    const poses = (pathTrack?.keyframes ?? []).map((k) => k.value);
    expect(poses.length).toBeGreaterThanOrEqual(3);
    // Every pose keeps the same anchor-id set so the morph reconciles.
    const idsOf = (v: unknown): string =>
      isPathKeyframeValue(v)
        ? v.points
            .map((p) => p.id)
            .sort()
            .join(',')
        : '';
    const staticIds = mark.points
      .map((p) => p.id)
      .sort()
      .join(',');
    for (const pose of poses) {
      expect(isPathKeyframeValue(pose)).toBe(true);
      expect(idsOf(pose)).toBe(staticIds);
    }
  });

  it('Persian defaults are non-empty RTL copy', () => {
    for (const s of STARTER_TEMPLATES) {
      const textFields = s.scene.fields.filter((f) => f.type === 'text');
      expect(textFields.length, `${s.id} has text fields`).toBeGreaterThan(0);
      for (const f of textFields) {
        if (f.type === 'text') expect(f.default, `${s.id}.${f.id} default`).not.toBe('');
      }
    }
  });

  // D-119 polish — a bound text field carries a REAL default as its base text,
  // with the data key layered on top (the hand-authored shape the Designer's own
  // bind action produces). A raw `{{token}}` as the base text would show
  // literally in the Designer and on air whenever the operator sends no value.
  it('bound text fields hold a real Persian default, never a raw {{token}}', () => {
    for (const s of STARTER_TEMPLATES) {
      // Every element in the scene: each layer's children, in the root AND in
      // every composition, descending through containers (which nest).
      const elements = [...s.scene.layers, ...(s.scene.compositions ?? []).flatMap((c) => c.layers)]
        .flatMap((l) => l.children)
        .flatMap(function walk(el): Element[] {
          return el.type === 'container' ? [el, ...el.children.flatMap(walk)] : [el];
        });

      // No element anywhere ships a mustache token as its authored copy.
      for (const el of elements) {
        if (el.type === 'text') {
          expect(el.text, `${s.id}.${el.id} base text is real copy`).not.toContain('{{');
        }
      }

      const textBindings = s.scene.bindings.filter((b) => b.target.kind === 'text');
      expect(textBindings.length, `${s.id} has text bindings`).toBeGreaterThan(0);

      for (const b of textBindings) {
        if (b.target.kind !== 'text') continue;
        // No placeholder => the value REPLACES the full text (bindings.ts), and
        // the Designer inspector recognises it as the element's Data key binding
        // (DynamicDataSection only treats `placeholder === undefined` as such).
        expect(
          b.target.placeholder,
          `${s.id}.${b.fieldId} binding must not carry a placeholder`,
        ).toBeUndefined();

        const el = elements.find((e) => e.id === b.target.elementId);
        expect(el?.type, `${s.id}.${b.fieldId} targets a text element`).toBe('text');

        const field = s.scene.fields.find((f) => f.id === b.fieldId);
        expect(field?.type, `${s.id}.${b.fieldId} is a text field`).toBe('text');

        // Base text and default agree: what the Designer shows is exactly what
        // goes to air when the operator sends no value.
        if (el?.type === 'text' && field?.type === 'text') {
          expect(el.text, `${s.id}.${b.fieldId} base text is non-empty`).not.toBe('');
          expect(
            el.text,
            `${s.id}.${b.fieldId} base text === field default (Designer == on-air fallback)`,
          ).toBe(field.default);
        }
      }
    }
  });
});
