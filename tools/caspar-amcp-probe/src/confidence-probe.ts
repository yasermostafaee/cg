import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AmcpClient, replyCode } from './amcp-client.js';

/**
 * PROBE / TOOL — NOT product code, NOT a feature. Session BN, serving `C-016`
 * (operator PGM confidence view) and `C-023` (a confidence thumbnail per live source,
 * which rides C-016's grab path deliberately rather than forking its own).
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * C-016's acceptance says the mechanism's **cost on the playout machine has been
 * MEASURED on real 2.3.2 BEFORE the mechanism is fixed**. This is the instrument that
 * obtains those numbers. It chooses nothing, designs nothing and ships no product
 * behaviour: it drives a real CasparCG over AMCP and writes down what happened.
 *
 * ── 🔴 WHY IT IS A TOOL AND NOT A SESSION'S SCRATCH SCRIPT ──────────────────
 *
 * Owner constraint, 2026-08-21: _"This product is not only for one particular network.
 * It may be sold to different networks, each of which has different facilities."_ So
 * the deliverable cannot be "the answer for this plant" — an installer on a different
 * box, with a different channel format and a weaker playout machine, has to be able to
 * run the same kit and get their own numbers. That is why this is a committed tool with
 * a documented invocation rather than something that dies with the session.
 *
 * ── 🔴 THE DISCIPLINE THAT MATTERS MOST: DISCOVER, NEVER GUESS ──────────────
 *
 * The grab verb is **not hard-coded**. This asks the server what it supports
 * ({@link discoverGrabVerbs}) and tries only tokens the server itself named. Guessing an
 * AMCP verb into a runbook somebody pastes at a live plant is the worst available
 * outcome, so when discovery finds nothing this reports a FINDING and stops rather than
 * filling the gap with a plausible command name.
 *
 * The same rule applies to the DROP COUNTER. Nothing here knows what a dropped-frame
 * field is called on any particular build, so it captures `INFO` verbatim and every OSC
 * address the channel emits, before and after, and lets the comparison be made on real
 * text instead of on a field name this file invented.
 *
 * ── SAFETY, stated because this runs against a machine that is on air ───────
 *
 * - **It never PLAYs anything on the channel it is measuring.** A grab is a read.
 * - **It never sends a bare channel-wide `CLEAR`.** Every clear names a layer.
 * - **§3.4's generalisation phase REFUSES to run on the air channel.** It needs a
 *   `probeChannel` that differs from `channel`; without one it records a SKIPPED result
 *   naming the reason. That is BN's stop rule ("if measuring 3.4 would require putting
 *   something on the program channel → stop and ask") expressed as code rather than as a
 *   sentence somebody has to remember.
 */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One AMCP exchange, recorded verbatim in both directions. */
export interface Exchange {
  readonly sentAtMs: number;
  readonly command: string;
  /** Every reply line attributed to this command, verbatim. */
  readonly reply: readonly string[];
  readonly code: number;
  /** Wall-clock ms from send to the last reply line seen inside the wait window. */
  readonly latencyMs: number;
}

/** §3.1 — what the server said it supports, and what each candidate actually did. */
export interface VerbDiscovery {
  readonly version: Exchange;
  /** The full verbatim `HELP` (or equivalent) enumeration. */
  readonly enumeration: Exchange;
  /**
   * Command tokens THE SERVER NAMED that look grab-shaped, with the pattern that
   * matched. Empty is a legitimate — and reportable — outcome.
   */
  readonly candidates: readonly { readonly verb: string; readonly matchedOn: string }[];
  /** Each candidate actually attempted, with its verbatim reply. */
  readonly attempts: readonly Exchange[];
  /** The verb that produced an OK reply, or null. */
  readonly accepted: string | null;
  readonly finding: string | null;
}

/** A channel observation: `INFO` verbatim plus whatever OSC the channel emitted. */
export interface ChannelSnapshot {
  readonly atMs: number;
  readonly info: Exchange;
  /** Every distinct OSC address seen for this channel, with its last value. */
  readonly osc: Readonly<Record<string, string>>;
}

export interface GrabTiming {
  readonly index: number;
  readonly atMs: number;
  readonly latencyMs: number;
  readonly code: number;
  readonly reply: readonly string[];
}

export interface CadenceResult {
  readonly requestedHz: number;
  readonly durationMs: number;
  readonly grabs: readonly GrabTiming[];
  readonly before: ChannelSnapshot;
  readonly midpoint: ChannelSnapshot;
  readonly after: ChannelSnapshot;
}

