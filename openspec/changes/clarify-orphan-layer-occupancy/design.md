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
