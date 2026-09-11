import { normalizeDigits } from './NumericInput.js';

/**
 * 🔴 `SETTINGS-MATCH-02` §10 — **WHAT A NUMERIC OR ADDRESS FIELD MAY HOLD.**
 *
 * Owner: a numeric field and an address field must not accept letters and the like. This is
 * the one place that rule is written down, so a second field cannot spell it differently.
 *
 * ── ⚠ IT NEVER REPLACES A BRIDGE REFUSAL ────────────────────────────────────
 *
 * Every refusal CONDITION is unchanged and the bridge stays authoritative: it re-validates
 * the whole config, it owns the band's overlap rules, and it owns the ranges. What this adds
 * is that nonsense does not have to travel to the bridge and back to be refused — and, more
 * importantly, that a field cannot silently hold something it cannot mean.
 *
 * ── 🔴 §10.1 — THE CONTRACT TABLE, READ FROM THE SCHEMA RATHER THAN FROM THE SAMPLE ──────
 *
 * `192.168.21.114` LOOKS like an IP. It is not one, by contract, and locking the field to
 * digits and dots would break every installation that names its servers:
 *
 * | field                        | `@cg/shared-ipc` says                          | so it is |
 * | ---------------------------- | ---------------------------------------------- | -------- |
 * | Host address (A and B)       | `host: z.string().min(1)`                      | ADDRESS  |
 * | Template host                | `templateServeHost: z.string().optional()`     | ADDRESS  |
 * | AMCP port                    | `amcpPort: z.number().int().positive()`        | NUMERIC  |
 * | OSC port                     | `oscPort: z.number().int().nonnegative()`      | NUMERIC  |
 * | Template port                | `templateServePort: int 0–65535 .optional()`   | NUMERIC  |
 * | Device index / Key device    | `device: z.number().int().positive()`          | NUMERIC  |
 * | Route channel / layer        | `int().positive()` / `int().nonnegative()`     | NUMERIC  |
 * | First / Last layer (band)    | `int().nonnegative().max(MAX_LIVE_SOURCE_LAYER)` | NUMERIC |
 *
 * ⭐ **Three of the eight are ADDRESSES and letters are legal in them**, which is exactly the
 * inference §10.1 forbids: `isLoopbackHost` itself accepts `localhost` and `::1`, so a
 * digits-and-dots rule would refuse two values the product already treats as correct.
 *
 * ── 🔴 §10.2 — NORMALISE, THEN CONSTRAIN ────────────────────────────────────
 *
 * On a Persian keyboard the digit keys emit `۰۱۲۳۴۵۶۷۸۹` (U+06F0–U+06F9); an Arabic layout
 * emits `٠١٢٣٤٥٦٧٨٩` (U+0660–U+0669). Both are digits to the operator and neither is ASCII.
 * A naive "drop everything that is not `[0-9]`" makes these fields **untypeable for the people
 * this console is built for**, and accepting them raw sends `۵۲۵۰` to the bridge to fail
 * somewhere far from here. So every function below normalises FIRST (`latinDigits`, the same
 * helper the render path uses) and constrains second.
 */

/** Persian `٫` and the Arabic thousands mark have no place in a port or an index. */
const NON_DIGIT = /[^0-9]/g;

/**
 * §10.3 — a NUMERIC field's value: Persian/Arabic-Indic digits → ASCII, then digits only.
 *
 * ⚠ **VALUE-level, never keystroke-level.** `preventDefault` on keydown breaks paste,
 * Ctrl+A/C/V, the arrows, Home/End, undo and selection — and is how "the field ate my
 * characters" is born. Running on the VALUE covers typing and paste with one rule, because
 * both deliver the whole value to `onChange`.
 */
export function digitsOnly(raw: string): string {
  return normalizeDigits(raw).replace(NON_DIGIT, '');
}

/**
 * §10.4 — an ADDRESS field's value: digits normalised, and the whitespace a paste carries
 * removed. **Nothing else is touched.**
 *
 * 🔴 **IT NORMALISES; IT DOES NOT SANITISE — and the first spelling of this did, which was
 * wrong in a way a test caught.** Stripping "characters no host can contain" turned a pasted
 * `http://192.168.21.114/x` into `http:192.168.21.114x`: a string that is not what the
 * operator pasted, not a host, and no longer legible enough for him to see what went wrong.
 * A numeric field may drop a letter because there is exactly one thing it can mean; an
 * address field cannot, because the operator's own text is the value.
 *
 * ⚠ And the colon is why the removal could not be made to work anyway: `::1` and `[::1]` are
 * hosts this product already accepts (`isLoopbackHost`), so a colon has to survive — at which
 * point `http://…` survives too, half-mangled. So malformed text STAYS VISIBLE and
 * {@link hostError} says what is wrong with it, inline, beside the field.
 *
 * Whitespace is the one exception: a trailing space arrives with almost every pasted address
 * and is never meant.
 */
export function hostValue(raw: string): string {
  return normalizeDigits(raw).replace(/\s/g, '');
}

/**
 * §10.3 — is this port text acceptable, and if not, the ONE sentence to show beside it.
 *
 * ⚠ **Out of range is a REFUSAL, never a silent clamp.** `70000` is not quietly rewritten to
 * `65535`: the operator typed a number, and a field that changes it without saying so is a
 * field he cannot trust with the next one.
 */
export function portError(
  raw: string,
  { min, label, blankAllowed = false }: { min: number; label: string; blankAllowed?: boolean },
): string | null {
  const value = raw.trim();
  if (value === '') {
    return blankAllowed
      ? null
      : `${label} is required — it is how this console reaches the server.`;
  }
  if (!/^\d+$/.test(value)) {
    return `${label} is a number between ${String(min)} and 65535.`;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > 65535) {
    return `${label} is out of range — it must be between ${String(min)} and 65535.`;
  }
  return null;
}

/** §10.3 — a positive integer field (a device index, a route channel). */
export function indexError(
  raw: string,
  { label, min = 1, blankAllowed = false }: { label: string; min?: number; blankAllowed?: boolean },
): string | null {
  const value = raw.trim();
  if (value === '') {
    return blankAllowed ? null : `${label} is required.`;
  }
  if (!/^\d+$/.test(value)) return `${label} is a whole number.`;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    return `${label} must be ${min === 0 ? 'zero or more' : String(min) + ' or more'}.`;
  }
  return null;
}

/**
 * §10.4 — is this host text acceptable, and if not, the sentence to show beside it.
 *
 * It answers only the two questions the renderer can answer: is there anything there, and is
 * what is there shaped like a host at all. Whether it RESOLVES, and whether CasparCG can be
 * reached on it, belongs to the bridge.
 */
export function hostError(
  raw: string,
  { label, blankAllowed = false }: { label: string; blankAllowed?: boolean },
): string | null {
  const value = raw.trim();
  if (value === '') {
    return blankAllowed
      ? null
      : `${label} is required — a name or an address, e.g. 192.168.21.114.`;
  }
  if (/\s/.test(value)) return `${label} cannot contain a space.`;
  /*
    The charset an address can be written in: a hostname's letters, digits, dots and hyphens,
    plus the colons and brackets of an IPv6 literal. This is where a pasted URL is caught —
    `hostValue` deliberately leaves it visible rather than mangling it into something that
    looks like a host (see its note).
  */
  if (!/^[A-Za-z0-9._:[\]-]+$/.test(value)) {
    return `${label} is a name or an address, not a URL — letters, digits, dots and hyphens.`;
  }
  return null;
}
