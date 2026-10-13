// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CLOSE_REQUESTED_EVENT, closeGuardDoor, type ShellInvoke } from '../src/closeGuard.js';

/**
 * `D-162` / `R-094` — the JS half of the shells' close guard, against a recorded shell.
 *
 * The other half (`close_window.rs`) is Rust and is tested there; what is pinned here is what the
 * page SAYS to the shell — the command names and their order — because a name spelled differently
 * on the two sides fails silently: the shell never arms, and the window closes without asking.
 */

function recordedShell(answer: () => Promise<unknown> = () => Promise.resolve(null)): {
  invoke: ShellInvoke;
  said: { command: string; args?: Record<string, unknown> }[];
} {
  const said: { command: string; args?: Record<string, unknown> }[] = [];
  const invoke: ShellInvoke = (command, args) => {
    said.push(args === undefined ? { command } : { command, args });
    return answer();
  };
  return { invoke, said };
}

const ask = (target: EventTarget): void => {
  target.dispatchEvent(new Event(CLOSE_REQUESTED_EVENT));
};

describe('closeGuardDoor', () => {
  it('the event is the one the shells send (`close_window.rs` ASK_THE_PAGE)', () => {
    expect(CLOSE_REQUESTED_EVENT).toBe('cg:close-requested');
  });

  it('with a shell: holding arms it, an ask is acknowledged and reaches the holder, a release lets go', () => {
    const { invoke, said } = recordedShell();
    const target = new EventTarget();
    const door = closeGuardDoor(invoke, target);
    expect(door.held()).toBe(true);

    const onRequest = vi.fn();
    const release = door.hold(onRequest);
    expect(said).toEqual([{ command: 'close_guard', args: { armed: true } }]);

    ask(target);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(said.at(-1)).toEqual({ command: 'close_request_seen' });

    release();
    expect(said.at(-1)).toEqual({ command: 'close_guard', args: { armed: false } });
    // Let go: an ask after the release reaches nobody and is not acknowledged.
    const before = said.length;
    ask(target);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(said).toHaveLength(before);
  });

  it('CONTROL — every repeated ask is acknowledged and delivered: the dialog, not the door, refuses to stack', () => {
    const { invoke, said } = recordedShell();
    const target = new EventTarget();
    const door = closeGuardDoor(invoke, target);
    const onRequest = vi.fn();
    door.hold(onRequest);
    ask(target);
    ask(target);
    ask(target);
    expect(onRequest).toHaveBeenCalledTimes(3);
    expect(said.filter((s) => s.command === 'close_request_seen')).toHaveLength(3);
  });

  it('holds are counted: armed once by the first, let go once by the last, and the newest holder answers', () => {
    const { invoke, said } = recordedShell();
    const target = new EventTarget();
    const door = closeGuardDoor(invoke, target);
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = door.hold(first);
    const releaseSecond = door.hold(second);
    expect(said.filter((s) => s.command === 'close_guard')).toEqual([
      { command: 'close_guard', args: { armed: true } },
    ]);

    ask(target);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    releaseSecond();
    releaseSecond(); // idempotent: a second call releases nothing more
    ask(target);
    expect(first).toHaveBeenCalledTimes(1);
    expect(said.filter((s) => s.command === 'close_guard')).toHaveLength(1);

    releaseFirst();
    expect(said.filter((s) => s.command === 'close_guard')).toEqual([
      { command: 'close_guard', args: { armed: true } },
      { command: 'close_guard', args: { armed: false } },
    ]);
  });

  it('closeNow asks the shell to close the window, and surfaces a refusal', async () => {
    const { invoke, said } = recordedShell();
    await closeGuardDoor(invoke, new EventTarget()).closeNow();
    expect(said).toEqual([{ command: 'close_window_now' }]);

    const refusing = closeGuardDoor(
      () => Promise.reject(new Error('no window')),
      new EventTarget(),
    );
    await expect(refusing.closeNow()).rejects.toThrow('no window');
  });

  it('a shell that refuses an arm or an acknowledgement throws nothing into the page', async () => {
    const { invoke } = recordedShell(() => Promise.reject(new Error('refused')));
    const target = new EventTarget();
    const door = closeGuardDoor(invoke, target);
    const onRequest = vi.fn();
    const release = door.hold(onRequest);
    ask(target);
    release();
    // The rejections are swallowed (a failed arm leaves the shell closing at once, as before).
    await new Promise((r) => setTimeout(r, 0));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('in a browser (no shell): nothing is held anywhere and closeNow has no window to close', async () => {
    const target = new EventTarget();
    const door = closeGuardDoor(null, target);
    expect(door.held()).toBe(false);
    const onRequest = vi.fn();
    const release = door.hold(onRequest);
    release();
    await expect(door.closeNow()).resolves.toBeUndefined();
  });
});
