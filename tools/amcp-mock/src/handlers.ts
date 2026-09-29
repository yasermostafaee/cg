import * as http from 'node:http';
import * as https from 'node:https';
import { decodeCgData } from './cg-data.js';
import { clipElapsedAt } from './layer-state.js';
import {
  FULL_FRAME,
  type AmcpHandler,
  type AmcpRequest,
  type HandlerContext,
  type AmcpResponse,
  type LayerState,
  type MixerRect,
  type ProducerKind,
} from './types.js';

/**
 * Built-in handler set. Models the subset of CasparCG 2.3.x AMCP that
 * @cg/caspar-client exercises: VERSION, INFO, PLAY [HTML], CG ADD,
 * CG INVOKE, CG STOP, CG REMOVE, CLEAR — and, for `DEV-LOCAL-CASPAR-01`'s
 * reads of a real core, INFO PATHS and CLS.
 *
 * Anything else is a `400 ERROR`. Tests can override individual verbs via
 * `MockHandle.setHandler`.
 */
export function defaultHandlers(): Map<string, AmcpHandler> {
  const m = new Map<string, AmcpHandler>();
  m.set('VERSION', handleVersion);
  m.set('INFO', handleInfo);
  m.set('CLS', handleCls);
  m.set('PLAY', handlePlay);
  m.set('LOAD', handleLoad);
  m.set('LOADBG', handleLoadBg);
  m.set('PAUSE', handlePause);
  m.set('RESUME', handleResume);
  m.set('CALL', handleCall);
  m.set('CLEAR', handleClear);
  m.set('CG', handleCg);
  m.set('MIXER', handleMixer);
  m.set('ADD', handleAdd);
  m.set('REMOVE', handleRemove);
  return m;
}

/**
 * R-022 — `MIXER <ch>-<layer> VOLUME <value>`.
 * D-137 / C-015 — `MIXER <ch>-<layer> FILL|CLIP <x> <y> <x-scale> <y-scale>`
 * and `MIXER <ch>-<layer> CLEAR`.
 *
 * VOLUME is modelled because rehearse depends on it and its failure mode is
 * SILENCE ON AIR: rehearse leaves the producer resident and mutes the layer, so
 * a mute that is never restored is a graphic that airs with no sound. Without a
 * MIXER handler the mock answered `400 ERROR` to the mute, which would have made
 * the bridge's fail-closed refusal fire in every test and hidden the real
 * behaviour behind a plumbing failure.
 *
 * FILL and CLIP are modelled for the same shape of reason one layer out: the
 * geometry chain in `live-source-multibox` design.md §6 is otherwise
 * UNCHECKABLE OFFLINE, and its failure mode — a live box placed beside the
 * transparent hole it should fill, or masked away entirely — produces no error
 * and no operator signal.
 *
 * `LOOK-SWITCH-01` added `OPACITY` (a plate is seated hidden and revealed in one commit).
 *
 * Anything OTHER than these sub-verbs (and `COMMIT`) is still `400`, deliberately: an
 * unimplemented sub-verb that silently `202`s would let a wrong command look
 * correct, which is the one thing a mock must never do.
 *
 * All mixer state here is applied to the layer and NOT reset by `CLEAR` or
 * `CG REMOVE` (those handlers patch specific fields), which is the real
 * behaviour — mixer state belongs to the channel, not to the producer — and is
 * precisely why both the volume restore and the geometry reset have to be
 * explicit.
 *
 * `B-198` / `B-221` — **`DEFER` and `COMMIT` are modelled, and modelled as the real
 * server keeps them.** A trailing `DEFER` on `VOLUME`/`FILL`/`CLIP` STAGES the change
 * into the channel's queue (`HandlerContext.stageMixer`) instead of applying it, exactly
 * as `transforms_applier::apply()` does in 2.5.0's `AMCPCommandsImpl.cpp`; `MIXER <ch>
 * COMMIT` applies the whole queue in order and empties it. The layer token on a `COMMIT`
 * is accepted and IGNORED — measured on the plant (`B-198`): `MIXER 1-30 COMMIT` applied
 * a change staged on 1-31 — and the queue belongs to the server, not to the connection,
 * so a change staged on one socket is applied by a commit from another (`B-199`).
 *
 * Until this the mock applied a deferred line at once and answered `400` to `COMMIT`,
 * which is the one thing a mock must never do twice over: a bridge that staged a batch
 * and lost its commit looked, offline, exactly like one that committed it.
 */