export interface GeneralisationResult {
  readonly ran: boolean;
  readonly skippedBecause: string | null;
  /** (a) a second channel carrying a `route://` of the air layer. */
  readonly routePath: readonly Exchange[];
  /**
   * (b) opening the physical input a SECOND time on a spare layer — session BM's §2.2,
   * left open and STOOD IN FOR by the `live-source-duplicate` refusal.
   */
  readonly secondOpenPath: readonly Exchange[];
  /** Verbatim, whichever way it went. The refusal is as much a result as the success. */
  readonly secondOpenVerdict: string | null;
}

export interface ArtifactResult {
  readonly searched: readonly string[];
  readonly found: {
    readonly file: string;
    readonly bytes: number;
    readonly width: number | null;
    readonly height: number | null;
    readonly kind: string;
  } | null;
  readonly note: string;
}

export interface ConfidenceProbeResult {
  readonly startedAtIso: string;
  readonly options: Readonly<Record<string, string | number | boolean | null>>;
  readonly discovery: VerbDiscovery;
  readonly singleGrabAtRest: readonly GrabTiming[];
  readonly singleGrabUnderLoad: {
    readonly ran: boolean;
    readonly skippedBecause: string | null;
    readonly grabs: readonly GrabTiming[];
  };
  readonly atRestBefore: ChannelSnapshot | null;
  readonly atRestAfter: ChannelSnapshot | null;
  readonly cadence: CadenceResult | null;
  readonly generalisation: GeneralisationResult;
  readonly artifact: ArtifactResult;
  readonly findings: readonly string[];
}

export interface ConfidenceProbeOptions {
  readonly casparHost: string;
  readonly casparPort: number;
  readonly oscPort: number;
  /** The channel to MEASURE — normally the programme channel. Never played onto. */
  readonly channel: number;
  /**
   * A channel that carries NO air, for §3.4 only. Absent ⇒ §3.4 is skipped with a
   * recorded reason. It must differ from {@link channel}.
   */
  readonly probeChannel: number | null;
  /** A layer on {@link probeChannel} for §3.4's producers. Never on {@link channel}. */
  readonly probeLayer: number;
  /** The air layer §3.4(a) routes FROM, when routing is being tried. */
  readonly routeFromLayer: number | null;
  /** A producer argument for §3.4(b) — the physical input, opened a second time. */
  readonly inputArg: string | null;
  /** An `html` template URL to animate for §3.2's under-load case. Optional. */
  readonly loadTemplateUrl: string | null;
  /** A layer on {@link probeChannel} to animate the load template on. */
  readonly loadLayer: number;
  readonly cadenceHz: number;
  readonly cadenceMs: number;
  readonly restGrabs: number;
  /** Directories to look in for the produced artifact (§3.5). */
  readonly mediaRoots: readonly string[];
  readonly replyWaitMs: number;
  readonly outPath: string | null;
}

/**
 * Patterns a grab-shaped verb might match. ⚠ These filter THE SERVER'S OWN
 * ENUMERATION — they are not a list of commands to send. A token reaches
 * {@link VerbDiscovery.attempts} only because the server printed it.
 */
const GRAB_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  { label: 'contains PRINT', re: /\bPRINT\b/i },
  { label: 'contains SNAPSHOT', re: /\bSNAPSHOT\b/i },
  { label: 'contains THUMBNAIL', re: /\bTHUMBNAIL\b/i },
  { label: 'contains GRAB', re: /\bGRAB\b/i },
  { label: 'contains CAPTURE', re: /\bCAPTURE\b/i },
  { label: 'contains SCREENSHOT', re: /\bSCREENSHOT\b/i },
];

/**
 * Passive OSC listener recording EVERY address for one channel, with its last value.
 *
 * 🔴 It does not look for a named drop counter, because nothing here knows what one is
 * called on an arbitrary build. Capturing the whole address space and diffing two
 * snapshots is what lets a counter be FOUND rather than assumed — the same discovery
 * discipline the verb search uses, applied to the measurement.
 */
class ChannelOscWatch {
  readonly #sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  readonly #prefix: string;
  readonly #latest = new Map<string, string>();
  #bound = false;

  constructor(channel: number) {
    this.#prefix = `/channel/${String(channel)}/`;
  }

