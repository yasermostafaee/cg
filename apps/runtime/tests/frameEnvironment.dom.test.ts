// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@cg/shared-schema';
import { positionQuery } from '@cg/shared-schema';
import {
  applyOperatorPosition,
  type PageRuntimeWindow,
} from '../src/renderer/features/monitors/frameEnvironment.js';

/**
 * R-022 / R-011 — what PVW does to a rehearsal frame's DOCUMENT: it hands the
 * page the operator's placement override, which a `srcdoc` frame's empty
 * `location.search` otherwise never delivers.
 *
 * Asserted here against a real jsdom document; the real-browser end is in
 * `tests/e2e/rehearse-composite.spec.ts`.
 *
 * A transparent-base injection was specified alongside this and is deliberately
 * absent — measured, it is a no-op. The reasoning is in `frameEnvironment.ts`
 * and the consequence is recorded in DEBT.md.
 */

/**
 * A stand-in for the served page: the `.cg-stage` with the INLINE width/height
 * `buildScene` writes from the scene's own resolution, which is where the
 * placement code reads the resolution back from.
 */
function pageDocument(opts: { resolution?: string; head?: boolean } = {}): Document {
  const doc = document.implementation.createHTMLDocument('page');
  if (opts.head === false) doc.documentElement.removeChild(doc.head);
  const stage = doc.createElement('div');
  stage.className = 'cg-stage';
  const [w, h] = (opts.resolution ?? '1920x1080').split('x');
  stage.style.width = `${w ?? ''}px`;
  stage.style.height = `${h ?? ''}px`;
  doc.body.appendChild(stage);
  return doc;
}

