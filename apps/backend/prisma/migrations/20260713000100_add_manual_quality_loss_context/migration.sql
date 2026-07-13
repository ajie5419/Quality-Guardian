-- AlterTable
ALTER TABLE `quality_losses` ADD COLUMN `partId` VARCHAR(191) NULL,
    ADD COLUMN `partName` VARCHAR(191) NULL,
    ADD COLUMN `projectId` VARCHAR(191) NULL,
    ADD COLUMN `projectName` VARCHAR(191) NULL,
    ADD COLUMN `workOrderNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `quality_loss_index` ADD COLUMN `lossType` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `quality_losses_workOrderNumber_idx` ON `quality_losses`(`workOrderNumber`);

-- CreateIndex
CREATE INDEX `quality_losses_projectId_idx` ON `quality_losses`(`projectId`);

-- CreateIndex
CREATE INDEX `quality_losses_partId_idx` ON `quality_losses`(`partId`);

-- AddForeignKey
ALTER TABLE `quality_losses` ADD CONSTRAINT `quality_losses_workOrderNumber_fkey` FOREIGN KEY (`workOrderNumber`) REFERENCES `work_orders`(`workOrderNumber`) ON DELETE SET NULL ON UPDATE CASCADE;
