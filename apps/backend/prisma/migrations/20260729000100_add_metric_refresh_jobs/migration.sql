CREATE TABLE `metric_refresh_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `metricType` ENUM('SUPPLIER_SCORE') NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leaseOwner` VARCHAR(191) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `completedAt` DATETIME(3) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `metric_refresh_jobs_metricType_status_availableAt_isDeleted_idx`(`metricType`, `status`, `availableAt`, `isDeleted`),
  INDEX `metric_refresh_jobs_status_leaseUntil_isDeleted_idx`(`status`, `leaseUntil`, `isDeleted`),
  INDEX `metric_refresh_jobs_metricType_entityId_status_isDeleted_idx`(`metricType`, `entityId`, `status`, `isDeleted`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
