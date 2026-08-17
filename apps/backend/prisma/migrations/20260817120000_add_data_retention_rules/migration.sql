-- CreateTable
CREATE TABLE `data_retention_rules` (
    `id` VARCHAR(191) NOT NULL,
    `dataClass` VARCHAR(64) NOT NULL,
    `displayName` VARCHAR(64) NOT NULL,
    `retentionDays` INTEGER NOT NULL,
    `action` VARCHAR(16) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `data_retention_rules_dataClass_key`(`dataClass`),
    INDEX `data_retention_rules_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
