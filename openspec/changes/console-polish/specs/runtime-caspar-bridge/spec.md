## ADDED Requirements

### Requirement: A Load CG Bridge refuses SHALL leave nothing behind

CG Bridge SHALL judge a Load — onto a fixed row or not — before it creates the item: a Load refused
(`unknown-template`, `not-fixed`, `wrong-bank`, `slot-bound`) SHALL be answered and audited exactly as before,
and SHALL create no stack item, so nothing is counted, saved or restored for it. At start CG Bridge SHALL drop
every restored item that has no layer and is in `error` — what a refused Load left before this change — logging
one line for each and touching nothing on air. A row error SHALL be dismissable (`stack.dismiss-error`), judged
as a removal of that row is judged: the item's error is cleared and it reads the status it settled to.

#### Scenario: A refused Load

- **WHEN** a console Loads a template the channel does not list **THEN** the Load is refused
  `unknown-template` and the stack holds no new item — control: a Load of a listed template creates its row's
  item

#### Scenario: The owner's stored count

- **WHEN** CG Bridge starts on a stack holding two items with no layer in `error` **THEN** neither is restored,
  and a row item in `error` on a layer is restored as before

#### Scenario: Dismissed

- **WHEN** a row in `error` is dismissed **THEN** every console reads it in its settled status, and nothing is
  sent to CasparCG

### Requirement: CG Bridge SHALL tell every console who imported, re-imported or removed a template

After an import, a re-import or a removal it accepts, CG Bridge SHALL publish `templates.acted` to every
console — the act, the template's id and name, the channel (or none), and the acting user as the audit names
them — alongside `templates.changed`. A refused act SHALL publish nothing.

#### Scenario: A removal is named

- **WHEN** a user removes a template from CH 1 **THEN** every console is told `remove`, that template, CH 1 and
  that user — control: a removal refused `in-use` tells no one

### Requirement: The connection check SHALL also read CG Bridge's session, OSC, the CG license and the channels

