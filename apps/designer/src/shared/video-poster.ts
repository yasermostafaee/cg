/**
 * D-128 — the ONE robust at-rest poster routine for a STORED video, shared by
 * every stored-asset surface: the canvas iframe (`preview.ts` serializes this
 * function's SOURCE into the srcdoc document), the Inspector / assets-panel
 * thumbnails (`VideoPoster`), and the import modal's post-store verification
 * (`verifyStoredPoster`) — so "import verified it" and "the canvas renders it"
 * are the SAME code, never two implementations that can drift.
 *
 * WHY a ladder instead of one seek (the D-128 canvas-blank root cause, proven
 * 2026-07-25): ffmpeg/libvpx encodes the WebM alpha plane as a SECOND VP8
 * stream (BlockAdditional) whose keyframes are placed on the alpha encoder's
 * own schedule — they do NOT always align with the main stream's keyframes. A
 * COLD seek (preload=metadata, no data loaded) into a GOP whose governing main
 * keyframe carries an alpha INTER frame gives Chromium's freshly-initialized
 * alpha decoder a reference-less frame → `PIPELINE_ERROR_DECODE`, a TERMINAL
 * media error — the element goes permanently blank. Sequential playback always
 * decodes (full alpha history), which is exactly why the import modal's
 * playability verification passes these files. Container-verified: on the repro
 * clip, every failing seek's governing main keyframe carried an alpha
 * inter-frame; an alpha-stripped control encode cold-seeks clean everywhere.
 *
 * The ladder:
 *  1. `preload='auto'` + seek once metadata lands — measured safe on every
 *     previously-failing GOP (the eager load path primes the pipeline before
 *     the seek); instant on healthy files.
 *  2. On ANY media error / seek stall: `load()` reset, then muted playback at
 *     16× from 0, pausing at the poster time — sequential decode, the one
 *     operation the import verification PROVED works (~0.7 s wall for a 14 s
 *     clip). `playbackRate` is restored to 1 so a later real play (VideoDriver)
 *     is untouched.
 *  3. Only a clip that cannot decode SEQUENTIALLY fails — and that failure is
 *     returned to the caller to surface, never a silently dead element.
 *
 * SERIALIZATION CONTRACT: `attachRobustVideoPoster` is injected into the canvas
 * iframe via `Function.prototype.toString()`, so it MUST stay fully
 * self-contained — no imports, no references to module scope, no `</script>`
 * substring. TS types are fine (erased); helper functions live INSIDE it.
 */

export interface VideoPosterOutcome {
  ok: boolean;
  /** Which rung produced the frame ('none' when no frame was produced). */
  via: 'seek' | 'rate-play' | 'none';
  /** The media error / reason when `ok` is false. */
  error?: string;
}

