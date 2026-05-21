CREATE TABLE `processes` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `processes_name_key`(`name`),
  INDEX `processes_name_idx`(`name`),
  INDEX `processes_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inspections`
  ADD COLUMN `processId` VARCHAR(191) NULL,
  ADD INDEX `inspections_processId_idx`(`processId`),
  ADD CONSTRAINT `inspections_processId_fkey`
    FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `quality_records`
  ADD COLUMN `processId` VARCHAR(191) NULL,
  ADD INDEX `quality_records_processId_idx`(`processId`),
  ADD CONSTRAINT `quality_records_processId_fkey`
    FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `work_order_requirements`
  ADD COLUMN `processId` VARCHAR(191) NULL,
  ADD INDEX `work_order_requirements_processId_idx`(`processId`),
  ADD CONSTRAINT `work_order_requirements_processId_fkey`
    FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `processId` VARCHAR(191) NULL,
  ADD INDEX `qms_inspection_requests_processId_idx`(`processId`),
  ADD CONSTRAINT `qms_inspection_requests_processId_fkey`
    FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inspection_form_templates`
  ADD COLUMN `processId` VARCHAR(191) NULL,
  ADD INDEX `inspection_form_templates_processId_idx`(`processId`),
  ADD CONSTRAINT `inspection_form_templates_processId_fkey`
    FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
