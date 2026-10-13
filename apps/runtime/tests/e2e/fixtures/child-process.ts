import type { ChildProcess } from 'node:child_process';

/**
 * 🔴 `CENTRAL-BRIDGE-01` — **STOP A SPAWNED BRIDGE, AND WAIT UNTIL IT IS GONE**, before anything
 * removes its state folder. The one copy every spec that spawns the bridge CLI uses.
 *
 * On Linux `SIGINT` is the bridge's graceful stop, and a graceful stop WRITES: the stack is flushed
 * into the state folder as the bridge closes (`stack-store.ts`). A teardown that sent the signal and
 * went straight on to `rmSync` raced that write and failed `ENOTEMPTY` — on Linux only, because a
 * Windows child has no `SIGINT` and Node ends it outright (run 36719814205: `plate-band`,
 * `playout-authz`, `playout-auth-reload`). Bounded: a bridge still running after 5 s is killed.
 *
 * ⚠ A child ended BY a signal keeps `exitCode` null and sets `signalCode`, so both are read.
 */
export async function stopChild(child: ChildProcess | null): Promise<void> {
  if (child === null || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), 5000);
  });
  child.kill('SIGINT');
  const stopped = await Promise.race([exited.then(() => true as const), late]);
  clearTimeout(timer);
  if (!stopped) {
    child.kill('SIGKILL');
    await exited;
  }
}
