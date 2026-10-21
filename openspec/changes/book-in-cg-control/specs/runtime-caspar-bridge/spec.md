## ADDED Requirements

### Requirement: A book's text page SHALL travel as text

A page list value MAY hold TEXT pages (`{ id, text }`) among its pictures (`RUN-NEXT-VERSION-03` 1.6). CG Bridge SHALL
accept it (a text page names no picture to hold), count it as a page, and a turn onto it SHALL carry the page and no
picture address; the page draws the text in the sequence's own style.

#### Scenario: A turn onto a text page

- **WHEN** a book of a picture, a text page and a picture is taken and turned to page 2
- **THEN** one `CG UPDATE` carries `"page":{"field":"pages","index":1}` and no `media`, and the next turn names the
  third page's picture

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
