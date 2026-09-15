# Design — the completion channel out of CEF

## 1. The premise that had to be measured first: the page cannot currently talk at all

`C-017` proposed a same-origin ping and filed the recon as "`fetch` availability/behaviour
in CEF ~71 ([[B-066]] class: verify, never assume)". The availability question has a duller
answer than expected, and it is not about CEF.

**The served page's own CSP forbids it.** `ExporterSingleFile` writes:

`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; media-src data:;`

`connect-src` is absent, so it falls back to `default-src 'none'`. Every `fetch`, `XHR` and
`sendBeacon` from that page is refused by the page itself, in any engine — Chromium 71 or
Chromium 140. This is not an oversight: `SECURITY.md` states it as a shipped property, and
`docs/phases/phase-4-export-architecture.md` writes it out as an explicit `connect-src 'none'`
with the reason "prevents a template from phoning home — broadcast templates have no business
making network calls."

So the first thing this change does is relax it, and the relaxation is argued rather than
assumed:

- **`connect-src 'self'`, not a host list and not `*`.** For the bridge-served page, `'self'`
  is `http://<serveHost>:<port>` — the bridge that served it. There is no second origin it
  could reach.
- **The single-file artifact dropped into CasparCG over `file://` is unaffected in practice.**
  Its origin is opaque; there is nothing for `'self'` to resolve to and no bridge to answer.
  `C-017` already scopes that case out — "there is no origin to ping".
- **The arming key is the real guard.** The page opens no connection unless it holds a take
  token, and a take token arrives only inside `__cg`, which only this bridge writes. A
  template served by anything else never sends a byte. That property — not the CSP — is what
  makes the relaxation safe, and it is why the CSP can stay one string for both artifacts
  rather than becoming two spellings of one producer.

`Chromium 71` itself is not a problem for the API: `fetch` is Chrome 42, `sendBeacon` is
Chrome 39, `AbortController` is Chrome 66. None is in `CEF_BANNED_BUILTINS`. **What cannot be
measured off the plant is whether CasparCG's CEF honours the round trip in practice**, and
that stays an owed hardware check rather than a claim.

## 2. Which settles are SELF-ends, and which are not

`PlayoutController` reaches `settled = true` from four places. Only two of them are the
template finishing by itself:

| site                                        | self-end? | why                                                         |
| ------------------------------------------- | --------- | ----------------------------------------------------------- |
| `onOutroEnd()` with no cycles left          | YES       | the authored run is over — the natural terminal             |
| `setRemainingPasses(0)` during the gap      | YES       | the count ran out; the pass the operator declined never ran |
| `stop()` — including the gap short-circuit  | no        | an external command asked for it                            |
| a cascaded `stop()` from the runtime's exit | no        | same, one level up                                          |

The discriminator is therefore "did an external command initiate this exit", and it is read
**at the controller**, not at the runtime. A runtime-level "an exit was requested" flag would
have to be set by `stop()`, `out()` and the deferred-outro resume, and cleared by `play()` —
four sites that must agree, which is the shape this repo has paid for repeatedly. The
controller already knows which of its own methods it is standing in.

So `PlayoutControllerOptions` gains `onSelfEnd?: () => void`, fired from exactly the two rows
marked YES, immediately before `onSettle()`. The runtime wires it for the GLOBAL ROOT only —
a nested composition instance settling is not the template finishing.

⚠ **`static`, `manual` and every infinite lifecycle never reach either row.** `static` and
`manual` have no auto-exit; an infinite `loop-cycle` returns at `cyclesLeft === 'infinite'`
before the terminal branch. This is a property of the existing control flow, not a new guard —
which is why the spec pins it as an ABSENCE rather than as a condition.

## 3. The token: what it names, and where it is refreshed

A signal must name the TAKE. Four things would otherwise stop a newer run:

1. a page from an OLDER take (after an `out` destroyed the producer and a re-ADD built a new page);
2. a re-ADD from `setPosition`;
3. a RE-TAKE of a still-resident producer — `stop` then `PLAY`, with no re-ADD and therefore the SAME page;
4. the BACKUP server's copy of the same page, which mirror-sync hands the SAME URL.

