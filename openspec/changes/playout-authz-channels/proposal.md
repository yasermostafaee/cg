# A verified principal is not yet an authorised one

## Why

`C-037` gave the control socket a principal. Nothing yet asks what that principal may DO.

A viewer who signs in can take a graphic to air. An operator granted channel 2 can clear a layer
on channel 1. The `cg_channels` claim has been carried on the principal since `C-037` — its own
field note says so: _"`C-038` is the item that gates on it; this change only carries it"_ — and
`refusedByAuth` says the same from the other side: _"`C-038` is the item that adds a permission
class of its own."_

This change is that item. It implements `C-038` in full and `R-066`'s bullets 3 and 4, against
[ADR 0010](../../../docs/adrs/0010-playout-link.md) and the contract in `docs/integration/playout/`.

## What changes

- **A permission class on every route** — the REQUIRED 4th field of `Route`, beside `B-229`'s
  `lock`. Three classes (`read` / `operator` / `station-admin`) that are RUNGS OF A PRINCIPAL
  HIERARCHY rather than statements about what a route writes. 26 / 33 / 6 across the 65 routes.
- **A channel check** against the principal's `cg_channels` grants, through ONE predicate in
  `@cg/shared-ipc` — `grantsChannel` — which the bridge's gate and the console's permitted-channel
  strip both resolve from, so a control the console offers and a command the bridge accepts are
  the same judgement.
- **One channel resolver**, `channelsForRequest`, answering "which channels does this request
  touch" from the three ways a request can become a channel: the request saying so, an `itemId`
  resolving through the runtime's two ledgers, and the bulk verbs' union. Bulk verbs are
  all-or-nothing, decided before the first send.
- **A refusal that names the channel.** Two sentences, not one: "this sign-in does not allow that
  command" and "this sign-in does not cover channel N" have different remedies, and the role is
  checked first so the broader sentence is the one a viewer hears.
- **The permitted-channel strip.** `channelIds` gains the principal, exactly as `R-066` bullet 3
  names. A channel the bank declares but the principal may not operate is shown READ-ONLY and
  still selectable — `read` is a real permission, and a channel missing from the strip cannot be
  told apart from a station that does not have it.
- **Viewer read-only state.** Operator controls are ABSENT, not greyed out (golden rule 13), and
  the fact is said ONCE, in the status bar, through a `Tag` whose type makes `onClick`
  inexpressible.

## What deliberately does NOT change

- 🔴 **`stack.silence-all-live-plates` stays UNSCOPED** — owner answer A16 and CLAUDE.md's
  cadence floor. It takes the `operator` class like any other intent and NO channel check, and
  the console gates it on the ROLE alone so that an operator whose selected channel is not
  granted still has the panic button.
- 🔴 **Auth OFF is byte-identical.** The gate reads the mode first and returns before anything is
  resolved — no role lookup, no channel resolution, no config read.
- **The unbound item keeps working.** `slot` is optional and the state is deliberately reachable;
  eleven of the fourteen item verbs already refuse such a row, and the three that do not touch no
  channel and nothing on air. Refusing them would take away behaviour that works today and call
  it a safety property. See `design.md` §4 for the per-verb table.
- **`auth.sign-out` while the console is locked.** REPLY 1 asked for it; it contradicts `B-229`'s
  recorded no-carve-out answer and the assertion `C-037` wrote to pin it. Not touched, and flagged
  for an owner answer — see `design.md` §7.

## Impact

- `@cg/shared-ipc` — `PermissionClass`, `holdsPermissionClass`, `grantsChannel`, `grantedChannels`,
  two refusal strings, and `permittedChannels` on `AuthState`.
- `tools/caspar-bridge` — `Route.perm`, `channelsForRequest`, `authzRefusal`, and
  `CasparRuntime.channelsForItem` / `.declaredChannels`.
- `apps/runtime` — `channelIds` takes the principal; `operableChannels`, `useCanOperate`,
  `useHoldsOperatorRole`, `ReadOnlyIndicator`; guards on the bulk verbs, the row verbs, PANIC,
  RELEASE, FAILOVER and the lock.
