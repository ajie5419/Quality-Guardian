-- METRIC-GOVERNANCE-001 / PHASE-1.7B: append-only approval and owner metadata.
-- This migration neither creates metric definitions nor changes metric values.

CREATE TABLE `metric_approval_evidences` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionVersionId` VARCHAR(191) NOT NULL,
  `decisionHistoryId` VARCHAR(191) NOT NULL,
  `decisionStatus` ENUM('APPROVED', 'APPROVED_WITH_POLICY_PENDING') NOT NULL,
  `approvedOption` VARCHAR(191) NOT NULL,
  `approvedDefinition` TEXT NOT NULL,
  `decisionSource` VARCHAR(191) NOT NULL,
  `decisionBy` VARCHAR(191) NOT NULL,
  `decisionNote` TEXT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `metric_approval_evidence_key`(`metricDefinitionVersionId`, `decisionHistoryId`),
  INDEX `metric_approval_evidences_decisionStatus_idx`(`decisionStatus`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_approval_evidences_version_fkey`
    FOREIGN KEY (`metricDefinitionVersionId`) REFERENCES `metric_definition_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `metric_owner_assignments` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionId` VARCHAR(191) NOT NULL,
  `ownerRole` ENUM('BUSINESS', 'POLICY', 'DATA') NOT NULL,
  `ownerLabel` VARCHAR(191) NOT NULL,
  `ownerDeptId` VARCHAR(191) NULL,
  `ownerStatus` ENUM('UNCONFIRMED', 'CONFIRMED', 'CONFIRMED_FROM_APPROVAL') NOT NULL DEFAULT 'UNCONFIRMED',
  `decisionHistoryId` VARCHAR(191) NULL,
  `approvalEvidence` TEXT NULL,
  `sourceDocument` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `metric_owner_assignment_key`(`metricDefinitionId`, `ownerRole`, `ownerLabel`),
  INDEX `metric_owner_assignments_ownerRole_ownerStatus_idx`(`ownerRole`, `ownerStatus`),
  INDEX `metric_owner_assignments_ownerDeptId_idx`(`ownerDeptId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_owner_assignments_definition_fkey`
    FOREIGN KEY (`metricDefinitionId`) REFERENCES `metric_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `metric_canonical_mappings`
  DROP FOREIGN KEY `metric_canonical_mappings_canonical_fkey`,
  DROP INDEX `metric_canonical_mapping_key`,
  DROP INDEX `metric_canonical_mappings_canonicalMetricDefinitionId_idx`,
  CHANGE COLUMN `canonicalMetricDefinitionId` `canonicalMetricDefinitionVersionId` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `metric_canonical_mapping_key`(`legacyMetricDefinitionId`, `canonicalMetricDefinitionVersionId`),
  ADD INDEX `metric_canonical_mappings_canonicalMetricDefinitionVersionId_idx`(`canonicalMetricDefinitionVersionId`),
  ADD CONSTRAINT `metric_canonical_mappings_version_fkey`
    FOREIGN KEY (`canonicalMetricDefinitionVersionId`) REFERENCES `metric_definition_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
