-- Change manpower column in supervision_daily_reports from INT to TEXT.
-- Existing integer values are automatically cast to their string representation
-- by MySQL when modifying INT to VARCHAR/TEXT.
ALTER TABLE `supervision_daily_reports`
  MODIFY COLUMN `manpower` TEXT NULL;
