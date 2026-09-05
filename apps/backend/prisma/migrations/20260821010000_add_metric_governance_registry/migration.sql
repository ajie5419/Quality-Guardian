-- METRIC-GOVERNANCE-001 / PHASE-1: governance metadata only.
-- No metric values, executable formulas, or business seed data belong here.

CREATE TABLE `metric_definitions` (
  `id` VARCHAR(191) NOT NULL,
  `metricCode` VARCHAR(191) NOT NULL,
  `metricName` VARCHAR(191) NOT NULL,
  `domain` VARCHAR(191) NOT NULL,
  `category` ENUM('A', 'B', 'C', 'D') NOT NULL,
  `ownerDeptId` VARCHAR(191) NULL,
  `ownerStatus` ENUM('UNCONFIRMED', 'CONFIRMED') NOT NULL DEFAULT 'UNCONFIRMED',
  `status` ENUM('DRAFT', 'ACTIVE', 'DEPRECATED') NOT NULL DEFAULT 'DRAFT',
  `currentVersion` INTEGER NOT NULL DEFAULT 1,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `metric_definitions_metricCode_key`(`metricCode`),
  INDEX `metric_definitions_category_status_idx`(`category`, `status`),
  INDEX `metric_definitions_ownerDeptId_idx`(`ownerDeptId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `metric_definition_versions` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `businessDefinition` TEXT NOT NULL,
  `numeratorDefinition` TEXT NULL,
  `denominatorDefinition` TEXT NULL,
  `formulaType` VARCHAR(191) NOT NULL,
  `sourceModel` JSON NOT NULL,
  `sourceFields` JSON NOT NULL,
  `dimensions` JSON NOT NULL,
  `exclusions` JSON NOT NULL,
  `scopePolicy` ENUM('ALL', 'DEPT', 'SELF', 'SOURCE_INHERITED', 'NOT_APPLICABLE') NOT NULL,
  `refreshPolicy` VARCHAR(191) NOT NULL,
  `unit` VARCHAR(191) NOT NULL,
  `precision` INTEGER NOT NULL,
  `effectiveFromAt` DATETIME(3) NOT NULL,
  `effectiveToAt` DATETIME(3) NULL,
  `changeReason` TEXT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `conflictStatus` ENUM('NO_CONFLICT', 'CANONICAL_CANDIDATE', 'BUSINESS_DECISION_REQUIRED') NOT NULL DEFAULT 'BUSINESS_DECISION_REQUIRED',

  UNIQUE INDEX `metric_definition_version_key`(`metricDefinitionId`, `version`),
  INDEX `metric_definition_versions_metricDefinitionId_createdAt_idx`(`metricDefinitionId`, `createdAt`),
  INDEX `metric_definition_versions_conflictStatus_idx`(`conflictStatus`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_definition_versions_metricDefinitionId_fkey`
    FOREIGN KEY (`metricDefinitionId`) REFERENCES `metric_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
