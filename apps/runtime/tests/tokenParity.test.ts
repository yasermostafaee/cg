import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssVars } from '../src/renderer/theme.js';

/**
 * R-007 — the `--r-*` custom properties in `controls.css` MUST match `theme.ts`
 * `cssVars` (the single source of truth), so the stylesheet and the TS
 * primitives never drift. Parses the `:root {…}` block and compares.
 */

const cssPath = fileURLToPath(new URL('../src/renderer/ui/controls.css', import.meta.url));

function parseRootVars(css: string): Record<string, string> {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css);
  if (root === null) throw new Error('no :root block in controls.css');
  const out: Record<string, string> = {};
  for (const m of (root[1] as string).matchAll(/(--r-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1] as string] = (m[2] as string).trim();
  }
  return out;
}

describe('theme.ts cssVars ↔ controls.css :root parity', () => {
  const cssVarsInCss = parseRootVars(readFileSync(cssPath, 'utf8'));

  // Compare case- and whitespace-insensitively (prettier may normalize spacing
  // inside e.g. `rgba(...)`; the semantic value is what must match).
  const norm = (v: string): string => v.toLowerCase().replace(/\s+/g, '');

  it('every theme.ts token is declared in controls.css with the same value', () => {
    for (const [name, value] of Object.entries(cssVars)) {
      expect(cssVarsInCss[name], `missing ${name} in controls.css`).toBeDefined();
      expect(norm(cssVarsInCss[name] ?? '')).toBe(norm(value));
    }
  });

  it('controls.css declares no --r-* token missing from theme.ts', () => {
    for (const name of Object.keys(cssVarsInCss)) {
      expect(cssVars, `controls.css has ${name} not in theme.ts`).toHaveProperty(name);
    }
  });
});
