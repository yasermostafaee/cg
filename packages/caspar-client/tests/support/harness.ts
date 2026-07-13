import { afterEach } from 'vitest';

/**
 * B-073 — guaranteed release for the socket/timer suites.
 *
 * Several tests here build their own mocks/transports/queues and release them on the
 * trailing lines of the test body. Any earlier `expect` failure skips that cleanup and
 * leaks a listening server, a TCP socket, or a live `setInterval` (a leaked
 * `HeartbeatService` keeps pinging a queue whose transport was already destroyed) for
 * the rest of the fork — one red assertion then cascades into unrelated reds.
 *
 * `track()` registers the release when the resource is BOUND, so `afterEach` runs it
 * however the test exits.
 */

type Release = () => Promise<void> | void;

const releases: Release[] = [];

/** Register `resource` for guaranteed release and return it unchanged. */
export function track<T>(resource: T, release: (r: T) => Promise<void> | void): T {
  releases.push(() => release(resource));
  return resource;
}

/** Release everything `track()`ed by the current test, newest first. */
afterEach(async () => {
  const failures: unknown[] = [];
  for (const release of releases.splice(0).reverse()) {
    try {
      await release();
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'tracked test resources failed to release');
  }
});
