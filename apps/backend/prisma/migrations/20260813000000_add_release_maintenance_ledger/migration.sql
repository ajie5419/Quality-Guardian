-- This migration only creates release-maintenance execution metadata.
-- Release tasks own all business-data mutations and run after migrate deploy.
CREATE TABLE `release_maintenance_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `taskKey` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `status` ENUM('RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'RUNNING',
  `attemptToken` VARCHAR(191) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `release_maintenance_tasks_taskKey_revision_key`(`taskKey`, `revision`),
  INDEX `release_maintenance_tasks_status_leaseUntil_idx`(`status`, `leaseUntil`),
  INDEX `release_maintenance_tasks_taskKey_status_idx`(`taskKey`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
