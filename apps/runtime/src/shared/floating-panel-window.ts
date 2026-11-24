import type { FloatingPanelId, FloatingPanelPlacement } from './floating-panels.js';

export type FloatingPanelDock = Pick<FloatingPanelPlacement, 'left' | 'top' | 'width' | 'height'>;

export interface FloatingPanelArrangement {
  panel: FloatingPanelId;
  title: string;
  visible: boolean;
  dock: FloatingPanelDock | null;
  placement: FloatingPanelPlacement | null;
}

export interface FloatingPanelWindowDoor {
  arrange(arrangement: FloatingPanelArrangement): Promise<void>;
  placement(panel: FloatingPanelId): Promise<FloatingPanelPlacement | null>;
  dispose(): Promise<void>;
}
