## Why

A Playout node can report a valid pending source observation while its decoder advances without exporting a JPEG. Presence alone then selects that node forever, leaving PVW and source pickers blank even when the peer has a current picture of the same logical source.

## What Changes

After a valid observation without a usable JPEG, permit one independently authorized picture read from the peer. Require positively confirmed alternate presence and that node's own source identity. Preserve snapshot budgets, PVW union leases, cancellation and actual provider metadata. Programme, audio and Listen routing do not change.

## Impact

CG Bridge internal read routing only. No IPC, persisted data, station authority, programme commands or hidden receiver changes.
