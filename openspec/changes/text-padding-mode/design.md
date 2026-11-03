## Decisions

Like corner radius, the value shape records the mode: a number is uniform and an object is per-side. Existing objects require no migration. Switching to per-side copies the uniform value; switching back uses top as the representative and migrates the matching keyframe track.
