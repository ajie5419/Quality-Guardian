-- CreateTable
CREATE TABLE `IdentityBridgeCode` (
    `id` VARCHAR(191) NOT NULL,
    `hash` CHAR(64) NOT NULL,
    `clientId` VARCHAR(128) NOT NULL,
    `redirectUri` VARCHAR(512) NOT NULL,
    `challenge` VARCHAR(43) NOT NULL,
    `userId` VARCHAR(128) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `IdentityBridgeCode_hash_key`(`hash`),
    INDEX `IdentityBridgeCode_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdentityBridgeCredential` (
    `id` VARCHAR(191) NOT NULL,
    `hash` CHAR(64) NOT NULL,
    `clientId` VARCHAR(128) NOT NULL,
    `userId` VARCHAR(128) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `IdentityBridgeCredential_hash_key`(`hash`),
    INDEX `IdentityBridgeCredential_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

