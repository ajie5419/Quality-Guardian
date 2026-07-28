ALTER TABLE `processes`
  ADD COLUMN `inspectionRequestCategory` VARCHAR(20) NOT NULL DEFAULT 'PROCESS';

ALTER TABLE `processes`
  ADD CONSTRAINT `processes_inspectionRequestCategory_check`
  CHECK (`inspectionRequestCategory` IN ('INCOMING', 'PROCESS'));
