# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: ON AIR display is honest when the SPA↔bridge link is down

The Runtime stack MUST NOT keep rendering a confident **ON AIR** for an item once the SPA↔bridge
link — the WebSocket to the local bridge, the SPA's only conduit to CasparCG — is down. While the
link status is `disconnected`, the renderer freezes the last stack snapshot (a disconnected bridge
publishes nothing, and the bridge-side `unverified` demotion of [[B-086]] cannot be sent by a dead
bridge), so an on-air row would otherwise stay frozen on the broadcast-red badge.

While the SPA↔bridge link is `disconnected`, each stack row whose frozen status is on-air (`on-air`,
or the `playing` fallback that renders identically) SHALL render in the muted **UNVERIFIABLE** state —
the same `unverified` presentation B-086 uses (never the broadcast red, never the amber of
`unconfirmed`), with an operator label conveying "was on air, cannot confirm now". A row that is not
on-air (e.g. `loaded`, `idle`) SHALL be unchanged. This is a **display mask** over the frozen
snapshot only: it changes no stored state and makes no restore-vs-reset decision.

On reconnect (link returning to `live`), the renderer re-pulls the authoritative stack snapshot and
the real status SHALL replace the mask automatically, with no operator action.

The `unverified` badge tooltip SHALL be accurate for both link-loss cases now that both render
`unverified`: when the SPA↔bridge link is down it SHALL name the **bridge** connection; when an item
is `unverified` from a CasparCG link-loss on a live bridge (B-086) it SHALL name the **CasparCG**
link. The visible badge label and icon SHALL be unchanged (muted "WAS ON AIR").

The on-air **refusal** is unchanged: while the link is down, `take`/`update`/`out` remain refused
(R-006). This requirement changes only the honesty of the on-air **display**, never what a command
does, and requires no bridge or schema change.

#### Scenario: An on-air row is masked when the bridge link drops

- **WHEN** a stack item is showing ON AIR and the SPA↔bridge link becomes `disconnected` (the bridge
  process died) **THEN** its badge renders the muted "WAS ON AIR" (`unverified`) state, not the
  confident red ● ON AIR and not IDLE

#### Scenario: The real status returns on reconnect

- **WHEN** the SPA↔bridge link returns to `live` **THEN** the renderer re-pulls the authoritative
  stack snapshot and the row shows its real current status (the display mask is gone), with no
  operator action

#### Scenario: A non-on-air row is untouched while the bridge link is down

- **WHEN** the SPA↔bridge link is `disconnected` and a row's frozen status is `loaded` or `idle`
  **THEN** its badge is unchanged — only the confident on-air/`playing` claim is masked

#### Scenario: The tooltip names the link that actually dropped

- **WHEN** a row is masked because the SPA↔bridge link is down **THEN** its `unverified` tooltip names
  the **bridge** connection; **WHEN** a row is `unverified` from a CasparCG link-loss on a live bridge
  (B-086) **THEN** its tooltip names the **CasparCG** link

#### Scenario: The on-air refusal is unchanged while the bridge link is down

- **WHEN** the SPA↔bridge link is down and the operator issues `take`/`update`/`out` **THEN** the
  command is still refused (R-006) — the display mask changes no command outcome
