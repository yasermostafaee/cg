import { z } from 'zod';
import { defineChannel } from '../channel.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D9) — **WHAT CG BRIDGE SERVES OVER HTTP BESIDE ITS SOCKET, AND THE TICKET
 * THAT OPENS IT.**
 *
 * The console is on another machine now, and a picture or a download is fetched by the page's
 * `<img>` or by a link — which carry no token. So the console asks for a TICKET over its VERIFIED
 * socket and the bridge answers with a path that carries it (`/pgm/2?ticket=…`); the HTTP route
 * accepts nothing else. A ticket is random, short-lived and bound to what it was issued for:
 *
 *   - `/pgm/<n>` — the programme return for channel `n`, issued only for a channel the socket's
 *     sign-in holds (the channel scope, `C-038`);
 *   - `/logs.zip` — CG Bridge's logs, issued only to a `station-admin`, used once.
 *
 * The console joins the path to CG Bridge's own host and port (the socket's): nothing here names an
 * address.
 */

const TicketPathSchema = z.object({
  /** An absolute path on CG Bridge's control port, with its ticket in the query. */
  path: z.string().regex(/^\/[^\s]*\?ticket=[A-Za-z0-9_-]+$/),
});

export type TicketPath = z.infer<typeof TicketPathSchema>;

/** A ticket for channel `channel`'s programme return (`/pgm/<n>`). */
export const PgmReturnTicketChannel = defineChannel(
  'pgmReturn.ticket',
  z.object({ channel: z.number().int().positive() }),
  TicketPathSchema,
);

/** A ticket for CG Bridge's logs (`/logs.zip`). `station-admin` only. */
export const BridgeLogsTicketChannel = defineChannel(
  'bridge.logs-ticket',
  z.void(),
  TicketPathSchema,
);

/** The path of the logs download on CG Bridge's control port. */
export const BRIDGE_LOGS_PATH = '/logs.zip';

/** How long a ticket may wait before its request, from issue. */
export const HTTP_TICKET_TTL_MS = 30_000;
