import { useState } from 'react';
import type { AnimatableProperty, Scene } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { InspectorPanel } from '../inspector/InspectorPanel.js';
import { FieldsPanel } from './FieldsPanel.js';
import * as s from './DesignerRightPanel.css.js';

type RightTab = 'inspector' | 'variables';

interface Props {
  scene: Scene;
  selection: ReadonlySet<string>;
  selectedKeyframe: { elementId: string; property: AnimatableProperty; frame: number } | null;
  selectedKeyframes: readonly {
    elementId: string;
    property: AnimatableProperty;
    frame: number;
  }[];
  keyframeInspectorOpen: boolean;
  bindModeFieldId: string | null;
}

/**
 * D-166 — the right pane has two PEER composition surfaces. This component owns
 * only the view choice; selecting an element is deliberately unable to change it.
 */
export function DesignerRightPanel(props: Props): JSX.Element {
  const [tab, setTab] = useState<RightTab>('inspector');
  return (
    <section className={s.shell} aria-label="Designer properties">
      <div className={s.tabs} role="tablist" aria-label="Right panel">
        <RightTabButton tab="inspector" active={tab} onSelect={setTab}>
          Inspector
        </RightTabButton>
        <RightTabButton tab="variables" active={tab} onSelect={setTab}>
          Variables
        </RightTabButton>
      </div>
      <div
        className={s.body}
        role="tabpanel"
        id="designer-inspector-panel"
        aria-labelledby="designer-inspector-tab"
        hidden={tab !== 'inspector'}
      >
        <InspectorPanel
          scene={props.scene}
          selection={props.selection}
          selectedKeyframe={props.selectedKeyframe}
          selectedKeyframes={props.selectedKeyframes}
          keyframeInspectorOpen={props.keyframeInspectorOpen}
        />
      </div>
      <div
        className={s.body}
        role="tabpanel"
        id="designer-variables-panel"
        aria-labelledby="designer-variables-tab"
        hidden={tab !== 'variables'}
      >
        <aside className={s.variables} aria-label="Variables">
          <FieldsPanel scene={props.scene} bindModeFieldId={props.bindModeFieldId} />
        </aside>
      </div>
    </section>
  );
}

function RightTabButton({
  tab,
  active,
  onSelect,
  children,
}: {
  tab: RightTab;
  active: RightTab;
  onSelect: (tab: RightTab) => void;
  children: string;
}): JSX.Element {
  const selected = tab === active;
  return (
    <Button
      variant="bare"
      id={`designer-${tab}-tab`}
      role="tab"
      aria-selected={selected}
      aria-controls={`designer-${tab}-panel`}
      className={selected ? s.tabActive : s.tab}
      onClick={() => onSelect(tab)}
    >
      {children}
    </Button>
  );
}
