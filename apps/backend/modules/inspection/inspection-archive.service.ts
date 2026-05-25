import { InspectionCoreService } from './inspection-core.service';

export const InspectionArchiveService = {
  getArchiveTasks: InspectionCoreService.getArchiveTasks,
  updateArchiveTaskStatus: InspectionCoreService.updateArchiveTaskStatus,
};
