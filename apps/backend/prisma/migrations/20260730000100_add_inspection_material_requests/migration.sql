-- CreateTable
CREATE TABLE `qms_inspection_material_requests` (
    `id` VARCHAR(191) NOT NULL,
    `inspectionRequestId` VARCHAR(191) NOT NULL,
    `requestedName` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `resolutionMode` ENUM('CREATE', 'LINK_EXISTING') NULL,
    `resolvedPartId` VARCHAR(191) NULL,
    `resolvedPartName` VARCHAR(191) NULL,
    `reviewRemark` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `qms_inspection_material_requests_inspectionRequestId_key`(`inspectionRequestId`),
    INDEX `qms_inspection_material_requests_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `qms_inspection_material_requests_requestedName_idx`(`requestedName`),
    INDEX `qms_inspection_material_requests_resolvedPartId_idx`(`resolvedPartId`),
    INDEX `qms_inspection_material_requests_reviewedById_idx`(`reviewedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `qms_inspection_material_requests`
    ADD CONSTRAINT `qms_inspection_material_requests_inspectionRequestId_fkey`
    FOREIGN KEY (`inspectionRequestId`) REFERENCES `qms_inspection_requests`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `qms_inspection_material_requests`
    ADD CONSTRAINT `qms_inspection_material_requests_reviewedById_fkey`
    FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
