-- CreateTable
CREATE TABLE `cron_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `jobKey` VARCHAR(191) NOT NULL,
    `cronExpr` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastRunAt` DATETIME(3) NULL,
    `lastStatus` VARCHAR(191) NULL,
    `lastError` TEXT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cron_jobs_jobKey_isDeleted_idx`(`jobKey`, `isDeleted`),
    INDEX `cron_jobs_enabled_isDeleted_idx`(`enabled`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
