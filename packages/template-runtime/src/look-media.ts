/**
 * `multibox-layout-switch` §14 (LOOKS) / `B-150` — **CONTENT INSIDE A LOOK THAT IS NOT ON
 * SCREEN IS PARKED: silent, and not spending frames.**
 *
 * `applyLook` shows exactly one look's composition instance and hides the rest with
 * `display: none`. Hiding a node does not stop what is inside it: a `<video>` goes on
 * decoding, a Lottie goes on computing a frame per tick and pushing `goToAndStop`, a crawl
 * goes on crawling. Under LOOKS that stops being an exotic case and becomes the ordinary
 * one — every look a template authors is built and running, and only one of them is
 * visible — while `design.md` §9.6f measured the frame budget as the tight resource
 * (−4 % for interpolating holes, −10 % for a backdrop crossfade). Paying that for pictures
 * nobody can see is the whole of the defect.
 *
 * ── THE MEMBERSHIP TEST IS THE DOM, DELIBERATELY ────────────────────────────────
 *
 * A member is hidden when it sits inside a look instance that is not the active one, and
 * that is asked of the NODES (`Element.contains`) rather than of a scope table. The reason
 * is golden rule 8's: probe the axis you intend to judge. `display: none` is a fact about
 * the DOM, so a registry that answered from a parallel structure could disagree with what
 * is actually on screen — and containment answers correctly for a member nested any number
 * of compositions deep inside a look, which is the case a flat table gets wrong first.
 *
 * ── SILENCE IS NOT THE PAUSE, AND THAT SEPARATION IS THE POINT ──────────────────
 *
 * Two obligations, deliberately not fused:
 *
 *   - **Silence is unconditional.** Nothing whose picture is off screen may put sound on
 *     air. That holds no matter what the pause policy says, which is exactly why it is a
 *     separate act: when the operator toggle of `tasks.md` 7.10 lets an installation keep
 *     hidden looks DECODING, the silence must survive it untouched.
 *   - **Pausing is the policy**, and it is what the toggle will govern.
 *
 * 🔴 **The mute is CAPTURED AND RESTORED, never forced to `false` on revive.** Restoring a
 * literal `muted = false` would be a mechanism for putting audio on air that nobody
 * authored — the opposite failure, and a worse one. What was true before the park is what
 * is true after it.
 *
 * ── WHAT IS DELIBERATELY NOT PARKED ─────────────────────────────────────────────
 *
 * 🔴 **Content that gates a HOLD.** A graphic with a content-driven hold stays on air until
 * its content completes; a paused driver never completes, so parking a hold-gating driver
 * inside a hidden look would hold the graphic on air FOREVER. That is far worse than a
 * decoding video, so `parkable` is decided at registration from the same `drivesHold` the
 * hold arrays are built from, and a member that gates the hold is silenced but never
 * paused. ⚠ Its bound, stated rather than discovered: `D-112` lets a PARENT instance
 * re-filter a child's hold participation, so a member registered as parkable can still be
 * pulled into a parent's aggregation. Registration reads the element's own flag, which is
 * the same value every other consumer reads.
 *
 * 🔴 **Clocks — at all, and this is not an oversight.** A clock's entire job is to track
 * time that passes whether or not anyone is looking. `ClockDriver.resume()` accrues the
 * paused interval into `pausedAccumMs`, which `activeElapsedMs()` subtracts — so a
 * duration countdown parked for thirty seconds comes back claiming thirty seconds more than
 * remain. It would lie about a deadline, and (a countdown being an opt-OUT hold driver) it
 * would extend the graphic's life by the time it spent hidden. An absolute-target clock
 * repaints correctly on resume, so parking it would buy one repaint's worth of nothing at
 * the cost of a rule with an exception in it.
 */

/**
 * The pause/resume pair every content driver in this package already implements — plus
 * `isRunning()`, which `B-217` added because the park needs to know whether a pause DID
 * anything before it promises a resume (see `#park`).
 */
export interface ParkableDriver {
  pause(): void;
  resume(): void;
  /** True while the driver is actively advancing its content (not stopped, not paused). */
  isRunning(): boolean;
}

/** Just enough of a media element to silence it — kept structural so tests need no DOM. */
export interface Silenceable {
  muted: boolean;
}

export interface LookMediaMember {
  /**
   * The node whose place in the tree decides whether this member is on screen.
   *
   * `B-217` — a GETTER is accepted as well as a node, for the one kind whose node a host may
   * legitimately REPLACE: the Designer preview pools a `<video>` across a rebuild and
   * transplants it over the freshly built one (`preview.ts` `reconcileVideos`), so the node
   * captured at registration is detached from then on, `contains()` answers false for it,
   * and the member would never be parked or silenced again. The video registers `live()`
   * (the same resolver `B-137` gave its driver) so the question is asked of the node that is
   * actually in the document.
   */
  readonly node: Element | (() => Element);
  readonly driver: ParkableDriver;
  /**
   * `false` when this member gates a hold: it is silenced while hidden but never paused,
   * because a paused driver never completes and the graphic would never come off air.
   */
  readonly parkable: boolean;
  /** The element to silence, when this kind has sound at all — a getter for the same reason as `node`. */
  readonly audio?: Silenceable | (() => Silenceable) | undefined;
}

const nodeOf = (member: LookMediaMember): Element =>
  typeof member.node === 'function' ? member.node() : member.node;

const audioOf = (member: LookMediaMember): Silenceable | undefined =>
  typeof member.audio === 'function' ? member.audio() : member.audio;

