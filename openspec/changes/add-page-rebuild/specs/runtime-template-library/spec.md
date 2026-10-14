## ADDED Requirements

### Requirement: An import SHALL keep the verified package and the runtime that built its page

When CG Control imports a `.vcg`, it SHALL send the exact bytes it has just verified to CG Bridge before
the import. CG Bridge SHALL keep them by its own SHA-256 of the bytes received. The import SHALL name
that package only when CG Bridge answered the same hash, and SHALL name the template runtime that built
the page (`PageBuild`: CG Control's release and the page runtime fingerprint). A package CG Bridge
cannot keep (too large for one frame, refused, or answered with another hash) SHALL NOT fail the
import; the page is then simply not rebuildable.

#### Scenario: The verified bytes are kept

- **WHEN** an operator imports a `.vcg`
- **THEN** CG Bridge holds those exact bytes under their SHA-256, and the stored page names that hash and the runtime that built it, across a bridge restart

#### Scenario: A package that cannot be kept does not stop the import

- **WHEN** CG Bridge refuses the package or answers another hash
- **THEN** the template is imported as before and its page names no package

### Requirement: A console SHALL rebuild every page another runtime built, from the verified package only

When a console that may operate connects, it SHALL ask CG Bridge which listed pages were built by
another template runtime and have a kept package. Pages built by a newer CG Control release, pages
already waiting to be swapped in, and pages whose rebuild by this runtime failed SHALL NOT be
offered. For each page offered, the console SHALL read the kept package back, refuse it unless it
hashes to the package verified at import, and build the page through the import's own verify →
unpack → bake, keeping the operator's file name. A package that fails verification SHALL be reported,
never built.

#### Scenario: A runtime change rebuilds a page on connect

- **WHEN** a console whose runtime differs from the one that built a kept page connects
- **THEN** it rebuilds that page and CG Bridge lists the rebuilt page in its place

#### Scenario: The signature check still runs

- **WHEN** a kept package no longer passes `verify`
- **THEN** no page is built from it, the old page stays listed, and the failure is reported

### Requirement: A rebuilt page SHALL never land under a page on a layer

A rebuilt page SHALL be stored as a new version at a new serve path (`<templateId>~<version>`). While
an ADD of the old page is in flight, or any row holding it is in any state but `idle` (on air,
exiting, loaded with its page on the layer, unconfirmed, or not known), CG Bridge SHALL hold the
rebuilt page back and change nothing any channel's list names. The first row change that frees the
old page SHALL swap every list that names it over to the rebuilt page. The old page SHALL stay stored
and served while any row holds it.

#### Scenario: An on-air page is not rebuilt until it is off

- **WHEN** a rebuilt page arrives for a template whose row is on air, and then stopped with its page on the layer
- **THEN** the channel's list, the served path and the page on air are unchanged
- **AND WHEN** the row is cleared
- **THEN** the list names the rebuilt page at a new path, and the next take loads it

#### Scenario: A page on no layer is swapped at once

- **WHEN** a rebuilt page arrives for a template no row has on a layer
- **THEN** every list naming the old page names the rebuilt page at a new path

### Requirement: A failed rebuild SHALL keep the old page and tell the operator once

When a console cannot build a page, it SHALL report why. CG Bridge SHALL keep the old page listed,
record the failure on it, and SHALL NOT offer it again to the same runtime. The console SHALL tell the
operator once per pass, in one sentence naming each template, that it plays as before and must be
imported again.

#### Scenario: A failure is said once and not retried

- **WHEN** a rebuild fails
- **THEN** the old page stays listed, a failed `template-rebuild` audit row is written, the operator reads one sentence naming the template, and the same runtime does not try it again

### Requirement: The Library SHALL name, once, the templates that cannot be rebuilt

The template picker SHALL show one line, "Re-import these N templates" (or "Re-import 1 template"),
for the templates on its channel's list that this runtime cannot rebuild — imported before packages
were kept, or whose rebuild failed — each name isolated and its id only on hover. Nothing else about
those templates SHALL change: they stay listed and selectable, with no chip.

#### Scenario: An old template is listed once

- **WHEN** the picker opens on a channel that lists a template imported before packages were kept
- **THEN** one line names it, once, and the template is still listed

#### Scenario: Nothing to re-import, no line

- **WHEN** every page on the channel's list is current or rebuildable
- **THEN** no re-import line is shown

### Requirement: Every rebuild SHALL write one audit row

CG Bridge SHALL write one `template-rebuild` audit row per rebuild that takes effect, naming the
template and the old and new runtime, as the console that built it even when the swap lands during
another request. A failure SHALL write one `failed` row with the reason. The Log SHALL show the
releases (`0.11.6 → 0.12.0`) and carry the runtime fingerprints on hover.

#### Scenario: One row per rebuild

- **WHEN** a held-back rebuild is swapped in after its row is cleared
- **THEN** exactly one `template-rebuild` row records it, naming the template and both runtimes
