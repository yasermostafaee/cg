import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { PgmPlateCropEdit } from '@cg/shared-ipc';

export type ProgramCropDrag = Extract<PgmPlateCropEdit, { dx: number }>;
export type ProgramCropGesture = ReturnType<typeof useProgramCropGesture>;

interface CropScale {
  x: number;
  y: number;
}

interface CropPointer {
  pointerId: number;
  token: string;
  x: number;
  y: number;
  scale: CropScale;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function dragAt(
  origin: CropPointer,
  event: PointerEvent<HTMLButtonElement>,
): ProgramCropDrag | null {
  const x = origin.scale.x === 0 ? 0 : event.clientX - origin.x;
  const y = origin.scale.y === 0 ? 0 : event.clientY - origin.y;
  return Math.hypot(x, y) < 2
    ? null
    : { token: origin.token, dx: clamp(x * origin.scale.x), dy: clamp(y * origin.scale.y) };
}

/** One gesture session for both the programme picture and its source map. */
export function useProgramCropGesture(
  draft: (drag: ProgramCropDrag | null) => void,
  commit: (drag: ProgramCropDrag) => void,
) {
  const start = useRef<CropPointer | null>(null);
  const nextDraft = useRef<ProgramCropDrag | null>(null);
  const frame = useRef<number | null>(null);

  const stop = useCallback((): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    start.current = null;
  }, []);
  useLayoutEffect(() => stop, [stop]);

  const cancel = useCallback(
    (pointerId?: number): void => {
      if (pointerId !== undefined && start.current?.pointerId !== pointerId) return;
      stop();
      draft(null);
    },
    [draft, stop],
  );

  return {
    begin(event: PointerEvent<HTMLButtonElement>, token: string, scale: CropScale): boolean {
      if (event.button !== 0 || start.current !== null) return false;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = {
        pointerId: event.pointerId,
        token,
        x: event.clientX,
        y: event.clientY,
        scale,
      };
      return true;
    },
    move(event: PointerEvent<HTMLButtonElement>): void {
      const origin = start.current;
      if (origin?.pointerId !== event.pointerId) return;
      nextDraft.current = dragAt(origin, event);
      frame.current ??= requestAnimationFrame(() => {
        frame.current = null;
        draft(nextDraft.current);
      });
    },
    finish(event: PointerEvent<HTMLButtonElement>): void {
      const origin = start.current;
      if (origin?.pointerId !== event.pointerId) return;
      stop();
      const shift = dragAt(origin, event);
      draft(shift);
      if (shift !== null) commit(shift);
    },
    nudge(event: KeyboardEvent<HTMLButtonElement>, token: string, step: CropScale): void {
      if (start.current !== null) return;
      const dx = event.key === 'ArrowLeft' ? -step.x : event.key === 'ArrowRight' ? step.x : 0;
      const dy = event.key === 'ArrowUp' ? -step.y : event.key === 'ArrowDown' ? step.y : 0;
      if (dx === 0 && dy === 0) return;
      event.preventDefault();
      commit({ token, dx: clamp(dx), dy: clamp(dy) });
    },
    cancel,
  };
}
