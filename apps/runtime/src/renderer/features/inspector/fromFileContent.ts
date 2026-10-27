import type { FileSourceCapableField } from '@cg/shared-schema';
/**
 * Keep Runtime's established helper names while the canonical transforms live
 * in shared-schema, so Designer preview and playout interpret identical bytes.
 */
export {
  fileSourceContentToFieldValue as contentToFieldValue,
  parseFileDelimiter as parseDelimiter,
  splitFileSourceContent as splitContent,
} from '@cg/shared-schema';

/**
 * R-018 — pure transforms from a text file's content to a field value. Kept
 * React-free and DOM-free so they unit-test in the node env against a fake
 * {@link import('./textFileSource.js').TextFileSource}.
 *
 * VERBATIM IS THE CONTRACT. File content is newsroom copy that goes on air:
 * it is NEVER trimmed (split mode's per-entry trim is the one documented
 * exception), never digit-normalized (`latinDigits` is for numeric INPUT
 * fields — R-020; applying it here would silently rewrite Persian digits in
 * broadcast copy), and never otherwise transformed. Whole-file mode is the
 * DEFAULT because it is the incumbent Cinegy workflow: the typist embeds the
 * separators, and the whole file IS the content.
 */

/**
 * The field kinds a text file can feed.
 *
 * DERIVED, not re-listed (golden rule 6). It used to spell `'text' | 'multiline' |
 * 'list'` here while `Inspector.tsx` spelled the same three inline in its gate —
 * two copies of one rule, which is how an outer gate comes to admit a kind the
 * inner one refuses. `@cg/shared-schema` now owns the list once, as the variants
 * that can carry the authored `allowFileSource` grant, and both read it from there.
 */
export type FromFileFieldKind = FileSourceCapableField['type'];

/** How list-field content is (optionally) split into items. */
export type { FileSourceSplitConfig as SplitConfig } from '@cg/shared-schema';
