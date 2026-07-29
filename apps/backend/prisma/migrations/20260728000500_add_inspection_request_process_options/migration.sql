CREATE TABLE `inspection_request_process_options` (
  `id` VARCHAR(191) NOT NULL,
  `processId` VARCHAR(191) NOT NULL,
  `category` ENUM('INCOMING', 'PROCESS', 'SHIPMENT') NOT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `inspection_request_process_options_category_processId_key`(`category`, `processId`),
  INDEX `inspection_request_process_options_category_isEnabled_sort_idx`(`category`, `isEnabled`, `sort`),
  INDEX `inspection_request_process_options_processId_isEnabled_idx`(`processId`, `isEnabled`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inspection_request_process_options`
  ADD CONSTRAINT `inspection_request_process_options_processId_fkey`
  FOREIGN KEY (`processId`) REFERENCES `processes`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
