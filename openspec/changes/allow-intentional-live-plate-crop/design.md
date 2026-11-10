## Decision

Read the authored fit from the same per-look carrier that determines the effective fit. An authored
`cover` permits a known aspect mismatch only while the effective mode is also `cover`. The
assigned source's known aspect continues to drive the existing geometry, including the preview crop
target and the first mixer fill. Without authored `cover`, a conflicting operator override
continues to refuse. `contain` and unavailable or unassigned inputs keep their existing paths.
