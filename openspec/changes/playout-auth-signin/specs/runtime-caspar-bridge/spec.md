# runtime-caspar-bridge

## MODIFIED Requirements

### Requirement: Browser↔bridge wire protocol is `@cg/shared-ipc` over a WebSocket

The browser and the bridge SHALL communicate over a single WebSocket carrying the existing
`@cg/shared-ipc` request/response and publish channels as JSON frames — the same contract
`MockRuntime` implements. The system SHALL NOT define a low-level AMCP/OSC byte protocol over
the WebSocket. Both ends SHALL validate each frame against the channel's Zod schema at the
boundary.

The wire **frame envelope** SHALL be defined once and shared by both ends (in `@cg/shared-ipc`),
as JSON-serialized frames discriminated by `type`:

- `request` — `{ type: 'request', id, channel, payload }`
- `response` — `{ type: 'response', id, payload }` or `{ type: 'response', id, error }`
- `publish` — `{ type: 'publish', channel, payload }`
- `auth` — `{ type: 'auth', id, token }`, browser → bridge, carrying a Playout-issued JWT

A request and its response SHALL be correlated by `id`. The inner `payload` of each frame SHALL
be the existing channel's request / response / publish schema, validated against that channel
before dispatch (request) and before send (response/publish).

The `auth` frame SHALL NOT be a channel and SHALL NOT appear in the route table, so that the
authorisation gate can run before any principal exists without a carve-out for the door itself.
Its `token` SHALL be a non-empty string at the schema, so that a malformed frame is refused at
parse rather than by a verifier. Its reply SHALL be an ordinary `response` frame correlated by
the same `id`.

#### Scenario: Channel calls are relayed over the WebSocket

- **WHEN** the renderer invokes a `RuntimeBridge` method **THEN** it is serialized as the
  corresponding `@cg/shared-ipc` channel frame, answered by a correlated response frame, and
  push channels arrive as `publish` frames — with the renderer unchanged

#### Scenario: Round-trip is provable end to end through an in-memory backing

- **WHEN** the bridge runs its in-memory backing and a `WebSocketRuntime` connects **THEN**
  `stack.load` / `take` / `update` / `out` issued over the WebSocket are reflected back to the
  browser via `stack.state-changed` publish frames, proving the full request/response + publish
  round-trip without any real CasparCG

#### Scenario: Frames are schema-validated at the boundary

- **WHEN** a frame arrives whose inner payload does not match its channel schema **THEN** it is
  rejected at the boundary (the request gets an `error` response; a malformed publish is
  dropped) rather than reaching application logic

#### Scenario: An `auth` frame carrying anything but a token string never reaches a verifier

- **WHEN** an `auth` frame arrives whose `token` is absent, empty, a number or an object
  **THEN** the frame fails the envelope schema and is dropped, so no cryptographic code is the
  first thing to meet a malformed input

### Requirement: The bridge binds loopback by default

The bridge SHALL bind its WebSocket server to `127.0.0.1` by default, enforced at socket bind
(not merely documented). LAN exposure of the control WebSocket SHALL require explicit
configuration and SHALL never be the default.

The control-plane bind SHALL be independent of the CasparCG connection config: no
`ConnectionConfig` — including one applied at runtime via `connections.set-config`, and
including one that declares a REMOTE server — may change where the control WebSocket binds.
Only the DATA plane follows the declared server's locality: the template HTTP server (content
CasparCG fetches) and the OSC UDP ingest (inbound telemetry only) bind routable interfaces ONLY
when the declared server host is non-loopback.

A bridge that binds a NON-LOOPBACK host while authentication is OFF SHALL print a warning naming
the exposure and the mode. The combination stays PERMITTED — it is the owner's development
default (ADR 0010 rule 11) — but it SHALL NOT be silent.

#### Scenario: Default bind is loopback-only

- **WHEN** the bridge starts with no host override **THEN** it binds `127.0.0.1` at the socket
  level, so non-loopback origins cannot reach it

#### Scenario: A remote server config never exposes the control plane

- **WHEN** a config declaring a remote (non-loopback) CasparCG host is applied at runtime
  **THEN** the control WebSocket remains bound to `127.0.0.1` (a new loopback client still
  connects and round-trips) **AND** only the template serve and OSC ingest go routable, with the
  LAN exposure reported to the operator

