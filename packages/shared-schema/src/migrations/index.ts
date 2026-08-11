/**
 * Scene-schema migration registry.
 *
 * 🔴 **NOTHING IN PRODUCTION CALLS `migrate()`. Do NOT register a migration here
 * expecting it to run — it will not.** This docstring used to claim that "the
 * loader in `@cg/vcg-format` walks the registry"; that was false and it cost two
 * changes real time. Measured 2026-08-11: `packages/vcg-format/` contains no
 * reference to `migrations` at all, the only importers of this module are this
 * package's own tests, and `schemaVersion` is WRITTEN by `ProjectStore.ts` and
 * `pack.ts` but read back only as `z.literal(1)` — so a document with any other
 * version FAILS TO PARSE rather than entering a conversion, and the walker's
 * `while (version < CURRENT_SCHEMA_VERSION)` loop can never execute a step.
 *
 * **The mechanism that DOES run is parse-time normalization** — a `z.preprocess`
 * on the schema itself, as `PlayoutSchema` does for its legacy `mode` key and
 * `SceneSchema` does for the legacy `background` key (B-129). It runs on every
 * load path for free, because every load path parses.
 *
 * The delete-vs-wire-it-up decision is filed as `P-031` in `docs/prd/platform.md`.
 *
 * Migrations operate on raw JSON (unknown), not parsed types — that's the
 * whole point: parsing the current schema is what they would enable, if one ran.
 */

export interface SchemaMigration<From = unknown, To = unknown> {
  from: number;
  to: number;
  up(raw: From): To;
}

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const migrations: SchemaMigration[] = [
  // Example shape (when we have a v2):
  //
  // {
  //   from: 1,
  //   to: 2,
  //   up(raw) {
  //     // mutate / reshape raw to v2 form
  //     return raw;
  //   },
  // },
];

/**
 * Walk migrations from the input's `schemaVersion` to `CURRENT_SCHEMA_VERSION`.
 * Throws if no path exists; returns the input unchanged when versions match.
 */
export function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Cannot migrate: input is not an object');
  }
  const versioned = raw as { schemaVersion?: unknown };
  const observed = typeof versioned.schemaVersion === 'number' ? versioned.schemaVersion : 1;

  let current: unknown = raw;
  let version = observed;
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === version);
    if (!step) {
      throw new Error(`No migration registered from schema v${version} to v${version + 1}`);
    }
    current = step.up(current);
    version = step.to;
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Schema v${version} is newer than the loader's current v${CURRENT_SCHEMA_VERSION}. Update the Runtime.`,
    );
  }

  return current;
}