function handleMixer(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'MIXER' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'MIXER' };
  const sub = (req.args[1] ?? '').toUpperCase();

  if (sub === 'COMMIT') {
    ctx.commitMixer(slot.channel);
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  }

  // The real applier pops a trailing `DEFER` before the sub-verb parses its arguments,
  // so `FILL 0 0 1 1 DEFER` is four numbers plus a flag, not five arguments.
  const deferred =
    req.args.length > 2 && (req.args[req.args.length - 1] ?? '').toUpperCase() === 'DEFER';
  const args = deferred ? req.args.slice(0, -1) : req.args;
  const apply = (patch: Partial<Omit<LayerState, 'slot'>>): AmcpResponse => {
    if (deferred) ctx.stageMixer(slot.channel, () => ctx.setLayer(slot, patch));
    else ctx.setLayer(slot, patch);
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  };

  if (sub === 'VOLUME') {
    const raw = args[2];
    /*
      `BRIDGE-TRUTH-01` §3 — the QUERY form: `MIXER <ch>-<layer> VOLUME` with no value answers
      `201 MIXER OK` and the layer's current transform volume. It is the ONLY read-out of a
      layer's volume — `INFO`'s `<volume>` nodes are the output bus's meters — and it is per
      layer, which is why the band reader pipelines it. ⚠ The real reply's number spelling is
      not modelled; a reader parses it as a number.
    */
    if (raw === undefined) {
      return { kind: 'ok-line', code: 201, verb: 'MIXER', data: String(ctx.getLayer(slot).volume) };
    }
    const volume = Number(raw);
    // A non-numeric or negative volume is a REFUSAL, not a clamp: silently
    // coercing it would let a malformed mute read as a successful one.
    if (!Number.isFinite(volume) || volume < 0) return { kind: 'err', code: 401, verb: 'MIXER' };
    /*
      `PLAYOUT-SOURCES-01` §1.I — `VOLUME <v> <frames>` is a RAMP (the core's `duration`, read with
      `stoi`, so anything but a whole number is refused). The mock lands the end value at once — the
      tween's shape is not modelled — and a malformed duration is refused rather than ignored.
    */
    const frames = args[3];
    if (frames !== undefined && !/^\d+$/.test(frames)) {
      return { kind: 'err', code: 401, verb: 'MIXER' };
    }
    return apply({ volume });
  }

  /*
    `LOOK-SWITCH-01` — `MIXER <ch>-<layer> OPACITY <v>`, staged by a trailing `DEFER` like every
    other sub-verb here. The bridge seats a plate HIDDEN (`OPACITY 0`, committed before its `PLAY`)
    and reveals it in the action's one commit, so a missing reveal must be visible offline.
    Refused the same way `VOLUME` is: a value that is not a number in `[0, 1]` is not a clamp.
  */
  if (sub === 'OPACITY') {
    const opacity = Number(args[2]);
    if (args[2] === undefined || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return { kind: 'err', code: 401, verb: 'MIXER' };
    }
    return apply({ opacity });
  }

  if (sub === 'FILL' || sub === 'CLIP') {
    const rect = parseMixerRect(args.slice(2));
    // Same doctrine as VOLUME's refusal: four numbers or nothing. A rect with a
    // silently-coerced component is a geometry nobody declared, and half a
    // placement is worse than none — it looks applied.
    if (rect === null) return { kind: 'err', code: 401, verb: 'MIXER' };
    return apply(sub === 'FILL' ? { fill: rect } : { clip: rect });
  }

  if (sub === 'CLEAR') {
    /*
      🔴 `BRIDGE-TRUTH-01` R3(c) — resets the WHOLE transform, VOLUME INCLUDED, which is what
      the real verb does: `stage::clear_transforms` → `tweens_.erase(index)`. Measured by the
      Playout team on a 2.5.0-based core with `stage.cpp` unmodified from upstream:
      `VOLUME 0` → `CLEAR` → still `0` → `MIXER CLEAR` → `1`.

      This used to reset the two geometry terms and leave volume alone, "so the R-022 restore
      path keeps being tested on its own terms" — a modelling choice nobody had measured, and it
      made a teardown's volume residue invisible offline. A mock that agrees with the code only
      proves the code agrees with itself (`B-189`). The four terms this mock carries go back
      to a fresh layer's values — opacity too (`LOOK-SWITCH-01`), which is why a `MIXER CLEAR` on
      a layer holding a seated, hidden plate would REVEAL it.
    */
    ctx.setLayer(slot, { fill: FULL_FRAME, clip: FULL_FRAME, volume: 1, opacity: 1 });
    return { kind: 'ok', code: 202, verb: 'MIXER' };
  }

  return { kind: 'err', code: 400, verb: 'MIXER' };
}

/**
 * `<x> <y> <x-scale> <y-scale>` → a normalized rect, or `null` when the four
 * arguments are not four finite numbers.
 *
 * NOT clamped to `[0,1]`. A `FILL` may legitimately hang off the frame, and a
 * mock that clamped would hide exactly the bridge bug (an unclamped scene rect)
 * that the real server would show as a box running off the raster.
 */
