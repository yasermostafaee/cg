# runtime-ui — delta (PVW must show every element kind the artifact carries: B-136)

## ADDED Requirements

### Requirement: PVW renders every element kind the retained page carries, video included

The Runtime's PVW (PREVIEW) panel SHALL render every element kind the retained single-file page
carries, including `video`. PVW exists so an operator can check what air will show BEFORE taking it
to air, so a PVW that silently omits an element is a correctness failure, not a cosmetic one: an
operator MUST never be able to believe PVW is showing the real picture when it is not.

Because the rehearsal frame is an `<iframe srcDoc>`, its document INHERITS the embedding page's
Content-Security-Policy, which is enforced IN ADDITION to the policy the artifact declares for
itself — the intersection governs. The embedding page's CSP SHALL therefore admit every resource
scheme the exporter can emit. In particular it SHALL declare `media-src` admitting `data:`, since
`@cg/single-file-export` inlines a packaged video as a base64 `data:video/webm` URI; without that
directive media falls back to `default-src` and every video in PVW is refused while images, fonts
and scripts still load.

That policy SHALL be no wider than the need: schemes the application never produces SHALL NOT be
admitted merely to match another application's policy. Parity with a sibling application is NOT a
reason to widen a policy — the Designer admits `blob:` media because it plays video off object URLs,
and this application creates none. A scheme SHALL be added only by a change that needs it, and that
change SHALL carry a test demonstrating the need.

#### Scenario: A video-bearing template rehearses and its video plays in PVW

- **WHEN** a template whose retained page carries a base64 `data:video/webm` element is put ON PVW
- **THEN** the `<video>` in the rehearsal frame loads its media (it reaches at least
  `HAVE_METADATA`) and no Content-Security-Policy violation is raised against `media-src` or
  `default-src` for that media

#### Scenario: The embedding page's own policy is what admits the media

- **WHEN** the Runtime page's Content-Security-Policy is read
- **THEN** it declares a `media-src` directive admitting `data:`, rather than relying on
  `default-src`, and it does NOT admit `blob:` media, which this application never creates
