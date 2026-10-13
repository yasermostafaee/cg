import { fieldAllowsFileSource, type AggregatedFields } from '@cg/shared-schema';
import { fieldPathKey } from './listFieldTargets.js';

/**
 * TEXT-FILE-OPT-01 — every field path in a template whose AUTHOR granted it a file
 * source, as `fieldPathKey` strings.
 *
 * ── WHY IT WALKS THE AGGREGATE AND NOT THE SCENE ────────────────────────────────
 *
 * The Runtime never holds the scene: it holds `TemplateInfo`, whose `fields` +
 * `groups` ARE the operator's form (`aggregateCompositionFields` produced them at
 * import). `FieldEditor` renders a root field at `[f.id]` and `FieldGroup` recurses
 * into `group.aggregate` at `[...prefix, group.name]` — so walking that same
 * structure the same way is the only way the paths this produces and the paths the
 * Inspector renders cannot disagree.
 *
 * ⚠ That equivalence is load-bearing, not tidiness: the ONE consumer of this set
 * DELETES the attachments whose path is missing from it (`detachUngrantedSources`).
 * A walk that skipped a namespace would report its granted fields as un-granted and
 * detach a file the operator is using. If `FieldEditor`/`FieldGroup` ever change how
 * a path is composed, this changes in the same commit.
 *
 * The Inspector's own `aggregateHasFields` filter is deliberately NOT mirrored here:
 * a group it drops has no fields anywhere in its subtree, so it contributes no paths
 * either way, and re-deriving the filter would be a second copy of a rule that
 * cannot change the answer.
 */
export function grantedFileSourcePaths(
  aggregate: AggregatedFields,
  prefix: readonly string[] = [],
  out = new Set<string>(),
): Set<string> {
  for (const field of aggregate.fields) {
    if (fieldAllowsFileSource(field)) out.add(fieldPathKey([...prefix, field.id]));
  }
  for (const group of aggregate.groups) {
    grantedFileSourcePaths(group.aggregate, [...prefix, group.name], out);
  }
  return out;
}
