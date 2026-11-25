import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShellInvoke } from './closeGuard.js';

export interface WindowFullscreenDoor {
  readonly available: boolean;
  read(): Promise<boolean>;
  toggle(): Promise<boolean>;
  subscribe(listener: () => void): () => void;
}

/** Use the originating desktop window, or the whole document in the browser. */
export function windowFullscreenDoor(
  invoke: ShellInvoke | null,
  owner: Document,
): WindowFullscreenDoor {
  const root = owner.documentElement;
  const read = async (): Promise<boolean> =>
    invoke === null
      ? owner.fullscreenElement === root
      : (await invoke('plugin:window|is_fullscreen')) === true;

  return {
    available:
      invoke !== null ||
      (owner.fullscreenEnabled === true &&
        typeof root.requestFullscreen === 'function' &&
        typeof owner.exitFullscreen === 'function'),
    read,
    async toggle() {
      if (invoke === null) {
        // Call the browser API during the click or key event's user activation.
        if (owner.fullscreenElement === root) await owner.exitFullscreen();
        else await root.requestFullscreen();
      } else {
        await invoke('plugin:window|set_fullscreen', { value: !(await read()) });
      }
      return read();
    },
    subscribe(listener) {
      const desktop = invoke === null ? null : owner.defaultView;
      owner.addEventListener('fullscreenchange', listener);
      desktop?.addEventListener('resize', listener);
      return () => {
        owner.removeEventListener('fullscreenchange', listener);
        desktop?.removeEventListener('resize', listener);
      };
    },
  };
}

export function useWindowFullscreen(door?: WindowFullscreenDoor | null): {
  available: boolean;
  active: boolean;
  pending: boolean;
  toggle(): Promise<void>;
} {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (!door?.available) return;
    const refresh = () => {
      if (inFlight.current) return;
      const request = ++sequence.current;
      void door.read().then(
        (value) => {
          if (sequence.current === request) setActive(value);
        },
        () => undefined,
      );
    };
    const unsubscribe = door.subscribe(refresh);
    refresh();
    return () => {
      ++sequence.current;
      unsubscribe();
    };
  }, [door]);

  const toggle = useCallback(async () => {
    if (!door?.available || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const request = ++sequence.current;
    try {
      const value = await door.toggle();
      if (sequence.current === request) setActive(value);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [door]);

  const available = door?.available === true;
  return { available, active: available && active, pending, toggle };
}
