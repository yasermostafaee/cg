/**
 * D-128 — the source-hash Worker shell. The File arrives structured-cloned; the
 * chunked read + incremental sha256 (`hashSourceStream`) run HERE so hundreds of
 * megabytes of pure-JS hashing never touch the main thread (the page-unresponsive
 * freeze). Progress streams back for the modal's percentage; cancellation is the
 * owner terminating this worker — no protocol needed.
 */

import { hashSourceStream } from './source-hash.js';
import type { SourceHashWorkerOut } from './source-hash.js';

const post = (msg: SourceHashWorkerOut): void => {
  (self as unknown as { postMessage(m: SourceHashWorkerOut): void }).postMessage(msg);
};

self.onmessage = (e: MessageEvent<{ file: File }>) => {
  void hashSourceStream(e.data.file, {
    onProgress: (ratio) => post({ kind: 'progress', ratio }),
  }).then(
    (hex) => post({ kind: 'done', hex }),
    (err: unknown) => post({ kind: 'error', message: String(err) }),
  );
};
