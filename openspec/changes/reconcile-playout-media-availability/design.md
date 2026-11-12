## D11 observations

The Bridge requests an explicit limit equal to the by-ID batch size. It treats a page with a
cursor, inconsistent total or unreadable entries as incomplete for determining missing IDs.
Valid matches refresh the existing catalogue in either a by-ID or search response. The Bridge
keeps the timestamp and playback settings from the station's current binding.

The Bridge assigns an observation order before issuing each request and retains the last order
only for bound IDs. A response that arrives late cannot undo a newer observation. Search hits
for unbound clips continue to live in the transient lookup.

The Media picker uses the current search item for an exact ID while displaying that result.
This also handles a Bridge that still reports the older saved status. IDs absent from the
current results continue to use their saved catalogue state.
