import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpack } from '@cg/vcg-format';
import type { Download, Page } from '@playwright/test';
import { expect, test } from './fixtures/designer.js';

/**
 * 🔴 `D-165` — SOUND EFFECTS in the REAL built app: `Audio…` imports a WAV, an MP3, an OGG and an
 * M4A through the in-app converter (each becomes ONE 48 kHz stereo WAV, measured: length and
 * peak); a dropped sound is ONE `audio` element with no box on the canvas and its own Sound
 * section; the Preview offers a Sound switch; and the `.vcg` carries the WAV.
 *
 * The fixtures are a 0.5 s 1 kHz tone at −6 dBFS in each format (`fixtures/tone*`), made with
 * system ffmpeg. The level on AIR is measured on CasparCG, not here (the change's design.md).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Buffer => readFileSync(join(HERE, 'fixtures', name));

/**
 * Each fixture's own peak, measured on the fixture by system ffmpeg 8.1.2 (`volumedetect`) when it
 * was made: a lossy codec moves a pure tone's peak (AAC overshoots by 2.5 dB). The import must
 * report that peak, within its own decoder's ±0.6 dB, and the PCM source exactly. The MONO WAV
 * must read −6.0 — its level kept, never the −9 dB the −3 dB pan law would give it.
 */
const SOUNDS = [
  { name: 'tone-44k-mono.wav', mimeType: 'audio/wav', peak: -6.0 },
  { name: 'tone.mp3', mimeType: 'audio/mpeg', peak: -6.3 },
  { name: 'tone.ogg', mimeType: 'audio/ogg', peak: -5.7 },
  { name: 'tone.m4a', mimeType: 'audio/mp4', peak: -3.5 },
];

