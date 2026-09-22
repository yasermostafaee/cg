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

/** What the bridge holds for THIS socket right now. */
export const AuthStateSchema = z.object({
  mode: AuthModeSchema,
  /** `null` when auth is off, or on but this socket has not presented a valid token. */
  principal: PlayoutPrincipalSchema.nullable(),
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
