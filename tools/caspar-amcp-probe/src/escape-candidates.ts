/**
 * B-041 escape-matrix candidates. The on-paper AMCP un-escape rule is NOT
 * derivable — two hardware data points contradict every hand-derived model (see
 * `openspec/changes/fix-amcp-escaping-v2/design.md`). So, exactly like ADR 0006's
 * update-mechanism sweep, we DISCOVER the rule empirically: send the SAME hard
 * payload under several candidate AMCP escapings against real CasparCG 2.3.2 and
 * record which one the served template's `window.update` receives such that
 * `JSON.parse` succeeds and the value is byte-exact equal to the original.
 *
 * The command sequence is fixed (the ADR-0006-validated `CG ADD` + `CG UPDATE`);
 * only the **escaping** of the JSON data argument varies. The winning candidate IS
 * the canonical rule — to be locked into `@cg/caspar-client escape()` afterwards.
 */

/**
 * The hard-case payload. One field per character class so the results table shows
 * a clean PASS/FAIL per class (`"`, 1–4 backslashes, newline, tab, Persian, and a
 * nasty combo of all of them).
 */
export const HARD_PAYLOAD = {
  quote: 'aaa"bbb',
  bs1: 'a\\b',
  bs2: 'a\\\\b',
  bs3: 'a\\\\\\b',
  bs4: 'a\\\\\\\\b',
  newline: 'New text\nsecond text',
  tab: 'col1\tcol2',
  persian: 'خبر فوری ۱۴۰۳ — «به‌روزرسانی»',
  combo: 'he said "a\\b"\nخط دوم',
} as const;

export type HardKey = keyof typeof HARD_PAYLOAD;

/** Human label per character class (for the results table). */
export const CLASS_LABEL: Record<HardKey, string> = {
  quote: 'quote "',
  bs1: 'backslash×1',
  bs2: 'backslash×2',
  bs3: 'backslash×3',
  bs4: 'backslash×4',
  newline: 'newline',
  tab: 'tab',
  persian: 'persian',
  combo: 'combo',
};

/** The JSON string the template's `window.update` SHOULD receive byte-exact. */
export function expectedJson(): string {
  return JSON.stringify(HARD_PAYLOAD);
}

export interface EscapeCandidate {
  id: string;
  title: string;
  note: string;
  /**
   * Build the FULL AMCP data argument (INCLUDING the surrounding `"`) from the JSON
   * string. A candidate fully controls the wire token — `raw-json` deliberately
   * leaves inner quotes unescaped so it breaks (a control).
   */
  encodeArg(json: string): string;
}

// ── escaping primitives (scan-based, backslash-parity-correct) ───────────────

