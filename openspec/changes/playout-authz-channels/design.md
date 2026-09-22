# Design — `C-038` per-channel authorisation

## 0. What this change is

A verified principal is not yet an authorised one. `C-037` established WHO a socket is;
this establishes WHAT that principal may do, on WHICH channels. Two mechanisms, one
predicate:

- a **permission class** on every route — the REQUIRED 4th argument of `route(…)`, so a
  new route cannot be added without answering the question;
- a **channel check** against the principal's `cg_channels` grants, for the routes whose
  request resolves to one or more CasparCG channels.

🔴 **Auth OFF is byte-identical.** Every gate below returns early when the bridge is in
`auth: 'off'`, before anything is resolved. A station that has not federated identity sees
the same wire, the same refusals and the same timings it saw before this change.

## 1. The permission classes

Three, and they are **rungs of a principal hierarchy — not statements about what a route
does**. A principal at a rung may reach every route at that rung and below.

| Class           | Who                                                     |
| --------------- | ------------------------------------------------------- |
| `read`          | any signed-in principal, a viewer included (ADR rule 2) |
| `operator`      | a principal holding the operator role                   |
| `station-admin` | a principal holding the station-admin role              |

⚠ **`read` names the bottom rung of the principal hierarchy, not a promise that the route
does not write.** `auth.sign-out` is its one member that writes, and what it writes is the
principal's own session, never the station. A future reader who classifies by verb rather
than by principal will put `auth.sign-out` in `operator` and strand every viewer signed in
at a console — which is the whole reason this paragraph exists.

No fourth `any-principal` class. It would ship with one member and then attract everything
that feels session-ish from a reader who never saw this note.

## 2. The channel predicate

One implementation, in `@cg/shared-ipc`, called by the bridge gate AND by the console's
permitted-channel strip — golden rule 6. It is also the predicate `R-062`'s discovery will
read, so it is written to be that now rather than to become it later.

```
grantsChannel(channels: PlayoutChannels, hosts: readonly string[], channel: number): boolean
```

**A grant authorises channel _N_ iff `grant.channel === N` and
`grant.host ∈ configuredCasparHosts(config)`.** `'*'` authorises every channel; `[]`
authorises none.

### Why the host is matched against the SET, not against `servers.A.host`

ADR §8 pins the contract's spelling to `servers.A.host`, but A and B are **mirrors of one
channel set, not a partition** — `caspar-runtime.ts:1586` already says
_"`configuredCasparHosts`, never `servers.A.host`"_ and `B-162` is the hole that opened
when one caller read the primary directly.

Two alternatives were rejected:

- **require every configured host to be granted** — refuses every operator on any redundant
  station, against the contract as written and against all five test users;
- **match the current primary** — the verdict would move under a failover the operator did
  not cause, which is golden rule 8's shape exactly.

What survives is the only property that matters: **a grant naming another station's host
does not authorise this station's channel 1.**

### (a) The predicate reads config at EVALUATION time

So a `station-admin` editing the server list changes who is authorised. **That is
intended, and it is not the failover case rejected above.** A deliberate act by a principal
holding authority is a different thing from an event the operator did not cause. The next
reader will otherwise see a verdict that moves and think it is the bug we avoided.

### (b) It accepts B's host as well as A's

The contract as written names A's. This is a **tolerance, not a widening** — the Playout
issues A's host today, so nothing changes in practice, and a grant naming a host that is
not ours still authorises nothing. It belongs in the `iss`-addendum text owed to the
Playout team, so their side reads our interpretation rather than discovering it.

## 3. Channel resolution — three mechanisms, one resolver

No "which channels does this request touch" function existed before this change (two
independent passes confirmed). It is written **once**:

| #   | Mechanism                        | Routes                                                                                                                                                                            |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) | explicit in the request          | `layers.clear`, `playoutLayers.clear`, `fixedLayers.load`, `fixedLayers.clear-layer`, `fixedLayers.set-config`, `channelSettings.set`, `stack.restore` (N channels, one per item) |
| (b) | `itemId` → `CasparRuntime#slots` | every per-item verb                                                                                                                                                               |
| (c) | `itemId` → `#liveLayers`         | the plate verbs — coordinates can differ from the template's slot, and can be several                                                                                             |

**Bulk verbs are all-or-nothing**, decided over the whole set before the first send —
the same ordering `#removeRefusal` already forces on `removeAll`, and for the same reason:
a loop that refused as it went would act on half the stack and then report that it had not.

## 4. 🔴 The unbound item — every verb, with its answer

