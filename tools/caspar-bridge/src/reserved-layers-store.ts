import * as fs from 'node:fs';
import { MAX_RESERVED_LAYER, ReservedLayersSchema, type ReservedLayers } from '@cg/shared-ipc';

/**
 * R-028 / C-015 — bridge-side loading of the RESERVED playout layers: the
 * ranges the company's playout system owns (it binds templates to playlist
 * videos and drives them over AMCP directly, outside this project). This is
 * the playout split's ONLY mechanism — ownership can never be inferred from
 * the wire (OSC reports producer KIND, not identity, so a playout graphic and
 * one of ours are indistinguishable there), so it must be DECLARED here.
 *
 * Same doctrine as `fixed-layers-store.ts`, for the same reason: a reserved
 * file that is PRESENT but unusable (unreadable, bad JSON, schema-invalid) is
 * a HARD startup failure, never a warning. Silently ignoring it would boot the
 * bridge with an EMPTY reservation while the operator believes the playout
 * range is fenced — and the very next allocation could put one of our graphics
 * on top of the company's playout output. An ABSENT file is the normal
 * nothing-reserved case and changes nothing.
 *
 * DEPLOYMENT INVARIANT (the R-021 b′ class): every station sharing one
 * CasparCG must declare the SAME reserved ranges, and the declaration must
 * match what the playout team actually uses. One bridge cannot see another's
 * config — this is a C-009 operator-contract requirement, not a validatable
 * one.
 */

/** A reserved-layers file that is present but unusable (hard startup failure). */
export class ReservedLayersFileError extends Error {
  override readonly name = 'ReservedLayersFileError';
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`reserved-layers file ${file} is present but unusable: ${reason}`);
  }
}

/**
 * Load the declared reserved ranges. ABSENT file → null (nothing reserved).
 * PRESENT but unusable → {@link ReservedLayersFileError} (see header).
 */
export function loadReservedLayers(filePath: string): ReservedLayers | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ReservedLayersFileError(filePath, err instanceof Error ? err.message : String(err));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ReservedLayersFileError(
      filePath,
      `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const result = ReservedLayersSchema.safeParse(parsed);
  if (!result.success) {
    throw new ReservedLayersFileError(filePath, `schema-invalid: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Parse the CLI's `--reserved-layers` value (e.g. `60-69` or `60-69,105`)
 * into declared ranges. Throws a plain Error naming the bad token — the CLI
 * surfaces it as a boot failure, consistent with the file doctrine above.
 */
export function parseReservedLayersFlag(value: string): ReservedLayers {
  const ranges: ReservedLayers['ranges'] = [];
  for (const token of value.split(',')) {
    const trimmed = token.trim();
    if (trimmed === '') continue;
    const match = /^(\d+)(?:-(\d+))?$/.exec(trimmed);
    if (match === null) {
      throw new Error(
        `--reserved-layers: cannot parse "${trimmed}" — expected a layer number or a ` +
          `from-to range like 60-69`,
      );
    }
    const from = Number(match[1]);
    const to = match[2] !== undefined ? Number(match[2]) : from;
    if (to < from) {
      throw new Error(`--reserved-layers: range "${trimmed}" runs backwards (to < from)`);
    }
    if (to > MAX_RESERVED_LAYER) {
      throw new Error(
        `--reserved-layers: range "${trimmed}" exceeds layer ${String(MAX_RESERVED_LAYER)} — ` +
          `a typo'd range must fail legibly, never expand`,
      );
    }
    ranges.push({ from, to });
  }
  return { ranges };
}
