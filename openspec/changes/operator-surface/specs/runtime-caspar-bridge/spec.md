## MODIFIED Requirements

### Requirement: Server connection is reconfigurable at runtime, gated on air

The bridge SHALL accept a new `ConnectionConfig` (primary required, backup optional) over a
`connections.set-config` channel, validated against the shared schema, and SHALL apply it to the
RUNNING process: the declared sessions and redundancy adapter are torn down and rebuilt from the
new config, OSC interest is re-registered for retained slots, the per-server producer/adoption
knowledge is reset (so a later Take heals via adopt-CLEAR + re-ADD), the template serve options
are re-derived from the new primary host, and the sessions reconnect — WITHOUT restarting the
WebSocket bridge or dropping connected clients. The OSC bind SHALL derive from each declared
server's locality exactly like the template serve path (loopback host → loopback bind; remote host
→ routable bind), so a remote server's confirmations arrive.

> 🔴 **CORRECTED by `STALE-CLAIMS-02` §2 (2026-09-07) — the previous text named REMOVE-ALL as the
> unblock path, and wave 1 of this change refuses Remove-All in exactly the state that text
> describes.** The contradiction was invisible to `openspec validate --all --strict`, which checks
> SHAPE and not TRUTH, and no delta covered it. **The spec was the side that was wrong**: the
> behaviour it described was superseded on purpose, by an owner answer (`design.md` `§6` → (A)),
> for a stated reason — Apply gates on the on-air COUNT, not on an empty list, so Clear-All
> unblocks it and Remove-All is disabled precisely because of the condition being reported.
> Naming a control that the reported condition has just disabled is the defect `§6` exists to
> remove, and it is `B-212`'s "steering toward the sweeping remedy" one surface along.

Applies SHALL be SERIALIZED: at most one `set-config` executes at a time, and a concurrent request
is refused loudly (`reason: 'apply-in-progress'`) with nothing changed — two applies can never
interleave their teardown/rebuild.

Reconfiguration SHALL be REFUSED (bridge-authoritative) while anything is on air or unsettled: any
stack item with status `playing`, `on-air`, `updating`, `exiting`, or `unconfirmed`, or with a
pending intent, blocks the switch with a clear reason. Items resting `idle`/`loaded`/`error`/
`disconnected` do not block.

Failure semantics SHALL be land-on-new-config: an invalid config is rejected at the schema layer
with nothing changed; an unreachable host is NOT an apply error (sessions retry with backoff and
health honestly reports `disconnected`); if the template serve fails to bind even after a loopback
retry, the bridge reports `apply-failed` and remains running on the new config in a defined,
non-crashing state. Every applied config SHALL be published to all connected clients
(`connections.config-changed`).

Template-serve INTEGRITY across applies: the serve teardown SHALL be bounded (held client
connections — e.g. CasparCG CEF keep-alive or preconnect sockets — are force-destroyed, on every
Node version), and whenever serving has been started for the process, a completed apply SHALL
leave the template server genuinely listening or SHALL report `apply-failed` — never `ok` with the
serve down. A load issued while serving is intended but down SHALL be refused loudly
(`template-serve-down` on the item), and the bridge SHALL NEVER emit a bare template id as the
`CG ADD` argument in that state (an unservable bare id is a silent 404 on real CasparCG).

The stack list SHALL be clearable in one operation (`stack.remove-all`): every item is OUTed and
REMOVEd with the per-item CLEAR-destroys semantics, in sequence, clearing air and emptying the
list. **`stack.remove-all` SHALL itself be refused while anything is on air**, so it is NOT the
path that unblocks reconfiguration.

**CLEAR-ALL SHALL be the sanctioned path to unblock reconfiguration.** It takes every on-air item
off air and leaves every row on the stack, which is what a blocked Apply actually needs: the gate
counts what is ON AIR, not what is on the list. Every place that names the remedy — the settings
panel's copy, the offline mock, and the bridge's own refusal message — SHALL name Clear-All, and
SHALL NOT name a control that is disabled precisely because of the condition being reported.

#### Scenario: Re-point to a different server

- **WHEN** nothing is on air and the operator applies a config naming a different CasparCG
  **THEN** the bridge rebuilds its sessions against the new server, subsequent loads/takes reach
  that server, and every connected client receives the new config and fresh health

#### Scenario: Refused while on air, accepted after Clear-All

- **WHEN** any item is on air (or unsettled) and a new config is applied **THEN** the bridge
  refuses with an on-air reason, the reason names CLEAR-ALL as the remedy, and nothing changes
- **WHEN** the operator runs Clear-All **THEN** every on-air item comes off air, every row REMAINS
  on the stack, and a subsequent apply of the same config succeeds
- **WHEN** the operator instead runs Remove-All while an item is on air **THEN** it is refused
  bridge-side with nothing on the wire, so it cannot be the unblock path

#### Scenario: Unreachable host is honest, not fatal

- **WHEN** a config naming an unreachable host is applied with nothing on air **THEN** the apply
  succeeds, the sessions enter their normal reconnect/backoff loop, health reports the
  disconnected state, and the bridge neither crashes nor drops WS clients

#### Scenario: Concurrent applies cannot interleave

- **WHEN** a second `set-config` arrives while one is executing **THEN** it is refused with
  `reason: 'apply-in-progress'` and nothing changes, and a subsequent sequential apply succeeds
  with uncorrupted sessions and a listening template serve

#### Scenario: An apply cycle never strands the template serve silently

- **WHEN** any apply cycle completes (including one whose predecessor was interrupted or slow) and
  serving was started for this process **THEN** the template server is genuinely listening, or the
  apply reported `apply-failed` — never `ok` with the serve down
- **WHEN** a Load is issued while serving is intended but down **THEN** the load is refused with a
  clear `template-serve-down` reason and NO `CG ADD` reaches the wire (never a silent bare-id 404)
