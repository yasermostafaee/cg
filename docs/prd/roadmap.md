# Roadmap / strategic notes — NOT engineering backlog items

This file captures **discussed-but-not-actioned** items that aren't (yet) concrete
engineering work: business/strategic decisions, go-to-market, and large external
integrations to validate. They live here so the conversation isn't the only record.

> These are **notes, not `D-`/`C-`/`P-` items.** When one becomes actionable, promote
> it to a real PRD item in the right file (with What / Why / Acceptance) and link back
> here. Don't implement straight from this list.

## Non-engineering / strategic

- **License decision.** `LICENSE` / the README license is still **TBD**. Pick and
  apply a license (and any third-party/font attribution, e.g. Vazirmatn) before any
  external distribution. _Owner: project lead — a business decision, not a code task._
- **Go-to-market (GTM) + on-air reference deployment.** Establish a real reference
  deployment running on air (or a pilot station) as the credibility anchor, and the
  GTM motion around it. Gates several "post-stabilization" items (e.g. the end-user
  docs site, P-006). _Strategic; sequence after the feature set stabilizes._

## Integrations / validation to scope later

- **MOS / newsroom (NRCS) integration.** Integrate with newsroom systems via the MOS
  protocol so rundowns/graphics flow from the NRCS. Large and external; needs its own
  design (and likely the host/bridge, since browsers can't speak MOS directly). Scope
  into PRD items (probably under `caspar.md` / a new area) when prioritized.
- **Frame-accuracy validation on target hardware.** Validate playout/animation
  frame-accuracy on real CasparCG hardware + CEF, not just happy-dom/Chromium. The
  engine is time-based (FrameDriver) by design; this is the on-target confirmation that
  it holds at broadcast frame rates. Pairs with the single-file CEF/`file://` hardening
  item (`C-007`).

## Already tracked elsewhere (do not duplicate)

- **End-user product documentation site (Loopic-style).** Tracked as **P-006** in
  [`platform.md`](./platform.md) (blocked: post-feature-stabilization / GTM).
- **Engine docs + coverage** for the canvas editor and animation subsystem are tracked
  as **D-036 / D-037** in [`designer.md`](./designer.md); the template-runtime pass
  (Item 2 step 1) is already done.
