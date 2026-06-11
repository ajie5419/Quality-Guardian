-- CreateTable
CREATE TABLE `qms_inspection_request_work_orders` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `workOrderNumber` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `qms_inspection_request_work_orders_workOrderNumber_idx`(`workOrderNumber`),
    UNIQUE INDEX `qms_inspection_request_work_orders_requestId_workOrderNumber_key`(`requestId`, `workOrderNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `qms_inspection_request_inspections` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `inspectionId` VARCHAR(191) NOT NULL,
    `workOrderNumber` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `qms_inspection_request_inspections_inspectionId_idx`(`inspectionId`),
    INDEX `qms_inspection_request_inspections_workOrderNumber_idx`(`workOrderNumber`),
    UNIQUE INDEX `qms_inspection_request_inspections_requestId_inspectionId_key`(`requestId`, `inspectionId`),
    UNIQUE INDEX `qms_inspection_request_inspections_requestId_workOrderNumber_key`(`requestId`, `workOrderNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `qms_inspection_request_work_orders` ADD CONSTRAINT `qms_inspection_request_work_orders_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `qms_inspection_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qms_inspection_request_work_orders` ADD CONSTRAINT `qms_inspection_request_work_orders_workOrderNumber_fkey` FOREIGN KEY (`workOrderNumber`) REFERENCES `work_orders`(`workOrderNumber`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qms_inspection_request_inspections` ADD CONSTRAINT `qms_inspection_request_inspections_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `qms_inspection_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qms_inspection_request_inspections` ADD CONSTRAINT `qms_inspection_request_inspections_inspectionId_fkey` FOREIGN KEY (`inspectionId`) REFERENCES `inspections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qms_inspection_request_inspections` ADD CONSTRAINT `qms_inspection_request_inspections_workOrderNumber_fkey` FOREIGN KEY (`workOrderNumber`) REFERENCES `work_orders`(`workOrderNumber`) ON DELETE RESTRICT ON UPDATE CASCADE;

