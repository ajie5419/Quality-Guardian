-- METRIC-GOVERNANCE-001 / PHASE-2G: append-only Shadow Validation evidence.
CREATE TABLE `metric_shadow_validation_evidences` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionVersionId` VARCHAR(191) NOT NULL,
  `metricCode` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `executionWindowStart` DATETIME(3) NOT NULL,
  `executionWindowEnd` DATETIME(3) NOT NULL,
  `scope` VARCHAR(32) NOT NULL,
  `result` JSON NOT NULL,
  `classification` VARCHAR(64) NOT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `metric_shadow_evidence_key`(`metricDefinitionVersionId`, `executionWindowStart`, `executionWindowEnd`, `scope`),
  INDEX `metric_shadow_validation_evidences_metricCode_version_idx`(`metricCode`, `version`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_shadow_validation_evidences_version_fkey`
    FOREIGN KEY (`metricDefinitionVersionId`) REFERENCES `metric_definition_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
