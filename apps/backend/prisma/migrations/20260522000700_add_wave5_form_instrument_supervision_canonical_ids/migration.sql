ALTER TABLE `inspection_form_templates`
  ADD COLUMN `formNameId` VARCHAR(191) NULL;

CREATE INDEX `inspection_form_templates_formNameId_idx`
  ON `inspection_form_templates` (`formNameId`);

ALTER TABLE `measuring_instruments`
  ADD COLUMN `instrumentNameId` VARCHAR(191) NULL;

CREATE INDEX `measuring_instruments_instrumentNameId_idx`
  ON `measuring_instruments` (`instrumentNameId`);

ALTER TABLE `supervision_issues`
  ADD COLUMN `issueTypeId` VARCHAR(191) NULL;

CREATE INDEX `supervision_issues_issueTypeId_idx`
  ON `supervision_issues` (`issueTypeId`);

ALTER TABLE `supervision_issue_actions`
  ADD COLUMN `actionTypeId` VARCHAR(191) NULL;

CREATE INDEX `supervision_issue_actions_actionTypeId_idx`
  ON `supervision_issue_actions` (`actionTypeId`);
