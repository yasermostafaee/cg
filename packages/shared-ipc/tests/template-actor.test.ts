import { describe, expect, it } from 'vitest';
import { normalizeActor, TEMPLATE_ACTOR, UNATTRIBUTED_ACTOR } from '../src/ws-frame.js';

/**
 * 🔴 `SELF-STOP-24` §2.3 / §0.8 — **A PLAYOUT VERB WITH A NON-OPERATOR ACTOR.**
 *
 * The audit models the actor as one free string resolved at one site, and outside a control
 * request it answers {@link UNATTRIBUTED_ACTOR}. There was no non-operator actor before this:
 * a bridge-initiated append was simply unattributed.
 *
 * That is not good enough for a template's own stop. "Unattributed" would put it in the same
 * bucket as housekeeping, and the ONE question this row exists to answer is *why did that row
 * come off air when nobody touched it*. So there is a reserved value — and it has to be
 * reserved rather than conventional, because a console's name is typed by a human who is free
 * to type anything.
 *
 * ⚠ **The ACTION stays `stop`.** It is the same verb reaching air by the same path; only who
 * asked differs, which is exactly what an actor field is for. `PLAYOUT_VERBS` gains no entry and
 * `AuditEntrySchema.action` gains no member.
 */

describe('SELF-STOP-24 — the template actor is reserved', () => {
  it('is distinct from the unattributed default', () => {
    // If these collided, a template's stop and a housekeeping append would read identically,
    // which is the whole reason the constant exists.
    expect(TEMPLATE_ACTOR).not.toBe(UNATTRIBUTED_ACTOR);
  });

  it('a console CANNOT claim it from the wire', () => {
    expect(normalizeActor(TEMPLATE_ACTOR)).toBe(UNATTRIBUTED_ACTOR);
  });

  it('the refusal survives the tricks a name is normalised through', () => {
    // `normalizeActor` trims and truncates before comparing, so a reserved-value check placed
    // before that work would be defeated by a space or a tab.
    expect(normalizeActor(`  ${TEMPLATE_ACTOR}  `)).toBe(UNATTRIBUTED_ACTOR);
    expect(normalizeActor(`\t${TEMPLATE_ACTOR}\n`)).toBe(UNATTRIBUTED_ACTOR);
  });

  it('is refused case-insensitively', () => {
    // A console named `Template` is not a template, and a record where the two differ only by
    // a capital letter is a record that cannot be read under pressure.
    expect(normalizeActor(TEMPLATE_ACTOR.toUpperCase())).toBe(UNATTRIBUTED_ACTOR);
    expect(normalizeActor('TeMpLaTe')).toBe(UNATTRIBUTED_ACTOR);
  });

  it('does not refuse a name that merely CONTAINS it', () => {
    // The reserved value is the whole name, not a banned substring. Refusing "Template Suite 2"
    // would be a console silently losing its own name for no reason it could discover.
    expect(normalizeActor('Template Suite 2')).toBe('Template Suite 2');
    expect(normalizeActor('gallery-template')).toBe('gallery-template');
  });

  it('leaves every ordinary console name exactly as it was', () => {
    expect(normalizeActor('Gallery 2')).toBe('Gallery 2');
    expect(normalizeActor('  Gallery 2  ')).toBe('Gallery 2');
    expect(normalizeActor('')).toBe(UNATTRIBUTED_ACTOR);
    expect(normalizeActor(undefined)).toBe(UNATTRIBUTED_ACTOR);
  });
});
