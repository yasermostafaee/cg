import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';

export type InspectorSectionId =
  | 'layerDetails'
  | 'timing'
  | 'position'
  | 'effects'
  | 'livePlates'
  | 'plateInputs'
  | 'fields'
  | `upcoming:${string}`;

export interface InspectorDisclosureState {
  readonly defaultOpen: boolean;
  readonly overrides: Partial<Record<InspectorSectionId, boolean>>;
}

export const OPEN_INSPECTOR_SECTIONS: InspectorDisclosureState = {
  defaultOpen: true,
  overrides: {},
};

export interface InspectorDisclosure {
  open: boolean;
  toggle: () => void;
}

export function InspectorSection({
  label,
  heading = label,
  disclosure,
  actions,
  className,
  children,
}: {
  label: string;
  heading?: ReactNode;
  disclosure?: InspectorDisclosure | undefined;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const [localOpen, setLocalOpen] = useState(true);
  const open = disclosure?.open ?? localOpen;
  const bodyId = useId();
  const title = (
    <h2>
      <button
        type="button"
        className="cg-inspector-disclosure"
        aria-controls={bodyId}
        aria-expanded={open}
        onClick={disclosure?.toggle ?? (() => setLocalOpen((previous) => !previous))}
      >
        <Icon icon={open ? ChevronDown : ChevronRight} size={14} flipRtl={!open} />
        {heading}
      </button>
    </h2>
  );
  return (
    <section
      className={`cg-inspector-section${className === undefined ? '' : ' ' + className}`}
      aria-label={label}
    >
      {actions === undefined ? (
        title
      ) : (
        <div className="cg-section-caption">
          {title}
          <div hidden={!open}>{actions}</div>
        </div>
      )}
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