#### Scenario: An unauthenticated control socket off loopback says so at boot

- **WHEN** the bridge binds a non-loopback host with authentication OFF **THEN** a warning names
  the exposure and the mode, and **WHEN** either the bind is loopback or authentication is ON
  **THEN** no such warning is printed

## ADDED Requirements

### Requirement: A socket establishes its principal from a Playout-issued token, verified offline

The bridge SHALL accept an `auth` frame and verify the token it carries OFFLINE, with no request
to the Playout at verification time: ES256 against the Playout's cached JWKS; `kid` present in
that key set; `iss` compared BYTE-FOR-BYTE to the configured `playout.issuer` and never derived
from any other value; `aud` equal to or containing the configured audience; `exp` and `nbf`
within ±60 s; and `name`, `roles` and `cg_channels` well formed. An unknown `kid` SHALL cause the
key set to be re-fetched at most once per 60 s before the token is refused.

The resulting principal SHALL belong to THAT SOCKET and no other, so that two browsers presenting
two tokens interleave their requests without either seeing the other's identity. The verified
`name` SHALL become the value `operatorActor()` yields — reduced ONCE, by the same normaliser every
other name entering the process goes through — and the token's `sub` SHALL be recorded beside it.
A name longer than the wire's bound SHALL be recorded as truncated, once, rather than shortened
silently.

A refused token SHALL be answered with a sentence naming the reason CLASS — expired, not for this
station, or could not be verified — and SHALL leave any principal the socket already held in
place.

#### Scenario: A valid token seats a principal and names the operator in the record

- **WHEN** a socket presents a token whose `kid` is in the key set, whose `iss` matches the
  configured issuer byte for byte, whose `aud` contains the configured audience and which is
  within the clock tolerance **THEN** the principal is set, the reply carries the verified name
  and `sub`, and every audit row that request reaches records that name

#### Scenario: Two sockets with two tokens never cross

- **WHEN** two sockets hold two different principals and interleave their requests **THEN** each
  request's audit row carries its own socket's verified name, and neither sees the other's

#### Scenario: A display name longer than the bound is recorded as shortened

- **WHEN** a token carries a `name` longer than the wire's maximum **THEN** the principal reports
  the shortened name together with the fact that it was shortened, the `sign-in` row records that
  fact once, and later rows do not repeat it

#### Scenario: An unknown key id re-fetches the key set at most once a minute

- **WHEN** tokens signed by a key that is not published arrive repeatedly **THEN** the key set is
  re-fetched no more than once per 60 s and each token is refused

#### Scenario: The token never travels on the template origin

- **WHEN** the template HTTP server's route set is listed **THEN** it carries no `auth`, identity
  or control route — only the template files and `POST /complete` — and its route KINDS are
  exactly the two it has always had, so a route at an unguessed path cannot be added silently

### Requirement: An unauthenticated socket is answered by the capability handshake, the sign-in door and the connection check, and nothing else

While authentication is ON, a socket that has not presented a valid token SHALL be refused every
request except `bridge.capabilities`, the `auth.*` channels and the connection check
(`setup.check`), with ONE shared sentence that names the state, names the remedy and states that
nothing was done — never naming CasparCG, which a refused request need not involve
(`DELTA-MULTI-CHANNEL-01-B` B1). Before any sign-in the connection check SHALL probe only this
station's own Playout: a check that names another address, or a CasparCG host, SHALL be refused
with its own one sentence. The refusal SHALL be decided at the one chokepoint every request passes,
beside the lock gate, and SHALL be evaluated per request rather than latched at connect.

Such a socket SHALL also receive no PUBLISH frames, because a stream of state is something other
than the two doors it is entitled to.

`bridge.capabilities` SHALL report the authentication MODE, and when that mode authenticates,
the address at which a browser signs in, the address at which it refreshes, and the integration
contract version — because that channel is asked at connect, before the operator can press
anything.

#### Scenario: Every route is censused, not sampled

- **WHEN** the route table is walked with no principal held **THEN** exactly
  `bridge.capabilities`, `auth.state`, `auth.sign-out` and `setup.check` are reachable and every
  other route is refused

