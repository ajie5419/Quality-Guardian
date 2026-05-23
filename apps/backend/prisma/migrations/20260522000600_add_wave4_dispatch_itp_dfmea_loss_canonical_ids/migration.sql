ALTER TABLE `qms_task_dispatches`
  ADD COLUMN `typeId` VARCHAR(191) NULL;

ALTER TABLE `itp_items`
  ADD COLUMN `processStepId` VARCHAR(191) NULL;

ALTER TABLE `dfmea`
  ADD COLUMN `causeId` VARCHAR(191) NULL;

ALTER TABLE `quality_losses`
  ADD COLUMN `typeId` VARCHAR(191) NULL;

CREATE INDEX `qms_task_dispatches_typeId_fkey` ON `qms_task_dispatches`(`typeId`);
CREATE INDEX `itp_items_processStepId_idx` ON `itp_items`(`processStepId`);
CREATE INDEX `dfmea_causeId_idx` ON `dfmea`(`causeId`);
CREATE INDEX `quality_losses_typeId_idx` ON `quality_losses`(`typeId`);
