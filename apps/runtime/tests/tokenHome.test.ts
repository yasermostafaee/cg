import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVars } from '../src/renderer/theme.js';

/**
 * ── STATION-CHROME-01 §1 — THE GUARD ON THE ONE HOME ────────────────────────
 *
 * REPLACES `tokenParity.test.ts`, whose premise no longer exists. That test asserted
 * `controls.css`'s `:root` block matched `theme.ts` `cssVars` value for value — a
 * correct guard on a DUPLICATE, and the duplicate is what defeated the owner's
 * acceptance test: «if later we want to change the colour of the Add buttons, we
 * change one colour, in one obvious place.» Two agreeing copies are still two edits.
 *
 * `controls.css` now declares nothing; `applyThemeVars()` writes the `:root` block
 * from `cssVars` before the first render. So the thing to guard changed shape, from
 * "do the two copies agree" to "is there only one copy":
 *
 *   1. no rule in `controls.css` spells a colour, radius, spacing step or font size;
 *   2. no renderer TS/TSX file outside `theme.ts` spells a colour;
 *   3. every `var(--r-…)` either file references is declared in `cssVars`.
 *
 * ── WHAT THIS GUARD CANNOT SEE ──────────────────────────────────────────────
 *
 * Stated because a guard whose blind spots are unwritten reads as total:
 *
 *   • **A colour COMPUTED AT RUNTIME.** `style={{ color: someExpr }}` where `someExpr`
 *     builds a colour from parts, or reads one out of data. Nothing textual can catch
 *     it. Cheap partial check, and it is implemented below: any `#rrggbb` or
 *     `rgb(…)`/`hsl(…)` SPELLED anywhere in renderer TS is caught wherever it sits,
 *     inside a template literal or not — so the runtime value has to be assembled from
 *     something that is itself never spelled, which is a far narrower hole.
 *   • **SVG and canvas.** A `fill="…"`/`stroke="…"` presentation attribute and a
 *     `ctx.fillStyle` are colours this file WOULD catch if spelled (they are still TS),
 *     but a `<use>`d sprite, an imported `.svg` asset or an image is opaque to it.
 *     There is no cheap check for those: the colour is inside a binary or an asset the
 *     type system never sees. The honest answer is that asset colour is out of scope,
 *     and the app has no such asset today except the APASAI mark in `index.html`.
 *   • **`apps/runtime/index.html`** — the startup splash, EXEMPT BY CONSTRUCTION and
 *     not by oversight. It paints before the bundle, so `var(--r-…)` would resolve to
 *     nothing on the one frame it exists for. It mirrors its values as literals, each
 *     commented with the token it mirrors, and `splashCss.test.ts` asserts every one
 *     of them IS a `cssVars` value. That file is the guard for this one's blind spot.
 *   • **A wrong ROLE.** Using `--r-caution-text` where `--r-danger-text` was meant
 *     compiles, passes here, and looks plausible. Only a reader catches that.
 */

const ROOT = process.cwd();
const RENDERER = join(ROOT, 'src', 'renderer');
const CSS = join(RENDERER, 'ui', 'controls.css');

