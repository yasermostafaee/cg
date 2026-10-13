# runtime-onair-cef-compat

## ADDED Requirements

### Requirement: The served page may reach its own origin and nothing else

The served page's Content Security Policy SHALL permit connections to its own origin, and SHALL permit no other network destination.

Before this change the policy named no `connect-src` at all, so it fell back to
`default-src 'none'` and every `fetch`, `XHR` and `sendBeacon` from a template was refused by
the page itself in every engine. That was a shipped property, written down in `SECURITY.md`
and in the export architecture, and relaxing it is deliberate rather than incidental.

The relaxation SHALL be `'self'` — for a served page, the bridge that served it — and SHALL NOT
be a host list, a scheme wildcard or `*`. A page loaded over `file://` has an opaque origin and
therefore still reaches nothing, which is the manually-dropped single-file case and is out of
scope by design.

The page SHALL open no connection unless it was given a take token. The policy states what is
POSSIBLE; the token is what makes anything happen, and a template served by anything other than
this bridge never receives one.

The CEF baseline SHALL be respected by whatever performs the request: it is written against APIs
present in the declared baseline and uses no banned built-in.

#### Scenario: The policy admits the page's own origin

- **WHEN** the served page is produced
- **THEN** its Content Security Policy names `connect-src 'self'`

#### Scenario: A cross-origin destination is still refused

- **WHEN** the page attempts a request to any origin other than the one that served it
- **THEN** the request is refused by the page's own policy

#### Scenario: A page with no token opens nothing

- **WHEN** a served page completes a run without ever having been given a take token
- **THEN** no request is attempted, whatever the policy permits
