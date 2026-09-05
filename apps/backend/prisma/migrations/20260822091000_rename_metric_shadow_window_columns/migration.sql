-- Align Shadow evidence timestamps with the repository date-field contract.
ALTER TABLE `metric_shadow_validation_evidences`
  CHANGE COLUMN `executionWindowStart` `executionWindowStartAt` DATETIME(3) NOT NULL,
  CHANGE COLUMN `executionWindowEnd` `executionWindowEndAt` DATETIME(3) NOT NULL;