function parseMixerRect(args: readonly string[]): MixerRect | null {
  if (args.length < 4) return null;
  const nums = args.slice(0, 4).map(Number);
  if (!nums.every((n) => Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as [number, number, number, number];
  return { x, y, width, height };
}

const VERSION_STRING = '2.3.2 Stable';

function handleVersion(_req: AmcpRequest): AmcpResponse {
  return { kind: 'ok-line', code: 201, verb: 'VERSION', data: VERSION_STRING };
}

/**
 * `DEV-LOCAL-CASPAR-01` — `CLS`, as a 2.5.0 core answers it. The core does not list media itself:
 * it relays the media scanner's `/cls` body verbatim, and answers `501 CLS FAILED` when no scanner
 * answers (`AMCPCommandsImpl.cpp` `make_request` / `cls_command`). The scanner's body is
 * `200 CLS OK`, one line per file, and an empty line (`src/app.ts`); each line is `generateCinf`'s
 * join, which puts TWO spaces on each side of the type (`" MOVIE "` joined with `' '`).
 */
function handleCls(_req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const files = ctx.mediaFiles();
  if (files === null) return { kind: 'err', code: 501, verb: 'CLS' };
  const lines = files.map((f) =>
    [`"${f.id}"`, ` ${f.type} `, String(f.bytes), f.modified, String(f.frames), f.timebase].join(
      ' ',
    ),
  );
  return { kind: 'ok-multi', code: 200, verb: 'CLS', lines };
}

/** The five characters boost's `write_xml` writes as entities in a text node. */
function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function handleInfo(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  if (req.args.length === 0) {
    const lines: string[] = [];
    for (let ch = 1; ch <= ctx.channelCount; ch++) {
      lines.push(`${String(ch)} PAL PLAYING`);
    }
    return { kind: 'ok-multi', code: 200, verb: 'INFO', lines };
  }
  /*
    `DEV-LOCAL-CASPAR-01` — `INFO PATHS`, in the real dialect (`AMCPCommandsImpl.cpp`
    `info_paths_command`): `201 INFO PATHS OK` and ONE chunk — boost's `write_xml` with a 3-space
    indent, bare `\n` inside, one `\r\n` after it. `media-path` is the config's own value (`env.cpp`
    keeps a relative one relative); `initial-path` is the start folder with `/` appended.
  */
  if (req.args[0]?.toUpperCase() === 'PATHS') {
    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<paths>',
      `   <media-path>${xmlText(ctx.paths.media)}</media-path>`,
      '   <log-path>log/</log-path>',
      '   <data-path>data/</data-path>',
      '   <template-path>template/</template-path>',
      `   <initial-path>${xmlText(ctx.paths.initial)}</initial-path>`,
      '</paths>',
      '',
    ].join('\n');
    return { kind: 'ok-line', code: 201, verb: 'INFO PATHS', data: xml };
  }
  /*
    🔴 `B-189` — `INFO <channel>` answers in the REAL server's dialect, because the old
    stub's dialect is how a broken parser stayed green for its whole life.

    The real 2.5.0 `69e8ad5` (captured on the wire 2026-08-31, quoted verbatim in
    `@cg/shared-ipc`'s `channel-settings.test.ts`) answers `201 INFO OK` followed by ONE
    payload chunk — an XML document whose internal newlines are bare `\n`, whose mode tag
    is `<format>`, terminated by a single `\r\n`. The old stub answered `200`/`ok-multi`
    with a `<video-mode>` tag: both axes matched the CODE's expectation instead of the
    server's, so `#readChannelMode` discarded every real reply while every test passed.
    **A mock that agrees with the code only proves the code agrees with itself** — this
    handler now mirrors the captured reply's shape exactly (status class, one-chunk body,
    bare-`\n` interior, tag names, 3-space indent), with the mock's own mode value.
  */
  /*
    `C-029` — `INFO CONFIG` answers in the real dialect too: `201 INFO CONFIG OK` and ONE
    chunk carrying the server's parsed `casparcg.config` written back (captured verbatim on
    the plant 2026-09-04; `outputs.test.ts` pins the shape). The mock's config DECLARES
    exactly what its `INFO <channel>` REPORTS running — `<screen/>` and `<system-audio/>`
    per channel — so the bridge's declared-versus-running check reads `ok` by default and a
    test that wants the alarm scripts a declaration the running set lacks via `setHandler`.
  */
  if (req.args[0]?.toUpperCase() === 'CONFIG') {
    const channels: string[] = [];
    for (let ch = 1; ch <= ctx.channelCount; ch++) {
      channels.push(
        '      <channel>',
        '         <video-mode>1080i5000</video-mode>',
        '         <consumers>',
        '            <screen/>',
        '            <system-audio/>',
        '         </consumers>',
        '      </channel>',
      );
    }
    const config = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<configuration>',
      '   <paths>',
      '      <media-path>media/</media-path>',
      '      <log-path disable="false">log/</log-path>',
      '      <data-path>data/</data-path>',
      '      <template-path>template/</template-path>',
      '   </paths>',
      '   <channels>',
      ...channels,
      '   </channels>',
      '   <controllers>',
      '      <tcp>',
      '         <port>5250</port>',
      '         <protocol>AMCP</protocol>',
      '      </tcp>',
      '   </controllers>',
      '</configuration>',
      '',
    ].join('\n');
    return { kind: 'ok-line', code: 201, verb: 'INFO', data: config };
  }
  /*
    🔴 `RELEASE-091-01` (DELTA B, B2) — `INFO <channel>-<layer>` answers exactly as `INFO <channel>`:
    2.5.0 registers INFO as a channel command and `info_channel_command` never reads the layer
    (`AMCPCommandsImpl.cpp:1507-1535`), so the reply is the WHOLE channel — measured on the plant's
    core as byte-identical replies (`occupancy-tap.ts`). The mock answered it `404`.
  */
  const address = /^(\d+)(?:-\d+)?$/.exec(req.args[0] ?? '');
  const ch = address === null ? Number.NaN : Number(address[1]);
  if (!Number.isInteger(ch) || ch < 1 || ch > ctx.channelCount) {
    return { kind: 'err', code: 404, verb: 'INFO' };
  }
  /*
    `C-029` — the `<output>` block mirrors the plant's capture (2026-09-04): each running
    consumer under `<port><port_N>` with its own `name()` in `<consumer>` — `system-audio`
    at 500 and `screen` at 600, which is what a channel with `<screen/>` + `<system-audio/>`
    reports. The old `<port/>` said "no consumers at all", which no real channel with a
    picture ever reports and which a declared-versus-running check would read as EVERY
    declared consumer missing.
  */
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<channel>',
    '   <format>1080i5000</format>',
    '   <framerate>50</framerate>',
    '   <framerate>1</framerate>',
    '   <mixer>',
    '      <audio/>',
    '   </mixer>',
    '   <output>',
    '      <port>',
    '         <port_500>',
    '            <consumer>system-audio</consumer>',
    '         </port_500>',
    '         <port_600>',
    '            <consumer>screen</consumer>',
    '            <screen>',
    '               <always_on_top>false</always_on_top>',
    '               <index>0</index>',
    '               <key_only>false</key_only>',
    '               <name>Screen consumer</name>',
    '            </screen>',
    '         </port_600>',
    '      </port>',
    '   </output>',
    ...stageXml(ctx.stageLayers(ch)),
    '</channel>',
    '',
  ].join('\n');
  return { kind: 'ok-line', code: 201, verb: 'INFO', data: xml };
}

/**
 * 🔴 `RELEASE-091-01` (DELTA B, B2) — **THE `<stage>` BLOCK, IN THE REAL 2.5 SHAPE**: one
 * `<layer_N>` per layer on the stage, each with its background and foreground producer, and NO
 * `<stage>` element at all when nothing is on it. Captured on the plant's core:
 * `b3-info-2-80-on-air.ndjson` (a live `html` page on 2-80) and `b5-teardown-info.ndjson` (an empty
 * channel, no `<stage>`). The mock carried no stage data, so nothing could ask it which layers exist.
 */
