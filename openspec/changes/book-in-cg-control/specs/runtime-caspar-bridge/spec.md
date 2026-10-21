## ADDED Requirements

### Requirement: A stored page picture SHALL be read back by its hash

`pages.get` SHALL answer the bytes and type CG Bridge stores for a page picture's SHA-256 — the file
its template server serves CasparCG for that hash — or `no-page` when it holds none. It SHALL be a
read: judged by the `read` permission, acting on no channel, sending nothing to CasparCG, and not
keeping a picture alive (only a row naming it does).

#### Scenario: Read back

- **WHEN** a picture is stored and then read back by its hash
- **THEN** the answer is the same bytes, as `image/png`, and nothing reaches CasparCG

#### Scenario: Not held

- **WHEN** a hash the bridge does not hold is asked for
- **THEN** the answer is `no-page`
