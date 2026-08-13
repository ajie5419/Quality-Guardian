-- Durable, per-source outbox for the quality-loss materialized index.
-- Business source rows are never mutated by this migration.
CREATE TABLE `quality_loss_index_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `source` ENUM('MANUAL', 'INTERNAL', 'EXTERNAL', 'COMMISSIONING') NOT NULL,
  `sourcePk` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseOwner` VARCHAR(191) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `quality_loss_index_jobs_status_availableAt_idx`(`status`, `availableAt`),
  INDEX `quality_loss_index_jobs_status_leaseUntil_idx`(`status`, `leaseUntil`),
  INDEX `quality_loss_index_jobs_source_sourcePk_status_idx`(`source`, `sourcePk`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
