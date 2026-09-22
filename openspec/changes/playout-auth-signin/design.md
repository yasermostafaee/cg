# Design — the decisions `C-037` and `R-066` left to the change

Everything here was decided with the code in front of it. Each section states the alternative
that was rejected, because the alternative is what a later reader will re-propose.

---

## 1. Where `playout.*` sits in `R-010`'s precedence

**Decided: its own persisted file, `~/.cg-runtime/bridge-playout.json`, with `--playout-*` flags
and `--auth`, resolved by `resolvePlayoutSettings(flags, file)` — CLI flags > file > default,
default `off`.**

**Rejected: putting the group inside `ConnectionConfig`**, which is where `templateServeHost`
lives and which already persists under `R-010`. Two measured facts killed it:

1. `ConnectionConfigSchema` **IS the `connections.set-config` REQUEST body**
   (`packages/shared-ipc/src/channels/connections.ts`). Auth configuration there would be
   rewritable over the control socket — by any socket that can reach the port, which is exactly
   what `C-037` exists to gate. A gate whose configuration is behind the gate is not a gate.
2. `loadPersistedConnection` **WARNS AND IGNORES** an invalid file and falls through to
   `defaultConnection()`. That is right for a server address — a station with a typo still boots
   and can be fixed from the console — and wrong here, because the fall-through would be _"no
   auth configured at all"_.

So it takes the **reserved-layers doctrine** instead: present-but-unusable is a hard startup
failure (`PlayoutConfigError`) thrown before the WebSocket binds. `bin/caspar-bridge.mjs` gains a
NARROW try/catch that turns that one error name into the CLI's own one-line refusal and re-throws
everything else — a broad catch there would change the behaviour of four existing store failures
on an auth commit.

**What `R-010` contributes is the precedence, which is the part `C-037`'s note actually cites.**

**Required vs derived.** `issuer` and `jwksUrl` are required when the mode is `playout`; the other
four addresses derive from the issuer because the contract fixes their paths, and re-typing four
URLs is four chances to typo one that is only exercised months later. `audience` defaults to
`cg-control`.

**A trailing slash on the issuer WARNS and is never rewritten.** ADR 0010 rule 1 says `iss` is
compared byte-for-byte and never derived, so stripping it here would silently change the
comparison; refusing it would reject a value a differently-configured Playout might legitimately
issue. The failure it would otherwise cause — every sign-in refused as "not for this station" — is
true and gives no hint why, so the boot line says so.

---

## 2. The refusal wording, and whether expiry shares it

**Decided: ONE sentence, `AUTH_REQUIRED_REFUSAL`, shared by never-signed-in, expired and revoked.**

> This console is not signed in, so that command was refused — nothing was sent to CasparCG.
> Sign in, then try again.

**Why they share it: the operator's remedy is identical in all three — sign in.** A second sentence
would ask them to tell apart two situations that differ in nothing they can act on, in the one
moment they have least attention to spare.

**Where the distinction IS drawn, because it is worth drawing:** on the identity pill, as a STATE
— _SIGNED OUT_ versus _SESSION EXPIRED — ⟨name⟩ — SIGN IN AGAIN_ — and on the sign-in card, which
names whose session ended. That is golden rule 11's split: the surface names the state, the
refusal names the remedy.

It satisfies the same three constraints as `LOCK_ENGAGED_REFUSAL`, beside which it lives: the
`R-017` one-string discipline; it does not open with one of `B-152`'s three skew shapes, so
`bridgeErrorFrom` passes it through verbatim and no renderer changes; and it names the state, the
remedy and that nothing was sent (`R-006`).

**Three separate sentences DO exist for a refused TOKEN** — `AUTH_TOKEN_EXPIRED`,
`AUTH_TOKEN_WRONG_STATION`, `AUTH_TOKEN_INVALID` — because those answer a different question
("I tried to sign in and it did not work") with three different remedies. Sharing a string was
right for the intent refusal for the same reason splitting is right here.

---

## 3. The sign-out mechanism

**Decided: an `auth.sign-out` CHANNEL. The socket stays open.**

**Rejected: a fresh socket**, which the prompt correctly names as the simplest correct option —
a new socket has no principal by construction. It was rejected because it takes the console's live
state down with it: the stack, health, the lock and the ledger all re-deliver, the link indicator
flickers through `disconnected`, and signing out becomes indistinguishable from a link failure on
the one surface whose whole job is to tell those apart. ADR 0010 rule 4 also says the socket is
never closed over a token; closing it _because of_ a token is the same sentence read backwards.

