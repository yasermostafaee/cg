import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import { installCasparGlobals } from '../src/adapters/caspar-globals.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * B-066 — CEF-emulation boot: CasparCG's CEF (baseline Chromium 71) has no
 * `String.prototype.replaceAll` (Chromium 85+). Deleting it here reproduces
 * the live failure faithfully: pre-fix, `createRuntime()` THREW while
 * applying the scene's field defaults (bindings walk), so the exported boot
 * never reached `installCasparGlobals()` — hence CEF's "update is not
 * defined" / "play is not defined", and no Persian ever rendered (the
 * "????" downstream effect). Post-fix the same boot completes, the bare
 * CasparCG entrypoints exist, and a simulated CasparCG `update(json)`
 * renders Persian.
 */

const REPLACE_ALL = String.prototype.replaceAll;
let uninstall: (() => void) | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  // CEF-71 emulation: the method simply does not exist.
  delete (String.prototype as { replaceAll?: unknown }).replaceAll;
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  // Restore for every other suite — the emulation must never leak.
  (String.prototype as { replaceAll?: unknown }).replaceAll = REPLACE_ALL;
});

describe('B-066 — the served boot sequence on a CEF without replaceAll', () => {
  it('boots without throwing, defines the bare CasparCG entrypoints, and renders Persian on update(json)', async () => {
    // The exported page's exact sequence: createRuntime THEN installCasparGlobals.
    // Pre-fix this threw "replaceAll is not a function" inside createRuntime
    // (the field-defaults application) — the cascade root.
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);

    // The bare globals CasparCG's html producer calls — not only window.cg.
    expect(typeof window.play).toBe('function');
    expect(typeof window.update).toBe('function');
    expect(typeof window.stop).toBe('function');
    expect(typeof window.next).toBe('function');

    // The scene's Persian DEFAULT already rendered during boot (the very walk
    // that used to throw).
    const el = document.querySelector('[data-cg-element-id="name"]');
    expect(el?.textContent).toContain('سارا نادری');

    // A CasparCG-delivered update(json) reaches the runtime and renders.
    window.update?.(JSON.stringify({ anchor: 'خبر فوری ۱۴۰۳' }));
    await Promise.resolve();
    expect(el?.textContent).toContain('خبر فوری ۱۴۰۳');
    expect(el?.textContent).not.toContain('?');
  });
});

describe('B-066 — CEF-safe placeholder replacement semantics', () => {
  it('replaces ALL occurrences of the literal placeholder', async () => {
    const scene = structuredClone(lowerThirdScene);
    const layer = scene.layers[0];
    const text = layer?.children.find((c) => c.id === 'name');
    if (text === undefined || text.type !== 'text') throw new Error('fixture drift');
    text.text = '{{anchor}} — {{anchor}}';
    const runtime = createRuntime(scene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.update?.(JSON.stringify({ anchor: 'الف' }));
    await Promise.resolve();
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('الف — الف');
  });

  it('treats a regex-special placeholder as a literal', async () => {
    const scene = structuredClone(lowerThirdScene);
    const layer = scene.layers[0];
    const text = layer?.children.find((c) => c.id === 'name');
    if (text === undefined || text.type !== 'text') throw new Error('fixture drift');
    text.text = 'x {{a+b(1)}} y';
    const binding = scene.bindings[0];
    if (binding === undefined || binding.target.kind !== 'text') throw new Error('fixture drift');
    binding.target.placeholder = '{{a+b(1)}}';
    const runtime = createRuntime(scene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.update?.(JSON.stringify({ anchor: 'ب' }));
    await Promise.resolve();
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('x ب y');
  });

  it('a field VALUE containing `$&` stays literal (no replacement-pattern expansion)', async () => {
    // String.replace/replaceAll expand `$`-patterns in a string replacement;
    // the CEF-safe split/join is fully literal — an operator typing "$&"
    // must render "$&", never the placeholder text.
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    uninstall = installCasparGlobals(runtime);
    window.update?.(JSON.stringify({ anchor: 'price $& up' }));
    await Promise.resolve();
    expect(document.querySelector('[data-cg-element-id="name"]')?.textContent).toBe('price $& up');
  });
});
