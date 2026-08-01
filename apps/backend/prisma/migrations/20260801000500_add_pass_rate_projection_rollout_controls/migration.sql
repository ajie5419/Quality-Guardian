-- WP3 rollout controls are additive. Historical fact tables remain immutable.
ALTER TABLE `identity_reconciliation_runs`
  ADD COLUMN `projectionGenerationId` VARCHAR(191) NULL,
  ADD INDEX `identity_reconciliation_generation_idx`(`consumerKey`, `projectionGenerationId`, `status`, `createdAt`);

CREATE TABLE `pass_rate_projection_refresh_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `reason` VARCHAR(191) NULL,
  `requestedById` VARCHAR(191) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `completedAt` DATETIME(3) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `pass_rate_projection_refresh_status_idx`(`status`, `leaseUntil`, `isDeleted`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
