import { sha256Hex } from './integrity.js';

/**
 * 🔴 `B-352` — **ONE PACKAGE ID PER COMPOSITION, THE SAME ON EVERY RE-EXPORT.**
 *
 * A Designer export flattens the chosen composition into the package's root, and the root kept the
 * PROJECT's `scene.id` — so every composition exported from one project carried one `manifest.id`.
 * CG Control lists templates by that id (`TemplateInfo.templateId`), and each import replaced the
 * one before it: the owner could not have two outputs of one project side by side.
 *
 * The id is derived, never stored: SHA-256 over the project id and the composition id, written in
 * the shape of a UUID (version nibble `8`, "custom"; RFC 4122 variant), so it is safe everywhere a
 * template id travels — a served URL, a file name, an AMCP argument. The same composition exported
 * again gets the same id, so a re-export still UPDATES its template in CG Control (its Source
 * defaults and its page rebuild intact); another composition, or a project saved as a copy (a new
 * project id), gets another.
 */
export function compositionPackageId(projectId: string, compositionId: string): string {
  // JSON, not a separator: two ids joined by any character could collide with two other ids.
  const hex = sha256Hex(JSON.stringify(['cg-package', projectId, compositionId]));
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
