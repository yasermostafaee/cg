import type { Element } from './elements.js';
import type { Scene } from './scene.js';

/**
 * 🔴 **`B-196` — THE RUNTIME CONTRACT VERSION, and the ONE comparison anybody makes with it.**
 *
 * ── WHAT THIS GUARDS, AND IN WHICH DIRECTION ────────────────────────────────
 *
 * A `.vcg` is a FILE, and a file outlives the build that wrote it. Two directions are
 * possible and only ONE of them needs a guard:
 *
 * - **An OLD package in a NEW app — NOT guarded, and deliberately.** The Runtime app rebuilds
 *   the served HTML from the scene at IMPORT using its own bundled runtime
 *   (`apps/runtime/src/renderer/features/library/templateDelivery.ts`), so the `cg.js` inside
 *   the package is never served and an old package is not old CODE. `P-031`'s compatibility
 *   floor is now set at release `0.11.4`: packages that release could open keep opening.
 * - 🔴 **A NEW package in an OLD app — THIS is the gap.** The package may declare something the
 *   older app's runtime cannot render, and the operator finds out at the worst moment.
 *
 * ── WHY A VERSION HERE, WHEN `capabilities.ts` REJECTED ONE FOR THE BRIDGE ──
 *
 * ⚠ `packages/shared-ipc/src/channels/capabilities.ts` considered and rejected a version
 * compare for the bridge↔SPA skew, on the grounds that it *"either refuses working stations …
 * or has to carry a hand-maintained compatibility range — a number somebody must REMEMBER to
 * bump."* **That objection is real and it applies here too; what differs is that no derived
 * answer exists for this question.** The bridge case could DERIVE both sides — the routed
 * channel list against the exported channel list — because the unit of failure is an
 * enumerable channel. A rendered scene has no such list: the unit of failure is "this app's
 * renderer does not do what this package assumes", which nothing enumerates.
 *
 * So this is a hand-maintained number, and the honest mitigation is to make it do as little as
 * possible: it is a CONTRACT version, not a build version. **Bump it only when the runtime
 * stops rendering something a scene could already declare, or starts requiring something older
 * runtimes cannot provide.** An ordinary release does not touch it — which is what keeps it
 * from becoming the guard that refuses working stations.
 *
 * ── WHAT IT ADDS OVER WHAT ALREADY REFUSES ──────────────────────────────────
 *
 * Both halves are already refused, badly. `SceneSchema`'s `schemaVersion: z.literal(1)`
 * (`scene.ts`) rejects a bumped document, and `ElementSchema` is a `z.union`, so an element
 * kind an older build does not know fails to parse. **The refusal exists; the MESSAGE does
 * not.** What an operator gets today is a zod failure with a path into an element array. This
 * turns that into one sentence naming the package, the version it needs and the version this
 * station has — which is the difference between a fault someone can act on and one they
 * escalate.
 */

/**
 * The rendering contract this build implements. See the header for when to bump it.
 *
 * 1.2.0 adds authored clock separator styling, a countup range and delayed Follow video Outros.
 * 1.2.1 applies normalisation gain on audio elements.
 * 1.2.3 carries authored paint order for overlapping Live plates.
 */
export const CG_RUNTIME_VERSION = '1.2.3';

/** Declare the minimum runtime that can reproduce all authored behavior in a package. */
export function requiredRuntimeVersionForScene(
  scene: Pick<Scene, 'layers' | 'compositions'>,
  requiresLivePlatePaintOrder = false,
): string {
  const compositions = [scene, ...(scene.compositions ?? [])];
  const hasElement = (matches: (element: Element) => boolean): boolean => {
    const visit = (element: Element): boolean =>
      matches(element) || (element.type === 'container' && element.children.some(visit));
    return compositions.some((comp) => comp.layers.some((layer) => layer.children.some(visit)));
  };
  if (
    requiresLivePlatePaintOrder ||
    hasElement(
      (el) =>
        el.type === 'video-placeholder' &&
        el.operatorMove !== undefined &&
        el.operatorMove !== (el.operatorPlacement !== undefined),
    )
  )
    return '1.2.3';
  if (hasElement((el) => el.type === 'audio' && (el.normalisationGainDb ?? 0) !== 0))
    return '1.2.1';

  const needsRuntime120 = (element: Element): boolean => {
    if (element.type === 'video') {
      return element.phases?.source === 'composition' && (element.phases.outroDelayFrames ?? 0) > 0;
    }
    if (element.type !== 'clock') return false;
    return (
      (element.separatorSpacingPx ?? 0) !== 0 ||
      (element.separatorOffsetYPx ?? 0) !== 0 ||
      (element.mode === 'countup' &&
        ((element.countupStartSeconds ?? 0) > 0 || element.countupLimitSeconds !== undefined))
    );
  };
  return hasElement(needsRuntime120) ? '1.2.0' : '1.1.0';
}

/** A parsed `major.minor.patch`. Pre-release and build metadata are not modelled. */
export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * `"1.2.3"` → `{1, 2, 3}`, or `null` when the string is not three dot-separated integers.
 *
 * `null` is a first-class answer and its handling is stated at {@link runtimeShortfall}: a
 * value nobody can read is not evidence that anything is wrong.
 */
export function parseSemver(value: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (m === null) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch)
  ) {
    return null;
  }
  return { major, minor, patch };
}

/** `-1` / `0` / `1`, comparing major, then minor, then patch. */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/** What a refusal has to be able to say. */
export interface RuntimeShortfall {
  /** The version the package declares it needs. */
  readonly required: string;
  /** The version this build implements. */
  readonly available: string;
}

/**
 * 🔴 **THE ONE COMPARISON.** Non-`null` means this build is OLDER than the package requires and
 * the import must be refused; `null` means it may proceed.
 *
 * ⚠ **It FAILS OPEN on an unreadable `required`, and that is deliberate rather than lax.**
 * Every package written before this field meant anything carries the literal `'0.0.0'`, which
 * parses and compares below everything — so they all pass, which is correct: they predate the
 * contract and nothing about them is newer than this build. A value that does not parse at all
 * is a MALFORMED MANIFEST, which is `verify`'s job and not this function's; refusing on it here
 * would turn a formatting slip into a station that cannot import anything, and would put two
 * authorities on one fact.
 */
export function runtimeShortfall(
  required: string,
  available: string = CG_RUNTIME_VERSION,
): RuntimeShortfall | null {
  const need = parseSemver(required);
  const have = parseSemver(available);
  if (need === null || have === null) return null;
  return compareSemver(need, have) > 0 ? { required, available } : null;
}

/**
 * The refusal an operator reads. One sentence, both versions, and the action.
 *
 * Kept beside the comparison so the two cannot drift: a message that named a different version
 * from the one that refused would send someone to update the wrong thing.
 */
export function runtimeShortfallMessage(name: string, shortfall: RuntimeShortfall): string {
  return (
    `"${name}" needs template runtime ${shortfall.required}. CG Control on this station provides ` +
    `${shortfall.available}. Update this station or ` +
    `re-export the template from a Designer matching it.`
  );
}
