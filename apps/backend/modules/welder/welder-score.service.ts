import { WelderScoreRefreshService } from './welder-score-refresh.service';

/**
 * Transition shim: keeps the legacy synchronous entry point working until all
 * call sites move to the async metric-refresh queue. The actual computation
 * lives in WelderScoreRefreshService.
 */
export const WelderScoreService = {
  syncFromInspectionIssues: WelderScoreRefreshService.refreshAll,
};