function stageXml(layers: readonly LayerState[]): string[] {
  if (layers.length === 0) return [];
  const producer = (kind: ProducerKind, path: string, paused: boolean | null): string[] => [
    ...(kind !== 'empty' && path !== ''
      ? ['<file>', `   <path>${xmlText(path)}</path>`, '</file>']
      : []),
    ...(paused === null ? [] : [`<paused>${String(paused)}</paused>`]),
    `<producer>${kind}</producer>`,
  ];
  const indent = (lines: string[], by: string): string[] => lines.map((l) => `${by}${l}`);
  return [
    '   <stage>',
    '      <layer>',
    ...layers.flatMap((l) => [
      `         <layer_${String(l.slot.layer)}>`,
      '            <background>',
      ...indent(producer(l.backgroundProducer, l.backgroundFilePath, null), '               '),
      '            </background>',
      '            <foreground>',
      ...indent(producer(l.producer, l.filePath, l.paused), '               '),
      '            </foreground>',
      `         </layer_${String(l.slot.layer)}>`,
    ]),
    '      </layer>',
    '   </stage>',
  ];
}

/**
 * `C-029` — `ADD <channel> <KIND …>` / `REMOVE <channel> <KIND …>` / `REMOVE <channel>-<port>`.
 *
 * Modelled as REFUSALS by default, and the refusal codes are the measured ones (2026-09-04,
 * 2.5.0 `69e8ad5`, plant and dev host alike):
 *
 * - `ADD 1 DECKLINK 99` for a device the server cannot open → `403 ADD FAILED` (a
 *   `user_error` from `get_device`, logged as " Check syntax." — the consumer-side twin of
 *   `B-177`'s disguise, `B-208`);
 * - `ADD 1 DECKLINK DEVICE 99` — the `DEVICE` word is not in the grammar — and `ADD 1 FOOBAR`
 *   → `404 ADD FAILED` (the factory threw, so the registry answered "no match … check
 *   syntax" as `file_not_found`);
 * - `REMOVE` of a consumer that is not running → `404 REMOVE FAILED`.
 *
 * A mock with no cards refuses every DeckLink `ADD` the way the plant refuses one for a card
 * it does not have; a test that wants a `202` scripts it with `setHandler('ADD', …)` and
 * asserts the exact line the bridge sent. The doctrine is the file's own: an unimplemented
 * verb that silently `202`s would let a wrong command look correct.
 */
function handleAdd(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const ch = Number(req.args[0]);
  if (!Number.isInteger(ch) || ch < 1 || ch > ctx.channelCount) {
    return { kind: 'err', code: 401, verb: 'ADD' };
  }
  const kind = req.args[1]?.toUpperCase();
  if (kind === 'DECKLINK') {
    const device = req.args[2];
    // `DEVICE` (or any non-number) where the grammar wants the device token → the factory's
    // stoll throws → 404 on the wire, exactly as measured.
    if (device === undefined || !/^\d+$/.test(device)) {
      return {
        kind: 'err',
        code: 404,
        verb: 'ADD',
        detail: 'No match found for supplied commands. Check syntax.',
      };
    }
    return { kind: 'err', code: 403, verb: 'ADD', detail: `Decklink device ${device} not found.` };
  }
  return {
    kind: 'err',
    code: 404,
    verb: 'ADD',
    detail: 'No match found for supplied commands. Check syntax.',
  };
}

function handleRemove(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const target = req.args[0] ?? '';
  const ch = Number(target.split('-')[0]);
  if (!Number.isInteger(ch) || ch < 1 || ch > ctx.channelCount) {
    return { kind: 'err', code: 401, verb: 'REMOVE' };
  }
  return { kind: 'err', code: 404, verb: 'REMOVE' };
}

/** A classified producer argument, or the reason the mock refuses to build one. */
type ProducerVerdict =
  | { ok: true; kind: Exclude<ProducerKind, 'empty'> }
  | { ok: false; code: number; detail: string };

/** `route://<channel>` or `route://<channel>-<layer>`, both 1-based. */
const ROUTE_TARGET = /^(\d+)(?:-(\d+))?$/;
/** Anything that ANNOUNCES itself as a scheme: `<word>://`. */
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
/**
 * The stream schemes a `stream` producer may use (`@cg/shared-ipc`'s `STREAM_URL_SCHEMES`, less
 * `http`/`https`, which this mock has always read as a page). Quoted, not imported: the mock is the
 * server's stand-in, not the product's.
 */
const STREAM_SCHEMES = new Set(['rtmp', 'rtmps', 'rtsp', 'srt', 'udp', 'rtp', 'mms']);