/** Escape every `"` → `\"` (and every `\` → `\\`). The original double-escape. */
function escBackslashQuote(json: string): string {
  return json.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape every `"` → `\"`; leave backslashes literal. (The failed #245 rule.) */
function escQuotesOnly(json: string): string {
  return json.replace(/"/g, '\\"');
}

/**
 * Escape ONLY the JSON-structural quotes (a BARE `"`), copying every existing
 * JSON escape pair (`\"`, `\\`, `\n`, `\uXXXX`, …) through untouched — so the
 * JSON's own backslash-escapes reach CasparCG intact. Scan-based so backslash
 * parity is correct.
 */
function escStructuralQuotesOnly(json: string): string {
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const c = json[i] as string;
    if (c === '\\' && i + 1 < json.length) {
      out += c + (json[i + 1] as string); // copy the escape pair verbatim
      i++;
      continue;
    }
    out += c === '"' ? '\\"' : c; // a bare quote is structural → escape it
  }
  return out;
}

/**
 * Rewrite the JSON's two-char control escapes (backslash-n, -r, -t, -b, -f) to the
 * six-char unicode form (backslash-u-00-0a etc.), honoring backslash parity (a
 * literal escaped-backslash is copied, so its trailing letter is NOT mistaken for a
 * control). This PRE-COMPENSATES for a CasparCG that un-escapes backslash-n into a
 * raw newline: the unicode form carries the newline with no bare backslash-n for
 * CasparCG to convert, and JSON.parse still decodes it back to a newline.
 */
function unicodeEscapeControls(json: string): string {
  const map: Record<string, string> = {
    n: '\\u000a',
    r: '\\u000d',
    t: '\\u0009',
    b: '\\u0008',
    f: '\\u000c',
  };
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const c = json[i] as string;
    if (c === '\\' && i + 1 < json.length) {
      const next = json[i + 1] as string;
      out += map[next] ?? c + next; // control escape → \uXXXX; else copy the pair
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

const wrap = (body: string): string => `"${body}"`;

/**
 * The candidate escapings to sweep. Add rows freely — the harness runs whatever is
 * exported here. The first two/three are CONTROLS (expected to reproduce the known
 * failures); the rest are plausible winners suggested by the v2 diagnosis.
 */
export const ESCAPE_CANDIDATES: EscapeCandidate[] = [
  {
    id: 'raw-json',
    title: 'raw JSON.stringify, NO AMCP escaping',
    note: 'CONTROL — inner quotes are unescaped; should break the AMCP token. Baseline.',
    encodeArg: (json) => wrap(json),
  },
  {
    id: 'quotes-only',
    title: 'escape only " → \\" (leave backslashes literal)',
    note: 'CONTROL — the failed PR #245 rule. Expect newline/quote/backslash to fail.',
    encodeArg: (json) => wrap(escQuotesOnly(json)),
  },
  {
    id: 'backslash-quote',
    title: 'escape \\ → \\\\ and " → \\" (original double-escape)',
    note: 'CONTROL — the original pre-#245 rule. B-041 reported it failed too; confirm.',
    encodeArg: (json) => wrap(escBackslashQuote(json)),
  },
  {
    id: 'structural-quotes-only',
    title: 'escape only the structural " ; keep JSON’s own \\-escapes intact',
    note: 'Leaves the JSON’s `\\"` / `\\\\` / `\\n` untouched so they reach CasparCG as-is.',
    encodeArg: (json) => wrap(escStructuralQuotesOnly(json)),
  },
  {
    id: 'quotes-only+uXXXX-controls',
    title: 'quotes-only, but control chars as \\uXXXX (pre-compensate \\n→newline)',
    note: 'No bare backslash-n for CasparCG to turn into a raw newline; JSON.parse still decodes \\u000a.',
    encodeArg: (json) => wrap(escQuotesOnly(unicodeEscapeControls(json))),
  },
  {
    id: 'backslash-quote+uXXXX-controls',
    title: 'backslash+quote, but control chars as \\uXXXX',
    note: 'Double-escape variant that also removes bare backslash-n via \\uXXXX.',
    encodeArg: (json) => wrap(escBackslashQuote(unicodeEscapeControls(json))),
  },
  {
    id: 'structural-quotes+uXXXX-controls',
    title: 'structural-quote-only + control chars as \\uXXXX',
    note: 'Minimal AMCP escaping (structural quotes) plus newline carried as \\u000a.',
    encodeArg: (json) => wrap(escStructuralQuotesOnly(unicodeEscapeControls(json))),
  },
];

// ── evaluation (harness-side, knows the original) ────────────────────────────

export interface CharClassResult {
  cls: HardKey;
  label: string;
  expected: string;
  actual: string | null;
  pass: boolean;
}

export interface CandidateEval {
  id: string;
  /** Did `window.update` fire (a beacon update was observed for this candidate)? */
  fired: boolean;
  /** Did the template's `JSON.parse(received)` succeed (the on-air failure mode)? */
  parseOk: boolean;
  /** Is the received string byte-exact equal to `JSON.stringify(HARD_PAYLOAD)`? */
  byteExact: boolean;
  /** Per-character-class PASS/FAIL (the value survived to JSON.parse equal). */
  classes: CharClassResult[];
  /** fired AND parseOk AND every class passed — i.e. THIS candidate is the rule. */
  allPass: boolean;
  /** Raw string `window.update` received (null = never fired). */
  received: string | null;
}

/**
 * Evaluate what the template's `window.update` received for a candidate against the
 * original payload — per character class, byte-exact. `received === null` means no
 * update fired (e.g. a broken token CasparCG rejected, or the page never loaded).
 */
export function evaluateReceived(id: string, received: string | null): CandidateEval {
  const keys = Object.keys(HARD_PAYLOAD) as HardKey[];
  if (received === null) {
    return {
      id,
      fired: false,
      parseOk: false,
      byteExact: false,
      allPass: false,
      received: null,
      classes: keys.map((cls) => ({
        cls,
        label: CLASS_LABEL[cls],
        expected: HARD_PAYLOAD[cls],
        actual: null,
        pass: false,
      })),
    };
  }

  let parsed: Record<string, unknown> | null = null;
  let parseOk = false;
  try {
    parsed = JSON.parse(received) as Record<string, unknown>;
    parseOk = true;
  } catch {
    parseOk = false;
  }

  const classes: CharClassResult[] = keys.map((cls) => {
    const expected = HARD_PAYLOAD[cls];
    const actual =
      parseOk && parsed !== null && typeof parsed[cls] === 'string'
        ? (parsed[cls] as string)
        : null;
    return { cls, label: CLASS_LABEL[cls], expected, actual, pass: actual === expected };
  });

  return {
    id,
    fired: true,
    parseOk,
    byteExact: received === expectedJson(),
    classes,
    allPass: parseOk && classes.every((c) => c.pass),
    received,
  };
}
