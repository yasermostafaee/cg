# Design — one live state for a book (Delta B)

## 1. The split that caused the defect

CG Bridge owned `StackItemState.pages`, but Auto lived entirely inside the baked template runtime. No message crossed
that boundary when a dwell advanced, so the Inspector stayed on its last operator-written index. Sending an absolute
Next from that stale index then moved the page backwards or sideways. The fix makes the page's actual index the fact:
the page reports it, the bridge validates and publishes it, and a live relative turn is resolved where the live state
exists.

## 2. One token, two report meanings

`POST /page-state` carries `{ take, field, index }`. The bridge accepts it only for the current live take and a real,
in-range page list, then updates the retained/published counter. It does not spend the take token because one run
reports many pages. `POST /complete` keeps its one-shot meaning; `book-end` and root `self-end` share the page adapter's
per-token completion de-duplication.

The new endpoint is intentionally narrow on the template origin: no reads, enumeration, arbitrary row id or playout
verb. A token chooses its own current row; a field and non-negative index can only update that row's declared book.

## 3. Live turns are relative; staged state is absolute

If the row owns live seats, Previous/Next travels as `{ field, turn }` in one `CG UPDATE`. The template runtime queues
each turn received during entrance, picture decode or transition and applies them in order. Go to remains absolute.
When the row owns no live seat, the bridge changes only its absolute stored page and the next take carries it. This is
the same canonical live-seat gate used by configuration verbs, including a recovered seat whose status has not caught
up.

An Auto page may need a picture URL no operator command carried. Its media hash is already in the applied page list,
so the served page fetches `GET /page/<sha256>` from its own origin; the extension-bearing route remains compatible.

## 4. Advance is row-local configuration

The exported `TemplateInfo.pageLists[].advance` is the initial mode. `StackItemState.pageAdvance[field]` is the row's
optional override and is retained across bridge restart. `stack.set-page-advance` sends one configuration-only update
when the row owns seats and sends nothing off air. The next take always carries the effective mode. It never performs a
playout verb.

## 5. One terminal exit

A page-list sequence joins the existing element-outro ledger. Operator STOP/OUT calls its `playOutro()`, retires any
picture decode in flight, and awaits the authored `transitionOut`. A finite Auto run or Next on its last live page uses
the same visual boundary, then emits `book-end`; the existing completion receipt invokes the same graceful row STOP as
other self-ending graphics. Operator exits do not emit natural completion, so there is no stop loop.
