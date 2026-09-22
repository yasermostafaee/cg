import { z } from 'zod';
import { defineChannel } from '../channel.js';

/**
 * 🔴 `C-037` / [ADR 0010](../../../../docs/adrs/0010-playout-link.md) — **WHO IS ON THIS
 * SOCKET, and the one sentence a socket without an answer gets.**
 *
 * Until now the control socket had no principal at all: `ws-frame.ts` says so in as many
 * words — `actor` is _"SELF-DECLARED and UNVERIFIED … the control socket is unauthenticated
 * loopback"_ — and the bridge served every socket that arrived. A socket now establishes its
 * principal by sending an {@link WsAuthFrame} carrying a Playout-issued JWT, which the bridge
 * verifies OFFLINE (ES256, against the Playout's cached JWKS).
 *
 * ── WHY THE PRINCIPAL IS A CHANNEL AS WELL AS A FRAME ───────────────────────
 *
 * The frame is how the TOKEN arrives; it is deliberately not a channel, so that no route
 * table, no census and no permission class ever has to carve out the one door that has to be
 * open before there is anybody to authorise. {@link AuthStateChannel} is how the console
 * READS what the bridge decided — and a read is exactly what a channel is for. The console
 * may show the D1 `principal` echo for immediacy, but once the bridge has answered, what the
 * bridge says is what is displayed: the browser's copy is convenience, the bridge's is the
 * verified one.
 */

/** One `{ host, channel }` grant, spelled exactly as the bridge addresses that server. */
export const PlayoutChannelGrantSchema = z.object({
  host: z.string().min(1),
  channel: z.number().int().positive(),
});
export type PlayoutChannelGrant = z.infer<typeof PlayoutChannelGrantSchema>;

/**
 * The channels a principal may OPERATE — the contract's `cg_channels` claim, verbatim in
 * shape: a list of `{host, channel}` pairs, or the string `"*"` for every channel.
 *
 * ⚠ Carried here from day one even though nothing reads it yet: `C-038` is the item that
 * gates on it, and a principal shape that had to grow a field later would mean every stored
 * and published copy of it changing at the same time.
 */
export const PlayoutChannelsSchema = z.union([z.literal('*'), z.array(PlayoutChannelGrantSchema)]);
export type PlayoutChannels = z.infer<typeof PlayoutChannelsSchema>;

/**
 * What the bridge VERIFIED about the operator on this socket.
 *
 * 🔴 Every field here came out of a signature check. Nothing on it is self-declared, which is
 * the whole difference between this and the `actor` field on a request frame.
 */
export const PlayoutPrincipalSchema = z.object({
  /**
   * The token's `name`, already reduced to what the audit record will carry — trimmed and
   * cut at `MAX_ACTOR_LENGTH`. The console shows THIS rather than the raw claim, so the name
   * on screen and the name in the log cannot differ.
   */
  name: z.string().min(1),
  /** The token's `sub` — an opaque stable id (Playout C2), kept beside the name in the record. */
  sub: z.string().min(1),
  /** Cumulative roles as issued (`station-admin ⊇ operator ⊇ viewer`). */
  roles: z.array(z.string()),
  /** The `cg_channels` claim. `C-038` is what enforces it; this change only carries it. */
  channels: PlayoutChannelsSchema,
  /** `exp`, as an ISO timestamp, so a surface can say WHEN the session ends. */
  expiresAt: z.string().min(1),
  /**
   * ⚠ ADR 0010's open note, made visible instead of silent: the contract bounds `name` at 64
   * and so does `MAX_ACTOR_LENGTH`, but a Playout that ever issued a longer one would have it
   * SHORTENED in the audit record. When that happens this is `true`, the bridge records it
   * ONCE on the `sign-in` row rather than on every row after it, and the console can say so.
   */
  nameTruncated: z.boolean(),
});
export type PlayoutPrincipal = z.infer<typeof PlayoutPrincipalSchema>;

