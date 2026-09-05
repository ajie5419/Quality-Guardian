-- IDEMPOTENCY-KEY-001 / PHASE-1: request-level idempotency table.
--
-- The (actorKey, operationKey, idempotencyKey) unique key is the claim
-- identity; the claim row and the business write are committed in the same
-- transaction by `withRequestIdempotency`, so a rolled-back business
-- transaction also rolls the claim back and the key stays reusable. The
-- expiresAt index supports future cleanup and key reuse after expiry.

CREATE TABLE `idempotency_requests` (
  `id` VARCHAR(191) NOT NULL,
  `actorKey` VARCHAR(191) NOT NULL,
  `operationKey` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestFingerprint` VARCHAR(191) NOT NULL,
  `status` ENUM('PROCESSING', 'COMPLETED') NOT NULL DEFAULT 'PROCESSING',
  `responseStatus` INT NULL,
  `resourceType` VARCHAR(191) NULL,
  `resourceId` VARCHAR(191) NULL,
  `responseBody` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_requests_actorKey_operationKey_idempotencyKey_key` (`actorKey`, `operationKey`, `idempotencyKey`),
  KEY `idempotency_requests_expiresAt_idx` (`expiresAt`),
  KEY `idempotency_requests_actorKey_operationKey_status_idx` (`actorKey`, `operationKey`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
