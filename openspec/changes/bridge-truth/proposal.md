# Proposal — `BRIDGE-TRUTH-01`: the bridge's account of itself

## Why

`BRIDGE-TRUTH-01` §1 re-ran the exemption audit `PLAYOUT-AUTHZ-01` lost to compaction: every
exemption the lock (`B-229`) has, and every place the auth or permission gate reuses a lock-era
condition, each answering _does this justification transfer to the permission axis?_ One line
answered **no, and it is live** — `B-257`: the lock was bridge-wide while its PIN was known only to
whoever engaged it, so an operator granted channel 1 could lock an operator of channel 2 out of
CLEAR and PANIC on a channel the first one held no grant for. Three more were measured on the way
(`B-258`, `B-259`, `B-260`).

The prompt's later sections are three places where the bridge's account of itself is wrong:
`CLEAR` leaves a layer's mixer state behind (§2, `B-253`), three ways of misreading `INFO` (§3),
and an auth-OFF audit that cannot tell an operator from the machine (§4).

## What Changes

**Commit 1 — the lock and auth axis (`REPLY 1` R1 + R2).** 🔴 Each is a refusal-condition change:

- **`B-257` NARROWS the lock's scope.** A lock covers the engager's channel set, captured at
  engage, and refuses only intents that touch a covered channel the requester holds. Auth OFF and
  an engager holding `'*'` keep the every-channel lock byte for byte. `lock.state` gains an
  optional `channels`; a console the lock does not reach does not present itself as locked.
- **`B-259` ADDS a refusal.** An `auth` frame presenting a DIFFERENT principal on a console the
  lock reaches is refused with the lock sentence; the same-`sub` refresh and a first sign-in pass.
- **`B-260` (b) REFUSES a mutation under a lock.** A re-delivery that would overwrite a held
  template is refused while the lock reaches the console; one that registers a missing id, or
  changes nothing, still passes. (a) Every template mutation writes an audit row — two new
  actions, `template-redeliver` and `template-remove`.
- **`B-258`** — a refused reconnect frame (`stack.restore`, a re-delivery) is still refused, and
  is no longer RECORDED as a press under the principal's name.

**Commit 2 — §2 + §3, with `REPLY 1` R3's corrections.** **Commit 3 — §4.** Filled in as they land.

## Impact

- `@cg/shared-ipc` `LockStateSchema` (optional `channels`); `@cg/shared-schema` `AuditEntrySchema`
  (two actions). Both additive.
- `tools/caspar-bridge`: the lock gate, the `auth` frame, template import/remove, the authz
  refusal recorder. Nothing changes on the path to air in Commit 1.
- `apps/runtime`: the lock screen, the status bar's lock slot and the channel strip read how much
  of the console the lock covers.
