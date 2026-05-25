/**
 * Facade: re-exports from split service modules.
 * Routes import { SupervisionService } from here — no changes needed.
 */
import { SupervisionIssueService } from './supervision-issue.service';
import { SupervisionPlanTaskService } from './supervision-plan-task.service';
import { SupervisionProjectService } from './supervision-project.service';
import { SupervisionReportService } from './supervision-report.service';

export const SupervisionService = {
  createIssue: SupervisionIssueService.createIssue.bind(
    SupervisionIssueService,
  ),
  createIssueAction: SupervisionIssueService.createIssueAction.bind(
    SupervisionIssueService,
  ),
  createProject: SupervisionProjectService.createProject.bind(
    SupervisionProjectService,
  ),
  createReport: SupervisionReportService.createReport.bind(
    SupervisionReportService,
  ),
  createTask: SupervisionPlanTaskService.createTask.bind(
    SupervisionPlanTaskService,
  ),
  deleteTask: SupervisionPlanTaskService.deleteTask.bind(
    SupervisionPlanTaskService,
  ),
  importPlanTasks: SupervisionPlanTaskService.importPlanTasks.bind(
    SupervisionPlanTaskService,
  ),
  listIssueActions: SupervisionIssueService.listIssueActions.bind(
    SupervisionIssueService,
  ),
  listIssues: SupervisionIssueService.listIssues.bind(SupervisionIssueService),
  listPlanTasks: SupervisionPlanTaskService.listPlanTasks.bind(
    SupervisionPlanTaskService,
  ),
  listProjects: SupervisionProjectService.listProjects.bind(
    SupervisionProjectService,
  ),
  listReports: SupervisionReportService.listReports.bind(
    SupervisionReportService,
  ),
  reorderTasks: SupervisionPlanTaskService.reorderTasks.bind(
    SupervisionPlanTaskService,
  ),
  updateIssue: SupervisionIssueService.updateIssue.bind(
    SupervisionIssueService,
  ),
  updateProject: SupervisionProjectService.updateProject.bind(
    SupervisionProjectService,
  ),
  updateTask: SupervisionPlanTaskService.updateTask.bind(
    SupervisionPlanTaskService,
  ),
};
