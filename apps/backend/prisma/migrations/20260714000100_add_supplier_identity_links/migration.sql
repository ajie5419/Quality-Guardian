CREATE TABLE `supplier_identity_links` (
  `id` VARCHAR(191) NOT NULL,
  `supplierId` VARCHAR(191) NOT NULL,
  `identityType` ENUM('TEAM') NOT NULL,
  `identityId` VARCHAR(191) NOT NULL,
  `identityNameSnapshot` VARCHAR(191) NOT NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `supplier_identity_links_identityType_identityId_key`(`identityType`, `identityId`),
  INDEX `supplier_identity_links_supplierId_identityType_isDeleted_idx`(`supplierId`, `identityType`, `isDeleted`),
  INDEX `supplier_identity_links_identityNameSnapshot_idx`(`identityNameSnapshot`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `unresolved_master_data_refs` (
  `id` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `fieldName` VARCHAR(191) NOT NULL,
  `rawId` VARCHAR(191) NULL,
  `rawName` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL,
  `evidence` JSON NULL,
  `status` ENUM('OPEN', 'RESOLVED', 'IGNORED') NOT NULL DEFAULT 'OPEN',
  `resolvedId` VARCHAR(191) NULL,
  `resolutionNote` TEXT NULL,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,

  UNIQUE INDEX `unresolved_master_data_refs_entityType_entityId_fieldName_key`(`entityType`, `entityId`, `fieldName`),
  INDEX `unresolved_master_data_refs_status_isDeleted_idx`(`status`, `isDeleted`),
  INDEX `unresolved_master_data_refs_entityType_fieldName_idx`(`entityType`, `fieldName`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_identity_links`
  ADD CONSTRAINT `supplier_identity_links_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Historical inspection records may contain IDs from legacy namespaces. MySQL
-- does not rescan existing rows after FOREIGN_KEY_CHECKS is re-enabled, so the
-- constraint protects all subsequent writes without deleting rollback evidence.
-- The companion maintenance command audits and repairs legacy rows in batches.
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `quality_records`
  ADD CONSTRAINT `quality_records_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inspections`
  ADD CONSTRAINT `inspections_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
