import { sourceDisplayName } from '../../ui/operatorNaming.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LivePreviewHandle, LivePreviewStatus, SourceDefinition } from '@cg/shared-ipc';
import { useLink } from '../../hooks/useLink.js';
import { useCanOperate } from '../../hooks/useCanOperate.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { uuid } from '../../lib/uuid.js';
import { useModalForeground } from '../../ui/modalForeground.js';

interface InputCheck {
  readonly surface: string;
  readonly sourceId: string;
  readonly view: LivePreviewStatus;
}

interface InputCheckControl {
  readonly check: InputCheck | null;
  readonly enabled: boolean;
  start(surface: string, channel: number, source: SourceDefinition): void;
  stop(surface: string, previewId?: string): void;
  stall(previewId: string): void;
}

const InputCheckContext = createContext<InputCheckControl | null>(null);

function release({ channel, previewId }: LivePreviewHandle): void {
  void window.cg.livePreview.stop({ channel, previewId }).catch(() => undefined);
}

function isActive(view: LivePreviewStatus): boolean {
  return view.state === 'ready' || view.state === 'connecting';
}

export function LiveInputCheckProvider({
  channel,
  locked,
  children,
}: {
  channel: number | null;
  locked: boolean;
  children: ReactNode;
}): JSX.Element {
  const live = useLink() === 'live';
  const canOperate = useCanOperate();
  const auth = useAuthSession();
  const enabled = live && canOperate && auth.kind === 'signed-in' && !locked;
  const [check, setCheck] = useState<InputCheck | null>(null);
  const current = useRef<InputCheck | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meter = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publish = useCallback((next: InputCheck | null): void => {
    current.current = next;
    setCheck(next);
  }, []);

  const clearTimers = useCallback((): void => {
    if (poll.current !== null) clearTimeout(poll.current);
    if (meter.current !== null) clearTimeout(meter.current);
    poll.current = null;
    meter.current = null;
  }, []);

  const stop = useCallback(
    (surface: string, previewId?: string): void => {
      const active = current.current;
      if (
        active === null ||
        active.surface !== surface ||
        (previewId !== undefined && previewId !== active.view.previewId)
      )
        return;
      clearTimers();
      publish(null);
      if (isActive(active.view)) release(active.view);
    },
    [clearTimers, publish],
  );

  const start = useCallback(
    (surface: string, target: number, source: SourceDefinition): void => {
      if (!enabled || target !== channel) return;
      const previous = current.current;
      if (
        previous?.surface === surface &&
        previous.sourceId === source.id &&
        isActive(previous.view)
      )
        return;
      if (previous !== null) stop(previous.surface, previous.view.previewId);

      const handle = { channel: target, previewId: uuid() };
      const owner = { surface, sourceId: source.id };
      const connecting: LivePreviewStatus = {
        ...handle,
        sourceName: sourceDisplayName(source.name, 'input'),
        state: 'connecting',
        dbFs: null,
      };
      publish({ ...owner, view: connecting });

      const failed = (state: 'unavailable' | 'stalled', message: string): void => {
        if (current.current?.view.previewId !== handle.previewId || !isActive(current.current.view))
          return;
        clearTimers();
        release(handle);
        publish({ ...owner, view: { ...connecting, state, message } });
      };
      const accept = (view: LivePreviewStatus, elapsedMs: number): void => {
        if (current.current?.view.previewId !== handle.previewId || !isActive(current.current.view))
          return;
        if (view.previewId !== handle.previewId || view.channel !== handle.channel) {
          failed('unavailable', 'Input preview returned the wrong session.');
          return;
        }
        clearTimers();
        const validFor = (view.meterValidForMs ?? 0) - elapsedMs;
        publish({ ...owner, view: validFor > 0 ? view : { ...view, dbFs: null } });
        if (!isActive(view)) return;
        if (view.dbFs !== null && validFor > 0) {
          meter.current = setTimeout(() => {
            const active = current.current;
            if (active?.view.previewId === handle.previewId) {
              publish({ ...owner, view: { ...active.view, dbFs: null } });
            }
          }, validFor);
        }
        poll.current = setTimeout(() => {
          const sent = performance.now();
          void window.cg.livePreview.status(handle).then(
            (next) => accept(next, performance.now() - sent),
            () => failed('stalled', 'The input preview connection was lost.'),
          );
        }, 200);
      };
      const sent = performance.now();
      void window.cg.livePreview.start({ ...handle, sourceId: source.id }).then(
        (view) => accept(view, performance.now() - sent),
        () => failed('unavailable', 'Input preview is unavailable on this Bridge.'),
      );
    },
    [channel, clearTimers, enabled, publish, stop],
  );

  const stall = useCallback(
    (previewId: string): void => {
      const active = current.current;
      if (active?.view.previewId !== previewId || !isActive(active.view)) return;
      clearTimers();
      publish({
        ...active,
        view: {
          ...active.view,
          state: 'stalled',
          dbFs: null,
          message: 'No current input picture.',
        },
      });
      const handle = { channel: active.view.channel, previewId };
      void window.cg.livePreview
        .status(handle)
        .then((view) => {
          if (
            current.current?.view.previewId === previewId &&
            view.previewId === previewId &&
            view.channel === handle.channel &&
            !isActive(view)
          )
            publish({ ...active, view });
        })
        .finally(() => release(handle))
        .catch(() => undefined);
    },
    [clearTimers, publish],
  );

  const visible = enabled && check?.view.channel === channel;
  useEffect(() => {
    const active = current.current;
    if (active !== null && (!enabled || active.view.channel !== channel))
      stop(active.surface, active.view.previewId);
  }, [channel, enabled, stop]);

  useEffect(() => {
    return () => {
      clearTimers();
      const active = current.current;
      current.current = null;
      if (active !== null && isActive(active.view)) release(active.view);
    };
  }, [clearTimers]);

  const value = useMemo(
    () => ({ check: visible ? check : null, enabled, start, stop, stall }),
    [check, enabled, stall, start, stop, visible],
  );
  return <InputCheckContext.Provider value={value}>{children}</InputCheckContext.Provider>;
}

export function useLiveInputCheck(): InputCheckControl | null {
  return useContext(InputCheckContext);
}

/** A surface owns its check until it closes or changes channels. */
export interface InputCheckSurface {
  readonly surface: string;
  readonly channel: number;
  start(source: SourceDefinition): void;
  stop(): void;
}

export function useInputCheckSurface(channel: number | undefined, visible = true, scope?: string) {
  const foreground = useModalForeground();
  const showing = visible && foreground;
  const surface = useId();
  const control = useLiveInputCheck();
  const stop = control?.stop;
  useEffect(() => {
    if (!showing) return undefined;
    return () => stop?.(surface);
  }, [channel, scope, stop, surface, showing]);

  const inputCheck: InputCheckSurface | undefined =
    showing && channel !== undefined && control?.enabled === true
      ? {
          surface,
          channel,
          start: (source) => control.start(surface, channel, source),
          stop: () => control.stop(surface),
        }
      : undefined;
  return { surface, inputCheck };
}
