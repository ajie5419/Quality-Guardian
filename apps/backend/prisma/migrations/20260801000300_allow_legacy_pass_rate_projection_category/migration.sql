-- Historical inspection categories include pre-enum values. This sidecar must
-- retain them for reconciliation instead of rejecting otherwise valid facts.
ALTER TABLE `pass_rate_process_identity_projection`
  MODIFY COLUMN `category` VARCHAR(32) NOT NULL;
