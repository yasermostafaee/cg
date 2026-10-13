# Design — `BRIDGE-TRUTH-01`

## 1. The exemption audit (§1), in full

Every exemption the lock (`B-229`) has, and every place the auth or permission gate reuses a
lock-era condition, each answering one question: _does this justification transfer to the
permission axis?_ Read at `5c07fc09`; the four lines marked MEASURED were driven through a socket by
a scratch spec that was run and deleted. The same table is filed in `B-257`.

| #   | Exemption (allowed past, or never meeting, the lock gate)                | Transfers to the permission axis?                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `LockPolicy` `read` — every read route                                   | **Yes.** Every handler is a pure getter; `auth.state` alone arms the D9 poller, named in `authGateState`, off the wire. Reused for an EXPIRED session; not for a never-authenticated one.                  |
| A2  | `unlock` — `lock.release`                                                | **No — and it was not copied.** Refused for an invalid session; class `operator`.                                                                                                                          |
| A3  | `resync` — `stack.restore`                                               | The ALLOW: **no — not copied** (refused when invalid; class `operator`; channel-checked; fenced to the bank). The "not a press" half: **yes — and NOT carried** to the refusal record. MEASURED → `B-258`. |
| A4  | `operator-unless-redelivery` — `templates.import`, `redelivery: true`    | As A3, same record defect. ⚠ On the lock's OWN axis the justification was false: a re-delivery of a held id replaced its HTML under a lock. MEASURED → `B-260`.                                            |
| A5  | the `auth` frame — outside the route table                               | Not a copied exemption — a permission-axis path around the lock. The refresh must pass; a principal CHANGE had no reason to, while `auth.sign-out` is refused there. MEASURED → `B-259`.                   |
| A6  | a malformed request, an unknown channel — answered before the lock gate  | **Yes.** The auth gate sits after the parse for the same reason.                                                                                                                                           |
| A7  | publishes                                                                | **Yes** for an expired session; deliberately not for a never-authenticated one. Unscoped by channel — `R-062`'s decision.                                                                                  |
| A8  | bridge machinery with no socket                                          | **Yes** — none acts with a principal's authority.                                                                                                                                                          |
| A9  | the deferred restore — `#decidePendingRestores`                          | **Yes, with the time-shift named**: authorised when asked; fires later, unchecked, possibly after that principal expired. Reaches `MIXER VOLUME 0` + `CG ADD` on the bank's channel with no `PLAY`.        |
| A10 | the template completion stop — `SELF-STOP-24`                            | **Yes** — only on an authorised take, with a per-take token spent on first use.                                                                                                                            |
| B1  | `refusedByAuth` reads `route.lock !== 'read'`                            | Yes for `read`; deliberately not for `resync`, `unlock` or a re-delivery.                                                                                                                                  |
| B2  | the gate ORDER — lock, auth, authz                                       | **Partly.** Another principal was told to use a PIN it did not hold. Both refused; nothing reached the wire. (Answered by `B-257` below: such a principal now meets the permission gate.)                  |
| B3  | a resumed token writes no `sign-in` row                                  | Yes — the one place "not a press" was carried.                                                                                                                                                             |
| B4  | 🔴 `lock.engage` / `lock.release` have no channel scope — "console-wide" | **NO, AND IT WAS LIVE** → `B-257`.                                                                                                                                                                         |
| B5  | `auth.sign-out` refused while locked                                     | Settled at `lock-refuses-intents.integration.test.ts:281`. Not reopened.                                                                                                                                   |
| B6  | the class of every lock-exempt route is `operator`                       | Correct: the permission gate inherits none of the lock's allows.                                                                                                                                           |

## 2. `B-257` — the decision, and which of the three options it is

**Owner decision (`REPLY 1` R1):** a lock covers the engager's channel set, captured at the moment
of engage, and refuses only intents that touch a channel in that set. It is **option 1** of the
three `B-257` named — _the lock scoped to the engager's granted channels_ — with two refinements the
decision's own tests require:

1. **The requester must hold the covered channel for the LOCK to be the refusal.** R1's positive
   control says channel 2's operator on channel 1 is refused _by permission, reason named_. So a
   principal holding none of the covered channels is not reached by the lock at all; an intent of
   theirs on a covered channel is one they hold no grant for, and the permission gate refuses it
   with the sentence that names the real obstacle. (This also answers audit line B2.)
2. **An intent that resolves to no channel** — the station-wide verbs, and a verb on a row with no
   layer — is refused for a principal the lock reaches, because it touches every channel they
   hold. PANIC is judged by where it REACHES, not by that rule (§3).

Options 2 (engage requires every channel) and 3 (the lock scoped to the engaging console) were not
taken.

**The covered set IS the engager's `permittedChannels`** — `grantedChannels` over the station's
declared channels and hosts at the moment of engage, the same composition `authStateFor` sends the
console — so the set the lock stores and the set the engaging console displays as its own cannot
differ. ⚠ `#declaredChannels()` is the bank's channel alone today, so a principal holds at most one
channel here: a lock covers a console entirely or not at all, and partial overlap is unreachable
until a second channel is declared (`R-062`).