/**
 * R-015 / D-137 — which producer real CasparCG would build for a `PLAY` /
 * `LOAD` argument.
 *
 * ── WHY THIS IS A CLASSIFIER AND NOT A TWO-WAY TEST ─────────────────────────
 *
 * It used to answer `'html' | 'ffmpeg'` and nothing else, so
 * `PLAY 1-11 "route://1-10"` was recorded as `'ffmpeg'` — indistinguishable
 * from a foreign video layer, which is the exact discriminator the D-137 /
 * C-015 ownership work turns on. Every ownership test would have been asserting
 * against a state the mock could not represent.
 *
 * ── AND WHY AN UNRECOGNISED FORM IS A REFUSAL ───────────────────────────────
 *
 * This module's own doctrine, written for `handleMixer`: _"an unimplemented
 * sub-verb that silently 202s would let a wrong command look correct, which is
 * the one thing a mock must never do."_ `handlePlay` did not obey it — it
 * refused only on ADDRESSING (bad slot, bad channel) and then `202`d ANY
 * producer argument, so `rout://1-1` and `DECKLINK DEVIC 3` both read as
 * success. That never mattered while the bridge only ever emitted `CG ADD`; it
 * starts mattering the moment the bridge emits `PLAY`, which is what phase 6
 * does.
 *
 * The line drawn is: a bare token with **no scheme and no keyword** is a media
 * FILE NAME and stays `'ffmpeg'`, exactly as CasparCG treats it (this is what
 * the existing foreign-layer fixtures like `"program-feed.mov"` rely on). A
 * token that announces a structured form — a `scheme://`, or a `DECKLINK` /
 * `NDI` keyword — and then fails to parse is REFUSED, because there is no
 * reading of it under which the server would have done what was asked.
 *
 * ⭐ **`DECKLINK DEVICE <n>` is MEASURED in BOTH forms** on this plant's DeckLink
 * SDI 4K (2.5.0 `69e8ad5`): the enumeration INDEX (`DEVICE 1`, 2026-08-24) and the
 * PERSISTENT ID (`DEVICE 23487013`, 2026-08-25 — recon walk Q1). What this
 * classifier models is therefore the form the server accepts, not a guess about it,
 * and it is right not to distinguish the two: they are one integer field.
 *
 * ⭐ **The NDI spelling is the Playout core's own now** (`PLAYOUT-SOURCES-01` §1.D): the producer is
 * the bracketed token, `PLAY 2-60 [NDI] "HOST (Cam 1)"` (their answer §1.2, citing
 * `newtek_ndi_producer.cpp:289-292`). `NDI NAME "…"` is that core's CONSUMER syntax and builds no
 * producer — the registry falls through to the file producer, which answers `404` — so it is
 * refused here the same way. Cited from their source, not yet measured on an NDI signal (`C-021`).
 *
 * 🔴 **WHAT THIS MOCK DOES NOT MODEL, AND MUST NOT BE READ AS EVIDENCE ABOUT: DEVICE
 * CONTENTION.** On real hardware ONE physical input admits ONE producer, `CLEAR`
 * answers `202` BEFORE the old producer is destroyed, and the new producer is
 * constructed before the old one dies — so a `CLEAR`-then-`PLAY` on the same device
 * can fail, and the failure surfaces as `404` + `File not found.` because the
 * producer registry falls through to the FILE producer. Here every `PLAY` succeeds
 * instantly and nothing contends. **B-177.** A green suite against this mock says
 * nothing about that class of failure.
 */
function classifyProducer(args: readonly string[]): ProducerVerdict {
  const first = args[1] ?? '';
  if (first === '') {
    return { ok: false, code: 402, detail: 'MISSING PRODUCER ARGUMENT' };
  }

  // B-038-era fidelity gap, fixed: real CasparCG's keyword is written `[HTML]`
  // in its own documentation and logs, and the old test compared `=== 'HTML'`,
  // so the real spelling never matched and every mock-facing test had to use a
  // non-CasparCG argument order to get an html producer at all.
  const keyword = (a: string): string => a.toUpperCase().replace(/^\[|\]$/g, '');
  if (args.some((a) => keyword(a) === 'HTML') || /^https?:\/\//i.test(first)) {
    return { ok: true, kind: 'html' };
  }

  const upper = first.toUpperCase();
  if (upper === 'DECKLINK') {
    const device = args[2]?.toUpperCase() === 'DEVICE' ? Number(args[3]) : NaN;
    if (!Number.isInteger(device) || device < 1) {
      return { ok: false, code: 404, detail: 'DECKLINK NEEDS DEVICE <n>' };
    }
    return { ok: true, kind: 'decklink' };
  }
  if (upper === '[NDI]') {
    if ((args[2] ?? '') === '') return { ok: false, code: 404, detail: '[NDI] NEEDS "<source>"' };
    return { ok: true, kind: 'ndi' };
  }
  if (upper === 'NDI') {
    // The consumer's spelling: no producer is built, and the file producer finds no such file.
    return { ok: false, code: 404, detail: 'NDI NAME IS THE CONSUMER SYNTAX: File not found.' };
  }

  const scheme = SCHEME.exec(first);
  if (scheme !== null) {
    /*
      `PLAYOUT-SOURCES-01` — a STREAM URL (C-025's schemes: `PLAY 1-10 "rtsp://…"`, the command the
      owner proved by hand) is played by CasparCG's ffmpeg producer, so it is recorded as one. Any
      other scheme is still refused: there is no reading of `rist://…` under which this server built
      a producer, and a mock that acked it would hide an unusable input reaching the wire.
    */
    if (STREAM_SCHEMES.has((scheme[1] ?? '').toLowerCase())) return { ok: true, kind: 'ffmpeg' };
    if (scheme[1]?.toLowerCase() !== 'route') {
      return { ok: false, code: 404, detail: `UNKNOWN PRODUCER SCHEME ${scheme[1] ?? ''}` };
    }
    const target = ROUTE_TARGET.exec(first.slice(scheme[0].length));
    if (target === null || Number(target[1]) < 1) {
      return { ok: false, code: 404, detail: 'ROUTE NEEDS <channel>[-<layer>]' };
    }
    return { ok: true, kind: 'route' };
  }

  // No scheme, no keyword — a media file name, which is what CasparCG assumes.
  return { ok: true, kind: 'ffmpeg' };
}

/**
 * `PLAYOUT-SOURCES-01` — a media FILE the server no longer has answers `404`, as the core answers a
 * clip that is gone. Only a file (`ffmpeg`, no scheme and no keyword) can be missing this way.
 */
function missingFile(
  verdict: ProducerVerdict,
  args: readonly string[],
  ctx: HandlerContext,
): boolean {
  return verdict.ok && verdict.kind === 'ffmpeg' && ctx.isMissingMedia(args[1] ?? '');
}

/**
 * `PLAY <channel>-<layer> "<url|file|route://…>" [HTML]`
 * `PLAY <channel>-<layer> DECKLINK DEVICE <n>`
 * `PLAY <channel>-<layer> [NDI] "<source>"`
 */
