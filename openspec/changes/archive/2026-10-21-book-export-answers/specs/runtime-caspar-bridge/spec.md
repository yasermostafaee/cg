## ADDED Requirements

### Requirement: One frame cap for both ends, and no frame past it is sent

CG Bridge and every console SHALL judge a socket frame against ONE cap, `WS_MAX_FRAME_BYTES` (64 MiB, counted as
UTF-8 bytes), declared once in `@cg/shared-ipc`: the bridge SHALL build its socket with it, and a console SHALL NOT
write a frame past it — the request SHALL be refused with its size (`BridgeFrameTooLargeError`) and the link SHALL stay
up. Past the cap the bridge closes the socket, which every command in flight read as "Bridge disconnected" about a
bridge that was fine.

#### Scenario: A frame past the cap is refused before it is written

- **WHEN** a console asks CG Bridge to import a page whose frame is larger than 64 MiB
- **THEN** the request is refused with its size and the cap, nothing is written to the socket, the link never leaves
  `live`, and the next command is answered