/** Colour literals in every spelling the codebase uses. */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*[\d.]+[\s,]|\bhsla?\(\s*[\d.]+[\s,]/g;

/** Strips `/* … *\/` (and `// …` outside CSS) so a documented value is not a defect. */
function stripComments(src: string, isCss: boolean): string {
  let out = '';
  let i = 0;
  let block = false;
  let line = false;
  let str: string | null = null;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (block) {
      if (c === '*' && n === '/') {
        block = false;
        i += 2;
        out += '  ';
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    if (line) {
      if (c === '\n') {
        line = false;
        out += '\n';
        i++;
        continue;
      }
      out += ' ';
      i++;
      continue;
    }
    if (str !== null) {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      block = true;
      i += 2;
      out += '  ';
      continue;
    }
    if (!isCss && c === '/' && n === '/') {
      line = true;
      i += 2;
      out += '  ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      str = c;
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * The ONE file allowed to spell a colour, and the one exception inside the renderer.
 * Both are named, not pattern-matched, so adding a third is a deliberate edit here.
 */
const TOKEN_HOME = join('src', 'renderer', 'theme.ts');
const DATA_NOT_CHROME = new Map([
  // The fallback VALUE of a template's own `color` field — the operator's data,
  // headed for the graphic on air. See the note at its use.
  [join('src', 'renderer', 'features', 'inspector', 'Inspector.tsx'), 1],
]);

describe('§1 — one home for colour, and a guard that says so', () => {
  const css = readFileSync(CSS, 'utf8');
  const cssRules = stripComments(css, true);

  it('controls.css declares no --r-* value of its own: the home is theme.ts', () => {
    // `:root { --r-…: … }` is gone entirely. If it comes back, the duplicate is back.
    expect(/--r-[a-z0-9-]+\s*:/.test(cssRules), 'controls.css re-declared a token').toBe(false);
  });

  it('no rule in controls.css spells a colour', () => {
    const hits = [...cssRules.matchAll(COLOUR)].map((m) => m[0]);
    expect(hits, `raw colours in controls.css: ${hits.join(', ')}`).toEqual([]);
  });

  /**
   * SPACING / RADIUS / TYPE are guarded NARROWLY, and the narrowness is deliberate.
   *
   * A colour is always a design decision, so "no literal" is the right rule for one.
   * A LENGTH is not: `padding: 0.4rem 0.8rem` on a button, a `3px` gap between two
   * glyphs and a `1px` hairline are that component's own geometry, not steps on a
   * shared scale, and forcing them onto tokens would invent a scale the design does
   * not have. Twenty-one such lengths are in `controls.css` today and every one is
   * local.
   *
   * What IS a defect is spelling a value the scale already owns — writing `8px`
   * where `var(--r-space-2)` was meant — because that is a step whose whole purpose
   * is to move together. So the rule is: a length may not EQUAL a token in the family
   * its property belongs to.
   */
  it('no rule in controls.css re-spells a value the scale already owns', () => {
    const family: Record<string, RegExp> = {
      spacing: /^(padding|margin|gap|row-gap|column-gap)$/,
      radius: /radius/,
      type: /^font-size$/,
    };
    const owned = {
      spacing: new Set(
        Object.entries(cssVars)
          .filter(([n]) => n.startsWith('--r-space-'))
          .map(([, v]) => v as string),
      ),
      radius: new Set(
        Object.entries(cssVars)
          .filter(([n]) => n.startsWith('--r-radius-'))
          .map(([, v]) => v as string),
      ),
      type: new Set(
        Object.entries(cssVars)
          .filter(([n]) => n.startsWith('--r-text-'))
          .map(([, v]) => v as string),
      ),
    };
    const bad: string[] = [];
    for (const line of cssRules.split('\n')) {
      const decl = /^\s*([a-z-]+)\s*:\s*([^;]+);/.exec(line);
      if (decl === null) continue;
      const [, prop = '', value = ''] = decl;
      if (value.includes('var(--')) continue;
      for (const [key, re] of Object.entries(family)) {
        if (!re.test(prop)) continue;
        for (const len of value.match(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/g) ?? []) {
          if (owned[key as keyof typeof owned].has(len)) bad.push(`${prop}: ${value}  (${len})`);
        }
      }
    }
    expect(bad, `values the scale already owns, spelled raw: ${bad.join(' | ')}`).toEqual([]);
  });

  it('every var(--r-…) the stylesheet reads is declared in theme.ts', () => {
    const used = new Set([...css.matchAll(/var\((--r-[a-z0-9-]+)/g)].map((m) => m[1] as string));
    const declared = new Set(Object.keys(cssVars));
    const missing = [...used].filter((n) => !declared.has(n));
    expect(missing, `controls.css reads tokens theme.ts does not declare`).toEqual([]);
  });

  it('no renderer component spells a colour — theme.ts is the only home', () => {
    const offenders: string[] = [];
    for (const file of walk(RENDERER)) {
      const rel = relative(ROOT, file);
      if (rel === TOKEN_HOME) continue;
      const hits = [...stripComments(readFileSync(file, 'utf8'), false).matchAll(COLOUR)];
      const allowed = DATA_NOT_CHROME.get(rel) ?? 0;
      if (hits.length > allowed) {
        offenders.push(
          `${rel.split(sep).join('/')} (${hits.length}: ${hits.map((h) => h[0]).join(', ')})`,
        );
      }
    }
    expect(offenders, `colour literals outside the token home`).toEqual([]);
  });

  it('every var(--r-…) a component reads is declared in theme.ts', () => {
    const declared = new Set(Object.keys(cssVars));
    const missing: string[] = [];
    for (const file of walk(RENDERER)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\((--r-[a-z0-9-]+)/g)) {
        if (!declared.has(m[1] as string)) missing.push(`${relative(ROOT, file)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('POSITIVE CONTROL: the guard really does see a planted literal', () => {
    // Without this, "no offenders" could mean the regex matches nothing at all — the
    // failure mode a text guard has and a type checker does not.
    const planted = stripComments(`const s = { color: '#ff00ff' };`, false);
    expect([...planted.matchAll(COLOUR)].map((m) => m[0])).toEqual(['#ff00ff']);
    const plantedCss = stripComments(`.x { background: rgba(1, 2, 3, 0.4); }`, true);
    expect([...plantedCss.matchAll(COLOUR)]).toHaveLength(1);
    // …and that a DOCUMENTED value in a comment is correctly NOT a defect.
    expect([...stripComments(`/* was #ff00ff */`, true).matchAll(COLOUR)]).toEqual([]);
  });

  it('the Add buttons are ONE declaration, and it is not the accent', () => {
    // The owner's acceptance test, as an assertion: `--r-btn-add` exists, is its own
    // key, and moving it cannot move `--r-accent` (which every secondary control reads).
    expect(Object.keys(cssVars)).toContain('--r-btn-add');
    expect(cssVars['--r-btn-add']).toBeTruthy();
    expect(css).toContain('border-color: var(--r-btn-add);');
    expect(css).toContain('color: var(--r-btn-add);');
  });
});