#### Scenario: The check answers before a sign-in, for this station only

- **WHEN** the Playout is down and a socket that never signed in checks this station's Playout
  **THEN** the check answers with its lines **AND** a take on the same socket is refused
- **WHEN** that socket checks another address **THEN** it is refused, and nothing is probed

#### Scenario: The refusal is one sentence and it reaches the operator unchanged

- **WHEN** an intent is refused for want of a principal **THEN** the answer is the single shared
  constant, worded so that the bridge-error translator passes it through verbatim, and it is the
  same sentence whether the socket never signed in, its token expired, or its token was revoked

#### Scenario: No state reaches a socket that has not signed in

- **WHEN** bridge state changes while an unauthenticated socket is connected **THEN** that socket
  receives no publish frame, while a socket on a bridge with authentication OFF receives it as
  before

#### Scenario: The console can discover that it must sign in

- **WHEN** an unauthenticated socket asks for the capabilities **THEN** it is answered, and the
  answer says the bridge authenticates and where to sign in

### Requirement: An expired or revoked principal degrades; it never disconnects and never touches air

A token that has passed its expiry, or whose `jti` appears on the Playout's revocation list, SHALL
cause NEW intents to be refused with the same shared sentence, while `read` routes and the
client's own resync keep answering. The socket SHALL NOT be closed, nothing on air SHALL change,
and a fresh `auth` frame on the SAME socket SHALL restore every control with no reload.

#### Scenario: Expiry refuses intents and keeps answering reads

- **WHEN** a held token passes its expiry plus the clock tolerance **THEN** intents are refused
  with the shared sentence, reads still answer, the socket is still open and no publish reports a
  change to air

#### Scenario: The clock tolerance is real

- **WHEN** a held token is past its expiry but still inside the ±60 s tolerance **THEN** intents
  still answer

#### Scenario: Signing in again on the same socket restores everything

- **WHEN** a fresh valid token is presented on a socket whose previous token had lapsed **THEN**
  the intent that was just refused answers, on the same connection, with no reconnect

### Requirement: Revocation is polled in the background and never asked at the gate

The bridge SHALL poll the Playout's revocation list at most once per 60 s, while at least one
principal is held, and SHALL read the last answer SYNCHRONOUSLY when deciding a request. The gate
SHALL NOT await a network call. When the Playout is unreachable the bridge SHALL keep the last
list it saw: an outage means a verdict cannot be UPDATED, never that it flips.

#### Scenario: A revoked token is refused within the polling interval

- **WHEN** a held token's `jti` appears on the revocation list and the list is next read **THEN**
  that socket's new intents are refused with the shared sentence while its reads keep answering

#### Scenario: A Playout outage never changes a verdict

- **WHEN** the Playout becomes unreachable **THEN** already-verified tokens keep working to their
  expiry, and a `jti` already known to be revoked stays refused

#### Scenario: The poll is bounded

- **WHEN** many requests are made inside one polling interval **THEN** the revocation list is
  requested at most once, and once the interval has passed the next request triggers exactly one
  more

### Requirement: The Playout link is configured under the bridge's precedence and refuses to start half-configured

The Playout configuration — the authentication mode and the `playout.*` addresses — SHALL resolve
as CLI flags > persisted file > default, with the default being authentication OFF. It SHALL
persist in its own file rather than in the connection config, because that config is the body of
a request any connected socket may send.

A mode that authenticates with a missing issuer or key-set address SHALL be a startup FAILURE
whose message names the missing key. The bridge SHALL NOT fall back to not authenticating. A
persisted file that is present but unusable SHALL likewise be a startup failure rather than a
warning.

#### Scenario: A flag overrides the file without clobbering it

- **WHEN** a flag and the persisted file both name a value **THEN** the flag wins for that field,
  the fields it did not name keep the file's values, and the file is not rewritten

#### Scenario: A bridge told to authenticate and told nothing else refuses to start

- **WHEN** the mode is set to authenticate but the issuer or the key-set address is missing
  **THEN** startup fails with a message naming that key, and no socket is left listening

#### Scenario: The default is off, and off is today

- **WHEN** nothing configures the Playout link **THEN** authentication is off, the capabilities
  say so, no route is refused, and no new file is written
