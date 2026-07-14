import type { TemplateInfo } from '@cg/shared-ipc';

/**
 * R-004 — how a template's human-readable name is derived at import and resolved at
 * display. Two directions, one rule, so they cannot drift apart.
 *
 * The name is DISPLAY-ONLY. `templateId` stays the sole identity (registry key, stack
 * item's `templateId`, the served `/template/<id>` URL) and the name never reaches an
 * AMCP argument.
 *
 * Kept React-free so it is unit testable on its own.
 */

/** A name is "usable" only if it survives a trim — `ManifestSchema.name` has no `.min(1)`. */
function usable(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Pick the display name to record on `TemplateInfo` at import: the manifest's name, else
 * the scene's. Returns `undefined` when neither is usable — the caller OMITS the key, and
 * the UI falls back to the id.
 */
export function pickTemplateName(
  manifestName: string | undefined,
  sceneName: string | undefined,
): string | undefined {
  return usable(manifestName) ?? usable(sceneName);
}

/**
 * Resolve what the operator reads for a registered template. Falls back to the id, so a
 * row can never render an empty primary line — including for a `TemplateInfo` registered
 * before this field existed (the schema keeps `name` optional for exactly that reason).
 */
export function templateDisplayName(template: TemplateInfo): string {
  return usable(template.name) ?? template.templateId;
}
