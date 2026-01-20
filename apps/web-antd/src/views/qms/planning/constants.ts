import { ProjectStatusEnum } from '#/api/qms/enums';

/**
 * Project Status UI Map
 */
export const PROJECT_STATUS_UI_MAP: Record<string, { color: string; textKey: string; defaultText: string }> = {
  [ProjectStatusEnum.ACTIVE]: { 
    color: 'green', 
    textKey: 'qms.planning.status.active',
    defaultText: '活跃'
  },
  [ProjectStatusEnum.ARCHIVED]: { 
    color: 'orange', 
    textKey: 'qms.planning.status.archived',
    defaultText: '已归档'
  },
};

/**
 * Control Point UI Map for ITP
 */
export interface ControlPointInfo {
  color: string;
  descKey: string;
  label: string;
}

export const CONTROL_POINT_MAP: Record<string, ControlPointInfo> = {
  H: { color: 'red', descKey: 'qms.planning.itp.controlPoint.holdDesc', label: 'Hold (H)' },
  R: { color: 'blue', descKey: 'qms.planning.itp.controlPoint.reviewDesc', label: 'Review (R)' },
  S: { color: 'green', descKey: 'qms.planning.itp.controlPoint.surveillanceDesc', label: 'Surveillance (S)' },
  W: { color: 'orange', descKey: 'qms.planning.itp.controlPoint.witnessDesc', label: 'Witness (W)' },
};
