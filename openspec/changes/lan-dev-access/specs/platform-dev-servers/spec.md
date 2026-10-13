# platform-dev-servers — delta (LAN dev access, P-041)

## ADDED Requirements

### Requirement: The dev servers are reachable from the plant network by default

The Designer and Runtime Vite DEV servers SHALL listen on every interface by default, SHALL print
each network URL at start, and SHALL be restrictable to loopback by setting `HOST=127.0.0.1`. The
default SHALL be LAN-visible rather than a flag to remember, because this is a private plant
network and a flag someone has to remember is the failure mode this repo has already paid for.

The dev-only boundary SHALL be enforced in code, not by convention: only Vite's `server.*`
option — read by the `vite` dev server alone — carries the LAN default. `vite preview` (which
reads `preview.*`) SHALL stay loopback by default, and a build SHALL bind nothing. A unit test in
each app SHALL pin the dev default, the `HOST` restriction, and the preview default separately,
so a change to one cannot silently carry the other.

The HMR host SHALL be left unset so Vite's client follows the page's own `location.hostname`,
and this SHALL be verified over a LAN address rather than assumed from the server binding.

#### Scenario: Default is LAN-visible

- **WHEN** either app is started with `pnpm --filter @cg/<app> dev` and `HOST` is unset **THEN**
  the server listens on every interface, prints a `Network:` URL for each, and a browser on the
  LAN loads the page at that address

#### Scenario: HOST restricts back to loopback

- **WHEN** either app is started with `HOST=127.0.0.1` **THEN** the dev server binds loopback
  only and is not reachable at the LAN address

#### Scenario: Preview and build are unchanged

- **WHEN** `vite preview` is started with `HOST` unset **THEN** it binds `127.0.0.1` as before,
  **AND** the Playwright suite, which serves the built app through `vite preview` at
  `127.0.0.1`, runs unchanged

#### Scenario: HMR connects over the LAN address

- **WHEN** a browser opens the dev server at the LAN address **THEN** Vite's HMR socket targets
  that same address and port and receives `{"type":"connected"}` — it does not point at
  `localhost` while the page itself loads

### Requirement: A browser client derives its server origin from where the page was served

A browser client SHALL derive the host of every server it reaches from the page's own origin
(`location.hostname`), in ONE module, and SHALL NOT read it from a hardcoded `localhost` /
`127.0.0.1` or from a build-time constant. Only the HOST follows the page; a server's PORT is a
property of that server and SHALL stay its documented default. A page served over `https:` SHALL
use `wss:`. When there is no page origin to follow (a Node test, a `file:` page) the client SHALL
fall back to loopback. A test-harness override SHALL take precedence when it is a non-empty
string, so E2E can pin a dead port and a Node test an ephemeral real server.

#### Scenario: The defect, stated so it can be tested

- **WHEN** the Runtime page is opened at `http://192.168.21.93:5174` from a second machine
  **THEN** it probes `ws://192.168.21.93:5280`, never `ws://127.0.0.1:5280` (which on that
  machine is its OWN loopback)

#### Scenario: A page opened locally still reaches a local bridge

- **WHEN** the page is opened at `http://localhost:5174` or `http://127.0.0.1:5174` **THEN** it
  probes the bridge at that same host, port 5280

#### Scenario: No page origin falls back to loopback

- **WHEN** the resolver runs where `location` is absent (Node) or has an empty hostname
  (`file:`) **THEN** the URL is `ws://127.0.0.1:5280`

#### Scenario: The harness override wins

- **WHEN** `__CG_BRIDGE_URL__` is a non-empty string **THEN** it is used verbatim; an empty or
  non-string value is ignored and the page decides

### Requirement: A hardcoded client origin fails lint

The renderer lint tier SHALL refuse, in client source (`src/**`), a string that spells an origin
by hand: a scheme beside a loopback / unspecified / IPv4-literal host, a loopback or IPv4 host
beside a port, a scheme beside any host and one of this repo's own default listening ports, or an
import of the bridge's bind-default constants. The module that derives the origin SHALL be the
one exemption, by path, and the exemption SHALL NOT extend to a neighbouring file. The rule SHALL
NOT be enabled for Node-tier code, which legitimately logs the address it binds. The rule's header
SHALL state the shapes it cannot see.

#### Scenario: The old constant fails

- **WHEN** client code contains `'ws://127.0.0.1:5280'`, `` `ws://${host}:5280` ``,
  `'http://localhost:5174/'`, `'http://' + host + ':4000'`, a literal IPv4 origin, or
  `'127.0.0.1:5280'` **THEN** `cg/no-hardcoded-origin` reports it

#### Scenario: Reading the bind default as a client target fails

- **WHEN** client code imports `DEFAULT_BRIDGE_WS_URL` or `DEFAULT_BRIDGE_HOST` from
  `@cg/shared-ipc` **THEN** the rule reports the import; importing `DEFAULT_BRIDGE_PORT` alone
  is allowed

#### Scenario: Legitimate spellings pass

- **WHEN** client code contains an SVG namespace URL, a bare CasparCG-style host with no scheme
  or port, operator text that mentions an address, a fully derived origin, or a public example
  URL **THEN** the rule stays quiet

#### Scenario: Owner exempt by path, neighbour not

- **WHEN** the origin literal appears in `src/platform/bridgeUrl.ts` **THEN** the rule stays
  quiet, **AND** the same literal in `src/platform/bridgeUrlCopy.ts` is reported

#### Scenario: Proven on the real tree

- **WHEN** the rule is run over the five renderer-tier workspaces after the change **THEN** it
  reports nothing, **AND** run over the verbatim pre-change `createRuntimeBridge.ts` it reports
  exactly the bind-default import
