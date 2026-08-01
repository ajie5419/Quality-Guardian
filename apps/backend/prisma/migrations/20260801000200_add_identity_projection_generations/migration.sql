-- WP2 only adds rebuildable sidecars. Historical fact tables remain untouched.
ALTER TABLE `identity_resolution_projection`
  DROP INDEX `identity_projection_reference_key`,
  ADD COLUMN `generationId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `identity_projection_generation_reference_key`(`generationId`, `entityType`, `entityId`, `fieldName`),
  ADD INDEX `identity_projection_generation_lookup_idx`(`generationId`, `entityType`, `fieldName`);

CREATE TABLE `identity_projection_generations` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('BUILDING', 'ACTIVE', 'RETIRED', 'FAILED') NOT NULL DEFAULT 'BUILDING',
  `sourceResolutionVersion` INTEGER NOT NULL,
  `failureReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activatedAt` DATETIME(3) NULL,
  `retiredAt` DATETIME(3) NULL,

  INDEX `identity_projection_generation_status_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `identity_projection_generation_pointer` (
  `key` VARCHAR(191) NOT NULL,
  `activeGenerationId` VARCHAR(191) NULL,
  `resolutionVersion` INTEGER NOT NULL DEFAULT 0,
  `switchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `pass_rate_process_identity_projection` (
  `id` VARCHAR(191) NOT NULL,
  `generationId` VARCHAR(191) NOT NULL,
  `inspectionId` VARCHAR(191) NOT NULL,
  `createdAtSnapshot` DATETIME(3) NOT NULL,
  `inspectionDate` DATETIME(3) NOT NULL,
  `category` ENUM('INCOMING', 'PROCESS') NOT NULL,
  `incomingType` VARCHAR(191) NULL,
  `effectiveProcessId` VARCHAR(191) NULL,
  `state` ENUM('RESOLVED', 'RETIRED', 'UNRESOLVED', 'AMBIGUOUS', 'CONFLICT', 'INVALID_ID', 'NOT_APPLICABLE', 'UNKNOWN_PROVENANCE') NOT NULL,
  `resolutionId` VARCHAR(191) NULL,
  `quantity` INTEGER NOT NULL,
  `qualifiedQuantity` INTEGER NULL,
  `unqualifiedQuantity` INTEGER NULL,
  `result` ENUM('PASS', 'FAIL', 'CONDITIONAL', 'NA') NOT NULL,

  UNIQUE INDEX `pass_rate_process_projection_generation_inspection_key`(`generationId`, `inspectionId`),
  INDEX `pass_rate_process_projection_snapshot_idx`(`generationId`, `createdAtSnapshot`, `inspectionDate`),
  INDEX `pass_rate_process_projection_identity_idx`(`generationId`, `effectiveProcessId`, `state`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `identity_resolution_projection`
  ADD CONSTRAINT `identity_resolution_projection_generationId_fkey`
  FOREIGN KEY (`generationId`) REFERENCES `identity_projection_generations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `identity_projection_generation_pointer`
  ADD CONSTRAINT `identity_projection_generation_pointer_activeGenerationId_fkey`
  FOREIGN KEY (`activeGenerationId`) REFERENCES `identity_projection_generations`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `pass_rate_process_identity_projection`
  ADD CONSTRAINT `pass_rate_process_identity_projection_generationId_fkey`
  FOREIGN KEY (`generationId`) REFERENCES `identity_projection_generations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
