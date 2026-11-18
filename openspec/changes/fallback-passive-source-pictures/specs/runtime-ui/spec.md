## ADDED Requirements

### Requirement: Independently authorized alternate passive source pictures

The Bridge SHALL permit a bounded read of the same logical source from the alternate engine only after the preferred engine returned a valid observation without a usable picture and the alternate source is positively confirmed and independently authorized. It SHALL preserve the actual delivering engine, source identity and requested media position. It SHALL NOT change programme, audio or Listen routing.

#### Scenario: Preferred observation is pending

- **WHEN** the preferred node returns a valid pending source observation without a JPEG and the independently resolved peer has a current picture
- **THEN** the peer picture replaces only that source's missing picture and reports the peer as its provider

#### Scenario: No observation or unconfirmed peer

- **WHEN** the preferred result is empty, throttled or refused, or alternate presence or authorization is unknown or missing
- **THEN** the Bridge does not guess a peer source or issue an unqualified alternate picture request

#### Scenario: Existing PVW and snapshot work

- **WHEN** fallback is added while another source is already previewing
- **THEN** both nodes retain their owned PVW source unions and normal snapshot budgets, independent input and positioned-media reads remain valid, and cleanup prevents late fallback work from reopening a stopped view
