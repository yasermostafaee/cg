## Decisions

An actual per-source observation without a JPEG qualifies for a fallback decision. Empty results, throttles, authentication failures and transport failures do not qualify. The existing presence readers refresh or share bounded D10/D11 reads; unknown or missing alternate presence never permits a fallback. Every node receives its own bearer and resolved IDs. Reading the peer picture does not change the selected audio, Listen or programme engine.

PVW keeps both nodes' same-view source unions warm, so adding a fallback never replaces a sibling source and repeated polls do not reopen leases. Recovered preferred pictures win and release unused alternate leases. Thumbnails and positioned media use at most one snapshot batch per node per normal poll. If the alternate already used its snapshot budget, its union warms on the next poll. Independent passive-input and positioned-media requests remain independent.

Only the matching source, and for positioned media the matching requested position, may replace a missing picture. Returned metadata names the actual delivering engine. Existing renderer provenance matching clears mismatched audio readings rather than presenting another node's VU as the picture's audio. Final target and selector checks prevent releasing earlier pictures after authorization or node configuration changed during asynchronous fallback validation.

Owner cleanup and PVW Stop invalidate pending fallback decisions. Both nodes' owned subscriptions close through their existing lifecycle. No PGM command or receiver-opening API is introduced.

## Validation

Real two-node HTTP fixtures reject foreign bearers and source IDs. Coverage includes both fallback directions, snapshot throttles, independent batch overlap, media position, PVW sibling unions and warm lease reuse, preferred recovery, missing authorization and delayed cleanup. Existing authenticated Bridge preview integration remains a compatibility check.