export function attachRobustVideoPoster(
  video: HTMLVideoElement,
  url: string,
  posterMs?: number,
  signal?: AbortSignal,
): Promise<VideoPosterOutcome> {
  // Epoch guard: a re-attach on the SAME element (asset URL change, StrictMode
  // re-run) supersedes any in-flight run — the stale run settles quietly
  // instead of fighting the new one over currentTime/playbackRate.
  const host = video as HTMLVideoElement & { __cgPosterEpoch?: number };
  const epoch = (host.__cgPosterEpoch ?? 0) + 1;
  host.__cgPosterEpoch = epoch;

  return new Promise((resolve) => {
    let settled = false;
    const cleanups: (() => void)[] = [];
    const finish = (r: VideoPosterOutcome): void => {
      if (settled) return;
      settled = true;
      for (const fn of cleanups) fn();
      resolve(r);
    };
    const superseded = (): boolean => host.__cgPosterEpoch !== epoch || signal?.aborted === true;
    const bail = (): boolean => {
      if (settled) return true;
      if (superseded()) {
        finish({ ok: false, via: 'none', error: 'superseded' });
        return true;
      }
      return false;
    };
    const mediaError = (): string => {
      const e = video.error;
      if (e === null) return 'unknown media error';
      return e.message !== '' ? e.message : 'media error code ' + String(e.code);
    };
    if (signal !== undefined) {
      const onAbort = (): void => {
        try {
          video.pause();
        } catch {
          /* detached */
        }
        finish({ ok: false, via: 'none', error: 'aborted' });
      };
      signal.addEventListener('abort', onAbort);
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
      if (signal.aborted) {
        onAbort();
        return;
      }
    }

    // Rung 1's load shape: the EAGER path. A cold preload='metadata' seek is
    // the exact operation that dies on alpha/main keyframe misalignment.
    video.muted = true;
    video.preload = 'auto';
    if (video.src !== url) video.src = url;

    const posterTime = (): number => {
      const dur = video.duration;
      const finiteDur = Number.isFinite(dur) && dur > 0 ? dur : 0;
      const want =
        typeof posterMs === 'number' && Number.isFinite(posterMs) && posterMs > 0
          ? posterMs / 1000
          : finiteDur / 2;
      if (finiteDur <= 0) return Math.max(0, want);
      return Math.min(Math.max(0, want), Math.max(0, finiteDur - 0.01));
    };

    /** Wait for metadata; self-cleaning; also registered for finish()-cleanup. */
    const waitMetadata = (timeoutMs: number): Promise<'ok' | 'error' | 'timeout'> =>
      new Promise((res) => {
        if (video.readyState >= 1) {
          res('ok');
          return;
        }
        let done = false;
        const settle = (v: 'ok' | 'error' | 'timeout'): void => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          video.removeEventListener('loadedmetadata', onMeta);
          video.removeEventListener('error', onErr);
          res(v);
        };
        const timer = setTimeout(() => settle('timeout'), timeoutMs);
        const onMeta = (): void => settle('ok');
        const onErr = (): void => settle('error');
        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('error', onErr);
        cleanups.push(() => settle('timeout'));
      });

    /** One bounded seek attempt. 'ok' | 'error' | 'stall' (timeout / no data). */
    const trySeek = (t: number, timeoutMs: number): Promise<'ok' | 'error' | 'stall'> =>
      new Promise((res) => {
        let done = false;
        const settle = (v: 'ok' | 'error' | 'stall'): void => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onErr);
          res(v);
        };
        const timer = setTimeout(() => settle('stall'), timeoutMs);
        const onSeeked = (): void => settle(video.readyState >= 2 ? 'ok' : 'stall');
        const onErr = (): void => settle('error');
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onErr);
        cleanups.push(() => settle('stall'));
        try {
          video.currentTime = t;
        } catch {
          settle('stall');
        }
      });

    /** Rung 2: sequential decode to the poster time — the PROVEN operation. */
    const ratePlayRecovery = async (): Promise<void> => {
      video.load(); // clears the terminal media error; same src
      const meta = await waitMetadata(8000);
      if (bail()) return;
      if (meta !== 'ok') {
        finish({ ok: false, via: 'none', error: mediaError() });
        return;
      }
      const target = posterTime();
      if (target <= 0) {
        finish({ ok: true, via: 'rate-play' });
        return;
      }
      video.playbackRate = 16;
      const restore = (): void => {
        try {
          video.pause();
        } catch {
          /* detached */
        }
        video.playbackRate = 1;
      };
      const wallMs = Math.min(30000, (target / 16) * 1000 + 10000);
      let done = false;
      const settle = (r: VideoPosterOutcome): void => {
        if (done) return;
        done = true;
        clearTimeout(wall);
        video.removeEventListener('error', onErr);
        video.removeEventListener('ended', onEnded);
        restore();
        finish(r);
      };
      const wall = setTimeout(
        () => settle({ ok: false, via: 'none', error: 'poster recovery timed out' }),
        wallMs,
      );
      const onErr = (): void => settle({ ok: false, via: 'none', error: mediaError() });
      const onEnded = (): void => settle({ ok: true, via: 'rate-play' });
      video.addEventListener('error', onErr);
      video.addEventListener('ended', onEnded);
      cleanups.push(() => settle({ ok: false, via: 'none', error: 'superseded' }));
      const poll = (): void => {
        if (done) return;
        if (superseded()) {
          settle({ ok: false, via: 'none', error: 'superseded' });
          return;
        }
        if (video.currentTime >= target) {
          settle({ ok: true, via: 'rate-play' });
          return;
        }
        setTimeout(poll, 100);
      };
      video.play().then(
        () => poll(),
        (err: unknown) => settle({ ok: false, via: 'none', error: String(err) }),
      );
    };

    void (async () => {
      const meta = await waitMetadata(8000);
      if (bail()) return;
      if (meta !== 'ok') {
        // Metadata itself failed on the eager path — one reset + sequential try.
        await ratePlayRecovery();
        return;
      }
      const seek = await trySeek(posterTime(), 5000);
      if (bail()) return;
      if (seek === 'ok') {
        finish({ ok: true, via: 'seek' });
        return;
      }
      await ratePlayRecovery();
    })();
  });
}
