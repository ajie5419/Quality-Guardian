CREATE TABLE `supplier_score_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `supplierId` VARCHAR(191) NOT NULL,
  `supplierName` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NULL,
  `outsourcingMode` VARCHAR(191) NULL,
  `incomingQualifiedRate` DOUBLE NOT NULL DEFAULT 100,
  `incomingScore` DOUBLE NOT NULL DEFAULT 100,
  `incomingBatchCount` INTEGER NOT NULL DEFAULT 0,
  `incomingTotalQuantity` DOUBLE NOT NULL DEFAULT 0,
  `engineeringIssueCount` INTEGER NOT NULL DEFAULT 0,
  `engineeringScore` DOUBLE NOT NULL DEFAULT 100,
  `afterSalesIssueCount` INTEGER NOT NULL DEFAULT 0,
  `afterSalesScore` DOUBLE NOT NULL DEFAULT 100,
  `totalEngineeringLoss` DOUBLE NOT NULL DEFAULT 0,
  `totalAfterSalesLoss` DOUBLE NOT NULL DEFAULT 0,
  `finalQualityScore` DOUBLE NOT NULL DEFAULT 100,
  `finalRating` VARCHAR(191) NOT NULL DEFAULT 'A',
  `finalStatus` VARCHAR(191) NOT NULL DEFAULT 'Qualified',
  `isWarning` BOOLEAN NOT NULL DEFAULT false,
  `scoringModel` VARCHAR(191) NOT NULL DEFAULT 'SUPPLIER',
  `stabilityScore` DOUBLE NOT NULL DEFAULT 100,
  `warningReasons` JSON NULL,
  `calculatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,

  UNIQUE INDEX `supplier_score_snapshots_supplierId_key`(`supplierId`),
  INDEX `supplier_score_snapshots_supplierName_idx`(`supplierName`),
  INDEX `supplier_score_snapshots_category_idx`(`category`),
  INDEX `supplier_score_snapshots_outsourcingMode_idx`(`outsourcingMode`),
  INDEX `supplier_score_snapshots_incomingQualifiedRate_idx`(`incomingQualifiedRate`),
  INDEX `supplier_score_snapshots_engineeringIssueCount_idx`(`engineeringIssueCount`),
  INDEX `supplier_score_snapshots_afterSalesIssueCount_idx`(`afterSalesIssueCount`),
  INDEX `supplier_score_snapshots_finalQualityScore_idx`(`finalQualityScore`),
  INDEX `supplier_score_snapshots_finalRating_idx`(`finalRating`),
  INDEX `supplier_score_snapshots_finalStatus_idx`(`finalStatus`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_score_snapshots`
  ADD CONSTRAINT `supplier_score_snapshots_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