/** Whether this bridge authenticates at all. `off` is today, byte for byte. */
export const AuthModeSchema = z.enum(['off', 'playout']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

/**
 * 🔴 **WHAT THE BRIDGE'S ONE AUTH PREDICATE SAYS ABOUT THIS SOCKET.**
 *
 * The same four names the gate decides with, carried on the wire so that a surface cannot
 * reach a different answer from the same facts. Golden rule 6: the request gate, the publish
 * gate and this read ask ONE predicate, and it is the bridge's.
 */
export const AuthStatusSchema = z.enum([
  /** This bridge does not authenticate. */
  'off',
  /** Auth is on and a verified, unexpired, unrevoked principal is on this socket. */
  'signed-in',
  /** A principal WAS established and no longer holds — expired, or its `jti` revoked. */
  'invalid',
  /** No token has ever been accepted on this socket. */
  'absent',
]);
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

/** What the bridge holds for THIS socket right now. */
export const AuthStateSchema = z.object({
  mode: AuthModeSchema,
  /**
   * 🔴 **WHAT THIS SOCKET PRESENTED — WHICH IS NOT THE SAME AS "IS IT GOOD".**
   *
   * It survives expiry and revocation on purpose, so a surface can say WHOSE session ended
   * rather than only that one did. `null` when auth is off, or when nothing was ever accepted.
   *
   * ⚠ **A reader must consult {@link AuthStateSchema.shape.status} before treating this as
   * "signed in".** It was briefly the only field, and that was a defect found by measurement:
   * with intents already refused for a revoked `jti`, this read still answered a full
   * principal, so the console would have said _signed in as ‹name›_ while every verb said
   * _you are not signed in_. A surface claiming a state the system does not hold is the defect
   * class this whole change exists to remove; a second derivation of "signed in" is how it got
   * in.
   */
  principal: PlayoutPrincipalSchema.nullable(),
  /** The bridge's own verdict, from the one predicate every gate asks. */
  status: AuthStatusSchema,
  /**
   * 🔴 `C-038` — **WHICH OF THIS STATION'S CHANNELS THIS PRINCIPAL MAY OPERATE.** The
   * permitted-channel strip's one source.
   *
   * ⚠ **THE BRIDGE COMPUTES IT; THE CONSOLE DOES NOT RE-DERIVE IT — and that IS golden rule
   * 6 rather than an exception to it.** {@link grantsChannel} stays the one implementation;
   * what changes is that it has ONE caller, on the side that holds the facts. The alternative
   * — shipping the connection config to the console and running the predicate there too —
   * needs `configuredCasparHosts` in two packages, which is `B-162`'s hole re-opened, and it
   * lets a stale config read make the strip and the gate disagree about a security verdict.
   * A control the console offers and a command the bridge accepts must be the same judgement,
   * and the only way to guarantee that is for there to be one judgement.
   *
   * ⭐ It is a list of THIS STATION's channels, intersected with the grants — never the raw
   * `cg_channels` claim. A grant naming a channel this station does not own contributes
   * nothing, so the strip can never offer a channel that is not there.
   *
   * EMPTY when auth is off (there is no principal to scope to, and every control is reachable
   * — the byte-identical path), and empty for a viewer, who is granted none.
   */
  permittedChannels: z.array(z.number().int().positive()),
});
export type AuthState = z.infer<typeof AuthStateSchema>;

/**
 * Read this socket's principal.
 *
 * ⚠ It answers to an UNAUTHENTICATED socket — it is half of the door ADR 0010 rule 4 leaves
 * open (`bridge.capabilities` and `auth.*`, nothing else). A read that were itself gated
 * would leave a console unable to discover that it needs to sign in.
 */
export const AuthStateChannel = defineChannel('auth.state', z.void(), AuthStateSchema);

/**
 * Drop this socket's principal without closing the socket.
 *
 * ⚠ A no-op on a socket that has none, deliberately: sign-out is a statement about the END
 * state, and an error here would make a console that signed out twice look broken.
 */
export const AuthSignOutChannel = defineChannel(
  'auth.sign-out',
  z.void(),
  z.object({ ok: z.literal(true) }),
);

/**
 * 🔴 `C-037` — **WHAT A BRIDGE WITH AUTH ON ANSWERS TO AN INTENT FROM A SOCKET WITH NO VALID
 * PRINCIPAL, and it is ONE string.**
 *
 * ── WHY ONE SENTENCE AND NOT THREE ──────────────────────────────────────────
 *
 * Three states reach it — never signed in, the token expired mid-shift, the token was revoked
 * — and the owner's question was whether they share a sentence. They do, because **the
 * operator's remedy is identical in all three: sign in.** A second sentence would ask them to
 * tell apart two situations that differ in nothing they can act on, in the one moment they
 * have least attention to spare. Where the distinction IS worth drawing it is drawn as a
 * STATE on the identity pill — _signed out_ versus _session expired_ — which is golden
 * rule 11's split: the surface names the state, the refusal names the remedy.
 *
 * ── THE SAME THREE CONSTRAINTS AS ITS SIBLING ───────────────────────────────
 *
 * The `R-017` discipline: the sentence the BRIDGE sends and the sentence any SURFACE shows
 * are the same string, beside {@link LOCK_ENGAGED_REFUSAL} and for the same reason — two that
 * match today drift the day one is edited.
 *
 * ⚠ It must not be worded like a SKEW message. `bridgeErrorFrom` (`B-152`) rewrites
 * `unknown channel: …` / `invalid request for …` / `invalid response for …` into "restart the
 * bridge" and passes everything else through verbatim, which is why this reaches every
 * existing `err.message` surface with no renderer change — and why a refusal opening with one
 * of those words would reach the operator as the wrong instruction.
 *
 * ⭐ It names the STATE, the REMEDY and the fact that nothing was sent — the `R-006` rule for
 * a pre-send refusal, because an operator who believes a command is queued will not reissue
 * it. No channel name and no code.
 */
export const AUTH_REQUIRED_REFUSAL =
  'This console is not signed in, so that command was refused — nothing was sent to CasparCG. ' +
  'Sign in, then try again.';

/**
 * Why a presented token was NOT accepted — the three reason CLASSES the contract's §3.5 names
 * ("expired / not for this station / invalid"), and no more than three.
 *
 * ⚠ **These are not the refusal above and must not be merged with it.** That one answers _"I
 * pressed TAKE and nothing happened"_; these answer _"I tried to sign in and it did not
 * work"_ — a different question, asked while looking at a different surface, with a different
 * remedy each time. Sharing a string there was right for the same reason splitting is right
 * here.
 *
 * ⚠ Deliberately NOT a machine code plus a lookup on the console: the bridge is the only side
 * that knows which check failed, and `R-017` says the sentence travels rather than a code that
 * two sides then have to keep in step.
 */
export const AUTH_TOKEN_EXPIRED = 'That sign-in has expired. Sign in again.';
/** `iss` is not this bridge's configured Playout, or `aud` does not contain `cg-control`. */
export const AUTH_TOKEN_WRONG_STATION =
  'That sign-in is not for this station. Check which Playout the console signed in to.';
/** Signature, `kid`, claim shape, or a revoked `jti` — anything the bridge could not vouch for. */
export const AUTH_TOKEN_INVALID = 'That sign-in could not be verified.';

/**
 * What a console is told when auth is ON and it has no token to present — the bridge is up,
 * the socket is open, and the only missing thing is the operator.
 *
 * ⚠ Sent as the `auth` frame's error when the frame carried an empty token, so that a console
 * cannot read "no answer" as "accepted".
 */
export const AUTH_NO_TOKEN = 'No sign-in was presented.';

/**
 * 🔴 `C-038` — **THE PERMISSION CLASS: WHICH RUNG OF THE PRINCIPAL HIERARCHY A ROUTE SITS ON.**
 *
 * Three classes, and they are **rungs of a hierarchy, not statements about what a route
 * does**. A principal at a rung may reach every route at that rung and below.
 *
 * ⚠ **`read` names the BOTTOM RUNG, not a promise that the route does not write.**
 * `auth.sign-out` is its one member that writes, and what it writes is the principal's own
 * session, never the station. ADR 0010 rule 2 defines `read` as _"any signed-in principal, a
 * viewer included"_ — a statement about WHO, which is exactly what a viewer signing out
 * needs. A future reader who classifies by VERB rather than by PRINCIPAL will put
 * `auth.sign-out` in `operator` and strand every viewer signed in at a console; this
 * paragraph exists because that is the one mistake the name invites.
 *
 * There is deliberately no fourth `any-principal` class. It would ship with one member and
 * then attract everything that feels session-ish from a reader who never saw this note.
 */
export const PermissionClassSchema = z.enum(['read', 'operator', 'station-admin']);
export type PermissionClass = z.infer<typeof PermissionClassSchema>;

/**
 * The hierarchy, lowest rung first. Exported so the census can assert the LIST rather than
 * sampling it — `R-028` (6.5)'s lesson one axis over: the danger is never that one rung is
 * implemented wrongly, it is that nothing enumerated the set.
 */
export const PERMISSION_CLASSES: readonly PermissionClass[] = ['read', 'operator', 'station-admin'];

/**
 * 🔴 **DOES THIS PRINCIPAL HOLD THIS CLASS? The ONE answer.** Golden rule 6 — the bridge's
 * request gate and the console's read-only state both call THIS, so they cannot come to
 * disagree about what a viewer may press.
 *
 * ⚠ **The hierarchy is applied EXPLICITLY, not inferred from the claim being cumulative.**
 * The contract says `roles` arrives cumulative (`station-admin ⊇ operator ⊇ viewer`) and the
 * Playout issues it that way today — but a Playout that ever sent a bare `['station-admin']`
 * would, under a membership test, be refused every `operator` route while holding strictly
 * more authority than an operator. That is a refusal nobody could explain and it would look
 * like a bridge defect. Widening here is not a widening at all: it grants a station-admin
 * exactly what the hierarchy already says they have.
 *
 * Everything else fails CLOSED: an unrecognised role grants nothing, and `[]` grants nothing
 * above `read`.
 */
export function holdsPermissionClass(roles: readonly string[], required: PermissionClass): boolean {
  if (required === 'read') return true;
  const admin = roles.includes('station-admin');
  if (required === 'station-admin') return admin;
  return admin || roles.includes('operator');
}

/**
 * 🔴 `C-038` — **MAY THIS PRINCIPAL OPERATE THIS CHANNEL ON THIS STATION? The ONE predicate.**
 *
 * Called by the bridge's request gate AND by the console's permitted-channel strip, so a
 * control the console offers and a command the bridge accepts are the same judgement
 * (golden rule 6). It is also the predicate `R-062`'s discovery will read — written to BE
 * that now, rather than so it could become it later.
 *
 * ── THE HOST RULE, AND WHY IT IS THE SET ────────────────────────────────────
 *
 * A grant authorises channel `channel` iff `grant.channel === channel` **and** `grant.host`
 * is one of the hosts this bridge is configured to drive.
 *
 * `hosts` is `configuredCasparHosts(config)` — **never `servers.A.host` read directly.**
 * ADR 0010 §8 pins the contract's spelling to A's host, but A and B are MIRRORS of one
 * channel set rather than a partition, and `B-162` is the hole that opened the last time a
 * caller reached for the primary instead of the set.
 *
 * Two alternatives were rejected, and the reasons are worth keeping:
 *
 * - **require EVERY configured host to be granted** — refuses every operator on any
 *   redundant station, against the contract as written and against every fixture user;
 * - **match the CURRENT PRIMARY** — the verdict would then move under a failover the
 *   operator did not cause, which is golden rule 8's shape exactly.
 *
 * What survives is the only property that matters: **a grant naming another station's host
 * does not authorise this station's channel 1.**
 *
 * ⚠ **It reads config at EVALUATION time**, so a `station-admin` editing the server list
 * changes who is authorised. That is INTENDED, and it is not the failover case above: a
 * deliberate act by a principal holding authority is a different thing from an event the
 * operator did not cause. Stated because the next reader will otherwise see a verdict that
 * moves and think it is the bug this design avoided.
 *
 * ⚠ **It accepts B's host as well as A's**, where the contract as written names A's. That is
 * a TOLERANCE, not a widening — the Playout issues A's host today, so nothing changes in
 * practice, and a grant naming a host that is not ours still authorises nothing. It belongs
 * in the `iss`-addendum owed to the Playout team, so their side reads our interpretation
 * rather than discovering it.
 *
 * `'*'` authorises every channel. `[]` authorises none — and an empty list is NOT
 * `no_cg_access`: a viewer signs in successfully and reads everything (contract §5).
 */
export function grantsChannel(
  channels: PlayoutChannels,
  hosts: readonly string[],
  channel: number,
): boolean {
  if (channels === '*') return true;
  return channels.some((g) => g.channel === channel && hosts.includes(g.host));
}

/**
 * Which of THIS STATION's channels the principal may operate — the permitted-channel strip's
 * one source, and `grantsChannel` applied over a set rather than a second reading of it.
 *
 * `stationChannels` is what the station actually has (from `channelSettings`), so a grant
 * naming a channel this station does not own contributes nothing, and the strip can never
 * offer a channel that is not there.
 */
export function grantedChannels(
  channels: PlayoutChannels,
  hosts: readonly string[],
  stationChannels: readonly number[],
): readonly number[] {
  return stationChannels.filter((c) => grantsChannel(channels, hosts, c));
}

/**
 * 🔴 `C-038` — **WHAT A PRINCIPAL IS TOLD WHEN THEIR ROLE IS NOT ENOUGH.**
 *
 * ⚠ **Not the same sentence as {@link AUTH_REQUIRED_REFUSAL}, and the difference is the
 * REMEDY.** That one answers _"I pressed TAKE and nothing happened"_ on a console that is
 * not signed in, and its remedy is to sign in. This one is read by somebody who IS signed
 * in, correctly, as themselves — signing in again would change nothing, and telling them to
 * would send them round a loop. The remedy here is a person, not an action.
 *
 * ⭐ It names the STATE, the REMEDY and the fact that nothing was sent — `R-006`'s rule for a
 * pre-send refusal, because an operator who believes a command is queued will not reissue it.
 * No channel name, no code, no role name: the roles are the Playout's vocabulary, not the
 * operator's (golden rule 11).
 */
export const AUTHZ_ROLE_REFUSAL =
  'This sign-in does not allow that command, so it was refused — nothing was sent to ' +
  'CasparCG. Ask whoever manages Playout accounts for access.';

/**
 * 🔴 `C-038` — **WHAT A PRINCIPAL IS TOLD WHEN THE CHANNEL IS NOT THEIRS.**
 *
 * ⭐ **It NAMES THE CHANNEL**, and that is golden rule 11's ⭐ clause rather than a nicety:
 * an operator with two channels granted and one refused cannot act on _"that channel"_. The
 * number is the one fact that makes the sentence usable, exactly as `R-028` keeps the real
 * layer number in a notice.
 *
 * ⚠ One sentence, built HERE, so the bridge and any surface that pre-empts it cannot drift
 * (`R-017`). Never concatenate prose after it — `DELTA A` §A3 is the measured instance of
 * what that produces.
 */
export function authzChannelRefusal(channel: number): string {
  return (
    `This sign-in does not cover channel ${String(channel)}, so that command was refused — ` +
    `nothing was sent to CasparCG. Ask whoever manages Playout accounts for access.`
  );
}