`StackItemStateSchema.slot` is OPTIONAL, and the state is **deliberately reachable**:
`restore` creates it by design for a row that comes back with no layer
(`caspar-runtime.ts:2573-2580` — _"A row with NO layer takes none of these three steps, and
that is the whole point"_).

Fail-closed is the right DEFAULT. It is not automatically the right ANSWER, because a row
that is loaded but never bound touches no channel and nothing on air — refusing an
operator's `remove` on it would protect nothing and take away an action that works today.
**"No channel" is not "no authority"; here it means there is nothing to authorise.**

Measured at every site that resolves an item to a slot:

| Verb                            | Today, with `slot` absent                                             | Authz answer                                                         |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `stack.take`                    | refuses `unknown-item`                                                | role only — unreachable past the existing refusal                    |
| `stack.update`                  | refuses `unknown-item`                                                | role only                                                            |
| `stack.stop`                    | refuses `unknown-item`                                                | role only                                                            |
| `stack.next`                    | refuses `unknown-item`                                                | role only                                                            |
| `stack.out`                     | refuses `unknown-item`                                                | role only                                                            |
| `stack.set-pass-timing`         | refuses `unknown-item`                                                | role only                                                            |
| `stack.set-active-look`         | refuses `unknown-item`                                                | role only                                                            |
| `stack.swap-live-source`        | refuses `unknown-item`                                                | role only                                                            |
| `rehearse.enter`                | refuses `unknown-item`                                                | role only                                                            |
| `rehearse.exit`                 | `#rehearsing` can only hold what `enter` admitted                     | role only — unreachable                                              |
| `emptiedAir.restore`            | delegates to `take`                                                   | role only — unreachable                                              |
| **`stack.set-position`**        | **succeeds** — records the override, sends nothing                    | **role only, NO channel check**                                      |
| **`stack.remove`**              | **succeeds** — `#removeExempt` returns `true` explicitly              | **role only, NO channel check**                                      |
| **`stack.set-plate-volume(s)`** | **succeeds** — never reads `#slots`; arms intent from the DECLARATION | **role only when no seat exists; channel-checked per seated record** |

**Eleven of fourteen already refuse**, so the authz gate changes nothing observable for
them — it must not, however, change the REFUSAL CODE they return, or a console that reads
`unknown-item` starts reading a permission error for a row that simply is not there.

**Three reach an unbound item and succeed today, and all three keep working**:

- **`set-position`** records an operator override and sends nothing. There is no channel to
  check and no producer to move.
- **`remove`** is explicitly exempt — `B-212` measured on a stock test CasparCG: a row
  outside the declared bank has no STOP and no CLEAR to press, so refusing its removal
  leaves no remedy at all. Adding a channel refusal on top would rebuild that trap under a
  different name.
- **`set-plate-volume`** deliberately accepts a plate known only by DECLARATION, to preserve
  the arm-before-the-take affordance; and deliberately accepts a plate known only by a
  SEATED LEDGER RECORD, so the emergency silence can reach a stranded producer the
  reconciler no longer carries (`B-145`). Where a seat exists, its record carries a channel
  and that channel IS checked. Where none does, nothing is sent and there is nothing to
  authorise.

## 5. Routes with no channel scope, and WHY — the exemption table

⚠ **Two different reasons live in this table and must not be read as one rule.**

| Route                                                                              | Reason it is unscoped                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stack.silence-all-live-plates`                                                    | 🔴 **Owner answer A16, and CLAUDE.md's cadence floor: it STAYS UNSCOPED.** Its request is `z.void()` and its scope is the whole ledger. An emergency control must not depend on the bookkeeping whose failure is the emergency — the same argument that deleted `B-122`'s status predicate. |
| `lock.engage` / `lock.release`                                                     | **It has no channel to scope to.** The lock is console-wide.                                                                                                                                                                                                                                |
| `auth.state` / `auth.sign-out`                                                     | The principal's own session, never the station.                                                                                                                                                                                                                                             |
| every `read`-class route                                                           | A read is not scoped by channel in this change. `R-062`'s discovery is where per-channel visibility is decided; widening a read here would pre-empt it.                                                                                                                                     |
| `connections.*`, `sources.*`, `delimiters.*`, `templates.*`, `update.*`, `audit.*` | Station-wide by nature. The six `station-admin` routes are gated by CLASS, which is the stronger gate.                                                                                                                                                                                      |

`stack.remove-all` / `stack.clear-all` / `stack.stop-all` are **not** in this table: they are
scoped, all-or-nothing, over the union of the channels their members resolve to.

## 6. Why `lock.engage` and `lock.release` are both `operator`

A viewer who can engage the lock can obstruct an operator while holding no authority over
the station; a viewer who can release it can unlock a console an operator deliberately
locked. The lock gates station operation, so it belongs to whoever may operate the station.

The PIN is a second, independent gate and does not change this — **ADR rule 3: the PIN stays
a safety mechanism and never becomes identity.**

**Same class for both.** The "anyone may pull it, few may reset it" asymmetry is right for
an alarm and wrong here: for a console lock it is the ENGAGING that obstructs.

## 7. 🔴 `auth.sign-out` while locked — REPLY 1 contradicts a recorded decision. NOT changed.

REPLY 1 asked me to confirm `auth.sign-out` is reachable while the lock is engaged. **It is
not**, and that is deliberate rather than missed.

`bridge.ts:1554` registers it `lock: 'operator'`, so `refusedWhileLocked` returns `true`.
`C-037` wrote the reason down in two places, and
`lock-refuses-intents.integration.test.ts:281` asserts it per verb:

> `auth.sign-out` is deliberately NOT here. It is an operator ACT, the lock refuses
> everything (the owner's no-carve-out answer), and signing out while locked would leave a
> console needing two keys with only one way in. The way out of the lock is the PIN; the way
> out of a session is a button that is behind it.

REPLY 1's warning says the opposite — _"signing out of a locked console must work, or a locked
console with a signed-in principal cannot be handed over"_ — and acting on it would add a
fourth carve-out to the lock, which is exactly what `B-229`'s recorded owner answer declined.

**So this change does not touch it.** The handover route that exists today is two steps:
unlock with the PIN, then sign out. That works, because the PIN is a station-level secret the
incoming operator has; what it is not is one step.

This needs an owner answer, not a resolution here. It sits on the LOCK axis rather than the
permission axis, so nothing else in `C-038` waits on it.

## 8. The guard paths — what walks every route, and what each proves

Four censuses now walk the route table, and each answers a claim no sample can make:

| Guard                            | Claim                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lock-refuses-intents` (`B-229`) | every route has a `LockPolicy` and the lock refuses every intent                                            |
| `route-coverage`                 | every channel in `@cg/shared-ipc` has exactly one route                                                     |
| `auth-gate` (`C-037`)            | every route is refused in the states ADR rule 4 names                                                       |
| **`authz-classes` (new)**        | **every route has a permission class, and every channel-resolving route resolves through the ONE resolver** |

The new census is what makes the 4th argument REQUIRED in practice as well as in the type:
a route added with a class but resolving channels by hand would typecheck, and this is what
refuses it.

⚠ **The class is a required POSITIONAL argument, not an options-bag field with a default.**
A default is the mechanism by which every future route silently becomes `operator`; the
compiler refusing to build is the only version of this rule that cannot be forgotten.

## 9. 🔴 What is NOT done, named rather than left to be found

**Station setup's FIELDS stay typeable for a principal who may not commit them.**

The six `station-admin` routes are refused at the bridge for everyone below that rung, and the
dialog's COMMIT controls are now absent: every section portals its APPLY through `footerSlot`,
so withholding the slot removes all of them at one gate, and a section added later inherits it.

What is not done is the other half — the inputs themselves still accept typing, so a viewer or
an ordinary operator can build a draft that has nowhere to go.

**Why it is left:** the two halves are not the same risk. An APPLY that reaches the bridge and
comes back refused is the failure `R-066` bullet 4 exists to remove — a control the console
offered and the system rejected. A field that accepts a character is a poor surface and claims
nothing: no value is shown as in force, nothing is sent, and the standing footer contract still
says what the commit would do. Making the whole dialog read-only means a read-only mode for
every section's controls, which is a piece of work with its own layout risk and its own e2e,
not a rider on this one.

⚠ **Do not "finish" this by DISABLING the fields.** That is golden rule 13's exact prohibition,
and on this surface it would also be a lie: `ChannelSection` already uses a disabled-looking
treatment to mean _"the designer owns this value"_ (ADR 0009), so a second, identical-looking
treatment meaning _"your account may not change this"_ would make one appearance carry two
unrelated facts. The read-only mode, when it is built, states which.

## 10. A vocabulary overlap, checked and left alone

The golden-rule-9 sweep found `Read only` already in use as a Station setup SECTION CONTRACT tag
(`sections.ts` — `Read only` · `Apply together` · `Auto-save`), meaning _"the designer owns these
values"_ (ADR 0009). This change adds `READ ONLY` meaning _"this channel is not yours"_.

Two facts, one phrase — checked rather than assumed, and left as it is: the surfaces are far
apart (a settings dialog's section head versus the channel strip and the status bar), the casing
differs, and each instance carries its own context — `CHANNEL 2 · READ ONLY` and
`READ ONLY — THIS SIGN-IN DOES NOT OPERATE` both say which they mean. Renaming either is a
wording decision that owes its own two-axis sweep, and neither reading is wrong today.
