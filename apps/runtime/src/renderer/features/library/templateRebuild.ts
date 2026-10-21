import type {
  ChannelRequest,
  ChannelResponse,
  PageBuild,
  TemplateInfo,
  TemplatesRebuildChannel,
  TemplatesRebuildPlanChannel,
  TemplatesSourceGetChannel,
} from '@cg/shared-ipc';
import { templateDisplayName } from '@cg/shared-ipc';
import { sha256Hex } from '@cg/vcg-format';
import { base64ToBytes } from './packageBytes.js';
import { produceTemplateDelivery, type ProduceOptions } from './templateDelivery.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **CG CONTROL BUILDS ITS TEMPLATES' PAGES AGAIN WHEN ITS TEMPLATE
 * RUNTIME CHANGES.**
 *
 * Every page is baked at import, in this console, from this console's bundled runtime — so a runtime
 * fix reached a station only after every template was re-exported and re-imported by hand. CG Bridge
 * now keeps each template's VERIFIED `.vcg` beside its page, with the runtime that built it. When a
 * console with another runtime connects, it asks the bridge what to rebuild, reads each kept package
 * back, checks the bytes are the ones verified at import, runs the SAME `verify` → `unpack` → bake
 * the import ran ({@link produceTemplateDelivery}), and sends the page. The bridge decides when it
 * goes into use: never under a page on a layer.
 *
 * ⚠ **THE SIGNATURE CHECK IS NOT WEAKENED, AND NOTHING NEW IS TRUSTED.** The only input is the
 * package the import verified, byte for byte (its SHA-256 is compared before anything else), and it
 * is verified again here by the same call. A package that fails is reported, and its old page stays.
 *
 * Kept React-free, like the import it reuses, so the pass is unit testable on a fake bridge.
 */

/** What the pass needs of `window.cg`. */
export interface TemplateRebuildBridge {
  templates: {
    rebuildPlan(
      req: ChannelRequest<typeof TemplatesRebuildPlanChannel>,
    ): Promise<ChannelResponse<typeof TemplatesRebuildPlanChannel>>;
    source(
      req: ChannelRequest<typeof TemplatesSourceGetChannel>,
    ): Promise<ChannelResponse<typeof TemplatesSourceGetChannel>>;
    rebuild(
      req: ChannelRequest<typeof TemplatesRebuildChannel>,
    ): Promise<ChannelResponse<typeof TemplatesRebuildChannel>>;
  };
}

/** What one pass did, for the one sentence the operator is told. */
export interface RebuildPassResult {
  readonly rebuilt: number;
  /** Rebuilt pages CG Bridge is holding back until no row has the old page on a layer. */
  readonly deferred: readonly TemplateInfo[];
  readonly failed: readonly { readonly template: TemplateInfo; readonly reason: string }[];
}

/**
 * Rebuild every page the bridge says this runtime should, one at a time (a bake is heavy, and a
 * console on air has other work). Never throws for one template: a template that cannot be built is
 * reported to the bridge — which keeps its old page and records it — and the pass goes on. A
 * failure to reach the bridge at all ends the pass quietly; the next connect asks again.
 */
export async function runRebuildPass(
  bridge: TemplateRebuildBridge,
  opts: { build: PageBuild } & Pick<ProduceOptions, 'fontsCss' | 'fetchUrl'>,
): Promise<RebuildPassResult> {
  let rebuilt = 0;
  const deferred: TemplateInfo[] = [];
  const failed: { template: TemplateInfo; reason: string }[] = [];
  let plan: ChannelResponse<typeof TemplatesRebuildPlanChannel>;
  try {
    plan = await bridge.templates.rebuildPlan({ build: opts.build });
  } catch {
    return { rebuilt, deferred, failed };
  }
  for (const entry of plan.rebuild) {
    const result = await buildAgain(bridge, entry, opts);
    let outcome: ChannelResponse<typeof TemplatesRebuildChannel>['outcome'];
    try {
      ({ outcome } = await bridge.templates.rebuild({
        versionId: entry.versionId,
        build: opts.build,
        result,
      }));
    } catch {
      break; // the bridge went away mid-pass: what was sent stands, the rest waits for next time
    }
    if (outcome === 'rebuilt') rebuilt += 1;
    if (outcome === 'deferred') deferred.push(entry.template);
    if (outcome === 'recorded' && !result.ok) {
      failed.push({ template: entry.template, reason: result.reason });
    }
  }
  return { rebuilt, deferred, failed };
}