  /**
   * Split one OSC packet into `{address → printable value}`.
   *
   * ⚠ The framing is the trap `LayerOscWatch` already paid for: after the NUL-padded
   * ADDRESS comes a NUL-padded TYPE TAG (`,s` / `,i` / `,f`), and only then the value.
   * This reads the address and then renders whatever follows as printable text — it does
   * not decode types, because the comparison that matters is "did this string change".
   */
  #ingest(buf: Buffer): void {
    const s = buf.toString('latin1');
    let at = s.indexOf(this.#prefix);
    while (at >= 0) {
      let i = at;
      while (i < s.length && s[i] !== '\u0000') i++;
      const address = s.slice(at, i);
      while (i < s.length && s[i] === '\u0000') i++;
      let value = '';
      if (s[i] === ',') {
        const tagStart = i;
        while (i < s.length && s[i] !== '\u0000') i++;
        const tags = s.slice(tagStart + 1, i);
        while (i < s.length && s[i] === '\u0000') i++;
        let end = i;
        while (end < s.length && s[end] !== '\u0000') end++;
        const raw = s.slice(i, end);
        value = tags.includes('s')
          ? raw.trim()
          : Buffer.from(raw, 'latin1').toString('hex').slice(0, 32);
      }
      this.#latest.set(address, value);
      at = s.indexOf(this.#prefix, at + this.#prefix.length);
    }
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.#sock.on('message', (b) => this.#ingest(b));
      this.#sock.on('error', () => resolve());
      this.#sock.bind(port, () => {
        this.#bound = true;
        resolve();
      });
    });
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.#latest].sort(([a], [b]) => a.localeCompare(b)));
  }

  close(): void {
    if (this.#bound) this.#sock.close();
  }
}

/** Send one command and collect every reply line that arrives inside the wait window. */
async function exchange(client: AmcpClient, command: string, waitMs: number): Promise<Exchange> {
  const sentAtMs = Date.now();
  client.send(command);
  await sleep(waitMs);
  const reply = client.linesSince(sentAtMs);
  const first = reply[0] ?? '';
  return {
    sentAtMs,
    command,
    reply,
    code: replyCode(first),
    latencyMs: Date.now() - sentAtMs,
  };
}

/**
 * 🔴 §3.1 — WHICH GRAB COMMANDS DOES **THIS BUILD** ACTUALLY HAVE?
 *
 * Ask, then try only what was named. The `finding` field is the deliverable when the
 * answer is "none": a build with no grab verb is a real, reportable result for C-016,
 * and it is the one outcome that must never be papered over with a guess.
 */
export async function discoverGrabVerbs(
  client: AmcpClient,
  channel: number,
  waitMs: number,
): Promise<VerbDiscovery> {
  const version = await exchange(client, 'VERSION', waitMs);
  const enumeration = await exchange(client, 'HELP', Math.max(waitMs, 800));

  const seen = new Map<string, string>();
  for (const line of enumeration.reply) {
    for (const { label, re } of GRAB_PATTERNS) {
      if (!re.test(line)) continue;
      // The command token is the leading word of a HELP line. Take it verbatim; do not
      // reconstruct it from the pattern that matched.
      const token = /^\s*([A-Z][A-Z0-9 _-]*?)(?:\s{2,}|\s+\[|\s+\{|$)/.exec(line)?.[1]?.trim();
      if (token !== undefined && token !== '' && !seen.has(token)) seen.set(token, label);
    }
  }
  const candidates = [...seen].map(([verb, matchedOn]) => ({ verb, matchedOn }));

  const attempts: Exchange[] = [];
  let accepted: string | null = null;
  for (const { verb } of candidates) {
    // The narrowest possible form: the verb and the channel. Anything more would be this
    // file inventing an argument grammar the server never showed it.
    const attempt = await exchange(client, `${verb} ${String(channel)}`, waitMs);
    attempts.push(attempt);
    if (accepted === null && attempt.code >= 200 && attempt.code < 300) accepted = verb;
  }

  const finding =
    candidates.length === 0
      ? 'FINDING (§3.1): the server enumerated NO grab-shaped verb. Nothing was guessed. ' +
        'Record the verbatim HELP output in the runbook — a build with no grab command is a ' +
        'result for C-016, not a gap to fill with a plausible command name.'
      : accepted === null
        ? 'FINDING (§3.1): the server named ' +
          `${String(candidates.length)} grab-shaped verb(s) and ACCEPTED none of them in ` +
          'their narrowest form. The argument grammar is therefore not established. Record ' +
          'each verbatim reply; do not extend the attempt with an invented argument.'
        : null;

  return { version, enumeration, candidates, attempts, accepted, finding };
}

async function snapshotChannel(
  client: AmcpClient,
  channel: number,
  osc: ChannelOscWatch,
  waitMs: number,
): Promise<ChannelSnapshot> {
  const info = await exchange(client, `INFO ${String(channel)}`, Math.max(waitMs, 400));
  return { atMs: Date.now(), info, osc: osc.snapshot() };
}

async function timedGrab(
  client: AmcpClient,
  verb: string,
  channel: number,
  index: number,
  waitMs: number,
): Promise<GrabTiming> {
  const ex = await exchange(client, `${verb} ${String(channel)}`, waitMs);
  return {
    index,
    atMs: ex.sentAtMs,
    latencyMs: ex.latencyMs,
    code: ex.code,
    reply: ex.reply,
  };
}

/** PNG/JPEG dimensions from the header alone — no dependency, no decode. */
function imageDimensions(buf: Buffer): {
  width: number | null;
  height: number | null;
  kind: string;
} {
  if (buf.length > 24 && buf.subarray(1, 4).toString('latin1') === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), kind: 'png' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1] ?? 0;
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 / SOF13..SOF15 carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), kind: 'jpeg' };
      }
      i += 2 + len;
    }
    return { width: null, height: null, kind: 'jpeg' };
  }
  return { width: null, height: null, kind: 'unknown' };
}

