import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreJsUrl from '@ffmpeg/core?url';
import coreWasmUrl from '@ffmpeg/core/wasm?url';

let preparationQueue: Promise<unknown> = Promise.resolve();

/** Prepare an operator's MP4 before either Preview or Take selects its bytes. */
export function prepareUpcomingMp4(file: File): Promise<File> {
  const preparation = preparationQueue.then(() => transcode(file));
  preparationQueue = preparation.catch(() => undefined);
  return preparation;
}

async function transcode(file: File): Promise<File> {
  const ffmpeg = new FFmpeg();
  try {
    // Load the bundled core directly from the console origin, under its existing CSP.
    await ffmpeg.load({
      coreURL: new URL(coreJsUrl, import.meta.url).href,
      wasmURL: new URL(coreWasmUrl, import.meta.url).href,
    });
    await ffmpeg.writeFile('source.mp4', new Uint8Array(await file.arrayBuffer()));
    const status = await ffmpeg.exec([
      '-i',
      'source.mp4',
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libvpx',
      '-deadline',
      'good',
      '-cpu-used',
      '5',
      '-b:v',
      '2M',
      '-crf',
      '20',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      'ready.webm',
    ]);
    if (status !== 0) throw new Error('Could not prepare the program video');
    const bytes = await ffmpeg.readFile('ready.webm');
    if (typeof bytes === 'string') throw new Error('Program video conversion returned no bytes');
    return new File([new Uint8Array(bytes)], file.name.replace(/\.mp4$/i, '') + '.webm', {
      type: 'video/webm',
    });
  } finally {
    ffmpeg.terminate();
  }
}