/**
 * One kept package, built into a page by this console — or the reason it could not be. The bytes
 * must hash to what the import verified; then they go through the import's own path, `verify`
 * first. `sourceFileName` is the one fact the bytes cannot carry, so the old page's is kept.
 */
async function buildAgain(
  bridge: TemplateRebuildBridge,
  entry: { versionId: string; template: TemplateInfo; sourceSha256: string },
  opts: Pick<ProduceOptions, 'fontsCss' | 'fetchUrl'>,
): Promise<ChannelRequest<typeof TemplatesRebuildChannel>['result']> {
  try {
    const kept = await bridge.templates.source({ sha256: entry.sourceSha256 });
    if (!kept.ok) return { ok: false, reason: 'the package kept at import is missing' };
    const bytes = base64ToBytes(kept.base64);
    if (sha256Hex(bytes) !== entry.sourceSha256) {
      return { ok: false, reason: 'the package kept at import is not the one that was verified' };
    }
    const produced = await produceTemplateDelivery(bytes, {
      ...(opts.fontsCss !== undefined && { fontsCss: opts.fontsCss }),
      ...(opts.fetchUrl !== undefined && { fetchUrl: opts.fetchUrl }),
      ...(entry.template.sourceFileName !== undefined && {
        sourceFileName: entry.template.sourceFileName,
      }),
    });
    /*
      🔴 `B-352` — rebuilt under the id the LIBRARY gave it. A package added as a new template beside
      one with its own id is listed under another id than its manifest's, and CG Bridge answers a
      rebuild whose id differs from the page's as `stale` — so it would never have been rebuilt.
    */
    return {
      ok: true,
      template: { ...produced.template, templateId: entry.template.templateId },
      html: produced.html,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: reason.slice(0, 512) || 'the page could not be built' };
  }
}

/**
 * 🔴 **THE ONE SENTENCE A FAILED REBUILD IS TOLD IN — once, for the whole pass.** The operator's
 * words: the template's name, that it plays as it did, and what to do. `null` when nothing failed.
 */
export function rebuildFailedLine(
  failed: readonly { readonly template: TemplateInfo }[],
): string | null {
  if (failed.length === 0) return null;
  const names = failed.map((f) => `“${templateDisplayName(f.template)}”`);
  return failed.length === 1
    ? `${names[0] ?? ''} could not be rebuilt for this CG Control, so it plays as before. Import it again.`
    : `${String(failed.length)} templates could not be rebuilt for this CG Control, so they play as ` +
        `before: ${names.join(', ')}. Import them again.`;
}

/**
 * 🔴 `C-034`'s acceptance — **ONE CONFIRMATION FOR A PASS THAT REBUILT OR HELD BACK ANYTHING**: how
 * many, and — by name — which wait for their row to be stopped. Never a per-template list of the
 * rebuilt ones (the Log has a row each) and never a progress dialog. `null` when the pass did
 * nothing worth saying.
 *
 * `RUN-NEXT-VERSION-02` Q11 — a held-back page waits only for a row that is ON AIR now: a stopped
 * row lets it through, so the wait ends when the row is stopped (it used to read "cleared").
 */
export function rebuiltLine(
  result: Pick<RebuildPassResult, 'rebuilt' | 'deferred'>,
): string | null {
  const total = result.rebuilt + result.deferred.length;
  if (total === 0) return null;
  const head = `Rebuilt for this CG Control · ${String(total)} template${total === 1 ? '' : 's'}`;
  if (result.deferred.length === 0) return head;
  const names = result.deferred.map((t) => `“${templateDisplayName(t)}”`).join(', ');
  const verb =
    result.deferred.length === 1 ? 'waits until its row is' : 'wait until their rows are';
  return `${head} · ${names} ${verb} stopped`;
}

/**
 * 🔴 **THE LIBRARY'S ONE LINE** for templates this runtime cannot rebuild — imported before their
 * package was kept, or whose rebuild failed. Their names follow it, each isolated.
 */
export function reimportLine(count: number): string {
  return count === 1 ? 'Re-import 1 template' : `Re-import these ${String(count)} templates`;
}

/** The long form, for the line's `title` only (an operator surface carries no prose). */
export const REIMPORT_TITLE =
  'Their pages were built by an earlier CG Control and cannot be rebuilt here: they were imported ' +
  'before CG Bridge kept the packages pages are built from, or their rebuild failed. They play as ' +
  'before; import each .vcg again to bring its page up to date.';