(1) and (2) are covered by minting at `#sendAdd`: a new page is a new token. (4) is covered by
one-shot consumption — the first signal spends the token and the second finds nothing. **(3) is
the one that forces a refresh**, and it is the dangerous one: run 1 self-ends, its POST is in
flight, the operator re-takes, and a token that named only the PAGE would stop run 2.

So the token is minted at **two** sites, which are the two routes into air:

- **`#sendAdd`** — the one `CG ADD` chokepoint, four callers. The token rides `__cg` in the ADD
  payload, beside the look and the pass timing that already ride it.
- **the resident-producer take path** — where `B-191` already sends a pre-PLAY `CG UPDATE` to
  tell the page its look. The token joins that tell, and the tell becomes unconditional: a
  look-less template needs the token as much as a look-bearing one does.

⚠ **A failed tell does not refuse the take** — the same rule `B-191` wrote for the look, for a
smaller reason: a run that cannot self-stop degrades to today's behaviour, and refusing a take
the wire has already moved on is the larger failure.

⚠ **The page lifts the token on BOTH doors.** `0f54e00d` was a value lifted on `update(data)`
and dropped on `play(data)`, silently inert on every host that delivers load-time data through
`play`. `take` is read in both, in the same place each already reads `look` and `timing`.

## 4. The receipt, and why the lock does not gate it

`POST /complete` on `TemplateHttpServer`, body `{"take":"<token>"}`. `GET` on that path, a
malformed body and an unknown token all answer `404` with no side effect — the same shape the
unknown-template id already gets, and no new refusal vocabulary.

**The B-229 console lock does not reach this, by construction rather than by decision.** The
lock gate lives at `handleFrame` in `bridge.ts` — the ONE chokepoint every control-WebSocket
request passes — and this is a different server with no control surface. That is the correct
default: the lock refuses OPERATOR actions, a template ending itself is not one, and the
picture has already gone. A locked console that went on showing ON AIR for a graphic that had
finished would be the lock making the stack LESS honest.

⚠ **The route is reachable from the LAN whenever the template server binds one** (a remote
CasparCG forces `0.0.0.0`). That is why the token is 128 random bits and one-shot, and why a
valid token can do exactly one thing — stop the row it names. It grants no read, no
enumeration and no second verb.

## 5. Two conditions, read once, at the receipt

A signal acts only when BOTH hold:

- the token matches a LIVE take (one-shot: matching spends it, whatever happens next);
- the row it names is ON AIR right now.

The second is what handles the operator race without a second list of invalidation sites. If
the operator's STOP lands first the row is `loaded`, so a late signal is ignored; if the signal
lands first the operator's button is already gone. Invalidating the token at every exit path
instead would mean `stopItem`, `out`, `remove` and the restore paths all remembering to do it —
extend-the-list-forget-the-mutator, and the one that forgets fails by stopping a live row.

## 6. The actor

The audit models the actor as one free string, resolved at one site (`operatorActor()`, reading
an `AsyncLocalStorage` bound per control request). Outside a request it answers
`UNATTRIBUTED_ACTOR`. There is **no non-operator actor today** — a bridge-initiated append is
simply unattributed.

That is not good enough here: "unattributed" would put a template's own stop in the same bucket
as a bridge-initiated housekeeping append, and the one question this row exists to answer is
_why did this row come off air when nobody touched it_. So the change adds ONE reserved
constant, `TEMPLATE_ACTOR`, beside `UNATTRIBUTED_ACTOR` where actors are already named, and
`normalizeActor` refuses it from the wire — a console cannot claim to be a template.

The ACTION stays `stop`. It is the same verb reaching air by the same path; only the actor
differs, which is exactly what an actor field is for. `PLAYOUT_VERBS` needs no new entry and
`AuditEntrySchema.action` needs no new member.

## 7. What is deliberately NOT built

- **No timer, anywhere.** The bridge acts only on a signal. `C-013` is explicit and `C-012`
  already refused to chase an outro with one.
- **No CLEAR.** Superseded by the owner's decision — see the proposal.
- **No change to STOP's semantics, no new refusal condition, no bank fencing, no change to**
  `silenceAllLivePlates`, **and no other wire change.**
- **No per-pass reporting.** The same channel could later report each PASS boundary, which
  would let the Inspector show a live `Passes remaining` instead of `Sent N more`. Filed as
  `C-035`, not built.
