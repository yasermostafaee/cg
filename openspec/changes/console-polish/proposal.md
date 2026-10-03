# console-polish — what the owner saw on his own-PC run of `0.10.0`: the open picker follows another console, the error badge counts real row errors, picker padding and Persian names, first-run's hint and check order, one sign-in look, a paged audit log, and two e2e defects (`B-300`…`B-305`, `R-080`…`R-083`)

Prompt: `CONSOLE-POLISH-01` (v3), 2026-10-03. Order: after `central-bridge` (archived `a8b59df5`) and after
`PLAYOUT-FEATURES-01` (archived `acfce121`) — so the license line of the check exists, and nothing is rebased.
Item 8 (the installers) is `INSTALLER-DESIGN-01`'s and is not touched here.

## Why

The owner ran `0.10.0` on his own PC, CG Bridge as a service and two consoles on it. Everything on air
worked; what follows is everything else he met.

- **`B-300` (§1).** An open template picker did not follow a removal made on the other console, and a Load
  of the removed template from it was refused in internal words.
- **`B-301` (§2).** The Layers header read `2 in error` and never cleared — on a station with no error on any
  row.
- **`B-302` (§3).** The source picker's `Inputs` tab touched the popover's edge.
- **`B-303` (§4).** `NDI کانالِ ۱ (APASAI)` read `NDI ۱ کانال (APASAI)` in the plate field, and a default the
  Playout no longer lists carried no mark.
- **`R-080` (§5).** Nothing said CG Bridge's address may stay empty, or where CG Bridge was found.
- **`R-081` (§6).** The check's "waiting for sign-in" line sat in the middle of the list, and the check was
  hard to find again after the first install.
- **`R-082` (§7).** The sign-in screens did not look like one product, and showed no version.
- **`R-083` (§9).** The LOG dialog read the whole audit file on every open, and the file never rotates.
- **`B-304`, `B-305` (§10).** Two e2e defects `PLAYOUT-FEATURES-01` found: a strict-mode race in
  `first-run.spec.ts:129`, and two specs fighting over `127.0.0.1:9250`.

## What changes

- **Templates (`B-300`).** The picker re-reads its channel's list on every `templates.changed` while it is
  open. CG Bridge tells every console who imported, re-imported or removed what (`templates.acted`); a
  template removed while chosen in an open picker, or while its Load is on the way, reads
  `“<name>” was removed on another console by <user>.` — never a raw refusal.
- **Row errors (`B-301`).** A Load the bridge refuses creates no item. The badge counts `error` rows of the
  view only, lists them when pressed, and each can be dismissed (the row then reads what is known). Items a
  refused Load left behind are dropped when CG Bridge starts: the owner's `2 in error` reads 0.
- **The picker (`B-302`, `B-303`).** The tab strip takes the rows' inset. Every operator name is laid out in
  its own direction — a name with Persian in it right to left, as the Playout shows it — in its own isolate;
  the `Default (…)` and `Use template assignment (…)` choices carry the name apart from their English; a
  default the Playout no longer lists reads `Unavailable`.
- **First-run (`R-080`, `R-081`, `B-304`).** The CG Bridge field: `Found automatically` and one hint line.
  The check's lines in four visible groups — Reachable, Versions, Sign-in, After sign-in — with new lines
  for CG Bridge's address, its version against this console's, this console's sign-in, CG Bridge's own
  session, OSC, the CG license and the channels. Station setup runs the same check. The Sign in section
  shows a blocker only once the check has a verdict.
- **Sign-in (`R-082`).** One card for the Playout sign-in, CG Bridge's sign-in and first-run: the Apasai
  mark and the product name, the version at the foot, a show/hide control on every password (a new shared
  `PasswordInput`), Enter from any field, one error line.
- **The audit (`R-083`).** `audit.page`: 100 rows a page, newest first, a cursor, the filters and the search
  run on CG Bridge; `audit.appended` pushes new rows; the list is virtualised. The audit file rotates daily
  and at 20 MB, and keeps 90 days and at most 200 MB; `Download logs` carries every kept audit file.
- **e2e (`B-305`).** `pgm-return.spec` runs its station and fake feed on its own loopback address.

## Not changed

Anything on air, the take wire and every refusal CONDITION (a refused Load is refused exactly as before; it
only stops leaving an item behind). `silenceAllLivePlates` stays unscoped. The installers. The Playout's
build is not shown: the Playout publishes none (`R-081` notes).
