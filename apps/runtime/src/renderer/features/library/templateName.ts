import type { TemplateInfo } from '@cg/shared-ipc';

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
 */

/** A name is "usable" only if it survives a trim — `ManifestSchema.name` has no `.min(1)`. */
function usable(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * `news-lower-third.vcg` → `news lower third`.
 *
 * Strips the `.vcg` extension and turns the separators an operator types (`-`, `_`) into
 * spaces. **Case is left exactly as it was**: these names are routinely Persian, or mixed
 * Persian/English, and title-casing them would corrupt the text — there is no correct
 * "capitalize" for an Arabic-script string, and imposing one on the Latin half would make
 * the two halves disagree.
 */
export function cleanFileName(fileName: string | undefined): string | undefined {
  if (fileName === undefined) return undefined;
  // Trim FIRST: the extension anchors to the end of the string, so a stray trailing space
  // would otherwise leave ".vcg" in the operator's label.
  const withoutExt = fileName.trim().replace(/\.vcg$/i, '');
  const spaced = withoutExt.replace(/[-_]+/g, ' ');
  // Collapse the runs a separator sweep can leave behind, and trim the edges.
  return usable(spaced.replace(/\s+/g, ' '));
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

/**
 * The ONE priority rule over the raw naming facts, for callers that hold them
 * without a full `TemplateInfo` — R-028's fixed-row binding carries
 * `{ templateName, sourceFileName }` over the wire precisely so the label is
 * resolved HERE, never by a second bridge-side copy of this rule.
 * `undefined` when neither fact is usable (the caller picks its fallback).
 */
export function displayLabel(parts: {
  name?: string | undefined;
  sourceFileName?: string | undefined;
}): string | undefined {
  return cleanFileName(parts.sourceFileName) ?? usable(parts.name);
}

/**
 * What the operator reads for a registered template, on EVERY surface — the Library card,
 * the stack row, the Inspector header.
 *
 * Never returns the `templateId`. A template with no file and no usable name is labelled in
 * words; showing a UUID as a label is the bug this replaced.
 */
export function templateDisplayName(template: TemplateInfo): string {
  return displayLabel(template) ?? 'Unnamed template';
}
