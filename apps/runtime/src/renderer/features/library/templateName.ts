/**
 * R-004 — how a template's human-readable label is derived at import and resolved at
 * display. One rule, both directions, so they cannot drift apart.
 *
 * The label is DISPLAY-ONLY. `templateId` stays the sole identity (registry key, stack
 * item's `templateId`, the served `/template/<id>` URL) and the label never reaches an AMCP
 * argument.
 *
 * The priority, and why:
 *
 *  1. **The imported file name**, cleaned. It is the one string the operator actually chose
 *     and the one they recognise. R-004's original manifest-name rule looked right in
 *     testing (the bundled starters carry real names) and failed on real packages: only ONE
 *     human name survives into a `.vcg` — the entry COMPOSITION's — and that is frequently a
 *     Designer-internal label, or blank, in which case the row fell all the way back to a
 *     raw UUID.
 *  2. **The manifest/scene name.** A bundled starter has no file, and its label is real.
 *  3. **Never the id.** A UUID is not a name. A row with neither a file nor a name says so
 *     in words rather than showing an identifier the operator cannot act on.
 *
 * Kept React-free so it is unit testable on its own.
 *
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — `cleanFileName`, `displayLabel` and `templateDisplayName` MOVED
 * to `@cg/shared-ipc` (`operator-naming.ts`): CG Bridge searches the audit by what a row shows, so it
 * must word a template exactly as the console does. They are re-exported here, unchanged — one
 * implementation.
 */
export { cleanFileName, displayLabel, templateDisplayName } from '@cg/shared-ipc';

/** A name is "usable" only if it survives a trim — `ManifestSchema.name` has no `.min(1)`. */
function usable(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Pick the display name to record on `TemplateInfo` at import: the manifest's name, else
 * the scene's. Returns `undefined` when neither is usable — the caller OMITS the key.
 *
 * This is the FALLBACK now, not the primary: the file name outranks it (see above).
 */
export function pickTemplateName(
  manifestName: string | undefined,
  sceneName: string | undefined,
): string | undefined {
  return usable(manifestName) ?? usable(sceneName);
}
