import {
  TEMPLATE_SOURCE_MAX_BYTES,
  WS_MAX_FRAME_BYTES,
  wsFrameBytes,
  type AssetMeta,
  type ChannelRequest,
  type ChannelResponse,
  type PageBuild,
  type TemplateInfo,
  type TemplatesImportChannel,
  type TemplatesSourcePutChannel,
} from '@cg/shared-ipc';
import {
  aggregateCompositionFields,
  hasNextStep,
  hasSoundEffects,
  pageListsOf,
  TEMPLATE_TIMING_VERSION,
  templateTimingOf,
  runtimeShortfall,
  runtimeShortfallMessage,
  type Manifest,
  type Position,
} from '@cg/shared-schema';
import { buildTemplateLiveSources, sha256Hex, unpack, verify } from '@cg/vcg-format';
import {
  ExporterSingleFile,
  cgCss,
  cgJsIife,
  cgJsLottieIife,
  pageRuntimeBuild,
  type ImageAssetSource,
} from '@cg/single-file-export';
import { pickTemplateName, templateDisplayName } from './templateName.js';
import { bytesToBase64 } from './packageBytes.js';
import { collectListFieldTargets, type ListFieldTargets } from '../inspector/listFieldTargets.js';
import { countdownTargetFieldsOf } from './countdownTargetFields.js';

/**
 * 🔴 `BOOK-EXPORT-01` (`B-350`) — **A FILE THAT IS NOT A TEMPLATE, IN THE OPERATOR'S WORDS.** Each
 * follows the file's name (`importVcgFile` puts it first).
 */
export const TEMPLATE_EMPTY =
  'is empty (0 bytes); the export did not finish. Export it again from the Designer.';
export const TEMPLATE_DAMAGED = 'is damaged or not a CG template.';

/** What a `templates.import` frame carries besides the page and its record: ids, the build stamp. */
const IMPORT_ENVELOPE_BYTES = 4096;

/**
 * `B-351` — the size of the `templates.import` frame this page makes: the page and its record as
 * they are serialized onto the socket, and the envelope.
 */
export function templateImportFrameBytes(template: TemplateInfo, html: string): number {
  return (
    wsFrameBytes(JSON.stringify(html)) +
    wsFrameBytes(JSON.stringify(template)) +
    IMPORT_ENVELOPE_BYTES
  );
}

/** `B-351` — the refusal, after the file's name. Sizes in MB as Windows counts them (1024²). */
export function templateTooLargeSentence(frameBytes: number): string {
  const mb = (n: number): string => String(Math.ceil(n / (1024 * 1024)));
  return (
    `is too large for CG Bridge: its page is ${mb(frameBytes)} MB, and one template can be at ` +
    `most ${mb(WS_MAX_FRAME_BYTES)} MB. Export it again from the Designer with fewer or smaller ` +
    `pictures.`
  );
}

/**
 * B-038 Phase 2 — produce the rendered template HTML in the browser and deliver
 * it to the bridge over the extended `templates.import` channel (content delivery
 * only; the bridge retains it, nothing renders yet).
 *
 * The heavy scene→HTML work stays browser-side (the bridge stays thin): at import
 * we already `verify` + `unpack` the `.vcg`; we now also render its scene to the
 * D-019 self-contained single-file HTML via `@cg/single-file-export` and ship that
 * string alongside the `TemplateInfo`.
 *
 * Kept React-free so it is unit testable on its own.
 */

/** What the import delivers: the registry metadata + the rendered page + warnings. */
export interface TemplateDelivery {
  template: TemplateInfo;
  /** The self-contained standalone HTML: runtime + scene + images inlined as base64. */
  html: string;
  /** Non-blocking export preflight messages (e.g. an image whose bytes didn't resolve). */
  warnings: string[];
  /**
   * R-011 — the scene's manifest default on-air position, surfaced at the
   * ONE moment the app holds the unpacked scene (import). The Library
   * records it so the Inspector's position picker can seed from it;
   * `TemplateInfo` deliberately does NOT carry it (the runtime applies the
   * default from the scene inside the served HTML regardless).
   */
  defaultPosition?: Position;
  /**
   * R-018 — which element kind consumes each `list` field (from the scene's
   * bindings), surfaced at the same one moment. The Library records it so the
   * Inspector's from-file control can default SPLIT per target (sequence → on,
   * ticker/unknown → off); `TemplateInfo` deliberately does not carry it.
   */
  listFieldTargets: ListFieldTargets;
}