async function importSounds(page: Page, names: readonly string[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add asset' }).dispatchEvent('pointerdown');
  await page.getByRole('menuitem', { name: 'Audio…', exact: true }).click();
  await (
    await chooser
  ).setFiles(
    SOUNDS.filter((s) => names.includes(s.name)).map((s) => ({
      name: s.name,
      mimeType: s.mimeType,
      buffer: fixture(s.name),
    })),
  );
}

/** Drop an asset on the canvas the way the Assets panel's drag does (kind + id). */
async function dropAsset(page: Page, filename: string): Promise<void> {
  const ok = await page.evaluate(async (name) => {
    const assets = await window.cg.assets.list();
    const a = assets.find((x) => x.filename === name);
    const canvas = document.querySelector('[data-testid="canvas-surface"]');
    if (a === undefined || canvas === null) return false;
    const dt = new DataTransfer();
    dt.setData('application/x-cg-asset-id', a.assetId);
    dt.setData('application/x-cg-asset-kind', a.kind);
    for (const type of ['dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      canvas.dispatchEvent(ev);
    }
    return true;
  }, filename);
  expect(ok).toBe(true);
}

test.describe('D-165 — sound effects in the Designer', () => {
  test('🔴 WAV, MP3, OGG and M4A each import as ONE 48 kHz stereo WAV, with its length and peak', async ({
    app,
    page,
  }) => {
    await app.newProject('Sounds');
    await page.getByRole('button', { name: 'Project assets' }).click();
    await importSounds(
      page,
      SOUNDS.map((s) => s.name),
    );
    await expect
      .poll(
        async () =>
          page.evaluate(async () =>
            (await window.cg.assets.list())
              .filter((a) => a.kind === 'audio')
              .map((a) => ({
                filename: a.filename,
                source: a.audio?.sourceFilename,
                ms: Math.round(a.audio?.durationMs ?? 0),
                peak: a.audio?.peakDbfs,
                rate: a.audio?.sampleRate,
                channels: a.audio?.channels,
              }))
              .sort((x, y) => x.filename.localeCompare(y.filename)),
          ),
        { timeout: 60_000 },
      )
      .toHaveLength(4);
    const stored = await page.evaluate(async () =>
      (await window.cg.assets.list()).filter((a) => a.kind === 'audio'),
    );
    for (const a of stored) {
      const source = a.audio?.sourceFilename ?? '';
      const fixtureOf = SOUNDS.find((s) => s.name === source);
      expect(fixtureOf, `an asset from ${source}`).toBeDefined();
      expect(a.filename.endsWith('.wav'), a.filename).toBe(true);
      expect(a.audio?.sampleRate).toBe(48000);
      expect(a.audio?.channels).toBe(2);
      // 0.5 s of tone — a lossy codec's priming may add a few tens of ms, never more.
      expect(a.audio!.durationMs, source).toBeGreaterThan(450);
      expect(a.audio!.durationMs, source).toBeLessThan(650);
      expect(Math.abs(a.audio!.peakDbfs - fixtureOf!.peak), `${source} peak`).toBeLessThanOrEqual(
        0.6,
      );
    }
    // The PCM source is exact: 0.5 s, −6.0 dBFS.
    const wav = stored.find((a) => a.audio?.sourceFilename === 'tone-44k-mono.wav');
    expect(wav?.audio?.durationMs).toBe(500);
    expect(wav?.audio?.peakDbfs).toBe(-6);
    // The tile shows both facts.
    await expect(page.getByTestId('audio-tile-facts').first()).toContainText('dBFS');
    await expect(page.getByTestId('audio-tile-facts').first()).toContainText(' s');
  });

  test('🔴 a dropped sound is ONE audio element: no box on the canvas, its own Sound section; start, volume and the Preview switch', async ({
    app,
    page,
  }) => {
    await app.newProject('SoundElement');
    await page.getByRole('button', { name: 'Project assets' }).click();
    await importSounds(page, ['tone-44k-mono.wav']);
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () => (await window.cg.assets.list()).filter((a) => a.kind === 'audio').length,
          ),
        { timeout: 60_000 },
      )
      .toBe(1);

    await dropAsset(page, 'tone-44k-mono.wav');
    await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue(
      'tone-44k-mono',
    );
    // A sound draws nothing: no Transform section, and its own facts.
    await expect(app.inspector.getByText('Transform', { exact: true })).toHaveCount(0);
    await expect(app.inspector.getByTestId('audio-length')).toHaveText('0.5 s');
    await expect(app.inspector.getByTestId('audio-peak')).toHaveText('−6.0 dBFS');
    // Nothing of it is painted in the canvas page.
    const frame = page.frameLocator('iframe[title="cgpreview"]');
    await expect(frame.locator('audio[data-cg-element-id]')).toHaveCount(1);
    await expect(frame.locator('audio[data-cg-element-id]')).toBeHidden();

    // Start at the exit, at −12 dB — and a value outside −60…+6 is clamped, never stored.
    const starts = app.inspector.getByRole('combobox', { name: 'starts' });
    await starts.selectOption('exit');
    await expect(starts).toHaveValue('exit');
    const volume = app.inspector.getByRole('spinbutton', { name: 'volume (dB)' });
    await volume.fill('-12');
    await volume.press('Enter');
    await expect(volume).toHaveValue('-12');
    await volume.fill('20');
    await volume.press('Enter');
    await volume.blur();
    await expect(volume).toHaveValue('6');

    // The Preview offers the Sound switch, ON; pressing it turns the sound OFF.
    await app.openPreviewModal();
    const sound = app.previewDialog.getByTestId('preview-sound');
    await expect(sound).toHaveText('Sound on');
    await expect(sound).toHaveAttribute('aria-pressed', 'true');
    await sound.click();
    await expect(sound).toHaveText('Sound off');
    await expect(sound).toHaveAttribute('aria-pressed', 'false');
  });

  test('🔴 Q10 — the Sound section shows loudness and true peak, and Normalise lands the sound on −23 LUFS', async ({
    app,
    page,
  }) => {
    await app.newProject('SoundLoudness');
    await page.getByRole('button', { name: 'Project assets' }).click();
    await importSounds(page, ['tone-44k-mono.wav']);
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () => (await window.cg.assets.list()).filter((a) => a.kind === 'audio').length,
          ),
        { timeout: 60_000 },
      )
      .toBe(1);
    // Measured at import: a 1 kHz tone at −6 dBFS in both channels reads about −6 LUFS.
    const imported = await page.evaluate(
      async () => (await window.cg.assets.list()).find((a) => a.kind === 'audio')?.audio,
    );
    expect(Math.abs((imported?.loudnessLufs ?? 0) - -6)).toBeLessThanOrEqual(0.2);
    expect(Math.abs((imported?.truePeakDbtp ?? 0) - -6)).toBeLessThanOrEqual(0.2);

    await dropAsset(page, 'tone-44k-mono.wav');
    await expect(app.inspector.getByTestId('audio-loudness')).toHaveText(
      /^−(5\.9|6\.0|6\.1) LUFS$/,
    );
    await expect(app.inspector.getByTestId('audio-true-peak')).toHaveText(/ dBTP$/);
    const offer = app.inspector.getByTestId('audio-normalise');
    await expect(offer).toHaveText('Normalise to −23.0 LUFS');
    await offer.click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () =>
            (await window.cg.assets.list())
              .filter((a) => a.kind === 'audio')
              .map((a) => a.filename)
              .sort(),
          ),
        { timeout: 30_000 },
      )
      .toEqual(['tone-44k-mono (-23.0 LUFS).wav', 'tone-44k-mono.wav']);
    // The element now plays the normalised sound: its facts say so, and nothing more is offered.
    await expect(app.inspector.getByTestId('audio-loudness')).toHaveText('−23.0 LUFS');
    await expect(offer).toHaveCount(0);
  });

  test('the .vcg carries the WAV and the element (start, volume) round-trips', async ({
    app,
    page,
  }) => {
    await app.newProject('SoundExport');
    await page.getByRole('button', { name: 'Project assets' }).click();
    await importSounds(page, ['tone.mp3']);
    await expect
      .poll(
        async () =>
          page.evaluate(
            async () => (await window.cg.assets.list()).filter((a) => a.kind === 'audio').length,
          ),
        { timeout: 60_000 },
      )
      .toBe(1);
    await dropAsset(page, 'tone.wav');
    await app.inspector.getByRole('combobox', { name: 'starts' }).selectOption('exit');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export .vcg', exact: true }).click();
    const download: Download = await downloadPromise;
    const chunks: Buffer[] = [];
    for await (const c of await download.createReadStream()) chunks.push(Buffer.from(c));
    const { manifest, files, scene } = await unpack(new Uint8Array(Buffer.concat(chunks)));
    const entry = manifest.assetIndex.find((e) => e.kind === 'audio');
    expect(entry?.path).toMatch(/^assets\/audio\/[0-9a-f]{64}\.wav$/);
    expect(entry?.mime).toBe('audio/wav');
    const bytes = files.get(entry?.path ?? '');
    expect(bytes?.slice(0, 4)).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46])); // RIFF
    const all = [...scene.layers, ...(scene.compositions ?? []).flatMap((c) => c.layers)].flatMap(
      (l) => l.children,
    );
    expect(all.find((e) => e.type === 'audio')).toMatchObject({
      type: 'audio',
      start: { at: 'exit' },
      volumeDb: 0,
    });
  });
});
