## Decision

Keep an acknowledgement in browser storage, keyed by the configured Bridge address, server endpoints, authentication origin and stable operator ID. Two remote Bridges that both advertise a loopback Caspar endpoint remain separate scopes. The event identity includes timestamp, endpoints and reason. Retain at most 64 scopes. If browser storage is unavailable, acknowledgement lasts for the current window.

The intentional new localStorage key is `cg.runtime.failover.dismissed.v1`, recorded in the exact persisted-key census. It has no predecessor to migrate. Missing or unreadable storage means no event is acknowledged. The stored scope and event identity grant no station or failover authority; another operator, Bridge or new event remains independently visible.

The Bridge already distinguishes Playout stations through `playoutLinked`. Apply that same fact to both redundancy-adapter constructors, so a stored enabled legacy flag cannot select another CG primary. The UI reads the existing authentication mode and suppresses completed legacy events there. Connection alarms remain visible and use server wording without legacy strategy chips on Playout stations.

## Validation

DOM tests cover console remount, station and user isolation, new events, Playout suppression and non-dismissible live alarms. A built-page browser test reloads the console after acknowledgement and then publishes a new event. Two real AMCP fixtures prove automatic switching remains disabled on Playout stations before and after runtime reconfiguration. Existing direct-station automatic and manual switching remain positive controls.
