import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { METER_FLOOR_DBFS, type LivePreviewStatus } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { meterClip, meterPercent, METER_SCALE_MARKS } from './meterScale.js';
import { liveInputPictures } from './liveInputPicture.js';
import { useLiveInputCheck } from './liveInputCheckContext.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from './pgmAudioPlayer.js';

const PICTURE_TIMEOUT_MS = 2_500;
const CAPTIONS = {
  connecting: 'Connecting',
  ready: 'Live',
  stalled: 'Stalled',
  unavailable: 'Unavailable',
  conflict: 'In use',
  replaced: 'Replaced',
  expired: 'Expired',
  forbidden: 'Access denied',
} satisfies Record<LivePreviewStatus['state'], string>;

export function LiveInputCheckCard({ surface }: { surface: string }): JSX.Element | null {
  const control = useLiveInputCheck();
  const check = control?.check;
  if (control === null || check == null || check.surface !== surface) return null;
  return (
    <InputCard
      key={check.view.previewId}
      view={check.view}
      onClose={() => control.stop(surface, check.view.previewId)}
      onStall={control.stall}
    />
  );
}

function InputCard({
  view,
  onClose,
  onStall,
}: {
  view: LivePreviewStatus;
  onClose: () => void;
  onStall: (previewId: string) => void;
}): JSX.Element {
  const { channel, previewId } = view;
  const canvas = useRef<HTMLCanvasElement>(null);
  const ready = view.state === 'ready';
  const [decoded, setDecoded] = useState(false);
  const pictureLive = ready && decoded;

  useEffect(() => {
    if (!ready) return undefined;
    const drawing = canvas.current;
    const context = drawing?.getContext('2d');
    const abort = new AbortController();
    const failed = (): void => {
      if (abort.signal.aborted) return;
      abort.abort();
      setDecoded(false);
      onStall(previewId);
    };
    let deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
    const run = async (): Promise<void> => {
      if (context == null || drawing === null) return;
      const url = await window.cg.livePreview.url({ channel, previewId }, 'picture');
      if (url === null || abort.signal.aborted) return;
      const response = await fetch(url, {
        signal: abort.signal,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok || response.body === null) return;
      for await (const jpeg of liveInputPictures(response.body)) {
        const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })).catch(
          () => null,
        );
        if (bitmap === null) continue;
        try {
          if (abort.signal.aborted) return;
          if (drawing.width !== bitmap.width) drawing.width = bitmap.width;
          if (drawing.height !== bitmap.height) drawing.height = bitmap.height;
          context.drawImage(bitmap, 0, 0);
          setDecoded(true);
          clearTimeout(deadline);
          deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
        } finally {
          bitmap.close();
        }
      }
    };
    void run().then(failed, failed);
    return () => {
      abort.abort();
      clearTimeout(deadline);
      context?.clearRect(0, 0, drawing?.width ?? 0, drawing?.height ?? 0);
    };
  }, [channel, onStall, previewId, ready]);

  const sound = useRef<{ context: AudioContext; player: PgmAudioPlayer } | null>(null);
  const [audio, setAudio] = useState<'off' | 'connecting' | 'playing' | 'unavailable'>('off');
  const closeSound = useCallback((): void => {
    const active = sound.current;
    sound.current = null;
    if (active === null) return;
    active.player.stop();
    void active.context.close().catch(() => undefined);
  }, []);

  useLayoutEffect(() => {
    if (!pictureLive) {
      closeSound();
      setAudio('off');
    }
    return closeSound;
  }, [closeSound, pictureLive]);

  const toggleSound = (): void => {
    if (sound.current !== null) {
      closeSound();
      setAudio('off');
      return;
    }
    if (!pictureLive) return;
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      setAudio('unavailable');
      return;
    }
    const lost = (): void => {
      if (sound.current?.context !== context) return;
      closeSound();
      setAudio('unavailable');
    };
    const player = new PgmAudioPlayer({
      url: () => window.cg.livePreview.url({ channel, previewId }, 'audio'),
      out: context as unknown as PcmOut,
      retry: false,
      onState: (state) => {
        if (sound.current?.context !== context) return;
        if (state === 'stopped') lost();
        else setAudio(state);
      },
    });
    sound.current = { context, player };
    setAudio('connecting');
    void context.resume().then(() => {
      if (sound.current?.context === context) player.start();
    }, lost);
  };

  const audible = audio === 'connecting' || audio === 'playing';
  const state = view.state === 'ready' && !decoded ? 'connecting' : view.state;
  return (
    <section className="cg-input-check" aria-label="PVW input check" data-input-check="">
      <header className="cg-input-check__head">
        <span className="cg-input-check__name">
          PVW INPUT · CH {channel} · <bdi dir="auto">{view.sourceName}</bdi>
        </span>
        <Button
          variant="icon"
          aria-label="Input preview sound"
          aria-pressed={audible}
          title={audible ? 'Mute input preview' : 'Listen to input preview'}
          disabled={!pictureLive}
          onClick={toggleSound}
        >
          <Icon icon={audible ? Volume2 : VolumeX} size={14} />
        </Button>
        <Button variant="icon" aria-label="Close input check" onClick={onClose}>
          <Icon icon={X} size={14} />
        </Button>
      </header>
      <div className="cg-input-check__body">
        <canvas
          ref={canvas}
          hidden={!pictureLive}
          className="cg-input-check__picture"
          role="img"
          aria-label={`Live input picture for ${view.sourceName}`}
          data-input-picture=""
        />
        <div
          className="cg-vu"
          role="img"
          aria-label={`PVW INPUT level for ${view.sourceName}, dBFS`}
          dir="ltr"
          data-input-meter=""
        >
          <span className="cg-vu__unit" aria-hidden="true">
            dBFS
          </span>
          <div className="cg-vu__body">
            <div className="cg-vu__bars">
              {[0, 1].map((index) => (
                <span key={index} className="cg-vu__bar">
                  <span
                    className="cg-vu__fill"
                    style={{
                      clipPath: meterClip(
                        (pictureLive ? view.dbFs?.[index] : null) ?? METER_FLOOR_DBFS,
                      ),
                    }}
                  />
                </span>
              ))}
            </div>
            <div className="cg-vu__scale" aria-hidden="true">
              {METER_SCALE_MARKS.map((db) => (
                <span
                  key={db}
                  className="cg-vu__mark"
                  style={{ bottom: `${String(meterPercent(db))}%` }}
                >
                  {db === 0 ? '0' : `−${String(Math.abs(db))}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="cg-input-check__state" role="status" data-input-check-state={state}>
        {CAPTIONS[state]}
        {view.message !== undefined ? ` · ${view.message}` : ''}
        {audio === 'unavailable' ? ' · Input sound unavailable' : ''}
      </span>
    </section>
  );
}
