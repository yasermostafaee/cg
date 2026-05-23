/**
 * Scene-schema migration registry.
 *
 * v1 is the initial schema; there are no migrations yet. As schema-breaking
 * changes accrue, register a new `SchemaMigration` here with `from = N` and
 * `to = N + 1`, and bump `CURRENT_SCHEMA_VERSION`. The loader in
 * `@cg/vcg-format` walks the registry from the loaded version to current.
 *
 * Migrations operate on raw JSON (unknown), not parsed types — that's the
 * whole point: parsing the current schema is what they enable.
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
