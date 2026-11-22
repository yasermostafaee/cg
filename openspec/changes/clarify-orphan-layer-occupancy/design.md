## Context

The occupancy sweep uses the reported producer kind and channel-layer to find occupied layers
outside the operator's stack. That observation leaves output visibility and producer origin unknown.

A D-201 foreground page can occupy the highest available live-source slot. Stop tears down the
input seats and synchronizes the foreground outro, and the hidden HTML page remains available for
another Take. Bridge-only restart can lose its in-memory foreground ownership. The reported layer
has no verified producer URL. Restoring ownership requires verified page identity, and releasing
the page after Stop requires confirmation that its own outro ended.

## Decisions

- The alert and each row identify HTML occupancy outside the stack. The warning directs the
  operator to Program to check the output.
- The video notice reports its channel-layer and producer kind without claiming a second system
  placed the producer. The same CG Bridge can seat a route, and the occupancy report carries no
  creator identity. The bridge ledger continues to exclude owned seats from the notice.
- Clear confirmations name each target and describe the removal of its producer. Clear continues
  through the existing per-layer command and its current guards.
- A bank Clear and an orphan Clear both update a matching bound row when the current primary
  acknowledges removal. The orphan command must still pass its existing unowned guard at
  dispatch. Binding may change while the command is in flight.
- The row retains its binding, drops its cached resident producer and ignores late OSC frames
  until its next Take. A newer row intent keeps its own result. Acknowledgement from the backup
  alone does not settle the primary's row.

## Preset artwork retirement

CasparCG can send a final OSC producer sample while its stage removes a temporary artwork route.
That sample can arrive after the Bridge has acknowledged Clear, invalidated its occupancy cache
and released the native transition lease. Consecutive sweep sightings can then report an empty
seat. The integration regression delivers such samples after two real preset switches.

The Bridge records acknowledgement for artwork routes identified during native retirement. When
a fresh route sample on one of those seats could be left over from cleanup, one read-only stage
query for the affected channel can confirm the seat is empty. The check is scoped to the engine
session and the retirement window. An occupied seat, an uncertain stage result, or a new producer
observation still goes through normal orphan detection. This evidence is used only for notices.

A Bridge-only update may leave a producer running in CasparCG while the old process’s temporary
artwork ownership is lost. Persistent live layers are restored by the existing ledger, while
native transition leases live in memory. Boot observations of genuinely occupied seats still
follow the ordinary rules. The exact upgrade-time and recurring station warnings have not been
captured with the active engine and ownership state.
