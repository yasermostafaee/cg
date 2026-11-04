# Preview command/data workspace

## Why

The composition Preview is the Designer's rehearsal surface, but its narrow dialog and data-first
sidebar make the transport hard to reach and waste space when a template has many variables. The
owner wants a large command-first workspace, visible elapsed time and a dense Variables table.

## What changes

- Enlarge the Preview modal within the current viewport.
- Put a large stable frame/time status strip directly above the Preview picture, and keep transport
  at the top of the right workspace.
- Give Preview text/list editors the same first-strong automatic direction as CG Control.
- Remove the Preview **Out** button; Stop remains the explicit closing command, with its existing
  animated closing contract and immediate counter reset.
- Put advanced/session timing after the transport and Variables below it.
- Render scalar variables as compact aligned rows while preserving rich list/repeater editors.
- Remove persistent instructional prose where a label or contextual info affordance is enough.
- Gate transport on the current Preview iframe's ready signal, resetting readiness on rebuild/reopen
  and ignoring unrelated or obsolete frame messages. Early commands must not be dropped while elapsed
  time advances. This is a Full-lane command/lifecycle fix, not a media-capture retry workaround.
- Make dedicated Preview Reset actually end the current rehearsal immediately, including paused or
  closing content, restore the host's seeded field data (including connected-file rows) and the initial frame, and remain blank until an
  explicit new Play. Reset must not start a graceful Stop outro or change Canvas/on-air contracts.

## Impact

Designer renderer and its generated Preview host, plus a small status message for natural completion. No schema,
package, Runtime-on-air, bridge or CG Control protocol change.
Readiness reuses the existing dedicated-iframe handshake; it does not change stored template timing
or on-air transport semantics.
