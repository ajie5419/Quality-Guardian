-- Keep the request's canonical responsibility on every generated inspection
-- record. PROCESS internal records may intentionally have no execution TEAM.
ALTER TABLE `inspections`
  ADD COLUMN `responsibilityType` VARCHAR(191) NULL,
  ADD COLUMN `responsibleDepartmentId` VARCHAR(191) NULL,
  ADD COLUMN `responsibleDepartment` VARCHAR(191) NULL,
  ADD INDEX `inspections_responsibilityType_responsibleDepartmentId_idx` (`responsibilityType`, `responsibleDepartmentId`);
