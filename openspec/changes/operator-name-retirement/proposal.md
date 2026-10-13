# The console stops claiming to know who is sitting at it

## Why

Directly above rows carrying a name that came out of a signature check, the Audit panel said:

> It is a LABEL you typed, not a verified sign-in — it says which console, not which person.

That sentence was **correct for every build before `C-037`** and is **false now**. `C-037`
verifies a Playout-issued token offline, `C-038` gates every route on the principal, and the
audit record carries the verified name with the operator's `sub` beside it. A caveat calling
that a typed label does not make the operator careful — it tells them the record is weaker than
it is, which is the same class of harm as the missing caveat `B-143` filed in the first place,
with the sign flipped.

So the sentence goes, and the browser-held field behind it goes with it. Keeping the field while
deleting its warning would be the worst of the three options: a self-declared value with nothing
on screen saying so.

This is `R-066` bullet 5 — the last of its six — and it closes the item.

## What changes

- **The field, its persisted key and its contract members are retired.**
  `platform/operatorName.ts` is deleted; `cg.runtime.operatorName` is gone; `audit.operatorName`
  and `audit.setOperatorName` leave the `RuntimeBridge` contract. ⚠ **The channel is removed, not
  the control** (golden rule 13's door): a contract member with no UI is one edit away from
  coming back, and a type that cannot express the value is the only version of this that cannot
  be undone by accident.
- **The caveat is retired at its source and in every copy** — the multi-line JSX sentence, the
  actor column's `title`, the stylesheet that sized the strip, the two geometry tokens, and the
  stale comments in four files that named it only by its ticket id.
- **A permanent two-axis guard**, `operatorNameRetired.test.ts`: the retired symbols, the
  persisted key, and the caveat's clauses matched MULTI-LINE — each with a positive control
  proving the instrument was live. Proved to fail by planting both forms back, the sentence one
  split across lines.
- **§3(a)** — the channel strip now follows the configuration. A new per-socket
  `auth.state-changed` publish, computed by the same `authStateFor` the `auth.state` read uses.
- **§3(b)** — Station setup shows its settings as **values** below `station-admin`, not as
  inputs that can be typed into and never saved.

## 🔴 What an auth-OFF bridge records as `actor`

**`unattributed`, for every row.**

The console now omits the `actor` field entirely — it is `.optional()` on the request frame, so
the omission is legal and always was. `normalizeActor(undefined)` yields `UNATTRIBUTED_ACTOR`,
and `operatorSub()` stays null, so no `actorSub` is written.

**Why that is the honest answer, and not a regression dressed up as one:**

- It is what the system actually knows. With no Playout and no token there is no identity, and
  `unattributed` is a word for a state rather than a name.
- It already happened on every auth-OFF console where nobody typed a name — `normalizeActor('')`
  has always returned it. What this change removes is the ability to opt OUT of it by typing, and
  that ability was exactly the self-declared claim being retired. You cannot delete the warning
  and keep the thing it warned about.
- The remedy for a station that wants attribution in its log is federating identity, which is
  what this whole integration is for.

⚠ **And the consequence, named rather than discovered:** `unattributed` already means "no console
caused this" — a boot adoption, an OSC reconciliation, an emptied-air notice. On an auth-OFF
station an operator's TAKE now shares that string, so those two cannot be told apart in the actor
column. Nothing goes red; the collapse is silent. It is the accepted cost of not letting a
console assert an identity it cannot prove, and the operator guide says so where the filter is
described.

## Impact

- `apps/runtime` — one module deleted, the contract narrowed, the Audit panel's strip removed,
  the eslint raw-control ratchet lowered 3 → 2 in the same commit (the rule refuses movement in
  both directions).
- `packages/shared-ipc` — the `actor` docblock requalified; `AuthStateChangedChannel` added.
- `tools/caspar-bridge` — `authStateFor` extracted as the one composition; a second subscription
  on `configChanged`.
- `openspec/changes/*` — three unarchived deltas superseded in place, because archiving them
  unchanged would have written the retired requirement into the living spec.
