# runtime-ui

## ADDED Requirements

### Requirement: The console signs in to the Playout when the bridge asks for it

The console SHALL show a sign-in over the live stack when the bridge advertises that it
authenticates and this console holds no valid principal.

That sign-in SHALL be in English — every word of the console's own, with Persian only in names
that come from the Playout (`DELTA-MULTI-CHANNEL-01-B` B3) — and built from the shared control
primitives with no raw control and no locally styled one. It SHALL carry the Playout's address with
CHECK beside it and ONE line of the connection check, a username, a password, ONE action and ONE
message line, and nothing else — no explanation of how sign-in works and no advice. The check SHALL
run once when the sign-in opens, and the username, the password and the action SHALL be enabled
only while the check says a sign-in can work — the Playout's keys and this console's CORS entry
both pass; while it does not, the one line SHALL be the check's own line saying why, and CHECK SHALL
stay available (`DELTA-MULTI-CHANNEL-01-B` B2). Only a wrong username or password SHALL mark a
field.

The console SHALL post the credentials to the PLAYOUT directly, at the address the bridge
advertised, so that the bridge never sees a password; it SHALL NOT route them through the bridge
and SHALL NOT route them through the template origin. It SHALL map the Playout's stable error
CODE to its own sentence and SHALL NOT display the Playout's free-text message.

The sign-in SHALL appear only when the bridge has SAID that it authenticates. A bridge that has
not answered yet SHALL produce no sign-in, because an unanswered handshake is not a statement
that the operator is signed out.

The token SHALL be held per console, survive a reload, be presented on every (re)connect from the
one site a connection is established, and be refreshed about ten minutes before it expires while
the page is open. A failed refresh SHALL NOT sign the operator out: the access token is valid
until it expires. Signing out SHALL clear the stored token and drop the bridge's principal without
closing the socket.

#### Scenario: The gate appears only when the bridge says it authenticates

- **WHEN** the bridge reports that it does not authenticate, or has not answered yet **THEN** no
  sign-in is rendered and no surface changes
- **WHEN** the bridge reports that it authenticates and no principal is held **THEN** a modal
  sign-in is rendered over the console with CHECK and one action, and no way past it

#### Scenario: A sign-in is offered only when it can work

- **WHEN** the Playout does not answer **THEN** the fields and the action are disabled and the one
  line is the check's own, in English **AND WHEN** the Playout answers and takes sign-in from this
  console **THEN** they are enabled
- **WHEN** the Playout stops answering between the check and the sign-in **THEN** the check runs
  again and its line says so, and no field is marked

#### Scenario: Each failure has its own sentence, on the surface the operator is looking at

- **WHEN** the Playout answers `invalid_credentials`, `no_cg_access`, `account_locked` or
  `rate_limited` **THEN** the sign-in shows this console's own English sentence for that case, the
  sentences differ from one another, only `invalid_credentials` marks the password field, and the
  password field is cleared while the username is kept

#### Scenario: The token is presented before anything else on every connect

- **WHEN** the socket opens, on the first connect and on every reconnect **THEN** the held token
  is written as the first frame, ahead of the capability handshake and the resync, so that the
  requests behind it are not refused

#### Scenario: A reload keeps the session and asks nothing

- **WHEN** the page reloads while a valid token is held **THEN** the console signs in again from
  storage and no sign-in is shown

#### Scenario: Signing out clears both halves and keeps the link

- **WHEN** the operator signs out **THEN** the stored token is removed, the bridge is asked to
  drop the principal, the sign-in returns, and the socket is not closed

### Requirement: The console's sign-in state is named in the operator's words, on its own instrument

The console SHALL name its sign-in state beside the link indicator, in the operator's words, as
one of: signed out; signed in as a named operator; or a session that has ended, naming whose. It
SHALL show nothing at all when the bridge does not authenticate or has not answered.

It SHALL be a SEPARATE instrument from the link indicator, because a console that is signed out
still has a live link and one indicator may not report two axes.

Internal identifiers SHALL NOT appear in the sentence: the operator's opaque id belongs in the
audit record, not on the status bar. Every operator NAME the console renders SHALL be
bidi-isolated, so that a Persian name beside English chrome is placed by the console rather than
by the bidirectional algorithm.

#### Scenario: Three states, named as facts

- **WHEN** the console is signed out, signed in, or holding a session that has expired **THEN**
  the indicator says which, in the operator's words, and says nothing when the bridge does not
  authenticate

#### Scenario: The identifier is relocated, never shown

- **WHEN** a principal is displayed **THEN** the operator's name appears and the opaque subject
  id appears nowhere in the sentence

#### Scenario: A state fact is written as a fact

- **WHEN** the indicator renders **THEN** it is not a control: it has no click handler, no button
  role and no disabled-control chrome
