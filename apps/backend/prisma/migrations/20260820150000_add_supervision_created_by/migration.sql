-- SEC-SUPERVISION-001: object-authorization owner columns.
ALTER TABLE `supervision_projects` ADD COLUMN `createdBy` VARCHAR(191) NULL;
ALTER TABLE `supervision_daily_reports` ADD COLUMN `createdBy` VARCHAR(191) NULL;
