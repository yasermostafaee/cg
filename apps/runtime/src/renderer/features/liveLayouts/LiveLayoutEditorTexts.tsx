import { useUiText } from '../../i18n/locale.js';
import { useId, useState } from 'react';
import { List, Plus, Trash2 } from 'lucide-react';
import type {
  ControlLiveLayout,
  ControlLiveLayoutAdditionalText,
  ControlLiveLayoutFrame,
  ControlLiveLayoutTitleStyle,
} from '@cg/shared-schema';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { TextInput } from '../../ui/TextInput.js';
import { controlLiveLayoutAdditionalTextStyle } from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorTitleStyle } from './LiveLayoutEditorTitleStyle.js';
import { LiveLayoutEditorSectionHeading } from './LiveLayoutEditorSectionHeading.js';

export function LiveLayoutEditorTexts({
  layout,
  frame,
  frameNumber,
  readingFont,
  onChange,
  onSharedStyle,
  onAddFont,
}: {
  layout: ControlLiveLayout;
  frame: ControlLiveLayoutFrame;
  frameNumber: number;
  readingFont: boolean;
  onChange: (texts: ControlLiveLayoutAdditionalText[]) => void;
  onSharedStyle: (index: number, patch: ControlLiveLayoutTitleStyle) => void;
  onAddFont: (file: File, scope: 'shared' | 'frame', text: { id: string; index: number }) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const id = useId();
  const [selectedId, select] = useState<string>();
  const texts = frame.additionalTexts ?? [];
  const selected = texts.find((item) => item.id === selectedId) ?? texts[0];
  const selectedIndex = selected === undefined ? 0 : texts.indexOf(selected);
  const selectedNumber = selectedIndex + 2;
  function addText(): void {
    const textId = uuid();
    onChange([...texts, { id: textId, text: '' }]);
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
      <LiveLayoutEditorSectionHeading icon={List} label={localizeUi('Additional text')} />
      <div
        className="cg-live-layout-title-scope"
        role="group"
        aria-label={localizeUi('Additional texts')}
      >
        {texts.map((item, index) => (
          <Button
            key={item.id}
            active={item.id === selected?.id}
            aria-pressed={item.id === selected?.id}
            onClick={() => select(item.id)}
          >
            {localizeUi('Text {number}', { number: index + 2 })}
          </Button>
        ))}
        <Button variant="neutral" onClick={addText}>
          <Icon icon={Plus} size={14} /> {localizeUi('Add text')}
        </Button>
      </div>
      {selected !== undefined && (
        <>
          <div className="cg-live-layout-extra-text-field">
            <TextInput
              id={id + '-text'}
              aria-label={localizeUi('Text {number}', { number: selectedNumber })}
              value={selected.text}
              onChange={(text) => changeSelected((current) => ({ ...current, text }))}
              dir="auto"
              maxLength={120}
            />
            <Button
              className="cg-list-remove"
              variant="icon"
              aria-label={localizeUi('Remove text {number}', { number: selectedNumber })}
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
            shared={controlLiveLayoutAdditionalTextStyle(layout, undefined, selectedIndex)}
            individualBase={controlLiveLayoutAdditionalTextStyle(
              layout,
              frame.titleStyle,
              selectedIndex,
            )}
            override={selected.style}
            fonts={layout.fonts ?? []}
            readingFont={readingFont}
            onSharedChange={(patch) => onSharedStyle(selectedIndex, patch)}
            onOverrideChange={(patch) =>
              changeSelected((current) => ({ ...current, style: { ...current.style, ...patch } }))
            }
            onResetOverride={() => changeSelected(({ style: _override, ...current }) => current)}
            onAddFont={(file, scope) =>
              onAddFont(file, scope, { id: selected.id, index: selectedIndex })
            }
          />
        </>
      )}
    </details>
  );
}