function handlePlay(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'PLAY' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'PLAY' };
  /*
    `ROUTE-PLATES-01` — a BARE `PLAY <ch>-<L>` promotes what `LOADBG` put in the background (contract
    v1.3 rule 4: `LOADBG … route://H-L`, at least 40 ms, then `PLAY`).

    🔴 With NOTHING in the background it is ACKED, as the real core acks it: measured on CasparCG
    2.5.0 (69e8ad5 Stable), `PLAY 1-92` on an empty layer answered `202 PLAY OK` and left the layer
    as it was (a paused foreground resumes). This mock refused it with a `402` at first, which was
    stricter than the core — so a test could only have caught a defect the plant would have hidden.
    What the bridge must never do (a bare `PLAY` with no `LOADBG` before it) is pinned on the WIRE,
    in the bridge's tests, not by a refusal the core does not make.
  */
  if ((req.args[1] ?? '') === '') {
    const layer = ctx.peekLayer(slot);
    if (layer === undefined) return { kind: 'ok', code: 202, verb: 'PLAY' };
    if (layer.backgroundProducer === 'empty') {
      // `MEDIA-PLATES-01` — and a paused clip's clock runs again (`layer::play()` un-pauses).
      if (layer.paused) ctx.setLayer(slot, { paused: false, ...clipClockResumed(layer, ctx) });
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    }
    ctx.setLayer(slot, {
      producer: layer.backgroundProducer,
      filePath: layer.backgroundFilePath,
      backgroundProducer: 'empty',
      backgroundFilePath: '',
      paused: false,
      onAir: true,
      pageResolution: 'resolved',
      ...clipClockAtPlay(layer.backgroundProducer, ['', layer.backgroundFilePath], ctx),
    });
    return { kind: 'ok', code: 202, verb: 'PLAY' };
  }
  const verdict = classifyProducer(req.args);
  // The layer is left UNTOUCHED on a refusal — a refused PLAY that had already
  // written the producer would be the "looks acked, renders nothing" gap in
  // reverse: looks refused, layer changed anyway.
  if (!verdict.ok) {
    return { kind: 'err', code: verdict.code, verb: 'PLAY', detail: verdict.detail };
  }
  if (missingFile(verdict, req.args, ctx)) {
    return { kind: 'err', code: 404, verb: 'PLAY', detail: 'File not found.' };
  }
  const url = req.args[1] ?? '';
  // Non-fetching media/producer path — the page state is inertly 'resolved'.
  ctx.setLayer(slot, {
    producer: verdict.kind,
    filePath: url,
    paused: false,
    onAir: true,
    pageResolution: 'resolved',
    ...clipClockAtPlay(verdict.kind, req.args, ctx),
  });
  return { kind: 'ok', code: 202, verb: 'PLAY' };
}

/** The channel's frame rate: every mock channel runs at 50 fps (its `framerate` OSC says so). */
const CHANNEL_FPS = 50;

/**
 * `MEDIA-PLATES-01` — a media clip's clock as a `PLAY` starts it: from 0, running now, and `LOOP`
 * read as the core reads it — a bare flag anywhere after the file (`ffmpeg_producer.cpp`'s
 * `contains_param(L"LOOP", params)`, so even `LOOP 0` loops). A file the mock has no length for, and
 * every other producer, gets no clock.
 */
function clipClockAtPlay(
  kind: ProducerKind,
  args: readonly string[],
  ctx: HandlerContext,
): Pick<LayerState, 'loop' | 'clipLengthS' | 'clipElapsedS' | 'clipRunningSince'> {
  const loop = kind === 'ffmpeg' && args.slice(2).some((a) => a.toUpperCase() === 'LOOP');
  const length = kind === 'ffmpeg' ? ctx.clipLengthOf(args[1] ?? '') : undefined;
  return {
    loop,
    clipLengthS: length,
    clipElapsedS: 0,
    clipRunningSince: length === undefined ? null : ctx.now(),
  };
}

/** `MEDIA-PLATES-01` — a paused clip's clock runs again from where it stopped. */
function clipClockResumed(
  layer: LayerState,
  ctx: HandlerContext,
): Partial<Pick<LayerState, 'clipRunningSince'>> {
  return layer.clipLengthS === undefined || layer.clipRunningSince !== null
    ? {}
    : { clipRunningSince: ctx.now() };
}

/**
 * `MEDIA-PLATES-01` — `PAUSE <ch>-<L>`: the frame on screen is held and the clip's clock stops
 * (2.5.0 `layer.cpp`: `paused_ = true`, and `receive` is not called while paused — measured on the
 * owner's core: `file/time` stood still for a second). Acked on any layer, as the core acks it.
 */
function handlePause(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'PAUSE' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'PAUSE' };
  const layer = ctx.peekLayer(slot);
  if (layer === undefined || layer.paused) return { kind: 'ok', code: 202, verb: 'PAUSE' };
  const elapsed = clipElapsedAt(layer, ctx.now());
  ctx.setLayer(slot, {
    paused: true,
    ...(elapsed !== undefined ? { clipElapsedS: elapsed, clipRunningSince: null } : {}),
  });
  return { kind: 'ok', code: 202, verb: 'PAUSE' };
}

/** `MEDIA-PLATES-01` — `RESUME <ch>-<L>`: the clip carries on from the frame after the held one. */
function handleResume(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'RESUME' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'RESUME' };
  const layer = ctx.peekLayer(slot);
  if (layer === undefined || !layer.paused) return { kind: 'ok', code: 202, verb: 'RESUME' };
  ctx.setLayer(slot, { paused: false, ...clipClockResumed(layer, ctx) });
  return { kind: 'ok', code: 202, verb: 'RESUME' };
}

/**
 * `MEDIA-PLATES-01` — `CALL <ch>-<L> SEEK <frames>` and `CALL <ch>-<L> LOOP [0|1]`, on a media clip,
 * as 2.5.0's `ffmpeg_producer.cpp` `call()` answers them: `SEEK` counts channel frames and works
 * after the clip has ended (measured: `SEEK 0` restarted an ended clip); `LOOP` with `0`/`1` switches
 * looping on a playing clip and answers the flag, and with no value only answers it. Anything else —
 * no clip on the layer, another sub-command, a value that is not a number or not `0`/`1` — is refused.
 */