/**
 * The ONE seam LOOKS uses to park hidden content — and the seam `tasks.md` 7.10's operator
 * toggle will be injected into when it is built.
 *
 * ⚠ **No policy field is carried today**, deliberately: an option nothing reads is the
 * written-but-unreachable class this repo has filed repeatedly, and the toggle is not this
 * change's. When it lands it becomes a constructor option here and changes `#reassert`'s
 * pause half alone — the silence half is not a policy and must not become one.
 */
export class LookMediaPark {
  readonly #members: LookMediaMember[] = [];
  #hiddenRoots: readonly Element[] = [];
  readonly #paused = new Set<LookMediaMember>();
  readonly #silenced = new Map<LookMediaMember, boolean>();

  /**
   * Enrol one driver. Called where the driver is BUILT, because that is the only place
   * both its node and its hold participation are known.
   */
  register(member: LookMediaMember): void {
    this.#members.push(member);
  }

  /**
   * The look instances that are NOT on screen. Empty ⇒ nothing is hidden, which is the
   * correct state for a template that authors no looks: every member stays live.
   */
  setHiddenRoots(roots: readonly Element[]): void {
    this.#hiddenRoots = [...roots];
    this.reassert();
  }

  /**
   * Bring every member into line with the current look. **Idempotent, and it must stay
   * that way** — it is called after anything that can start content (a run's `play()`, the
   * hold-entry content start, a loop-cycle re-arm) as well as on the switch itself, and a
   * second call must never double-pause or resurrect what it just parked.
   *
   * ⚠ There is no chokepoint every content start passes through, so this has more than one
   * caller by necessity. `looks-media-park.test.ts` therefore ENUMERATES those callers and
   * asserts the park holds after each — the same technique `live-add-mute` uses bridge-side,
   * and for the same reason: a chokepoint that acquires a caller who bypasses it is how this
   * class comes back.
   */
  reassert(): void {
    for (const member of this.#members) {
      const node = nodeOf(member);
      const hidden = this.#hiddenRoots.some((root) => root === node || root.contains(node));
      if (hidden) this.#park(member);
      else this.#revive(member);
    }
  }

  #park(member: LookMediaMember): void {
    const audio = audioOf(member);
    if (audio !== undefined) {
      // CAPTURE once, ASSERT every time. A member already silenced keeps its ORIGINAL
      // captured value — re-capturing would record our own mute as the thing to restore —
      // but the mute itself is re-applied, for the same reason `pause()` is below.
      if (!this.#silenced.has(member)) this.#silenced.set(member, audio.muted);
      audio.muted = true;
    }
    if (!member.parkable) return;
    /*
      🔴 **`pause()` IS RE-ISSUED ON EVERY REASSERT, and the obvious `if (already parked)`
      guard is a BUG.** This class does not own the drivers: `play()`, the hold-entry content
      start and a loop-cycle re-arm all call `reset()` + `start()` on them, knowing nothing
      about looks. A guard on our own bookkeeping would see "already parked", skip the pause,
      and leave a driver that had been restarted underneath us running inside a hidden look —
      which is exactly the state this class exists to prevent, reached by the code meant to
      prevent it. The set records only that a revive owes a `resume()`.

      Costs nothing to re-issue: every driver's `pause()` in this package returns immediately
      when it is not running or already paused.

      🔴 **`B-217` — A REVIVE IS OWED ONLY TO A DRIVER THE PAUSE ACTUALLY STOPPED.** This used
      to add the member to the set unconditionally, and `resume()` on a VideoDriver or a
      LottieDriver does not "continue" — it STARTS a driver that was never running (the ticker
      and sequence drivers refuse; the media drivers do not). The Designer canvas never plays,
      so every driver there is idle: one look switch away and back was enough to set a clip
      playing in the static editor, and the playhead then could not position it (`positionAt`
      is a no-op for a running driver) until the next rebuild. Measured 2026-09-04 in
      `video-looks-blank.spec.ts`. On air nothing changes: a running driver is still recorded
      and still resumed. The set is never REMOVED from here — a member paused by an earlier
      reassert is not running now, and still owes its resume.
    */
    if (member.driver.isRunning()) this.#paused.add(member);
    member.driver.pause();
  }

  #revive(member: LookMediaMember): void {
    const audio = audioOf(member);
    if (audio !== undefined && this.#silenced.has(member)) {
      // Whatever was true before the park — NOT `false`. See the header.
      audio.muted = this.#silenced.get(member) ?? true;
      this.#silenced.delete(member);
    }
    if (!this.#paused.has(member)) return;
    this.#paused.delete(member);
    // Every driver's `resume()` in this package continues IN PLACE rather than restarting:
    // `VideoDriver.resume()` re-anchors its clock to the media's actual position and plays
    // without seeking, which is what makes a switch back to a look seamless rather than a
    // visible jump to the top of the clip.
    member.driver.resume();
  }
}

/*
  ⚠ **A `parkedCount()` "test/diagnostic surface" was written here and REMOVED, unused.**
  Noted rather than silently deleted, because the pull towards it is real and the next reader
  will feel it too. Nothing called it: the tests assert what the operator would see — a
  `<video>`'s `paused`/`muted`, a crawl's transform — and an accessor reporting this class's
  own bookkeeping would have let a test pass while the DOM said otherwise, which is the exact
  failure the DOM-containment membership test exists to rule out. It is also the
  written-but-unreachable class this repo has filed repeatedly. If a future change needs to
  observe the park, observe its EFFECT.
*/
