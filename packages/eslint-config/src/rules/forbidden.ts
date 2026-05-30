// Centralized lists of modules forbidden by tier.
// Update here, propagate to every config that imports these.

const NODE_BUILTINS_BARE: readonly string[] = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'process',
  'querystring',
  'readline',
  'stream',
  'stream/promises',
  'string_decoder',
  'timers',
  'timers/promises',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
];

/** Node built-ins, both bare and `node:`-prefixed forms. */
export const NODE_BUILTINS: readonly string[] = [
  ...NODE_BUILTINS_BARE,
  ...NODE_BUILTINS_BARE.map((m) => `node:${m}`),
];

/** Electron is forbidden anywhere except Main + Preload. */
export const ELECTRON_PACKAGE = 'electron';

/**
 * @cg/* packages that may only be imported by Node-tier code (raw sockets,
 * filesystem). `@cg/vcg-format` is intentionally NOT here: since the browser
 * migration it is isomorphic (WebCrypto/noble + JSZip + Uint8Array) and
 * packs/unpacks `.vcg` in the browser too.
 */
export const MAIN_ONLY_PACKAGES: readonly string[] = ['@cg/caspar-client', '@cg/audit'];

/** @cg/* packages that may only be imported by Renderer-tier code. */
export const RENDERER_ONLY_PACKAGES: readonly string[] = ['@cg/ui'];

/** React surface — forbidden in Main and Broadcast tiers. */
export const REACT_PACKAGES: readonly string[] = ['react', 'react-dom'];
