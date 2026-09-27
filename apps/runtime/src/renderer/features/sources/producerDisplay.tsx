import type { SourceCatalog, SourceDefinition } from '@cg/shared-ipc';
import { SourceLabel } from './SourceLabel.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.E / §2.B — **A STREAM'S ADDRESS IS NEVER SHOWN IN THE CONSOLE.**
 *
 * The bridge publishes what it SENT — the ledger's producer, a refused command — with a stream
 * URL's credentials already written `***` (§1.E). Redacted is not the same as hidden: the address
 * itself (host, port, path) is still not an operator's word for a source, and golden rule 11 keeps
 * such a string off every surface an operator reads. So wherever a producer or a command is shown,
 * a stream address becomes the SOURCE it belongs to — `SourceLabel`, when the catalogue knows it —
 * or the word `stream` when it does not. `route://…` is not an address of anything outside the
 * server and is left as it is.
 */

const STREAM_ADDRESS = /"((?!route:)[a-z][a-z0-9+.-]*:\/\/[^"]*)"/gi;
/** Only a play's PRODUCER can be a stream; a `CG ADD`'s page URL is the bridge's own and stays. */
const PLAY_LINE = /^\s*(PLAY|LOAD|LOADBG)\s/i;

/** A producer argument as a surface may print it: a stream address reads `stream`. */
export function producerForDisplay(producer: string): string {
  return producer.replace(STREAM_ADDRESS, 'stream');
}

/** A refused AMCP line as a surface may print it: a play's stream address elided. */
export function commandForDisplay(command: string): string {
  return PLAY_LINE.test(command) ? command.replace(STREAM_ADDRESS, '"stream"') : command;
}

/**
 * The catalogue entry a command's producer argument names, found by the argument itself: a stream's
 * URL, a media item's clip, an NDI source. `null` when nothing in the catalogue matches.
 */
export function sourceInCommand(
  command: string,
  catalog: SourceCatalog,
): { readonly before: string; readonly source: SourceDefinition; readonly after: string } | null {
  const m = /^((?:PLAY|LOAD|LOADBG)\s+\S+\s+(?:\[NDI\]\s+)?)"([^"]*)"(.*)$/s.exec(command);
  if (m === null) return null;
  const [, before = '', arg = '', after = ''] = m;
  const source = catalog.sources.find((s) => {
    switch (s.producer.kind) {
      case 'stream':
        return s.producer.url === arg;
      case 'media':
        return s.producer.file === arg;
      case 'ndi':
        return s.producer.source === arg;
      default:
        return false;
    }
  });
  return source === undefined ? null : { before, source, after };
}

/** A refused command, with its source named the one way and no address shown. */
export function CommandText({
  command,
  catalog,
}: {
  command: string;
  catalog: SourceCatalog;
}): JSX.Element {
  const found = sourceInCommand(command, catalog);
  if (found === null) return <>{commandForDisplay(command)}</>;
  return (
    <>
      {found.before}
      <SourceLabel sourceId={found.source.id} meta={false} />
      {commandForDisplay(found.after)}
    </>
  );
}
