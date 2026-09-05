-- METRIC-GOVERNANCE-001 / PHASE-3B.1: append-only human activation approval.
CREATE TABLE `metric_activation_approval_evidences` (
  `id` VARCHAR(191) NOT NULL,
  `metricDefinitionVersionId` VARCHAR(191) NOT NULL,
  `metricCode` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `decision` VARCHAR(32) NOT NULL,
  `effectiveFromAt` DATETIME(3) NOT NULL,
  `decisionBy` VARCHAR(191) NOT NULL,
  `activationNote` TEXT NOT NULL,
  `scopeConfirmation` TEXT NOT NULL,
  `historicalCalculationConfirmation` TEXT NOT NULL,
  `sourceDocument` VARCHAR(191) NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `metric_activation_approval_key`(`metricDefinitionVersionId`, `effectiveFromAt`, `decisionBy`),
  INDEX `metric_activation_approval_evidences_metricCode_version_idx`(`metricCode`, `version`),
  PRIMARY KEY (`id`),
  CONSTRAINT `metric_activation_approval_evidences_version_fkey`
    FOREIGN KEY (`metricDefinitionVersionId`) REFERENCES `metric_definition_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
