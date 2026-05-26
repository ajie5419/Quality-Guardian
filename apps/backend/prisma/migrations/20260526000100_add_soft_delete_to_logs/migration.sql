ALTER TABLE `audit_logs`
  ADD COLUMN `isDeleted` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `login_logs`
  ADD COLUMN `isDeleted` BOOLEAN NOT NULL DEFAULT false;
