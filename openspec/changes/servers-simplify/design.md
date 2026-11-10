# Standalone CG station (R-098)

`No Playout` is an explicit choice in Windows Setup. Older configuration files and upgrades that do not choose a mode keep their existing Playout configuration. A standalone service skips Playout authentication, catalogue, licence and first-run flows, and uses the existing CasparCG AMCP connection.

The unauthenticated control listener binds `127.0.0.1`. It accepts the installed app origin and native local clients; it rejects remote clients, foreign browser origins and unrelated Host headers. The graphics HTTP service stays separate so remote CasparCG can fetch template pages without access to the control listener.

CG Control validates the configured local address and the Bridge's positive `standalone` capability before saving it. The persisted key stays `cg.runtime.station.v1`. The previous Playout record format remains valid; CG Control does not send a saved Playout token to a standalone station. The standalone check probes the Bridge's configured CasparCG, while the old Playout check and its authorization policy remain in place.
