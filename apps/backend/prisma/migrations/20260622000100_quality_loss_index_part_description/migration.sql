-- Add partName + description to quality_loss_index so the list can render
-- the same fields that the per-source formatters used to produce in memory.

ALTER TABLE `quality_loss_index`
  ADD COLUMN `partName` VARCHAR(255) NULL,
  ADD COLUMN `description` TEXT NULL;