The route is an ordinary route — censused like every other — and it reaches its own socket's
principal through the ALS context, which is what lets a per-connection answer come out of a
process-wide route table. It records a `sign-out` audit row before clearing.

**A failed sign-out still clears THIS console.** The token is removed from storage either way, and
a bridge that did not hear the sign-out refuses the next intent anyway once the token stops
verifying. What must not happen is a console that looks signed in because a round trip failed.

---

## 4. Truncation at `MAX_ACTOR_LENGTH`

**Decided: reduce the name ONCE, at verification time, with `normalizeActor` — the canonical
reducer — and carry a `nameTruncated` flag beside it.**

ADR 0010 records as open that a Playout display name longer than 64 characters would be
**silently** shortened in the audit record. It is not silent now: the flag travels with the
principal, the bridge writes `actorNameTruncated: true` **once**, on the `sign-in` row, and never
on the rows that follow — a flag repeated on every take would be noise about a fact that does not
change during a session.

**Reducing it once, at that one point, is what makes the name on screen and the name in the
record the same string** rather than two reductions of one claim that could differ after an edit
to either. `truncateActorName` still exists and is called only for its FLAG, because
`normalizeActor` truncates silently and that silence is the whole of the ADR's note.

**Golden rule 6 applies:** `normalizeActor` is what every other name entering this process goes
through, and the Playout is outside this process exactly as a browser is. A second, narrower
reduction for verified names would be a predicate that agrees today.

---

## 5. The gate's shape, and why it reads `LockPolicy`

`refusedByAuth(route, state)` takes four states — `off`, `signed-in`, `invalid`, `absent` — rather
than a boolean, because ADR 0010 rule 4 spells two different answers: a never-authenticated socket
gets `bridge.capabilities` and the `auth.*` door and nothing else, while an expired one refuses
new intents and keeps answering reads.

For the EXPIRED case it reads `route.lock`. That is not a re-derivation: `LockPolicy` already
classifies every route as answering-a-question (`read`), the client's own reconnect machinery
(`resync`), or acting. `C-038` is the item that adds a permission class of its own, and adding a
second required `route(…)` argument here would be doing `C-038`'s work with none of its design.

**What the gate does NOT do is treat the two policies as interchangeable.** `lock.release` is
reachable while LOCKED and refused while EXPIRED, because the lock's way out is a PIN and an
expired session's way out is signing in. Neither strands the operator, and each is answered by its
own gate.

**The gate sits AFTER the lock gate.** A locked console is a fact the operator already knows and
can act on in four keystrokes; being told to sign in when the real obstacle is the lock would send
them to the wrong remedy. The order is the message.

---

## 6. The publish gate — the second door

`wirePublishes` subscribed every socket to stack state, health, the lock, the live-layer ledger
and the emptied-air notice the instant it connected, **before a single frame was read**. A
request-level gate does not touch that path: an unauthenticated socket would be refused every
command and still be told everything, and ADR 0010 rule 4 says such a socket gets the two doors
and **nothing else**.

**Decided: a DELIVERY predicate read at push time**, defaulting to `() => true`.

**Rejected: deferring the subscription until sign-in**, because sign-out has to close it again on
the same socket — a wire/unwire pair is two operations that must stay in step, where one predicate
read at push time cannot fall out of step with itself. The default keeps auth-OFF byte-identical
and leaves the `B-247` publish-coverage guard's two-argument call unchanged.

**The console resyncs after signing in on an already-open socket**, because it has missed every
state change since it connected. That is the same `#resync` a reconnect runs; signing in is the
same event from the bridge's point of view.

---

## 7. The console's auth state, and why the identity pill is a SECOND pill

`AuthSessionState` has five names — `off`, `unknown`, `signed-out`, `signed-in`, `expired` —
because the surfaces that read it must tell apart three cases a nullable principal flattens into
one: a bridge that has not answered yet, a console that has never signed in, and a session that
LAPSED. `unknown` is not `off`: a console that treated them the same would present a sign-in on a
bridge that does not authenticate, or withhold one on a bridge that does.

**`R-066`'s acceptance says "the link indicator names the state".** `LinkIndicator`'s own header
forbids exactly that, and gives the reason this repo has paid for twice: _"What it may not do is
claim, in the word and the colour that mean 'connected', to be connected to something it does not
measure."_ A signed-out console has a perfectly live link. So the state is named in the operator's
words, in the same row and immediately beside the link — one instrument per axis, which is golden
rule 8's shape.