function handleCall(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'CALL' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CALL' };
  const layer = ctx.peekLayer(slot);
  if (layer === undefined || layer.producer !== 'ffmpeg') {
    return { kind: 'err', code: 403, verb: 'CALL', detail: 'NO CLIP ON THE LAYER' };
  }
  const sub = (req.args[1] ?? '').toUpperCase();
  const now = ctx.now();
  if (sub === 'SEEK') {
    const frames = Number(req.args[2]);
    if (!Number.isInteger(frames) || frames < 0) return { kind: 'err', code: 403, verb: 'CALL' };
    const length = layer.clipLengthS;
    const seconds = frames / CHANNEL_FPS;
    ctx.setLayer(slot, {
      clipElapsedS: length === undefined ? seconds : Math.min(seconds, length),
      clipRunningSince: length === undefined || layer.paused ? null : now,
    });
    return { kind: 'ok-line', code: 201, verb: 'CALL', data: String(frames) };
  }
  if (sub === 'LOOP') {
    const value = req.args[2];
    if (value === undefined) {
      return { kind: 'ok-line', code: 201, verb: 'CALL', data: layer.loop ? '1' : '0' };
    }
    if (value !== '0' && value !== '1') return { kind: 'err', code: 403, verb: 'CALL' };
    // Re-based at the old flag first, so an ENDED clip told to loop starts again from 0.
    const elapsed = clipElapsedAt(layer, now);
    ctx.setLayer(slot, {
      loop: value === '1',
      ...(elapsed !== undefined
        ? { clipElapsedS: elapsed, clipRunningSince: layer.paused ? null : now }
        : {}),
    });
    return { kind: 'ok-line', code: 201, verb: 'CALL', data: value };
  }
  return { kind: 'err', code: 403, verb: 'CALL', detail: `UNKNOWN CALL ${sub}` };
}

function handleLoad(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'LOAD' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'LOAD' };
  // ONE classifier for both verbs — `PLAY` and `LOAD` build the same producers,
  // and two copies of the acceptance rule is how they come to disagree about
  // what is a valid form.
  const verdict = classifyProducer(req.args);
  if (!verdict.ok) {
    return { kind: 'err', code: verdict.code, verb: 'LOAD', detail: verdict.detail };
  }
  if (missingFile(verdict, req.args, ctx)) {
    return { kind: 'err', code: 404, verb: 'LOAD', detail: 'File not found.' };
  }
  const url = req.args[1] ?? '';
  // LOAD primes the foreground but pauses immediately — PLAY is required to resume.
  ctx.setLayer(slot, {
    producer: verdict.kind,
    filePath: url,
    paused: true,
    onAir: false,
    pageResolution: 'resolved',
    // `MEDIA-PLATES-01` — its clock is set, and stands until the PLAY that resumes it.
    ...clipClockAtPlay(verdict.kind, req.args, ctx),
    clipRunningSince: null,
  });
  return { kind: 'ok', code: 202, verb: 'LOAD' };
}

/**
 * `ROUTE-PLATES-01` — `LOADBG <channel>-<layer> "<producer>"`: the producer goes to the layer's
 * BACKGROUND and the foreground is untouched, as on the core — so a `route://H-L` preloaded for a
 * hidden plate changes nothing on air until the bare `PLAY` promotes it. The same one classifier as
 * `PLAY` and `LOAD`: an unrecognised form is refused, never silently acked.
 */
function handleLoadBg(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'LOADBG' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'LOADBG' };
  const verdict = classifyProducer(req.args);
  if (!verdict.ok) {
    return { kind: 'err', code: verdict.code, verb: 'LOADBG', detail: verdict.detail };
  }
  if (missingFile(verdict, req.args, ctx)) {
    return { kind: 'err', code: 404, verb: 'LOADBG', detail: 'File not found.' };
  }
  ctx.setLayer(slot, { backgroundProducer: verdict.kind, backgroundFilePath: req.args[1] ?? '' });
  return { kind: 'ok', code: 202, verb: 'LOADBG' };
}

function handleClear(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const target = req.args[0];
  if (!target) {
    return { kind: 'err', code: 402, verb: 'CLEAR' };
  }
  const slot = parseChannelLayer(target);
  if (slot) {
    if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CLEAR' };
    // B-039 — CLEAR DESTROYS the producer (and takes it off air). `ROUTE-PLATES-01` — and the
    // background one with it, as on the core.
    ctx.setLayer(slot, {
      producer: 'empty',
      filePath: '',
      backgroundProducer: 'empty',
      backgroundFilePath: '',
      paused: false,
      onAir: false,
      pageResolution: 'resolved',
      // `MEDIA-PLATES-01` — the clip is gone, and its clock with it.
      loop: false,
      clipLengthS: undefined,
      clipElapsedS: 0,
      clipRunningSince: null,
      // `RELEASE-091-01` B2 — and the layer leaves the stage: its OSC stops and `INFO` no longer
      // lists it, as on the core. Its mixer state stays (the core keeps its transforms).
      onStage: false,
    });
    return { kind: 'ok', code: 202, verb: 'CLEAR' };
  }
  // `CLEAR <channel>` — clear all layers on the channel. Walk known slots.
  const channel = Number(target);
  if (!Number.isInteger(channel) || channel < 1 || channel > ctx.channelCount) {
    return { kind: 'err', code: 401, verb: 'CLEAR' };
  }
  // Without enumerating layers we can't actually clear them — the registry
  // is sparse. CLEAR <channel> is a no-op against an empty channel, which
  // matches the real server semantics ("nothing on, nothing to clear").
  return { kind: 'ok', code: 202, verb: 'CLEAR' };
}

