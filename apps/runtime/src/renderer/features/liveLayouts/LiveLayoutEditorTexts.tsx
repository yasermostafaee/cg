import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ControlLiveLayout,
  ControlLiveLayoutAdditionalText,
  ControlLiveLayoutFrame,
} from '@cg/shared-schema';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { TextInput } from '../../ui/TextInput.js';
import { controlLiveLayoutTitleGeometry } from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorTitleStyle } from './LiveLayoutEditorTitleStyle.js';

export function LiveLayoutEditorTexts({
  layout,
  frame,
  frameNumber,
  readingFont,
  onChange,
  onAddFont,
}: {
  layout: ControlLiveLayout;
  frame: ControlLiveLayoutFrame;
  frameNumber: number;
  readingFont: boolean;
  onChange: (texts: ControlLiveLayoutAdditionalText[]) => void;
  onAddFont: (file: File, textId: string) => void;
}): JSX.Element {
  const id = useId();
  const [selectedId, select] = useState<string>();
  const texts = frame.additionalTexts ?? [];
  const selected = texts.find((item) => item.id === selectedId) ?? texts[0];
  const selectedNumber = selected === undefined ? 2 : texts.indexOf(selected) + 2;
  const frameStyle = { ...layout.titleStyle, ...frame.titleStyle };
  function addText(): void {
    const textId = uuid();
    const { yPercent, heightPercent } = controlLiveLayoutTitleGeometry(
      layout.resolution,
      frameStyle,
    );
    const y = Math.max(0, yPercent - (texts.length + 1) * (heightPercent + 2));
    onChange([...texts, { id: textId, text: '', style: { yPercent: y } }]);
    select(textId);
    requestAnimationFrame(() => document.getElementById(id + '-text')?.focus());
  }

  function changeSelected(
    change: (current: ControlLiveLayoutAdditionalText) => ControlLiveLayoutAdditionalText,
  ): void {
    if (selected === undefined) return;
    onChange(texts.map((item) => (item.id === selected.id ? change(item) : item)));
  }

  return (
    <details className="cg-live-layout-title-style">
      <summary>Additional text</summary>
      <div className="cg-live-layout-title-scope" role="group" aria-label="Additional texts">
        {texts.map((item, index) => (
          <Button
            key={item.id}
            active={item.id === selected?.id}
            aria-pressed={item.id === selected?.id}
            onClick={() => select(item.id)}
          >
            Text {index + 2}
          </Button>
        ))}
        <Button variant="add" onClick={addText}>
          <Icon icon={Plus} size={14} /> Add text
        </Button>
      </div>
      {selected !== undefined && (
        <>
          <div className="cg-live-layout-extra-text-field">
            <TextInput
              id={id + '-text'}
              aria-label={'Text ' + String(selectedNumber)}
              value={selected.text}
              onChange={(text) => changeSelected((current) => ({ ...current, text }))}
              dir="auto"
              maxLength={120}
            />
            <Button
              className="cg-list-remove"
              variant="icon"
              aria-label={'Remove text ' + String(selectedNumber)}
              onClick={() => onChange(texts.filter((item) => item.id !== selected.id))}
            >
              <Icon icon={Trash2} size={15} />
            </Button>
          </div>
          <LiveLayoutEditorTitleStyle
            key={selected.id}
            frameId={selected.id}
            frameNumber={frameNumber}
            heading="Text style"
            raster={layout.resolution}
            shared={frameStyle}
            override={selected.style}
            fonts={layout.fonts ?? []}
            readingFont={readingFont}
            onOverrideChange={(patch) =>
              changeSelected((current) => ({ ...current, style: { ...current.style, ...patch } }))
            }
            onResetOverride={() => changeSelected(({ style: _override, ...current }) => current)}
            onAddFont={(file) => onAddFont(file, selected.id)}
          />
        </>
      )}
    </details>
  );
}
