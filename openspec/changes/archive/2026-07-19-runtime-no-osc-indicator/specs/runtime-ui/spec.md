# runtime-ui Specification (delta)

## ADDED Requirements

### Requirement: A server that answers commands but cannot be heard SHALL say so

The operator surface SHALL distinguish a server that is DOWN from a server that is UP but whose
observation channel is not reaching the controller. The two are identical on the command axis and
call for OPPOSITE remedies — one is a configuration fix on the server, the other is a dead server —
so presenting them alike sends the operator to the wrong one, and the wrong one is the remedy that
interrupts air.

While the controller is connected and a declared server is answering commands, but nothing has ever
been observed from that server on its observation channel, the status surface SHALL show a distinct
indicator saying so. It SHALL be presented in the caution tone — never the treatment reserved for
air claims or for a server that is genuinely down — and SHALL sit ALONGSIDE that server's health
reading rather than replacing it, so both facts are legible at once.

While a server is flagged this way its own health reading SHALL STOP ASSERTING CONFIDENCE — it
SHALL be presented in the same unverifiable treatment used when health cannot be read at all,
keeping the state word (which remains true on the command axis) while withdrawing the confident
presentation. Leaving a confident reading beside the warning would put two contradictory claims of
equal weight in one row, where the reassuring one wins — the failure this surface has already been
corrected for twice.

The flag SHALL be per SERVER and SHALL name which server it applies to: declared servers are
observed independently, so one can be inaudible while another is fine, and an unattributed warning
would send the operator to the wrong machine.

Its detail SHALL name the fault as a CONFIGURATION problem on the server side, SHALL state that the
server is up, SHALL say what the controller cannot do while it persists, and SHALL give the remedy.
It SHALL NOT imply that restarting or reconnecting the server is the fix.

The indicator SHALL be suppressed where it could only mislead: while the controller's own link is
down (nothing about the server is observable then, and that story belongs to the link), in
simulation mode (there is no server), and before the server has completed its connection handshake
(a cold start has legitimately observed nothing yet). It SHALL clear on its own once observations
begin arriving, without an operator action.

The indicator SHALL derive from the same evidence the restore safeguard uses, so the two can never
disagree about whether the server has been heard. It SHALL NOT be derived from per-layer
observations: a healthy server whose layers are all empty produces none, and an indicator keyed on
those would fire on every idle install.

This is an indicator only. It SHALL NOT change any decision, gate, or command the controller makes.

#### Scenario: A server answering commands with nothing heard from it is flagged

- **WHEN** the controller is connected, a declared server is answering commands, and nothing has
  ever been observed from it
- **THEN** the status surface shows the indicator alongside that server's health reading

#### Scenario: The flagged server's health reading stops asserting confidence

- **WHEN** a server is flagged as inaudible
- **THEN** its health reading is presented as unverifiable rather than confident, so the two
  readings in the row do not contradict each other

#### Scenario: The flag names which server is inaudible

- **WHEN** one declared server is inaudible and another is being observed normally
- **THEN** only the inaudible one is flagged, and the flag names it

#### Scenario: The indicator survives the server's own state changes

- **WHEN** the server's health reading changes while nothing is still being observed from it
- **THEN** the indicator remains shown, so the explanation is present at the moment the health
  reading looks alarming

#### Scenario: The detail points at the configuration, not at a restart

- **WHEN** the operator reads the indicator's detail
- **THEN** it identifies a server-side configuration fault, states the server is up, lists what is
  degraded, and gives the remedy — and does not suggest restarting or reconnecting the server

#### Scenario: An idle but healthy server is not flagged

- **WHEN** a server is being observed normally but no layer holds anything
- **THEN** the indicator is not shown

#### Scenario: It is suppressed where it could only mislead

- **WHEN** the controller's own link is down, or the session is in simulation mode, or the server
  has not yet completed its connection handshake
- **THEN** the indicator is not shown

#### Scenario: It clears once observations arrive

- **WHEN** observations begin arriving from the server
- **THEN** the indicator clears without an operator action