function pageWindow(): { win: PageRuntimeWindow; applyOutputPosition: ReturnType<typeof vi.fn> } {
  const applyOutputPosition = vi.fn();
  return { win: { CG: { applyOutputPosition } }, applyOutputPosition };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyOperatorPosition — the override reaches the frame at last', () => {
  const OVERRIDE: Position = { anchor: 'bottom-right', offset: { x: -40, y: -20 } };

  /**
   * THE BUG, stated as a test. A `srcdoc` document's URL is `about:srcdoc`, so
   * its `location.search` is always empty and the page's boot resolved the
   * override to null — every rehearsal rendered the AUTHORED position no matter
   * what the operator applied.
   */
  it('calls the PAGE’S OWN applyOutputPosition with the operator’s override', () => {
    const { win, applyOutputPosition } = pageWindow();
    expect(applyOperatorPosition(win, pageDocument(), OVERRIDE)).toBe(true);
    expect(applyOutputPosition).toHaveBeenCalledTimes(1);
    const [scene, options] = applyOutputPosition.mock.calls[0] as [
      { resolution: { width: number; height: number } },
      { search?: string },
    ];
    expect(scene.resolution).toEqual({ width: 1920, height: 1080 });
    // The search is the OVERRIDE spelled by the ONE shared builder — the same
    // one the bridge appends to CasparCG's served URL. Asserted against
    // `positionQuery` rather than a literal, because the property that matters
    // is that both deliverers of this override spell it identically; that the
    // page's parser reads it back is pinned by the round-trip test in
    // `@cg/template-runtime` (this app cannot import that package).
    expect(options.search).toBe(`?${positionQuery(OVERRIDE)}`);
    expect(options.search).toContain('pos=bottom-right');
    expect(options.search).toContain('dx=-40');
    expect(options.search).toContain('dy=-20');
  });

  it('reads scene.resolution from the page’s own .cg-stage, not from the panel', () => {
    const { win, applyOutputPosition } = pageWindow();
    applyOperatorPosition(win, pageDocument({ resolution: '800x240' }), OVERRIDE);
    const [scene] = applyOutputPosition.mock.calls[0] as [{ resolution: unknown }];
    expect(scene.resolution).toEqual({ width: 800, height: 240 });
  });

  /**
   * NO `cw`/`ch`. The frame IS sized to the channel raster, so the page's own
   * R-030 chain falls through to `window.innerWidth`/`innerHeight` and reads
   * that box. Sending a raster too would be a SECOND geometry source, and the
   * two could disagree.
   */
  it('sends the position half ONLY — the frame’s own box answers the raster', () => {
    const { win, applyOutputPosition } = pageWindow();
    applyOperatorPosition(win, pageDocument(), OVERRIDE);
    const [, options] = applyOutputPosition.mock.calls[0] as [unknown, { search?: string }];
    expect(options.search).not.toContain('cw=');
    expect(options.search).not.toContain('ch=');
  });

  /**
   * WITH NO OVERRIDE, DO NOTHING. `resolveOutputPosition` falls back to
   * `scene.defaultPosition`, which lives inside the page and is not available
   * here — so calling with an empty search would resolve to CENTERED and MOVE a
   * correctly-placed graphic. Abstaining is the honest action.
   */
  it('does NOTHING when the item has no override — it must not re-place to centre', () => {
    const { win, applyOutputPosition } = pageWindow();
    expect(applyOperatorPosition(win, pageDocument(), undefined)).toBe(false);
    expect(applyOutputPosition).not.toHaveBeenCalled();
  });

  it('abstains rather than guessing when the page is not one it can drive', () => {
    const { applyOutputPosition } = pageWindow();
    // No CG namespace at all (a stub page, or a boot that threw).
    expect(applyOperatorPosition({}, pageDocument(), OVERRIDE)).toBe(false);
    // No stage — nothing has been built, so there is no resolution to read.
    const bare = document.implementation.createHTMLDocument('bare');
    expect(applyOperatorPosition(pageWindow().win, bare, OVERRIDE)).toBe(false);
    // A stage with no usable size: a zero resolution would blank the output,
    // which is the worst reading of a missing measurement.
    const zero = pageDocument({ resolution: '0x0' });
    expect(applyOperatorPosition(pageWindow().win, zero, OVERRIDE)).toBe(false);
    expect(applyOutputPosition).not.toHaveBeenCalled();
  });

  /**
   * ── THE SCENE IS BYTE-IDENTICAL AFTER A POSITION REHEARSAL ─────────────────
   *
   * "Saving the position" writes the OPERATOR OVERRIDE (R-011) and never the
   * authored position in the scene — otherwise the operator would silently
   * rewrite a template that other rows and other installations also use.
   *
   * This assertion became worth making with this change and was not before. The
   * rehearsal previously touched nothing inside the frame; it now writes to that
   * document to place the graphic, which is exactly the kind of access that
   * could grow into a scene edit. So: after a full position rehearsal, the
   * SERVED PAGE BYTES are identical, and the scene's own footprint — the
   * `.cg-stage` inline resolution `buildScene` wrote — is untouched. What moves
   * is the transform, and only the transform.
   */
  it('leaves the served page and the scene’s own resolution BYTE-IDENTICAL', () => {
    const html = '<!doctype html><html><head></head><body></body></html>';
    const pageBefore = html;

    const doc = pageDocument({ resolution: '1280x720' });
    const stage = doc.querySelector<HTMLElement>('.cg-stage');
    const stageBefore = stage?.outerHTML ?? '';

    // A stand-in for the page's real `applyOutputPosition`: it writes the
    // transform, which is all the on-air one writes on the stage itself.
    const win: PageRuntimeWindow = {
      CG: {
        applyOutputPosition: () => {
          if (stage !== null) stage.style.transform = 'translate(10px, 20px)';
        },
      },
    };

    applyOperatorPosition(win, doc, OVERRIDE);
    applyOperatorPosition(win, doc, { anchor: 'top-left', offset: { x: 5, y: 5 } });

    // The retained page — the bytes the bridge serves CasparCG — is not a thing
    // this path can even reach: it is a string, read-only here, never re-packed.
    expect(html).toBe(pageBefore);
    // The scene's authored footprint is unchanged; only the transform moved.
    expect(stage?.style.width).toBe('1280px');
    expect(stage?.style.height).toBe('720px');
    expect(stage?.style.transform).toBe('translate(10px, 20px)');
    expect(stageBefore).not.toBe(stage?.outerHTML);
    expect(stageBefore.replace(/ transform:[^;"]*;?/, '')).toBe(
      (stage?.outerHTML ?? '').replace(/ ?transform:[^;"]*;?/, ''),
    );
  });
});