/**
 * `CG <channel>-<layer> ADD <flash-layer> "<template>" <play-on-load> "<data>"`
 * `CG <channel>-<layer> PLAY <flash-layer>`
 * `CG <channel>-<layer> STOP <flash-layer>`
 * `CG <channel>-<layer> UPDATE <flash-layer> "<data>"`
 * `CG <channel>-<layer> INVOKE <flash-layer> "<method>"`
 * `CG <channel>-<layer> REMOVE <flash-layer>`
 *
 * B-038 — the mock STOPS blind-acking `CG ADD`: it **resolves** the template
 * argument so a "looks acked, renders nothing" regression can't hide. A bare id
 * (no URL) or a URL it cannot `GET` → `404` (real CasparCG's `CG ADD FAILED`);
 * only a URL that returns a served page → `202` (+ producer `html`). It also
 * records the `CG ADD` / `CG UPDATE` data payload on the handle so tests can
 * assert it is the real, non-empty field JSON (not `"{}"`).
 *
 * B-041 — the recorded data payload is the SECOND-layer decode verdict
 * (`decodeCgData`): what `window.update` would receive after the html_cg_proxy
 * `update("…")` V8 embed, or a rejection flag for a framing/JSON-breaking
 * argument. Like real CasparCG the command still `202`s — the V8 failure is
 * asynchronous — but the payload assertion in tests now catches it.
 */
function handleCg(req: AmcpRequest, ctx: HandlerContext): AmcpResponse {
  const slot = parseChannelLayer(req.args[0]);
  if (!slot) return { kind: 'err', code: 401, verb: 'CG' };
  if (slot.channel > ctx.channelCount) return { kind: 'err', code: 404, verb: 'CG' };

  const sub = req.args[1]?.toUpperCase();
  switch (sub) {
    case 'ADD': {
      // `CG <slot> ADD <flash-layer> "<template>" <play-on-load> "<data>"`.
      const template = req.args[3] ?? '';
      const playOnLoad = req.args[4] === '1';
      // B-041 — the data arg has passed layer 1 (the tokenizer); run the
      // layer-2 (html_cg_proxy → V8) emulation before recording.
      const token = ctx.recordCgAdd(slot, template, decodeCgData(req.args[5] ?? ''));
      // Reconnect-reconciliation — model REAL CasparCG's acceptance: a bare
      // (non-URL) reference is a template-path lookup → `404 CG ADD FAILED`,
      // while a URL is accepted with NO fetch before the ack (CEF loads it
      // asynchronously — a dead URL still `202`s and produces empty frames).
      // The async fetch verdict is recorded per slot (`lastCgAdd().resolution`)
      // so tests assert delivery through it, never through a synthetic AMCP
      // failure — the "looks acked, renders nothing" tripwire lives on there.
      if (!/^https?:\/\//i.test(template)) {
        ctx.completeCgAdd(slot, token, false);
        return { kind: 'err', code: 404, verb: 'CG', detail: 'CG ADD FAILED' };
      }
      // B-039 — the producer exists immediately (before the page finishes
      // loading); it is on air only if play-on-load is set (`… 1 …`). A load
      // (`… 0 …`) loads it without playing — the operator's `CG PLAY` plays.
      ctx.loadCgPage(slot, token, template, playOnLoad);
      void httpGetOk(template, 2000).then((ok) => {
        ctx.completeCgAdd(slot, token, ok);
      });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'UPDATE': {
      // `CG <slot> UPDATE <flash-layer> "<data>"` — expose the two-layer decode
      // verdict for assertion (B-041). Recorded even when the command fails:
      // the recording observes what was SENT.
      ctx.recordCgUpdate(slot, decodeCgData(req.args[3] ?? ''));
      // Reconnect-reconciliation — real CasparCG 403s an update on a layer with
      // no cg producer (`get_expected_cg_proxy`; the B-038 live log showed
      // exactly this). No more blind 202.
      if (ctx.getLayer(slot).producer !== 'html') {
        return { kind: 'err', code: 403, verb: 'CG', detail: 'CG UPDATE FAILED' };
      }
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'PLAY': {
      // B-039 — `CG PLAY` puts the template on air ONLY when a producer is loaded.
      // PLAY on an empty/destroyed layer is an observable NO-OP (onAir stays false),
      // though it still 202s — matching real CasparCG's blind ack. This is the exact
      // "looks acked, renders nothing" gap the old mock hid.
      // Reconnect-reconciliation — a 'failed' page produces empty frames (the
      // queued play() never flushes): PLAY still 202s but stays off air.
      const layer = ctx.getLayer(slot);
      if (layer.producer === 'html' && layer.pageResolution !== 'failed') {
        ctx.setLayer(slot, { onAir: true });
      }
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    case 'STOP':
      ctx.setLayer(slot, { onAir: false });
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'INVOKE':
    case 'NEXT':
      return { kind: 'ok', code: 202, verb: 'CG' };
    case 'REMOVE': {
      ctx.setLayer(slot, {
        producer: 'empty',
        filePath: '',
        paused: false,
        onAir: false,
        pageResolution: 'resolved',
      });
      return { kind: 'ok', code: 202, verb: 'CG' };
    }
    default:
      return { kind: 'err', code: 400, verb: 'CG' };
  }
}

/** True iff `GET <url>` returns a 2xx within `timeoutMs`. Never throws. */
function httpGetOk(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const lib = url.toLowerCase().startsWith('https:') ? https : http;
      const request = lib.get(url, (res) => {
        const status = res.statusCode ?? 0;
        res.resume(); // drain so the socket can free
        done(status >= 200 && status < 300);
      });
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        done(false);
      });
      request.on('error', () => done(false));
    } catch {
      done(false);
    }
  });
}

/**
 * `<channel>-<layer>` or `<channel>` — returns null on parse failure.
 * (Layer-less form is treated as layer 0, matching CasparCG defaults.)
 */
function parseChannelLayer(token: string | undefined): { channel: number; layer: number } | null {
  if (!token) return null;
  const dash = token.indexOf('-');
  if (dash === -1) {
    const ch = Number(token);
    if (!Number.isInteger(ch) || ch < 1) return null;
    return { channel: ch, layer: 0 };
  }
  const ch = Number(token.slice(0, dash));
  const ly = Number(token.slice(dash + 1));
  if (!Number.isInteger(ch) || ch < 1 || !Number.isInteger(ly) || ly < 0) return null;
  return { channel: ch, layer: ly };
}
