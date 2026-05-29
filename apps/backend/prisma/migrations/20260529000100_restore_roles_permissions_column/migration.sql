-- Restore `roles.permissions` column dropped by 20260526001200.
-- Idempotent: some databases still have the column (with data), others had it
-- dropped. MySQL 8.0 lacks `ADD COLUMN IF NOT EXISTS`, so guard via information_schema.
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'roles'
    AND COLUMN_NAME = 'permissions'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `roles` ADD COLUMN `permissions` TEXT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