/** Inputs that vary by caller/environment (kept out of this React-free module). */
export interface ProduceOptions {
  /**
   * B-038 Phase 3 — the bundled app `@font-face` CSS (Vazirmatn / Exo 2). The
   * exporter fetches its `/fonts/…` URLs and inlines them as base64, so the
   * produced HTML stays self-contained AND Persian renders with the right face.
   * `LibraryPanel` passes the SPA's `fonts.css?inline`; default `''` (no bundled
   * faces) keeps the module usable without a Vite/`?inline` dependency.
   */
  fontsCss?: string;
  /**
   * Fetch a `/fonts/…` URL's bytes. Defaults to the browser `fetch` (resolves
   * against the SPA). Tests inject a node-fs reader so they can run off-DOM.
   */
  fetchUrl?: (url: string) => Promise<ArrayBuffer>;
  /**
   * R-004 — the name of the `.vcg` file the operator picked (`File.name`), verbatim. It is
   * the label they recognise, and it outranks the manifest name at display. The bytes alone
   * cannot tell us this, so the caller that HAS the `File` must pass it; omitted for a
   * bundled starter or a byte-only import (those keep their manifest name).
   */
  sourceFileName?: string;
  /**
   * `CHANNEL-TEMPLATES-01` — the channel whose list the template joins; no other channel's list
   * changes. Omitted, the station-wide import (every declared channel).
   */
  channel?: number;
  /**
   * 🔴 `PAGE-REBUILD-01` (`C-034`) — this console's release. With it, the import stamps the page
   * with the runtime that built it and keeps the verified package on CG Bridge, so the page can be
   * built again when the runtime changes. Omitted (a test, a byte-only caller), nothing is kept.
   */
  consoleVersion?: string;
}

/** The minimal `window.cg` surface this module needs (the extended import channel). */
export interface TemplateImportBridge {
  templates: {
    import(
      req: ChannelRequest<typeof TemplatesImportChannel>,
    ): Promise<ChannelResponse<typeof TemplatesImportChannel>>;
    /** `PAGE-REBUILD-01` — keep the verified package. Absent on a bridge stub: nothing is kept. */
    putSource?(
      req: ChannelRequest<typeof TemplatesSourcePutChannel>,
    ): Promise<ChannelResponse<typeof TemplatesSourcePutChannel>>;
  };
}

