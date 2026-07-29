CREATE TABLE `project_bom_required_processes` (
  `id` VARCHAR(191) NOT NULL,
  `bomId` VARCHAR(191) NOT NULL,
  `processId` VARCHAR(191) NULL,
  `processName` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_bom_required_processes_bomId_processId_key`(`bomId`, `processId`),
  INDEX `project_bom_required_processes_bomId_idx`(`bomId`),
  INDEX `project_bom_required_processes_processId_idx`(`processId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_bom_required_processes`
  ADD CONSTRAINT `project_bom_required_processes_bomId_fkey`
  FOREIGN KEY (`bomId`) REFERENCES `project_boms`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_bom_required_processes_processId_fkey`
  FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
