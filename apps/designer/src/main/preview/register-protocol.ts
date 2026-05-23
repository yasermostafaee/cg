import type { Protocol, Session } from 'electron';
import type { PreviewFs } from './preview-fs.js';

/**
 * Register the `cgpreview://` scheme + the request handler against
 * Electron's session protocol surface.
 *
 * Must be called BEFORE app.whenReady() for the scheme privileges, but
 * the actual handler registration goes after `app.ready` (which is where
 * `boot()` runs). The privileges are declared via
 * `protocol.registerSchemesAsPrivileged` in `index.ts`.
 *
 * Why a separate helper: this module is the only piece in the Designer
 * that touches Electron's request API. Keeping it isolated lets the
 * unit tests for PreviewFs run in plain Node.
 */
export interface RegisterPreviewProtocolOptions {
  protocol: Protocol | Session['protocol'];
  fs: PreviewFs;
}

export function registerPreviewProtocol(opts: RegisterPreviewProtocolOptions): void {
  // Electron ≥25 supports the Fetch-style `protocol.handle` API. Newer
  // installs only — designer's electron pin is 32.x.
  const protocol = opts.protocol as Protocol & {
    handle: (scheme: string, handler: (req: Request) => Promise<Response> | Response) => void;
  };
  protocol.handle('cgpreview', async (req) => {
    const entry = await opts.fs.resolve(req.url);
    if (entry === null) {
      return new Response('not found', { status: 404 });
    }
    return new Response(entry.bytes, {
      status: 200,
      headers: { 'content-type': entry.contentType },
    });
  });
}

/**
 * Privileged-scheme entry the app must register BEFORE `app.ready`.
 * Caller-supplied because the Protocol singleton it expects lives on
 * the imported `electron` module and we don't want to pull electron
 * into a unit-testable surface.
 */
export const CG_PREVIEW_SCHEME = {
  scheme: 'cgpreview',
  privileges: {
    standard: true,
    secure: true,
    bypassCSP: false,
    allowServiceWorkers: false,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
} as const;