**Constraints, each met:** (1) captured at engage, stored on `LockState.channels`, never
recomputed; (2) auth OFF and a `'*'` engager leave `channels` ABSENT and take the old code path —
`lock-refuses-intents` is unchanged and green; (3) inside the scope `B-229` stands — a second
channel-1 principal meets the lock on CLEAR and PANIC alike, sign-out stays refused; (4) release is
unchanged; (5) see §4.

**Consequences, named rather than left to be found:**

- **One lock at a time.** A principal the lock does not reach passes the gate on `lock.engage`, so
  `engage()` itself now refuses while any lock is engaged (a `lock-engage` row, `already-engaged`).
  Replacing the lock would change its PIN and scope under the first engager.
- **An engage covering nothing is refused** (`no-channel-held`): it would restrict nobody and still
  hold the one lock slot.
- **A principal the lock does not reach keeps the station-wide verbs** — failover, template import
  and removal, emptied-air dismissal, an update request — while the lock is engaged. The lock
  restricts the engager's channels; those verbs belong to no channel, and permission still decides
  them.
- **The gate waits for a landing sign-in** before judging a covered-set lock (its verdict turns on
  WHO asks), and re-reads the lock after that wait. The every-channel lock decides at once, as
  before.

## 3. 🔴 The PANIC check — done before building, reported first

**What PANIC touches, for a principal holding one channel:** every plate the bridge's LEDGER holds a
seat for, on every row and every channel, whatever the principal holds — A16, CLAUDE.md's floor. In
practice that is the bank's one channel: plates sit on their row's channel (`caspar-runtime.ts:5175`),
rows sit on the bank, and the bank's channel cannot change mid-session (`fixed-layers-store.ts:340`).
The one way the ledger spans two channels is boot adoption (`B-145`) of a ledger persisted under a
different bank channel — `adoptLiveLayers` does not filter by channel.

**Can anything refuse an operator PANIC on the channel they are authorised for?**

- **Permission — no.** PANIC resolves to no channel by A16 (`channelsForRequest` returns `[]` for it
  first), so only the ROLE is checked, and an operator holds it.
- **The bulk all-or-nothing rule — no.** PANIC is not one of the three bulk verbs.
- **The lock — yes, before this change: that is `B-257` itself.** After it, the lock refuses PANIC
  only when PANIC would reach a plate on a covered channel the operator also holds — constraint 3's
  own case. The one residual is inherent to an unscoped PANIC: an operator holding a covered AND an
  uncovered channel cannot PANIC while the ledger also holds a covered seat — unreachable while the
  station declares one channel.

⚠ **The flip side, which the owner should see plainly:** an operator the lock does not reach CAN
PANIC while the lock is engaged, and that PANIC silences the whole ledger — the covered channel's
plates included. A16 is unchanged; this change does not re-scope PANIC, it only stops refusing it.
Silence is the one direction PANIC can move anything.

## 4. Constraint 5 — the rendering chosen

One pure decision, `lockCoverage(lock, auth)`, from the same two inputs the bridge's `lockReaches`
uses: `none` · `all` · `partial`.

- **`all`** — the lock screen and the status bar's `LOCKED`, exactly as before.
- **`none`** — no lock screen, no `LOCKED`, and the status bar's Lock button ABSENT while any lock is
  engaged (one lock at a time). Nothing else changes on that console.
- **`partial`** — no lock screen; the covered channels' tabs read `CHANNEL n · LOCKED`. Their verbs
  stay offered and the bridge refuses them with the lock sentence — withdrawing them means reading
  the lock inside `useSelectedChannel`, which forty-seven dom specs' stubs do not carry, for a state
  unreachable while one channel is declared. Filed with `R-062`, not done here.

No tutorial prose; the label is a fact about the channel, stated where the channel is.

## 5. `REPLY 1` R2 — the three smaller fixes

**`B-259`.** In the `auth` frame, after verification and before `adopt`: a current principal, a
DIFFERENT `sub`, and a lock that reaches the current principal → refused with the lock sentence.
The same-`sub` refresh passes; a first sign-in on a socket passes (a console reloaded under a lock
must still sign in).

**`B-260`.** (a) `templateRedeliveryChange` classifies a re-delivery BEFORE it is applied —
`tombstoned` · `register` · `replace` · `none` — and one of the two new actions is written for
`register`/`replace`; `templates.remove` now writes `template-remove` for every outcome. (b) Under a
lock that reaches the console, a `replace` is REFUSED with the lock sentence. **Refuse, not defer,
because refusing needs no new state** — a deferral would need a queue of deferred re-deliveries.
⚠ **The reply's premise that the existing machinery re-sends after release is FALSE:** the console
re-delivers only in `#resync`, on (re)connect and on sign-in. So an overwrite refused under a lock
lands at that console's NEXT reconnect or sign-in, not at release. A `register` and a `none` still
pass, so a reconnect under a lock keeps working.

**`B-258`.** `isReconnectMachinery(route, req)` reads `LockPolicy` (`resync`, or a flagged
re-delivery) — no second list. The permission gate still REFUSES such a frame; it no longer writes a
`refused` row for it. A real refused press still writes one.