/**
 * §3.5 — the produced artifact, and where it landed.
 *
 * 🔴 **The bridge's HTTP server has NO filesystem root**, which this cannot discover for
 * you and which the runbook states as a read-from-code fact: `template-http-server.ts`
 * serves exactly one route, `/template/<id>`, out of an in-memory map. So wherever the
 * grab lands, C-016 needs a route that does not exist yet. This function's job is only to
 * say what the file IS.
 */
function findArtifact(roots: readonly string[], sinceMs: number): ArtifactResult {
  const searched: string[] = [];
  let best: { file: string; mtime: number } | null = null;
  for (const root of roots) {
    searched.push(root);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const file = path.join(root, e.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      if (stat.mtimeMs < sinceMs) continue;
      if (best === null || stat.mtimeMs > best.mtime) best = { file, mtime: stat.mtimeMs };
    }
  }
  if (best === null) {
    return {
      searched,
      found: null,
      note:
        searched.length === 0
          ? 'No media roots were given (--media-root), so nothing was searched. The artifact ' +
            "path is then whatever the grab's verbatim reply names — record that instead."
          : 'No file newer than the probe start was found under the given roots. Either the ' +
            'grab wrote elsewhere (record its verbatim reply) or it produced no file.',
    };
  }
  const buf = fs.readFileSync(best.file);
  const dims = imageDimensions(buf);
  return {
    searched,
    found: { file: best.file, bytes: buf.length, ...dims },
    note:
      'Newest file under the given roots since the probe started. Confirm by eye that it ' +
      'is the grab and not an unrelated write.',
  };
}

/**
 * 🔴 §3.4 — DOES THE GRAB PATH GENERALISE BEYOND THE PROGRAMME CHANNEL?
 *
 * C-023 rides on the answer, and C-016 says explicitly that a failure to generalise is a
 * finding for C-016 rather than a licence for C-023 to fork its own grab path. Two
 * candidate paths, DISTINGUISHED rather than assumed:
 *
 * - **(a) route** — a second channel carrying `route://<air>` of the live layer. Costs a
 *   channel; opens no input twice.
 * - **(b) second open** — the physical input opened a SECOND time on a spare layer. This
 *   is session BM's §2.2, left OPEN, and the `live-source-duplicate` refusal (§6.2) was
 *   shipped STANDING IN FOR the answer. Whatever the server does here decides whether
 *   that refusal is a hardware fact or a policy choice — so the verbatim reply is the
 *   result, in either direction.
 *
 * ⚠ **It refuses to run on the air channel.** Both paths PLAY a producer, and BN's stop
 * rule forbids putting anything on the programme channel without asking. No probe
 * channel ⇒ SKIPPED, with the reason recorded.
 */
