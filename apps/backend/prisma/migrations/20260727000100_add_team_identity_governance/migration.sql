CREATE TABLE `team_identity_aliases` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `alias` VARCHAR(191) NOT NULL,
  `nameKey` VARCHAR(191) NOT NULL,
  `aliasKind` ENUM('CANONICAL', 'HISTORICAL') NOT NULL DEFAULT 'CANONICAL',
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `team_identity_aliases_teamId_nameKey_isDeleted_key`(`teamId`, `nameKey`, `isDeleted`),
  INDEX `team_identity_aliases_teamId_aliasKind_isDeleted_idx`(`teamId`, `aliasKind`, `isDeleted`),
  INDEX `team_identity_aliases_nameKey_isDeleted_idx`(`nameKey`, `isDeleted`),
  INDEX `team_identity_aliases_alias_idx`(`alias`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `team_identity_name_keys` (
  `nameKey` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `team_identity_name_keys_teamId_idx`(`teamId`),
  PRIMARY KEY (`nameKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `team_identity_sources` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `sourceType` ENUM('MANUAL', 'DEPARTMENT', 'SUPPLIER', 'IMPORT') NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `sourceNameSnapshot` VARCHAR(191) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `team_identity_sources_sourceType_sourceId_key`(`sourceType`, `sourceId`),
  INDEX `team_identity_sources_teamId_isDeleted_idx`(`teamId`, `isDeleted`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `team_identity_merges` (
  `id` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `sourceTeamId` VARCHAR(191) NOT NULL,
  `targetTeamId` VARCHAR(191) NOT NULL,
  `sourceNameSnapshot` VARCHAR(191) NOT NULL,
  `targetNameSnapshot` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `attemptToken` VARCHAR(191) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `failureCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `referenceCounts` JSON NULL,
  `reason` TEXT NULL,
  `operator` VARCHAR(191) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `team_identity_merges_idempotencyKey_key`(`idempotencyKey`),
  INDEX `team_identity_merges_sourceTeamId_status_isDeleted_idx`(`sourceTeamId`, `status`, `isDeleted`),
  INDEX `team_identity_merges_targetTeamId_status_isDeleted_idx`(`targetTeamId`, `status`, `isDeleted`),
  INDEX `team_identity_merges_status_leaseUntil_isDeleted_idx`(`status`, `leaseUntil`, `isDeleted`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `team_identity_merge_participants` (
  `teamId` VARCHAR(191) NOT NULL,
  `mergeId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `team_identity_merge_participants_mergeId_idx`(`mergeId`),
  PRIMARY KEY (`teamId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `team_identity_aliases`
  ADD CONSTRAINT `team_identity_aliases_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_name_keys`
  ADD CONSTRAINT `team_identity_name_keys_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_sources`
  ADD CONSTRAINT `team_identity_sources_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_merges`
  ADD CONSTRAINT `team_identity_merges_sourceTeamId_fkey`
  FOREIGN KEY (`sourceTeamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_merges`
  ADD CONSTRAINT `team_identity_merges_targetTeamId_fkey`
  FOREIGN KEY (`targetTeamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_merge_participants`
  ADD CONSTRAINT `team_identity_merge_participants_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `dictionaries`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `team_identity_merge_participants`
  ADD CONSTRAINT `team_identity_merge_participants_mergeId_fkey`
  FOREIGN KEY (`mergeId`) REFERENCES `team_identity_merges`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
