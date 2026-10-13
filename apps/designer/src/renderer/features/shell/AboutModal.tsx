import { APP_BUILD_REF, APP_VERSION } from '../../appVersion.js';
import { Tag } from '../../ui/Tag.js';
import * as s from './AboutModal.css.js';
import { Modal } from './Modal.js';

interface Props {
  onClose: () => void;
  /** This build's release by default; a spec plants another to prove its check can fail. */
  version?: string;
  /** This build's `sha · date` by default. */
  build?: string;
}

/**
 * 🔴 `D-161` (`RELEASE-091-01` §4) — **Help → About**: the app's name, the release it is and the build
 * behind it. The version is the build stamp's (`appVersion.ts`), which reads this app's `package.json`;
 * `tools/release` refuses a build whose nine version files disagree, so it is the release's.
 *
 * Three FACTS, so three `Tag`s — never a control, nothing to press but the dialog's own close.
 */
export function AboutModal({
  onClose,
  version = APP_VERSION,
  build = APP_BUILD_REF,
}: Props): JSX.Element {
  return (
    <Modal title="About" onClose={onClose} width="min(360px, 92vw)">
      <div className={s.facts}>
        <Tag className={s.name} data-testid="about-name">
          CG Designer
        </Tag>
        <Tag className={s.fact} data-testid="about-version">
          Version {version}
        </Tag>
        <Tag className={s.fact} data-testid="about-build">
          Build {build}
        </Tag>
      </div>
    </Modal>
  );
}
