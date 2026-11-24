import {
  upcomingProgramsDrivesHold,
  upcomingProgramsRepeatOf,
  upcomingProgramsTransitionOf,
  upcomingProgramsUsesPagination,
  type UpcomingProgramsElement,
} from '@cg/shared-schema';
import { locate } from '../../state/scene-doc.js';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { CheckRow } from './DynamicDataSection.js';
import { InfoTip } from './InfoTip.js';
import { UpcomingProgramsCardSections } from './UpcomingProgramsCardSections.js';
import { UpcomingProgramsMotionSection } from './UpcomingProgramsMotionSection.js';
import { UpcomingProgramsTestData } from './UpcomingProgramsTestData.js';
import { NumberField, SelectField } from './controls.js';
import {
  SEQUENCE_PRESET_ORDER,
  SEQUENCE_TRANSITION_PRESETS,
  sequencePresetKeyFor,
} from './sequence-presets.js';

export function UpcomingProgramsSection({
  element,
}: {
  element: UpcomingProgramsElement;
}): JSX.Element {
  const hasVisibleCardCount = element.layout === 'grid' || element.layout === 'carousel';
  const hasAdvance = upcomingProgramsUsesPagination(element);
  const drivesHold = upcomingProgramsDrivesHold(element);
  const owner = designerStore.get();
  const update = (patch: Partial<UpcomingProgramsElement>): void => {
    designerStore.updateElement(element.id, patch);
  };

  return (
    <>
      <CollapseSection title="Upcoming Programs" defaultExpanded>
        <SelectField
          label="Layout"
          options={['single', 'grid', 'sequence', 'carousel'] as const}
          labels={['Single', 'Side by side', 'Sequential', 'Carousel']}
          value={element.layout}
          onCommit={(layout) => update({ layout })}
        />
        {hasVisibleCardCount && (
          <NumberField
            label="Visible cards"
            value={element.visibleCards}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            step={1}
            onCommit={(count) => {
              const visibleCards = Math.round(count);
              if (Number.isSafeInteger(visibleCards) && visibleCards >= 1) update({ visibleCards });
            }}
          />
        )}
        <CheckRow
          label="Show airtime"
          checked={element.showAirtime}
          onChange={(showAirtime) => update({ showAirtime })}
        />
        <CheckRow
          label="Drive content hold"
          title="In a Content-driven composition, complete the hold after the programmes finish so Auto-out can play the timeline Outro."
          checked={drivesHold}
          onChange={(drivesHold) => designerStore.setElementDrivesHold(element.id, drivesHold)}
        />
        {!hasAdvance && drivesHold && <DwellField element={element} update={update} />}
        {hasAdvance && <PagingFields element={element} update={update} />}
      </CollapseSection>
      <UpcomingProgramsMotionSection element={element} update={update} />
      <CollapseSection
        title="Test data"
        trailing={
          <InfoTip title="Upcoming Programs test data">
            <p>
              Choose an image or video from Project Assets. Import new photos, clips and sounds in
              Project Assets before assigning them here.
            </p>
            <p>
              Starter artwork is for rehearsal. Choose project media and Prepared in Designer to
              include the current programmes and assigned media when you export.
            </p>
          </InfoTip>
        }
      >
        <SelectField
          label="On-air data"
          options={['rehearsal', 'prepared'] as const}
          labels={['Rehearsal only', 'Prepared in Designer']}
          value={element.dataSource ?? 'rehearsal'}
          onCommit={(dataSource) => update({ dataSource })}
        />
        <UpcomingProgramsTestData
          key={element.id}
          items={element.sampleItems}
          onChange={(sampleItems) => update({ sampleItems })}
          onChooseMedia={(itemId, mediaAssetId, mediaKind, posterAssetId) => {
            const { scene, activeCompositionId } = designerStore.get();
            if (
              scene === null ||
              scene.id !== owner.scene?.id ||
              activeCompositionId !== owner.activeCompositionId
            )
              return;
            const found = locate(scene, element.id);
            const latest = found?.layer.children[found.elIdx];
            if (
              latest?.type !== 'upcomingPrograms' ||
              !latest.sampleItems.some(({ id }) => id === itemId)
            )
              return;
            const sampleItems = latest.sampleItems.map((row) =>
              row.id === itemId ? { ...row, mediaAssetId, mediaKind, posterAssetId } : row,
            );
            const { cardStyle } = latest;
            if (cardStyle?.media?.visible !== undefined) {
              update({ sampleItems });
              return;
            }
            update({
              sampleItems,
              cardStyle: { ...cardStyle, media: { ...cardStyle?.media, visible: true } },
            });
          }}
        />
      </CollapseSection>
      <UpcomingProgramsCardSections
        element={element}
        update={(patch) => update({ cardStyle: { ...element.cardStyle, ...patch } })}
      />
    </>
  );
}

function PagingFields({
  element,
  update,
}: {
  element: UpcomingProgramsElement;
  update: (patch: Partial<UpcomingProgramsElement>) => void;
}): JSX.Element {
  const transition = upcomingProgramsTransitionOf(element);
  const presetKey = sequencePresetKeyFor(transition);
  const options = SEQUENCE_PRESET_ORDER.filter(
    (preset) => preset.key !== 'custom' || presetKey === 'custom',
  );
  const repeat = upcomingProgramsRepeatOf(element);
  return (
    <>
      <SelectField
        label="Advance"
        options={['auto', 'manual'] as const}
        labels={['Automatic', 'Manual']}
        value={element.advance}
        onCommit={(advance) => update({ advance })}
      />
      {element.advance === 'auto' && <DwellField element={element} update={update} />}
      <SelectField
        label="Repeat"
        options={['infinite', 'count'] as const}
        labels={['Infinite', 'Fixed passes']}
        value={repeat === 'infinite' ? 'infinite' : 'count'}
        onCommit={(mode) => update({ repeat: mode === 'infinite' ? 'infinite' : 1 })}
      />
      {repeat !== 'infinite' && (
        <NumberField
          label="Pass count"
          value={repeat}
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          onCommit={(count) => {
            const passes = Math.round(count);
            if (Number.isSafeInteger(passes) && passes >= 1) update({ repeat: passes });
          }}
        />
      )}
      <SelectField
        label="Next effect"
        options={options.map((preset) => preset.key)}
        labels={options.map((preset) => preset.label)}
        value={presetKey}
        onCommit={(key) => {
          const preset = SEQUENCE_TRANSITION_PRESETS[key];
          if (preset !== undefined) update(preset);
        }}
      />
      {presetKey !== 'cut' && (
        <NumberField
          label="Next effect duration"
          value={transition.transitionMs / 1000}
          min={0.05}
          max={Number.MAX_SAFE_INTEGER / 1000}
          step={0.05}
          suffix="s"
          onCommit={(seconds) => {
            const transitionMs = Math.round(seconds * 1000);
            if (Number.isSafeInteger(transitionMs) && transitionMs >= 50) update({ transitionMs });
          }}
        />
      )}
    </>
  );
}

function DwellField({
  element,
  update,
}: {
  element: UpcomingProgramsElement;
  update: (patch: Partial<UpcomingProgramsElement>) => void;
}): JSX.Element {
  return (
    <NumberField
      label="Dwell (s)"
      value={element.dwellMs / 1000}
      min={0.1}
      max={Number.MAX_SAFE_INTEGER / 1000}
      step={0.1}
      onCommit={(seconds) => {
        const dwellMs = Math.round(seconds * 1000);
        if (Number.isSafeInteger(dwellMs) && dwellMs >= 100) update({ dwellMs });
      }}
    />
  );
}
