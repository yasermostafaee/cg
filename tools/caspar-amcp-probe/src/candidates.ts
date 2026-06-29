/**
 * The candidate load + update + stop sequences for the AMCP HTML-producer
 * update-mechanism investigation (ADR 0006). Each candidate loads the probe,
 * pushes an updated Persian-laden JSON payload, and stops. The harness records,
 * for each, the raw AMCP return codes and whether `window.update` received the
 * payload intact (via the probe's WebSocket beacon + the on-screen echo).
 *
 * Add rows here to try more variants — the harness runs whatever is exported.
 */

export interface BuildContext {
  /** `<channel>-<layer>`, e.g. `1-10`. */
  target: string;
  /** CG flash-layer index (HTML producers use a single layer; `0`). */
  flashLayer: number;
  /** URL CasparCG loads for the probe (served by the harness, or a file:// path). */
  probeUrl: string;
  /** Persian JSON sent at load (where the load form carries data). */
  dataInitial: string;
  /** Persian JSON pushed at update — what we check `window.update` receives. */
  dataUpdate: string;
}

export interface CandidateSteps {
  /** Commands that load + start the producer. */
  load: string[];
  /** Commands that push the updated payload (empty when the URL query carries it). */
  update: string[];
  /** Commands that stop + clear the producer. */
  stop: string[];
  /** Payload the probe's `window.update` is expected to receive. */
  expectPayload: string;
  /** Where the expected payload is delivered from. */
  expectSource: 'update-command' | 'url-query';
}

export interface Candidate {
  id: string;
  title: string;
  note: string;
  build(ctx: BuildContext): CandidateSteps;
}

/** AMCP escape + quote (mirrors `@cg/caspar-client`'s canonical quoter). */
export function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\r' || ch === '\n') out += ' ';
    else out += ch;
  }
  return out + '"';
}

export const CANDIDATES: Candidate[] = [
  {
    id: 'cg-add+cg-update',
    title: 'CG ADD then CG UPDATE',
    note: 'Phase-2 mock-validated path. amcp-mock acks CG UPDATE; UNVERIFIED on hardware that it reaches window.update.',
    build: ({ target, flashLayer, probeUrl, dataInitial, dataUpdate }) => ({
      load: [`CG ${target} ADD ${String(flashLayer)} ${quote(probeUrl)} 1 ${quote(dataInitial)}`],
      update: [`CG ${target} UPDATE ${String(flashLayer)} ${quote(dataUpdate)}`],
      stop: [`CG ${target} STOP ${String(flashLayer)}`, `CLEAR ${target}`],
      expectPayload: dataUpdate,
      expectSource: 'update-command',
    }),
  },
  {
    id: 'play-html+call-update',
    title: 'PLAY [HTML] then CALL "update"',
    note: 'ADR 0006: CALL returned 202 CALL OK but never invoked window.update. Re-verify.',
    build: ({ target, probeUrl, dataUpdate }) => ({
      load: [`PLAY ${target} [HTML] ${quote(probeUrl)}`],
      update: [`CALL ${target} "update" ${quote(dataUpdate)}`],
      stop: [`CLEAR ${target}`],
      expectPayload: dataUpdate,
      expectSource: 'update-command',
    }),
  },
  {
    id: 'cg-add+cg-invoke-update',
    title: 'CG ADD then CG INVOKE "update" "<json>"',
    note: 'ADR 0006 / Phase 4 §9 form: INVOKE delivered an EMPTY param. Re-verify the param survives.',
    build: ({ target, flashLayer, probeUrl, dataInitial, dataUpdate }) => ({
      load: [`CG ${target} ADD ${String(flashLayer)} ${quote(probeUrl)} 1 ${quote(dataInitial)}`],
      update: [`CG ${target} INVOKE ${String(flashLayer)} "update" ${quote(dataUpdate)}`],
      stop: [`CG ${target} STOP ${String(flashLayer)}`, `CLEAR ${target}`],
      expectPayload: dataUpdate,
      expectSource: 'update-command',
    }),
  },
  {
    id: 'cg-add+cg-invoke-inline',
    title: 'CG ADD then CG INVOKE "update(<json>)" (inline call)',
    note: 'Variant: pass the whole call as the INVOKE method string in case the param form is the problem.',
    build: ({ target, flashLayer, probeUrl, dataInitial, dataUpdate }) => ({
      load: [`CG ${target} ADD ${String(flashLayer)} ${quote(probeUrl)} 1 ${quote(dataInitial)}`],
      update: [`CG ${target} INVOKE ${String(flashLayer)} ${quote(`update(${dataUpdate})`)}`],
      stop: [`CG ${target} STOP ${String(flashLayer)}`, `CLEAR ${target}`],
      expectPayload: dataUpdate,
      expectSource: 'update-command',
    }),
  },
  {
    id: 'play-html-urlquery',
    title: 'PLAY [HTML] "...?data=<json>" (URL-query fallback)',
    note: 'ADR 0006 fallback (a): the page reads location.search at load; no AMCP update needed.',
    build: ({ target, probeUrl, dataUpdate }) => {
      const url = `${probeUrl}?data=${encodeURIComponent(dataUpdate)}`;
      return {
        load: [`PLAY ${target} [HTML] ${quote(url)}`],
        update: [],
        stop: [`CLEAR ${target}`],
        expectPayload: dataUpdate,
        expectSource: 'url-query',
      };
    },
  },
];
