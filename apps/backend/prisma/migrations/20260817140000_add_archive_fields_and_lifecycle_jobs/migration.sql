-- AlterTable: archive fields on core business tables (data lifecycle P3)
ALTER TABLE `inspections` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

ALTER TABLE `qms_inspection_requests` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

ALTER TABLE `quality_records` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `data_lifecycle_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `dataClass` VARCHAR(64) NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `sourcePk` VARCHAR(64) NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` TEXT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `data_lifecycle_jobs_status_availableAt_idx`(`status`, `availableAt`),
    UNIQUE INDEX `data_lifecycle_jobs_dataClass_source_sourcePk_key`(`dataClass`, `source`, `sourcePk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: index renamed with column
ALTER TABLE `data_retention_rules` RENAME INDEX `data_retention_rules_enabled_idx` TO `data_retention_rules_isEnabled_idx`;
