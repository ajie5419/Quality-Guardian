-- The projection is rebuildable. Existing rows intentionally remain NULL until
-- the next generation rebuild, which makes the feature-read guard fail closed.
ALTER TABLE `pass_rate_process_identity_projection`
  ADD COLUMN `updatedAtSnapshot` DATETIME(3) NULL;

CREATE INDEX `pass_rate_process_projection_freshness_idx`
  ON `pass_rate_process_identity_projection`(`generationId`, `updatedAtSnapshot`);
