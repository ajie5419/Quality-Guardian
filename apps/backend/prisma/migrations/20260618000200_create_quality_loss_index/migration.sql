-- Materialized index over the four quality-loss sources.
-- One row per (source, sourcePk); upsert from each source write path,
-- soft-delete by setting isDeleted = 1. Read paths page over this table
-- so cross-source aggregations no longer load full source tables into JS.

CREATE TABLE `quality_loss_index` (
  `id` VARCHAR(64) NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `sourcePk` VARCHAR(64) NOT NULL,
  `occurDate` DATETIME(3) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `actualClaim` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL,
  `projectName` VARCHAR(255) NULL,
  `workOrderNumber` VARCHAR(64) NULL,
  `respDept` VARCHAR(255) NULL,
  `supplierBrandId` VARCHAR(64) NULL,
  `createdBy` VARCHAR(64) NULL,
  `isDeleted` TINYINT(1) NOT NULL DEFAULT 0,
  `indexedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `quality_loss_index_source_sourcePk_key` (`source`, `sourcePk`),
  INDEX `quality_loss_index_occurDate_idx` (`occurDate`),
  INDEX `quality_loss_index_source_occurDate_idx` (`source`, `occurDate`),
  INDEX `quality_loss_index_workOrderNumber_idx` (`workOrderNumber`),
  INDEX `quality_loss_index_createdBy_idx` (`createdBy`),
  INDEX `quality_loss_index_respDept_idx` (`respDept`),
  INDEX `quality_loss_index_supplierBrandId_idx` (`supplierBrandId`),
  INDEX `quality_loss_index_isDeleted_occurDate_idx` (`isDeleted`, `occurDate`)
);
