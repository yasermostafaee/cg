import { useRef, useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { ControlLiveLayout } from '@cg/shared-schema';
import { sha256Hex } from '@cg/vcg-format';
import { APP_VERSION } from '../../appVersion.js';
import appFontsCss from '../../fonts.css?inline';
import { uuid } from '../../lib/uuid.js';
import { base64ToBytes } from '../library/packageBytes.js';
import { importTemplateFromBytes } from '../library/templateDelivery.js';
import { notifyLibraryChanged } from '../library/libraryChanged.js';
import {
  compileControlLiveLayout,
  createControlLiveLayout,
  readControlLiveLayout,
} from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditor } from './LiveLayoutEditor.js';

interface EditorRequest {
  channel: number;
  initial: ControlLiveLayout;
  background?: Blob;
  fonts?: ReadonlyMap<string, Blob>;
  mode: 'create' | 'edit' | 'duplicate';
  expectedSource?: string;
}

export function useControlLiveLayoutEditor(
  onSave: (templateId: string, channel: number) => void,
  onError: (message: string) => void,
): {
  open: (channel: number, template?: TemplateInfo, duplicate?: boolean) => Promise<void>;
  close: () => void;
  busy: boolean;
  dialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<EditorRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const close = (): void => {
    generation.current += 1;
    setBusy(false);
    setRequest(null);
  };
  const open = async (
    channel: number,
    template?: TemplateInfo,
    duplicate = false,
  ): Promise<void> => {
    const current = ++generation.current;
    setBusy(true);
    try {
      let next: EditorRequest;
      if (template === undefined) {
        const settings = await window.cg.channelSettings.get();
        const raster =
          settings.settings.find((item) => item.channel === channel)?.raster ??
          settings.observed.find((item) => item.channel === channel)?.raster ??
          undefined;
        next = { channel, initial: createControlLiveLayout(raster), mode: 'create' };
      } else {
        const expectedSource = template.controlLiveLayoutSource;
        if (expectedSource === undefined)
          throw new Error('The editable layout package is unavailable.');
        const source = await window.cg.templates.source({ sha256: expectedSource });
        if (!source.ok) throw new Error('CG Bridge no longer has this layout package.');
        const bytes = base64ToBytes(source.base64);
        if (sha256Hex(bytes) !== expectedSource)
          throw new Error('The saved layout package could not be verified.');
        const { layout, asset, fonts } = await readControlLiveLayout(bytes);
        const initial = duplicate
          ? {
              ...layout,
              id: uuid(),
              name: `${layout.name.slice(0, 115)} copy`,
            }
          : { ...layout, id: template.templateId };
        next = {
          channel,
          initial,
          fonts,
          ...(asset === undefined ? {} : { background: asset }),
          mode: duplicate ? 'duplicate' : 'edit',
          ...(duplicate ? {} : { expectedSource }),
        };
      }
      if (generation.current === current) setRequest(next);
    } catch (error) {
      if (generation.current === current) {
        onError(error instanceof Error ? error.message : 'The live layout could not be opened.');
      }
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  const save = async (
    layout: ControlLiveLayout,
    background: Blob | undefined,
    fonts: ReadonlyMap<string, Blob>,
  ): Promise<void> => {
    if (request === null) return;
    const bytes = await compileControlLiveLayout(layout, background, fonts);
    const saved = await importTemplateFromBytes(window.cg, bytes, {
      channel: request.channel,
      consoleVersion: APP_VERSION,
      fontsCss: appFontsCss,
      ...(request.expectedSource === undefined
        ? {}
        : { expectedControlLayoutSource: request.expectedSource }),
    });
    notifyLibraryChanged();
    onSave(saved.templateId, request.channel);
    close();
  };
  return {
    open,
    close,
    busy,
    dialog:
      request === null ? null : (
        <LiveLayoutEditor
          key={request.initial.id}
          channel={request.channel}
          initial={request.initial}
          initialFonts={request.fonts}
          {...(request.background === undefined ? {} : { initialBackground: request.background })}
          mode={request.mode}
          onClose={close}
          onSave={save}
        />
      ),
  };
}
