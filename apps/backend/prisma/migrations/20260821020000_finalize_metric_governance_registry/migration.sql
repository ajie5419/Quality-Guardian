-- METRIC-GOVERNANCE-001 / PHASE-1.7: governance metadata only.
-- This migration does not seed definitions, modify metric values, or activate metrics.

ALTER TABLE `metric_definitions`
  MODIFY `ownerStatus` ENUM('UNCONFIRMED', 'CONFIRMED', 'CONFIRMED_FROM_APPROVAL')
  NOT NULL DEFAULT 'UNCONFIRMED';

ALTER TABLE `metric_definition_versions`
  MODIFY `effectiveFromAt` DATETIME(3) NULL,
  ADD COLUMN `decisionHistoryId` VARCHAR(191) NULL,
  ADD COLUMN `approvalEvidence` TEXT NULL,
  ADD COLUMN `sourceDocument` VARCHAR(191) NULL;

CREATE TABLE `metric_canonical_mappings` (
  `id` VARCHAR(191) NOT NULL,
  `legacyMetricDefinitionId` VARCHAR(191) NOT NULL,
  `canonicalMetricDefinitionId` VARCHAR(191) NOT NULL,
  `decisionHistoryId` VARCHAR(191) NOT NULL,
  `mappingType` ENUM('SPLIT_TO', 'REPLACED_BY') NOT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `metric_canonical_mapping_key`(`legacyMetricDefinitionId`, `canonicalMetricDefinitionId`),
  INDEX `metric_canonical_mappings_canonicalMetricDefinitionId_idx`(`canonicalMetricDefinitionId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_canonical_mappings_legacy_fkey`
    FOREIGN KEY (`legacyMetricDefinitionId`) REFERENCES `metric_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `metric_canonical_mappings_canonical_fkey`
    FOREIGN KEY (`canonicalMetricDefinitionId`) REFERENCES `metric_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `metric_policy_dependencies` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionVersionId` VARCHAR(191) NOT NULL,
  `policyCode` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'APPROVED') NOT NULL DEFAULT 'PENDING',
  `decisionHistoryId` VARCHAR(191) NOT NULL,
  `pendingPolicy` TEXT NOT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `metric_policy_dependency_key`(`metricDefinitionVersionId`, `policyCode`),
  INDEX `metric_policy_dependencies_status_idx`(`status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_policy_dependencies_version_fkey`
    FOREIGN KEY (`metricDefinitionVersionId`) REFERENCES `metric_definition_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
