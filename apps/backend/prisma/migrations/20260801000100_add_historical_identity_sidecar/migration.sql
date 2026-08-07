-- WP1 sidecar only: historical fact tables remain untouched.
CREATE TABLE `historical_identity_resolutions` (
  `id` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `fieldName` VARCHAR(191) NOT NULL,
  `decisionVersion` INTEGER NOT NULL,
  `rawId` VARCHAR(191) NULL,
  `rawName` VARCHAR(191) NULL,
  `sourceFingerprint` VARCHAR(191) NOT NULL,
  `canonicalId` VARCHAR(191) NULL,
  `state` ENUM('RESOLVED', 'RETIRED', 'UNRESOLVED', 'AMBIGUOUS', 'CONFLICT', 'INVALID_ID', 'NOT_APPLICABLE', 'UNKNOWN_PROVENANCE') NOT NULL,
  `decisionSource` ENUM('OBSERVED_VALID_ID', 'LEGACY_AUDIT', 'MANUAL_DECISION') NOT NULL,
  `evidence` JSON NULL,
  `decisionNote` TEXT NULL,
  `decidedById` VARCHAR(191) NULL,
  `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `supersedesId` VARCHAR(191) NULL,

  UNIQUE INDEX `historical_identity_resolutions_supersedesId_key`(`supersedesId`),
  UNIQUE INDEX `historical_identity_resolution_version_key`(`entityType`, `entityId`, `fieldName`, `decisionVersion`),
  INDEX `historical_identity_resolution_lookup_idx`(`entityType`, `entityId`, `fieldName`),
  INDEX `historical_identity_resolution_canonical_idx`(`canonicalId`, `state`),
  INDEX `historical_identity_resolution_state_idx`(`state`, `decisionSource`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `identity_resolution_projection` (
  `id` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `fieldName` VARCHAR(191) NOT NULL,
  `sourceFingerprint` VARCHAR(191) NOT NULL,
  `effectiveCanonicalId` VARCHAR(191) NULL,
  `state` ENUM('RESOLVED', 'RETIRED', 'UNRESOLVED', 'AMBIGUOUS', 'CONFLICT', 'INVALID_ID', 'NOT_APPLICABLE', 'UNKNOWN_PROVENANCE') NOT NULL,
  `resolutionId` VARCHAR(191) NULL,
  `projectionVersion` INTEGER NOT NULL DEFAULT 1,
  `rebuiltAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `identity_projection_reference_key`(`entityType`, `entityId`, `fieldName`),
  INDEX `identity_projection_canonical_idx`(`effectiveCanonicalId`, `state`),
  INDEX `identity_projection_state_idx`(`state`, `entityType`, `fieldName`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `identity_reconciliation_runs` (
  `id` VARCHAR(191) NOT NULL,
  `consumerKey` VARCHAR(191) NOT NULL,
  `factEntityType` VARCHAR(191) NOT NULL,
  `baselineChecksum` VARCHAR(191) NOT NULL,
  `cutoffKind` ENUM('CREATED_AT', 'ID_BOUNDARY', 'SNAPSHOT_DESCRIPTOR') NOT NULL,
  `createdAtCutoff` DATETIME(3) NULL,
  `idCutoff` VARCHAR(191) NULL,
  `snapshotDescriptor` JSON NULL,
  `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `startedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `failureReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `identity_reconciliation_consumer_idx`(`consumerKey`, `status`, `createdAt`),
  INDEX `identity_reconciliation_fact_idx`(`factEntityType`, `cutoffKind`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `identity_reconciliation_metrics` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NOT NULL,
  `metricKey` VARCHAR(191) NOT NULL,
  `legacyValue` DECIMAL(20, 4) NOT NULL,
  `projectionValue` DECIMAL(20, 4) NOT NULL,
  `differenceValue` DECIMAL(20, 4) NOT NULL,
  `details` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `identity_reconciliation_metric_key`(`runId`, `metricKey`),
  INDEX `identity_reconciliation_metric_idx`(`metricKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `historical_identity_resolutions`
  ADD CONSTRAINT `historical_identity_resolutions_supersedesId_fkey`
  FOREIGN KEY (`supersedesId`) REFERENCES `historical_identity_resolutions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `identity_reconciliation_metrics`
  ADD CONSTRAINT `identity_reconciliation_metrics_runId_fkey`
  FOREIGN KEY (`runId`) REFERENCES `identity_reconciliation_runs`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