---

## 8. Persian on the sign-in, English everywhere else

The sign-in card is `dir="rtl"` and its copy is Persian. **It is the console's first Persian
chrome** — every other surface is English, and the Persian in the tree today is operator DATA (row
names, template names) and comments quoting the owner.

It is deliberate and it is scoped: the sign-in is the one screen an operator meets before they
have done anything. The identity pill keeps the status bar's existing English vocabulary, because
it sits in a row of English pills and changing that row is a redesign this change was not licensed
to do.

Error sentences are the CONSOLE's, not the Playout's: the contract says the Playout's free-text
`message` is _"never shown verbatim on air surfaces — CG Control maps `error` to its own
sentence"_.

---

## 9. The `auth` frame is not a channel, and `auth.*` are

The frame is how the TOKEN arrives. It is deliberately outside the route table, because the gate
that refuses every channel has to be able to run BEFORE a principal exists, and a door spelled as
one of the things behind the door is a carve-out somebody has to remember. As a frame type, the
census that walks every route cannot miss it — it is not a route.

`auth.state` and `auth.sign-out` ARE channels, because they are a read and a write of a principal
that by then exists, and because `route-coverage`'s guard then requires the bridge to route them
and the console's skew check requires the connected bridge to have them.

The frame's reply is an ordinary `response` correlated by `id`, carrying the `auth.state` payload
on success and a sentence on refusal — so the console needs no second correlation scheme.

---

## 11. What the acceptance bullets promised that the first implementation did not deliver

Four things the specs MEASURED after the first pass, recorded because each is a shape rather
than a slip.

**`auth.state` reported a principal the gate had already stopped accepting.** It read
`session.token.principal` directly, so with intents already refused for an expired or revoked
token the same socket's read still answered a full principal — a console would have said
_signed in as ⟨name⟩_ while every verb said _you are not signed in_. It now carries `status`,
the gate's own verdict from the one predicate, beside the principal. The principal is still
reported, because a surface has to be able to say WHOSE session ended.

**The revocation poll was an upper bound on FREQUENCY, not a bound on LATENCY.** Kicked only
from the request path, it never ran on an idle console — so the first intent after a quiet
spell was decided against a stale list and ALLOWED. One command by a revoked operator is
exactly what the bullet promises will not happen, so there is now an `unref`'d background tick
armed by the first live principal.

**A revoked socket froze the list it was revoked by.** `authGateState` returned `invalid`
before refreshing the D9 bearer, so on a single-console station nothing would ever poll again
and an operator un-revoked on the Playout could not be let back in. The bearer is now
refreshed for any token that verified and has not expired.

**`operatorSub()` was exported with zero call sites.** The verified id reached the record on
the identity rows alone, while the bullet says the audit record carries `sub` beside the name.
Fixed at `#recordAudit` — the one place a row becomes an entry — not at the seven sites that
name the actor.

⚠ **Two things that are NOT defects and are recorded so they are not "fixed" later.**
Publishes keep flowing to an EXPIRED or REVOKED socket: ADR 0010 says both refuse new intents
while _"reads keep answering"_, and a stream of state the operator was already entitled to is a
read. And `jose`'s JWKS cooldown is anchored to the last FETCH rather than to the last unknown
`kid`, so on a busy bridge an unknown-`kid` re-fetch may be deferred behind ordinary cache
refreshes — safe, because the contract publishes a key before signing with it and the cache
ages out at the contract's own hour, but it is not word-for-word what ADR 0010 rule 1 says.

---

## 10. The non-loopback warning that `C-037` calls "existing"

`C-037`'s acceptance says _"the existing warning prints"_. **Measured: there was no such warning.**
The two that exist (`bridge.ts` at boot, `caspar-runtime.ts` on reconfigure) are about the
TEMPLATE HTTP server — a different socket on a different port — and the second of them ends
_"Control WebSocket remains loopback-bound"_, which `--host 0.0.0.0` makes false.

So the warning is written NEW, for the combination the ADR's rule 11 names: a non-loopback control
socket with auth OFF. The owner's default is unchanged — auth OFF + loopback is today and stays,
auth OFF + `--host 0.0.0.0` stays permitted — what changes is that it is no longer silent.

⚠ **The false clause in `caspar-runtime.ts` is a separate finding and is NOT fixed here.** It is a
user-facing string, so changing it obliges a tree-wide sweep (golden rule 9), and that sweep does
not belong in an auth commit. It is reported.