let lastBuild: { fontsCss: string; runtimeBuild: string } | null = null;

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **WHICH TEMPLATE RUNTIME THIS CONSOLE BUILDS PAGES WITH**: its
 * release and the fingerprint of what it bakes into every page (`pageRuntimeBuild` — the runtime
 * bundles, the base CSS, these font faces and the exporter's shell revision). Stamped on every
 * import and every rebuild.
 */
export function pageBuildOf(consoleVersion: string, fontsCss: string): PageBuild {
  // The fingerprint hashes ~800 KB of runtime text; it cannot change while the page runs.
  if (lastBuild?.fontsCss !== fontsCss) {
    lastBuild = { fontsCss, runtimeBuild: pageRuntimeBuild(fontsCss) };
  }
  return { consoleVersion, runtimeBuild: lastBuild.runtimeBuild };
}

/**
 * 🔴 `PAGE-REBUILD-01` — **KEEP THE VERIFIED PACKAGE ON CG BRIDGE**, and answer its SHA-256 only when
 * the bridge holds exactly these bytes. Never fails the import: a package too large for one socket
 * frame, a bridge that refuses, or one that answers another hash keeps nothing, and the template is
 * then listed for re-import once a newer runtime runs — which is what happened to every template
 * before this existed.
 */
async function keepPackage(
  bridge: TemplateImportBridge,
  bytes: Uint8Array,
): Promise<string | undefined> {
  const put = bridge.templates.putSource;
  if (put === undefined || bytes.byteLength > TEMPLATE_SOURCE_MAX_BYTES) return undefined;
  const sha256 = sha256Hex(bytes);
  try {
    const kept = await put({ base64: bytesToBase64(bytes) });
    return kept.stored && kept.sha256 === sha256 ? sha256 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An {@link ImageAssetSource} backed by a `.vcg`'s unpacked contents — the
 * design's "asset-bytes source (the `files` map) rather than an AssetStore". The
 * manifest's `assetIndex` maps each `assetId → { path, … }`; the unpacked `files`
 * map holds the bytes at that path. Only image elements are resolved by the
 * exporter, but the lookup is asset-kind agnostic.
 */
function vcgImageAssetSource(
  manifest: Manifest,
  files: ReadonlyMap<string, Uint8Array>,
): ImageAssetSource {
  const byId = new Map(manifest.assetIndex.map((e) => [e.id, e] as const));
  return {
    get: (assetId) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      const meta: AssetMeta = {
        assetId: entry.id,
        // `D-165` — `AssetMeta` holds every `assetIndex` kind now, `audio` included, so the
        // kind is carried as the package states it (a sound resolves as a sound).
        kind: entry.kind,
        filename: entry.path.slice(entry.path.lastIndexOf('/') + 1),
        sha256: entry.sha256,
        byteSize: entry.bytes,
        workingPath: entry.path,
      };
      return Promise.resolve(meta);
    },
    bytes: (assetId) => {
      const entry = byId.get(assetId);
      if (entry === undefined) return Promise.resolve(null);
      return Promise.resolve(files.get(entry.path) ?? null);
    },
  };
}

/**
 * Verify + unpack a `.vcg` and render its scene to the self-contained standalone
 * HTML. Returns the `TemplateInfo`, the produced HTML, and any non-blocking export
 * warnings. **Throws** a clear message — registering nothing — when the package
 * fails verification, cannot be unpacked, or the export yields an error-severity
 * issue (the R-001 "bad input → clear error, nothing registered" invariant).
 *
 * B-038 Phase 3 — `fontsCss` (the bundled Vazirmatn / Exo 2 faces) is now inlined
 * as base64, so the produced HTML stays self-contained AND Persian renders with
 * the correct face on air. Operator `asset-*` fonts and images carried in the
 * `.vcg` also inline.
 */
export async function produceTemplateDelivery(
  bytes: Uint8Array,
  opts: ProduceOptions = {},
): Promise<TemplateDelivery> {
  // `B-350` — an export that never finished leaves a file of 0 bytes: say that, and the remedy.
  if (bytes.byteLength === 0) throw new Error(TEMPLATE_EMPTY);
  const result = await verify(bytes);
  if (!result.ok) {
    /*
      `B-350` — a file that is not a readable template is named as such; the zip library's own text
      ("Unpack failed: End of data reached … Corrupted zip ?") goes to the log. A template that
      parses wrong keeps its technical sentence: it may be a newer build's, not a damaged one.
    */
    if (
      result.failure === 'unreadable' ||
      result.failure === 'not-a-template' ||
      result.failure === 'integrity'
    ) {
      console.warn(`[import] not a readable template: ${result.errors.join('; ')}`);
      throw new Error(TEMPLATE_DAMAGED);
    }
    throw new Error(`failed verification: ${result.errors.join('; ')}`);
  }

  let scene, manifest, files;
  try {
    ({ scene, manifest, files } = await unpack(bytes));
  } catch (err) {
    throw new Error(`could not be unpacked: ${err instanceof Error ? err.message : String(err)}`);
  }

  /*
    🔴 `B-196` — THE ONE PLACE A PACKAGE FROM A NEWER BUILD IS REFUSED, WITH A SENTENCE.

    ⚠ It is not the only thing that refuses one, and that is the point. `SceneSchema`'s
    `schemaVersion: z.literal(1)` already rejects a bumped document, and `ElementSchema` is a
    `z.union`, so an element kind this build does not know already fails to parse — but what
    the operator gets from those is a zod error with a path into an element array, at import,
    with nothing saying that the STATION is the thing that is behind. This runs BEFORE the
    render for exactly that reason: the message is the feature, not the refusal.

    Placed after `unpack` because the manifest is what declares the requirement, and before
    the render because there is no value in rendering a package that must be refused. Fails
    OPEN on an unreadable version — see `runtimeShortfall`, which states why.
  */
  const shortfall = runtimeShortfall(manifest.compatibility.minRuntimeVersion);
  if (shortfall !== null) {
    throw new Error(
      runtimeShortfallMessage(
        pickTemplateName(manifest.name, scene.name) ?? 'This template',
        shortfall,
      ),
    );
  }

  // B-067 — the operator's field form must be the template's FULL field closure, not the
  // entry composition's flat fields. A D-119 starter is a graphic composition nested in a
  // full-frame positioning composition, and the authored fields live on the NESTED comp:
  // `migrateGlobalFieldsToCompositions` relocates each field to the comp that owns its
  // bound element, and the Designer exports the ENTRY comp scoped — so `scene.fields` is
  // `[]` and the Inspector rendered "No fields." This is the same collector the GDD
  // exporter already uses (`gdd.ts`), so `TemplateInfo` and the package's own GDD manifest
  // finally agree on which fields exist and how they are addressed.
  //
  // `DELTA-RUN-NEXT-VERSION-01-C` — and each text field that sets a countdown's target is marked
  // `countdown` HERE, from its own doc's `clock-target` binding, so CG Control offers the date and
  // time control for it. The binding is the one source of truth (`countdownTargetFieldsOf`).
  const aggregate = countdownTargetFieldsOf(scene, scene, aggregateCompositionFields(scene, scene));
  // R-004 — carry BOTH labels the package can offer, and let the display rule choose.
  //
  // `name` is the manifest's (the Designer's exporter writes `scene.name` into it). It is
  // the entry COMPOSITION's name, which for a real operator package is often a
  // Designer-internal label — or blank, since `ManifestSchema.name` has no `.min(1)`.
  //
  // `sourceFileName` is the file the operator actually picked. It outranks the manifest at
  // display (see `templateName.ts`), and this is the one hop where it is still in hand.
  const name = pickTemplateName(manifest.name, scene.name);
  const template: TemplateInfo = {
    templateId: manifest.id,
    ...(name !== undefined ? { name } : {}),
    ...(opts.sourceFileName !== undefined ? { sourceFileName: opts.sourceFileName } : {}),
    templateType: scene.templateType,
    fields: [...aggregate.fields],
    groups: [...aggregate.groups],
    // R-028 (5.4) — derived HERE, the one moment the app holds the unpacked
    // scene, by the canonical predicate the Designer's transport also uses.
    // It rides `TemplateInfo` (not a browser-local store like R-011/R-018) so
    // the bridge persists it and every browser gets the same answer.
    hasNext: hasNextStep(scene, scene.compositions),
    // `D-165` — the row's speaker mark: derived HERE, once, by the one predicate.
    ...(hasSoundEffects(scene, scene.compositions) ? { hasSound: true } : {}),
    // `R-100` — the template's PAGE LISTS, at this same one moment and for `hasNext`'s reason:
    // which rows load pictures, and whether Next / Previous wrap. Absent when there are none.
    ...(() => {
      const pageLists = pageListsOf(scene);
      return pageLists.length > 0 ? { pageLists } : {};
    })(),
    /*
      🔴 `TIMING-WIRE-22` §4 — the template's PLAYOUT, derived at this same one moment and for
      the reason stated two comments down: no `.vcg` reaches the bridge, so a fact not captured
      here is not recoverable later.

      🔴 Through `templateTimingOf`, NOT `playoutOf(scene)`. The scene root of a real template
      is a wrapper — every starter has `layers: []` and a set `entryCompositionId` — so
      `playoutOf(scene)` answers `static` for all of them, and the console would state `Static`
      for every template in existence while offering no pass control at all. The resolver reads
      the ENTRY composition for what the row DOES, and the first looping scope for the count and
      gap an override inherits from. This was found by screenshotting the section, not by any
      test: the first spelling was green and wrong.

      ⚠ `repeat` and `delayMs` are carried as AUTHORED — absent when the template authored
      none — rather than resolved through `repeatOf`/`delayMsOf`. The console needs to tell
      "the author asked for infinite" from "the author said nothing and the default is
      infinite": they display identically today, but only one of them changes if the default
      ever does, and an override UI that cannot see which it inherits cannot honestly say
      `Default (…)`.
    */
    playout: (() => {
      const t = templateTimingOf(scene);
      return {
        v: TEMPLATE_TIMING_VERSION,
        mode: t.mode,
        ...(t.holdSource !== undefined ? { holdSource: t.holdSource } : {}),
        ...(t.holdMs !== undefined ? { holdMs: t.holdMs } : {}),
        ...(t.loop !== undefined ? { loops: true } : {}),
        ...(t.loop?.repeat !== undefined ? { repeat: t.loop.repeat } : {}),
        ...(t.loop?.delayMs !== undefined ? { delayMs: t.loop.delayMs } : {}),
      };
    })(),
    // D-137 / C-015 — the Live Source carrier, derived at the SAME moment and for
    // the same reason as `hasNext`: this is the only point in the product where
    // the unpacked scene is in hand. `LibraryEntry` is `{ template, html }`, the
    // bridge parses no HTML, and no `.vcg` ever reaches the bridge — so a fact not
    // captured here is not recoverable later.
    //
    // ⭐ The block is ASSEMBLED IN ONE PLACE (`buildTemplateLiveSources`) rather than
    // field-by-field here. It gained a fourth field with the arrangement carrier
    // (`multibox-layout-switch` 5.2), and a block built by hand at a call site is one
    // whose NEXT field gets added here and forgotten at the next call site.
    liveSources: buildTemplateLiveSources(scene),
  };

  try {
    const exporter = new ExporterSingleFile({
      cgJsIife,
      cgJsLottieIife,
      cgCss,
      fontsCss: opts.fontsCss ?? '',
      assets: vcgImageAssetSource(manifest, files),
      ...(opts.fetchUrl !== undefined ? { fetchUrl: opts.fetchUrl } : {}),
    });
    const produced = await exporter.produce(scene);
    const errors = produced.issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((i) => i.message).join('; '));
    }
    return {
      template,
      html: produced.html,
      warnings: produced.issues.map((i) => i.message),
      ...(scene.defaultPosition !== undefined ? { defaultPosition: scene.defaultPosition } : {}),
      // R-018 — same walk shape as the field aggregation above, so the recorded
      // paths and the Inspector's field paths can never disagree.
      listFieldTargets: collectListFieldTargets(scene, scene),
    };
  } catch (err) {
    throw new Error(`could not be rendered: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Produce the standalone HTML from a `.vcg` and deliver it to the bridge over the
 * extended `templates.import` channel (`{ template, html }`). Returns the
 * registered id + any warnings; throws (registering nothing) on a bad package.
 */
export async function importTemplateFromBytes(
  bridge: TemplateImportBridge,
  bytes: Uint8Array,
  opts: ProduceOptions = {},
): Promise<{
  templateId: string;
  /** R-004 — what the operator should be told they imported (falls back to the id). */
  displayName: string;
  warnings: string[];
  defaultPosition?: Position;
  listFieldTargets: ListFieldTargets;
  /**
   * A9 / D-137 — the plate ids THIS version declares, so the caller can say whether the
   * template's existing defaults were carried over. Empty for a template with no live plates,
   * which is a real answer and not an absence.
   */
  declaredPlateIds: readonly string[];
}> {
  const { template, html, warnings, defaultPosition, listFieldTargets } =
    await produceTemplateDelivery(bytes, opts);
  /*
    🔴 `BOOK-EXPORT-01` (`B-351`) — **THE PAGE GOES TO CG BRIDGE IN ONE FRAME**, and past the
    bridge's cap the socket closed: a 141 MB book read "Bridge disconnected — command rejected" about
    a bridge that was fine. Measured here and refused with its size, BEFORE the package is kept, so
    a refused import leaves nothing behind on CG Bridge.
  */
  const frameBytes = templateImportFrameBytes(template, html);
  if (frameBytes > WS_MAX_FRAME_BYTES) throw new Error(templateTooLargeSentence(frameBytes));
  /*
    🔴 `PAGE-REBUILD-01` (`C-034`) — the bytes just VERIFIED are the ones kept, and the page names
    the runtime that built it. Kept BEFORE the import, in a frame of its own (the page fills most of
    the import's), so the import can name the package by the hash CG Bridge answered.
  */
  const build =
    opts.consoleVersion === undefined
      ? undefined
      : pageBuildOf(opts.consoleVersion, opts.fontsCss ?? '');
  const sourceSha256 = build === undefined ? undefined : await keepPackage(bridge, bytes);
  await bridge.templates.import({
    template,
    html,
    ...(opts.channel !== undefined && { channel: opts.channel }),
    ...(build !== undefined && { build }),
    ...(sourceSha256 !== undefined && { sourceSha256 }),
  });
  return {
    templateId: template.templateId,
    displayName: templateDisplayName(template),
    warnings,
    ...(defaultPosition !== undefined ? { defaultPosition } : {}),
    listFieldTargets,
    declaredPlateIds: (template.liveSources?.sources ?? []).map((s) => s.sourceId),
  };
}
