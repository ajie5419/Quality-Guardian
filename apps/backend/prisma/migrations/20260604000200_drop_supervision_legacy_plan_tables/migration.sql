-- Drop legacy supervision plan tables that have been superseded by supervision_plan_tasks (Gantt).
-- These tables were never wired to any backend routes or services.
-- Deletion order respects foreign key constraints:
--   supervision_plan_steps references supervision_plan_rows → drop steps first.
--   supervision_plan_rows references supervision_projects → drop rows after steps.
--   supervision_milestones references supervision_projects → can be dropped in any order relative to rows/steps.

DROP TABLE IF EXISTS `supervision_plan_steps`;
DROP TABLE IF EXISTS `supervision_plan_rows`;
DROP TABLE IF EXISTS `supervision_milestones`;
