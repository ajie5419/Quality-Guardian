import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/supervision/supervision-issue.service', () => ({
  SupervisionIssueService: {
    createIssue: vi.fn(),
    createIssueAction: vi.fn(),
    listIssueActions: vi.fn(),
    listIssues: vi.fn(),
    updateIssue: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision-plan-task.service', () => ({
  SupervisionPlanTaskService: {
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    importPlanTasks: vi.fn(),
    listPlanTasks: vi.fn(),
    reorderTasks: vi.fn(),
    updateTask: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision-project.service', () => ({
  SupervisionProjectService: {
    createProject: vi.fn(),
    listProjects: vi.fn(),
    updateProject: vi.fn(),
  },
}));

vi.mock('~/modules/supervision/supervision-report.service', () => ({
  SupervisionReportService: {
    createReport: vi.fn(),
    listReports: vi.fn(),
  },
}));

describe('supervisionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates facade methods to split supervision services', async () => {
    const { SupervisionIssueService } = await import(
      '~/modules/supervision/supervision-issue.service'
    );
    const { SupervisionPlanTaskService } = await import(
      '~/modules/supervision/supervision-plan-task.service'
    );
    const { SupervisionProjectService } = await import(
      '~/modules/supervision/supervision-project.service'
    );
    const { SupervisionReportService } = await import(
      '~/modules/supervision/supervision-report.service'
    );
    const { SupervisionService } = await import(
      '~/modules/supervision/supervision.service'
    );

    await SupervisionService.createIssue({ projectId: 'project-1' }, 'admin');
    await SupervisionService.createIssueAction('issue-1', {}, 'admin');
    await SupervisionService.listIssueActions('issue-1');
    await SupervisionService.listIssues({ page: 1 });
    await SupervisionService.updateIssue('issue-1', {});
    await SupervisionService.createTask('project-1', {});
    await SupervisionService.deleteTask('project-1', 'task-1');
    await SupervisionService.importPlanTasks('project-1', {});
    await SupervisionService.listPlanTasks('project-1');
    await SupervisionService.reorderTasks('project-1', []);
    await SupervisionService.updateTask('project-1', 'task-1', {});
    await SupervisionService.createProject({});
    await SupervisionService.listProjects({ page: 1 });
    await SupervisionService.updateProject('project-1', {});
    await SupervisionService.createReport({});
    await SupervisionService.listReports({ page: 1 });

    expect(SupervisionIssueService.createIssue).toHaveBeenCalledWith(
      { projectId: 'project-1' },
      'admin',
    );
    expect(SupervisionIssueService.createIssueAction).toHaveBeenCalledWith(
      'issue-1',
      {},
      'admin',
    );
    expect(SupervisionIssueService.listIssueActions).toHaveBeenCalledWith(
      'issue-1',
    );
    expect(SupervisionIssueService.listIssues).toHaveBeenCalledWith({
      page: 1,
    });
    expect(SupervisionIssueService.updateIssue).toHaveBeenCalledWith(
      'issue-1',
      {},
    );
    expect(SupervisionPlanTaskService.createTask).toHaveBeenCalledWith(
      'project-1',
      {},
    );
    expect(SupervisionPlanTaskService.deleteTask).toHaveBeenCalledWith(
      'project-1',
      'task-1',
    );
    expect(SupervisionPlanTaskService.importPlanTasks).toHaveBeenCalledWith(
      'project-1',
      {},
    );
    expect(SupervisionPlanTaskService.listPlanTasks).toHaveBeenCalledWith(
      'project-1',
    );
    expect(SupervisionPlanTaskService.reorderTasks).toHaveBeenCalledWith(
      'project-1',
      [],
    );
    expect(SupervisionPlanTaskService.updateTask).toHaveBeenCalledWith(
      'project-1',
      'task-1',
      {},
    );
    expect(SupervisionProjectService.createProject).toHaveBeenCalledWith({});
    expect(SupervisionProjectService.listProjects).toHaveBeenCalledWith({
      page: 1,
    });
    expect(SupervisionProjectService.updateProject).toHaveBeenCalledWith(
      'project-1',
      {},
    );
    expect(SupervisionReportService.createReport).toHaveBeenCalledWith({});
    expect(SupervisionReportService.listReports).toHaveBeenCalledWith({
      page: 1,
    });
  });
});
