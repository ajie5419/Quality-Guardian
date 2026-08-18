-- AlterTable: record the reporting user id for the "my reports" scope (anonymous scans leave it null)
ALTER TABLE `qms_inspection_requests` ADD COLUMN `reporterId` VARCHAR(191) NULL;
