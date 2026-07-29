ALTER TABLE `quality_loss_index`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `respDeptId` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL;

CREATE INDEX `quality_loss_index_projectId_idx`
  ON `quality_loss_index`(`projectId`);

CREATE INDEX `quality_loss_index_respDeptId_idx`
  ON `quality_loss_index`(`respDeptId`);

CREATE INDEX `quality_loss_index_partId_idx`
  ON `quality_loss_index`(`partId`);