async function measureGeneralisation(
  client: AmcpClient,
  opts: ConfidenceProbeOptions,
  verb: string | null,
  waitMs: number,
): Promise<GeneralisationResult> {
  const empty = { routePath: [], secondOpenPath: [], secondOpenVerdict: null };
  if (opts.probeChannel === null) {
    return {
      ran: false,
      skippedBecause:
        'SKIPPED (§3.4): no --probe-channel was given. Both paths PLAY a producer, and this ' +
        'kit will not put one on the channel it is measuring. Name a channel with no ' +
        'air-carrying consumer and re-run.',
      ...empty,
    };
  }
  if (opts.probeChannel === opts.channel) {
    return {
      ran: false,
      skippedBecause:
        `SKIPPED (§3.4): --probe-channel (${String(opts.probeChannel)}) is the channel being ` +
        'measured. That is the one thing this phase may not do.',
      ...empty,
    };
  }

  const routePath: Exchange[] = [];
  if (opts.routeFromLayer !== null) {
    const target = `${String(opts.probeChannel)}-${String(opts.probeLayer)}`;
    const from = `${String(opts.channel)}-${String(opts.routeFromLayer)}`;
    routePath.push(await exchange(client, `PLAY ${target} "route://${from}"`, waitMs));
    if (verb !== null) {
      routePath.push(await exchange(client, `${verb} ${String(opts.probeChannel)}`, waitMs));
    }
    // Named layer, never a bare channel CLEAR.
    routePath.push(await exchange(client, `CLEAR ${target}`, waitMs));
  }

  const secondOpenPath: Exchange[] = [];
  let secondOpenVerdict: string | null = null;
  if (opts.inputArg !== null) {
    const target = `${String(opts.probeChannel)}-${String(opts.probeLayer)}`;
    const play = await exchange(client, `PLAY ${target} "${opts.inputArg}"`, waitMs);
    secondOpenPath.push(play);
    const ok = play.code >= 200 && play.code < 300;
    secondOpenVerdict =
      (ok
        ? 'ACCEPTED — this hardware opened the same physical input a SECOND time. Session ' +
          "BM's §2.2 is answered YES, which makes `live-source-duplicate` a POLICY choice " +
          'rather than a hardware fact.'
        : 'REFUSED — this hardware did not open the same physical input twice. §2.2 is ' +
          'answered NO, which makes `live-source-duplicate` a hardware fact on this box.') +
      ' Verbatim reply: ' +
      play.reply.join(' | ');
    if (ok) secondOpenPath.push(await exchange(client, `CLEAR ${target}`, waitMs));
  }

  return {
    ran: true,
    skippedBecause: null,
    routePath,
    secondOpenPath,
    secondOpenVerdict,
  };
}

