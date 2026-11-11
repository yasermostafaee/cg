# Standalone CG station (R-098)

Fresh CG Control onboarding and the interactive Bridge installer present the APASAI Playout Engine connection.
The installer keeps an installed standalone service in its CasparCG maintenance page, with its existing host,
AMCP port, OSC port and shared-files settings available. An unattended installer may set `/MODE=standalone`
or `/MODE=playout` explicitly. Without a mode argument, an upgrade reads and preserves the installed mode.
Configuration without a mode uses the existing Playout behavior.

The unauthenticated control listener binds `127.0.0.1`. It accepts the installed app origin and native local clients; it rejects remote clients, foreign browser origins and unrelated Host headers. The graphics HTTP service stays separate so remote CasparCG can fetch template pages without access to the control listener.

CG Control reads the saved station from `cg.runtime.station.v1`. Existing Playout records and explicitly
standalone records retain their formats. The saved standalone record boots against a loopback Bridge whose
capability confirms standalone mode. It has no Playout session. Connection calls this card `CG Bridge` and
keeps the local Bridge and CasparCG endpoint controls. The dedicated maintenance check reports the configured
CasparCG endpoint's AMCP result. A verified local Bridge can answer that check even while CasparCG is offline.
An accepted address edit updates the existing record. `Set up again` opens the ordinary Playout onboarding.

The console selects the engine name at presentation time from the station's capability. Playout surfaces use
`APASAI Playout Engine` for engine cards, checks and diagnostics. Standalone maintenance uses `CasparCG`
for its engine. Bridge capability, persisted station keys, AMCP and authorization use their existing values.

B-434 reconciles the configured standalone banks with the running channels from primary AMCP `INFO`. Bridge publishes that observation separately from the configured banks and refuses a Take to a positively absent channel before muting. A connection whose channel list could not be verified supplies no new evidence. The console keeps an unavailable configured surface for repair if there is no overlap. Output consumers and the programme return are checked separately from channel existence. Playout continues to use its existing declarations, permission and licence checks.
