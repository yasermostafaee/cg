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

- **Multi-sport runtime architecture — one generic app, sports as data (NOT one app per sport).**
  Decision for the Runtime/sports wave: do **not** build a separate control app per sport
  (football / basketball / volleyball / …). Build **one generic Runtime** where a sport is a
  **declarative "sport definition" (data/config)**, plus per-sport template packs and a
  sport-data connector — exactly how NewBlue Captivate does it (one product + a generic
  "Sport Data Controller" add-on + named data inputs like Stat Crew statistics/scoreboards and
  NewTek DataLink + per-sport template collections; the "baseball-ness" of its control surface
  is configured buttons + baseball templates + a Stat Crew feed, not a baseball binary).
  Three data/config layers on one app:
  1. **Sport definition (declarative):** state fields (`score`/`period`/`clock`; baseball
     `balls`/`strikes`/`innings`/`outs`; basketball `fouls`/`shotClock`/`quarters`; soccer
     `halves`/`addedTime`/`cards`; tennis `sets`/`games`/`points`) + allowed operations
     (`+1 score`, `next period`, `start/stop clock`). A "+1 strike" button is just a declared op.
  2. **Operator panel auto-generated from the sport definition's declared operations** —
     adding a sport = adding a definition; the panel populates itself. This single decision is
     what prevents N apps.
  3. **Per-sport template pack** authored in the Designer (scorebug / lineup / stat-card),
     bound to the sport's state fields; reusable.
     Plus a **sport-data connector** ("Sport Data Controller": Stat Crew / Sportzcast / Daktronics /
     generic JSON·CSV·Sheet) to auto-fill state — it must live in the **host/bridge (C-001)** because
     browsers can't read serial/TCP/UDP/XML feeds. This is the sports specialization of the broader
     live-data-source gap (which also unlocks weather / stocks / elections). The only genuinely
     sport-specific **code** is unusual scoring (tennis deuce/advantage, cricket overs/wickets,
     volleyball rotation/sets): a small per-sport rules module behind a common interface — a plugin,
     not an app.
     **How to honor when scheduled:** scope **C-004** as a declarative sport-definition (state schema
  - operations + default control-surface layout + default template bindings) rather than hardcoded
    sport logic; have **C-005** render its control surface from those declared operations; file the
    **sport-data connector** as a new `caspar.md` item riding on **C-001**; **C-002** sequences
    per-sport presets on air and **C-006** feeds rosters/lineups. Promote to real PRD items in
    [`caspar.md`](./caspar.md) when the runtime wave starts; until then this is the design intent
    C-004/C-005 must follow.

## Already tracked elsewhere (do not duplicate)

- **End-user product documentation site (Loopic-style).** Tracked as **P-006** in
  [`platform.md`](./platform.md) (blocked: post-feature-stabilization / GTM).
- **Engine docs + coverage** for the canvas editor and animation subsystem are tracked
  as **D-036 / D-037** in [`designer.md`](./designer.md); the template-runtime pass
  (Item 2 step 1) is already done.