The connection check SHALL answer, beside its lines of reach and sign-in, four lines that read CG Bridge's own
state: **CG Bridge's Playout session** (signed in as its account; waiting for a station admin; the Playout's
own refusal as sent), **OSC** (CasparCG's OSC arriving, with when it last did; silent — said as "no
confirmation", a warning and never a failure, golden rule 8), **the CG license** (licensed, with its cap; the
Playout's own reason when not; not read on a Playout that publishes none), and **the channels** (how many
the asking console's sign-in holds). Each line SHALL wait, neutral, until a sign-in can read it, and SHALL say
what it waits for. Every line SHALL be returned in the one order `CONNECTION_CHECK_GROUPS` gives.

#### Scenario: Before any sign-in

- **WHEN** a console checks before anyone has signed in **THEN** the session, OSC, license and channels lines
  each wait, and none fails

#### Scenario: After a station admin's sign-in

- **WHEN** a station admin is signed in, CG Bridge holds its session and CasparCG answers with no OSC **THEN**
  the session line passes, the OSC line warns that nothing confirms what is on air, and the AMCP line passes

### Requirement: CG Bridge SHALL page its audit, rotate it, and push new rows

CG Bridge SHALL answer `audit.page` with up to 100 rows, newest first, and a cursor for the next page, applying
the request's filters (channel, user, action, result) and its search — and the console's channel grant —
BEFORE the page is cut. It SHALL read only as far back as the page needs. It SHALL push each new row to every
console told that row's channel (`audit.appended`). The audit file SHALL rotate at local midnight and at 20 MB,
each rotated file named by the time of its first row so a cursor survives a rotation, and SHALL keep 90 days
and at most 200 MB in all, deleting the oldest first. `Download logs` SHALL carry every kept audit file. A
page read that a rotation crosses SHALL return the rows the record holds, its cursor walking on into the
rotated file — never an empty page, a partial one, or the in-memory tail in its place; a record that does not
hold still across a few reads SHALL make the read fail in words (`B-310`).

#### Scenario: Pages and a filter

- **WHEN** the audit holds 50,000 rows **THEN** the first page is the newest 100, the next page the 100 before
  them, and a filter by user returns only that user's rows, newest first

#### Scenario: Rotation keeps the cursor and the limit

- **WHEN** the audit rotates between two pages **THEN** the second page continues where the first ended **AND**
  a rotated file older than 90 days, or past 200 MB in all, is deleted

#### Scenario: A rotation inside one page read

- **WHEN** the writer renames the current file between the reader's two reads of the record's file list
  **THEN** the page is the newest 100 rows the record holds, its cursor in the rotated file **AND** a page asked
  with a cursor taken before the rotation continues in that file — control: the reader before `B-310` answered
  an empty page with no cursor (CI run 37185337111: 0 rows of 100)

#### Scenario: A record that never holds still

- **WHEN** the record rotates across every read of one page **THEN** the console is answered that the read
  failed, and is never handed the in-memory tail as the page

#### Scenario: The zip

- **WHEN** a station admin downloads the logs **THEN** the zip carries every kept audit file

### Requirement: Bridge tests SHALL read the AMCP mock's wire trace through one reader of complete lines

The bridge's tests SHALL read `@cg/amcp-mock`'s wire trace through ONE shared reader in their support
folder that parses only complete lines. A trailing partial line — one the mock is still writing, which
`traceFlush()` does not cover when it began after the barrier — SHALL be left for the next read, never
parsed. No test SHALL carry its own copy of the reader.

#### Scenario: A torn last line

- **WHEN** the reader is handed a trace whose last line is half-written **THEN** it returns the complete
  lines and does not throw — control: the per-test reader it replaced throws `Unterminated string in JSON`
  on the same text

#### Scenario: The rest of the line arrives

- **WHEN** the mock finishes the line **THEN** the next read returns it whole

### Requirement: CG Bridge SHALL name a plate `Plate N` in every sentence an operator reads, never by its id

CG Bridge SHALL name a plate `Plate N` in every sentence it sends that a console shows — a refusal of a
take, a look switch, a swap or a binding change, and the reason a plate was released by a look switch:
its position among its template's declared plates, counted from 1, through the one numbering `@cg/shared-ipc` provides
(`plateLabel`), which the console's own plate labels use too. A plate SHALL be numbered from the template's
whole declaration, never from a subset a caller was asked to resolve. A plate the template does not declare
SHALL be said in words, never by its id. Every source name such a sentence carries SHALL sit in its own bidi
isolate, in its own direction (`isolateText`). The id SHALL be relocated, not deleted: it stays in each
payload (`plateId`, `plateIds`, `refused`) and in the bridge's log lines. Only the words change: no refusal
condition and nothing sent to CasparCG.

#### Scenario: A refused swap

- **WHEN** CasparCG refuses the `PLAY` of a swap of a template's first plate **THEN** the refusal reads
  `CasparCG refused the substitution, so Plate 1 is still on its previous source. Nothing was cleared.`, with
  no plate id in it — control: the AMCP lines the swap sent equal, line for line, those the unchanged bridge
  sent for the same swap

#### Scenario: A plate released by a look switch

- **WHEN** a switch to a solo look tears down a clip set to restart when hidden and holds four other plates
  **THEN** each release's reason begins `Plate 2` … `Plate 6`, none carries a plate id, and each release's
  `plateId` still names the plate — control: the switch's AMCP lines equal those recorded before the change

#### Scenario: A plate numbered in its template

- **WHEN** a look switch must resolve only the template's third plate and it has no source assigned **THEN**
  the refusal reads `Plate 3 has no live source assigned …`, not `Plate 1`

#### Scenario: A Persian source name

- **WHEN** a take is refused because `ورودی ۴` cannot be shown on channel 2 **THEN** the refusal reads
  `Plate 1: “ورودی ۴” can't be shown on CH 2.` with the name in a right-to-left isolate