/** Run the whole kit. Every phase records what happened; none of them decides anything. */
export async function runConfidenceProbe(
  opts: ConfidenceProbeOptions,
): Promise<ConfidenceProbeResult> {
  const startedAtIso = new Date().toISOString();
  const startedMs = Date.now();
  const findings: string[] = [];
  const osc = new ChannelOscWatch(opts.channel);
  await osc.start(opts.oscPort);

  const client = new AmcpClient();
  await client.connect(opts.casparHost, opts.casparPort);
  const wait = opts.replyWaitMs;

  try {
    const discovery = await discoverGrabVerbs(client, opts.channel, wait);
    if (discovery.finding !== null) findings.push(discovery.finding);
    const verb = discovery.accepted;

    let atRestBefore: ChannelSnapshot | null = null;
    let atRestAfter: ChannelSnapshot | null = null;
    const singleGrabAtRest: GrabTiming[] = [];
    let cadence: CadenceResult | null = null;
    const underLoad: GrabTiming[] = [];
    let loadSkipped: string | null = null;

    if (verb === null) {
      findings.push(
        'SKIPPED (§3.2, §3.3): no grab verb was established, so nothing could be timed. ' +
          'This is the §3.1 finding propagating — it is not a failure of the measurement.',
      );
    } else {
      // §3.2 — ONE grab, channel at rest.
      atRestBefore = await snapshotChannel(client, opts.channel, osc, wait);
      for (let i = 0; i < opts.restGrabs; i++) {
        singleGrabAtRest.push(await timedGrab(client, verb, opts.channel, i, wait));
        await sleep(250);
      }
      atRestAfter = await snapshotChannel(client, opts.channel, osc, wait);

      // §3.2 — ONE grab with a template ANIMATING. The load runs on the PROBE channel,
      // never on the channel being measured; without one the case is honestly skipped
      // rather than quietly run at rest and reported as "under load".
      if (opts.loadTemplateUrl === null) {
        loadSkipped =
          'SKIPPED (§3.2 under load): no --load-template-url was given, so there was ' +
          'nothing animating. A rest measurement must not be reported as an under-load one.';
      } else if (opts.probeChannel === null || opts.probeChannel === opts.channel) {
        loadSkipped =
          'SKIPPED (§3.2 under load): the load template needs a channel that is not the ' +
          'one being measured. Give --probe-channel.';
      } else {
        const target = `${String(opts.probeChannel)}-${String(opts.loadLayer)}`;
        await exchange(client, `CG ${target} ADD 0 "${opts.loadTemplateUrl}" 1`, wait);
        await sleep(500);
        for (let i = 0; i < opts.restGrabs; i++) {
          underLoad.push(await timedGrab(client, verb, opts.channel, i, wait));
          await sleep(250);
        }
        await exchange(client, `CLEAR ${target}`, wait);
      }

      // §3.3 — CADENCE. The measurement that decides whether C-016's ~1 s bar is
      // affordable at all, so its duration is deliberately not shortened by default.
      const before = await snapshotChannel(client, opts.channel, osc, wait);
      const periodMs = Math.max(1, Math.round(1000 / opts.cadenceHz));
      const grabs: GrabTiming[] = [];
      let midpoint: ChannelSnapshot | null = null;
      const deadline = Date.now() + opts.cadenceMs;
      const halfway = Date.now() + Math.round(opts.cadenceMs / 2);
      let n = 0;
      while (Date.now() < deadline) {
        const tick = Date.now();
        grabs.push(await timedGrab(client, verb, opts.channel, n++, wait));
        if (midpoint === null && Date.now() >= halfway) {
          midpoint = await snapshotChannel(client, opts.channel, osc, wait);
        }
        const spent = Date.now() - tick;
        if (spent < periodMs) await sleep(periodMs - spent);
      }
      const after = await snapshotChannel(client, opts.channel, osc, wait);
      cadence = {
        requestedHz: opts.cadenceHz,
        durationMs: opts.cadenceMs,
        grabs,
        before,
        midpoint: midpoint ?? before,
        after,
      };
    }

    const generalisation = await measureGeneralisation(client, opts, verb, wait);
    if (generalisation.skippedBecause !== null) findings.push(generalisation.skippedBecause);
    if (generalisation.secondOpenVerdict !== null) findings.push(generalisation.secondOpenVerdict);

    const artifact = findArtifact(opts.mediaRoots, startedMs);

    const result: ConfidenceProbeResult = {
      startedAtIso,
      options: {
        casparHost: opts.casparHost,
        casparPort: opts.casparPort,
        oscPort: opts.oscPort,
        channel: opts.channel,
        probeChannel: opts.probeChannel,
        probeLayer: opts.probeLayer,
        routeFromLayer: opts.routeFromLayer,
        inputArg: opts.inputArg,
        loadTemplateUrl: opts.loadTemplateUrl,
        cadenceHz: opts.cadenceHz,
        cadenceMs: opts.cadenceMs,
        restGrabs: opts.restGrabs,
      },
      discovery,
      singleGrabAtRest,
      singleGrabUnderLoad: {
        ran: underLoad.length > 0,
        skippedBecause: loadSkipped,
        grabs: underLoad,
      },
      atRestBefore,
      atRestAfter,
      cadence,
      generalisation,
      artifact,
      findings,
    };

    if (opts.outPath !== null) {
      fs.writeFileSync(opts.outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    return result;
  } finally {
    await client.close();
    osc.close();
  }
}

/** Percentile over a sorted copy — `p` in 0..1. */
function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? null;
}

/** Addresses whose value differs between two snapshots — the drop counter, if there is one. */
export function oscDelta(
  a: ChannelSnapshot | null,
  b: ChannelSnapshot | null,
): readonly { address: string; before: string; after: string }[] {
  if (a === null || b === null) return [];
  const out: { address: string; before: string; after: string }[] = [];
  for (const [address, after] of Object.entries(b.osc)) {
    const before = a.osc[address];
    if (before !== undefined && before !== after) out.push({ address, before, after });
  }
  return out;
}

/** The human-readable summary. Numbers and verbatim text; never a verdict. */
export function summarise(result: ConfidenceProbeResult): string {
  const out: string[] = [];
  const line = (s = ''): void => void out.push(s);
  const stat = (label: string, grabs: readonly GrabTiming[]): void => {
    if (grabs.length === 0) {
      line(`  ${label}: (none)`);
      return;
    }
    const ms = grabs.map((g) => g.latencyMs);
    const bad = grabs.filter((g) => g.code < 200 || g.code >= 300).length;
    line(
      `  ${label}: n=${String(grabs.length)} min=${String(Math.min(...ms))}ms ` +
        `p50=${String(percentile(ms, 0.5) ?? 0)}ms p95=${String(percentile(ms, 0.95) ?? 0)}ms ` +
        `max=${String(Math.max(...ms))}ms non-OK=${String(bad)}`,
    );
  };

  line(`CONFIDENCE-GRAB PROBE — ${result.startedAtIso}`);
  line(
    `  channel=${String(result.options['channel'] ?? '')} host=${String(result.options['casparHost'] ?? '')}`,
  );
  line();
  line('§3.1 VERB DISCOVERY');
  line(`  VERSION: ${result.discovery.version.reply.join(' | ')}`);
  line(`  server named ${String(result.discovery.candidates.length)} grab-shaped verb(s):`);
  for (const c of result.discovery.candidates) line(`    - ${c.verb}  (${c.matchedOn})`);
  for (const a of result.discovery.attempts) {
    line(`    ${a.command} -> ${a.reply.join(' | ') || '(no reply in window)'}`);
  }
  line(`  ACCEPTED: ${result.discovery.accepted ?? 'NONE'}`);
  line();
  line('§3.2 SINGLE GRAB');
  stat('at rest   ', result.singleGrabAtRest);
  if (result.singleGrabUnderLoad.skippedBecause !== null) {
    line(`  under load: ${result.singleGrabUnderLoad.skippedBecause}`);
  } else {
    stat('under load', result.singleGrabUnderLoad.grabs);
  }
  const restDelta = oscDelta(result.atRestBefore, result.atRestAfter);
  line(`  OSC addresses that CHANGED across the at-rest phase: ${String(restDelta.length)}`);
  for (const d of restDelta.slice(0, 12)) line(`    ${d.address}: ${d.before} -> ${d.after}`);
  line();
  line('§3.3 CADENCE');
  if (result.cadence === null) {
    line('  (not run)');
  } else {
    stat(`${String(result.cadence.requestedHz)} Hz`, result.cadence.grabs);
    const firstHalf = result.cadence.grabs.slice(0, Math.floor(result.cadence.grabs.length / 2));
    const lastHalf = result.cadence.grabs.slice(Math.floor(result.cadence.grabs.length / 2));
    stat('first half', firstHalf);
    stat('last half ', lastHalf);
    const drift = oscDelta(result.cadence.before, result.cadence.after);
    line(`  OSC addresses that CHANGED across the cadence run: ${String(drift.length)}`);
    for (const d of drift.slice(0, 12)) line(`    ${d.address}: ${d.before} -> ${d.after}`);
  }
  line();
  line('§3.4 GENERALISATION');
  if (!result.generalisation.ran) {
    line(`  ${result.generalisation.skippedBecause ?? 'not run'}`);
  } else {
    for (const e of result.generalisation.routePath) {
      line(`  (a) ${e.command} -> ${e.reply.join(' | ')}`);
    }
    for (const e of result.generalisation.secondOpenPath) {
      line(`  (b) ${e.command} -> ${e.reply.join(' | ')}`);
    }
    line(`  §2.2 VERDICT: ${result.generalisation.secondOpenVerdict ?? '(not attempted)'}`);
  }
  line();
  line('§3.5 ARTIFACT');
  if (result.artifact.found === null) {
    line(`  ${result.artifact.note}`);
  } else {
    const f = result.artifact.found;
    line(
      `  ${f.file} — ${f.kind} ${String(f.width ?? '?')}x${String(f.height ?? '?')} ` +
        `${String(f.bytes)} bytes`,
    );
  }
  line(
    '  ⚠ The bridge HTTP server has NO filesystem root: `template-http-server.ts` serves only ' +
      '`/template/<id>` from memory. Wherever this file is, C-016 needs a route that does not ' +
      'exist yet.',
  );
  if (result.findings.length > 0) {
    line();
    line('FINDINGS');
    for (const f of result.findings) line(`  - ${f}`);
  }
  return out.join('\n');
}
