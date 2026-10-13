import * as os from 'node:os';
import type { ConnectionConfig } from '@cg/shared-ipc';
import type { TemplateServeOverride } from './template-http-server.js';

/**
 * `C-024` — **THE THREE-LAYER RESOLUTION OF THE ADVERTISED TEMPLATE ADDRESS, IN ONE PLACE.**
 *
 * `B-162` gave the bridge `--template-serve-host` / `--template-serve-port` and left them with no
 * stored layer, so the address had to be re-typed at every start (`bin/caspar-bridge.mjs` says so
 * in its own comment). This module adds the middle layer and — more importantly — puts the
 * PRECEDENCE in one function that every derivation point calls, rather than in each of them.
 *
 * The order is `R-010`'s, unchanged for every other bridge store:
 *
 *     explicit command-line flag  >  persisted connection config  >  built-in derivation
 *
 * ⚠ **It lives here rather than in `template-http-server.ts` because, when it was written, that
 * file was in `.claude/never-stage`** while the owner's plant-testing `guessLanHost()` pin sat in
 * it uncommitted (`P-035`). `deriveServeOptions` already takes an override, so the whole
 * three-layer rule composes ABOVE that seam. The pin and the never-stage entry were both removed
 * on 2026-09-04 (`LAN-DEV-ACCESS-01`); the split stays because it is the right seam, not because
 * the file is still off-limits.
 */

/**
 * 🔴 **THE ONE NORMALIZER. EMPTY MEANS "DERIVE IT" — IT IS NOT AN ADDRESS.**
 *
 * `undefined` (never stored) and `''` (stored, then cleared) are DIFFERENT VALUES that must produce
 * the IDENTICAL outcome: fall through to the next layer. They are kept distinct in the schema on
 * purpose — the panel has to be able to clear the field, so `''` must round-trip through the store
 * — and they are collapsed exactly here, once, at the moment the question becomes "what address do
 * we advertise?".
 *
 * Getting this wrong in either direction is a real failure this repo has paid for:
 *
 * - Fold `''` to `undefined` at the SCHEMA and the operator can never clear a serve host back to
 *   the derivation; the field becomes write-once.
 * - Treat `''` as an ADDRESS and the bridge advertises `http://:7911/template/<id>`, which every
 *   server accepts at `CG ADD` and none can fetch — `B-162`'s exact silent failure, arrived at from
 *   the surface built to prevent it.
 *
 * Whitespace is trimmed for the same reason: a serve host of `' '` is a typo, not an address.
 */
export function normalizeServeHost(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * The port's half of the same rule. `undefined` is "derive it" (an ephemeral bind).
 *
 * ⚠ `0` IS A VALUE, not an absence, and must survive: it is the explicit spelling of "ephemeral",
 * the same reading `oscPort` already gives it. A `?? 0` written anywhere on this path would be
 * indistinguishable from the derivation and would hide a deliberate pin — the numeric shape of the
 * empty-vs-absent confusion above.
 */
export function normalizeServePort(raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  return Number.isInteger(raw) && raw >= 0 && raw <= 65535 ? raw : undefined;
}

/** The serve address a `ConnectionConfig` stores, normalized. */
export function storedServeOverride(config: ConnectionConfig): TemplateServeOverride {
  const serveHost = normalizeServeHost(config.templateServeHost);
  const port = normalizeServePort(config.templateServePort);
  return {
    ...(serveHost !== undefined ? { serveHost } : {}),
    ...(port !== undefined ? { port } : {}),
  };
}

/**
 * 🔴 **THE PRECEDENCE, WRITTEN ONCE. FLAGS LAST, SO FLAGS WIN.**
 *
 * Called from BOTH derivation points — the constructor and `#applyConfig` — rather than each of
 * them spreading two objects in whatever order looked right at the time. Golden rule 6's shape: a
 * precedence rule with two implementations is a precedence rule that will one day disagree with
 * itself, and the disagreement here is invisible (both spellings produce *an* address; only one
 * produces the right one).
 *
 * ⚠ **The spread order is the whole contract.** `flags` is last, so any field it defines overrides
 * the stored one. Reversing it would let a value saved from a panel silently beat a flag a boot
 * script passed — the inverse of the confusion `B-162` just fixed, and undetectable from any
 * surface, because the resulting address is perfectly well-formed.
 *
 * Note this merges FIELD BY FIELD, not object by object: a `--template-serve-port` with no
 * `--template-serve-host` masks the port and leaves the stored host in force. That is what the
 * panel then has to report, one field at a time.
 */
export function resolveServeOverride(
  stored: TemplateServeOverride,
  flags: TemplateServeOverride,
): TemplateServeOverride {
  return { ...stored, ...flags };
}

/**
 * `C-024` — this machine's non-internal IPv4 addresses, so the operator PICKS instead of typing.
 *
 * ⚠ **CANDIDATES, NEVER A VERDICT — and the ordering here is not a ranking.** This is the same
 * enumeration `guessLanHost()` walks; the only difference is that it returns ALL of them instead of
 * silently committing to the first. That silent commit is the defect: on a box with Hyper-V, WSL,
 * VPN or Docker adapters the first non-internal IPv4 is routinely not the interface the plant can
 * reach, and the failure it produces has no surface at all.
 *
 * So this function deliberately does NOT sort, score or recommend. The bridge cannot know which
 * address the plant routes to — only the operator can — and a list that implied otherwise would
 * reproduce `guessLanHost()`'s mistake with more confidence behind it. Every surface rendering
 * these must say they are candidates.
 *
 * Deduplicated, because an interface reporting the same address twice is noise rather than choice.
 */
export function detectServeHostCandidates(): readonly string[] {
  const seen = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) seen.add(a.address);
    }
  }
  return [...seen];
}
