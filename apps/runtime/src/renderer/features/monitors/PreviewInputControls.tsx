import { Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useUiText } from '../../i18n/locale.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import type { PreviewAudioControls } from './previewAudio.js';

export function PreviewInputControls({
  controls,
  sourceId,
  name,
}: {
  controls: PreviewAudioControls;
  sourceId: string;
  name: string;
}): JSX.Element {
  const localizeUi = useUiText();
  const picture = controls.pictureStateOf(sourceId);
  const audio = controls.stateOf(sourceId);
  return (
    <>
      {picture !== undefined && (
        <Button
          variant="icon"
          className="cg-preview-plate-audio"
          aria-label={localizeUi('Live preview · {source}', { source: name })}
          aria-pressed={picture !== 'snapshots'}
          active={picture !== 'snapshots'}
          title={localizeUi(
            picture === 'snapshots'
              ? 'Start live input preview'
              : picture === 'connecting'
                ? 'Cancel live input preview'
                : 'Stop live input preview',
          )}
          data-preview-plate-picture={picture}
          onClick={() => controls.togglePicture(sourceId)}
        >
          <Icon icon={picture === 'snapshots' ? VideoOff : Video} size={13} />
        </Button>
      )}
      {audio !== undefined && (
        <Button
          variant="icon"
          className="cg-preview-plate-audio"
          aria-label={localizeUi('Preview audio · {source}', { source: name })}
          aria-pressed={audio === 'audible'}
          title={localizeUi(
            audio === 'connecting'
              ? 'Cancel preview audio'
              : audio === 'audible'
                ? 'Mute this preview input'
                : 'Listen to this preview input',
          )}
          data-preview-plate-audio={audio}
          onClick={() => controls.toggle(sourceId)}
        >
          <Icon icon={audio === 'audible' ? Volume2 : VolumeX} size={13} />
        </Button>
      )}
    </>
  );
}
