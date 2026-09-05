-- SCHEDULER-INTEGRITY-001: unique job identity for cron_jobs.
--
-- Concurrent instance startup could previously create duplicate jobKey rows
-- via find-then-create. Reconcile existing duplicates BEFORE enforcing the
-- unique index so the migration never fails on production data:
--   - keep the earliest row (MIN id) per jobKey as canonical
--   - enabled: any duplicate enabled -> enabled
--   - lastRunAt: most recent run wins (avoids premature re-run)
--   - lastStatus/lastError: taken from the row with the most recent run
--   - delete the remaining duplicates
-- The code registry remains the source of truth; sync upserts by jobKey.

CREATE TEMPORARY TABLE `_cron_jobs_reconciled` AS
SELECT
  k.`id`,
  k.`any_enabled` AS `enabled`,
  k.`max_run` AS `lastRunAt`,
  r.`lastStatus`,
  r.`lastError`
FROM (
  SELECT
    MIN(`id`) AS `id`,
    `jobKey`,
    MAX(`enabled`) AS `any_enabled`,
    MAX(`lastRunAt`) AS `max_run`
  FROM `cron_jobs`
  GROUP BY `jobKey`
) k
LEFT JOIN `cron_jobs` r
  ON r.`jobKey` = k.`jobKey`
 AND r.`lastRunAt` = k.`max_run`
 AND r.`id` = (
   SELECT MIN(s.`id`)
   FROM `cron_jobs` s
   WHERE s.`jobKey` = k.`jobKey` AND s.`lastRunAt` = k.`max_run`
 );

-- Apply the merged execution state onto the canonical (earliest) row, then
-- remove the remaining duplicate rows. Deterministic per jobKey.
UPDATE `cron_jobs` c
INNER JOIN `_cron_jobs_reconciled` m
  ON m.`id` = c.`id`
SET
  c.`enabled` = m.`enabled`,
  c.`lastRunAt` = m.`lastRunAt`,
  c.`lastStatus` = m.`lastStatus`,
  c.`lastError` = m.`lastError`;

DELETE d
FROM `cron_jobs` d
LEFT JOIN `_cron_jobs_reconciled` m
  ON m.`id` = d.`id`
WHERE m.`id` IS NULL;

DROP TEMPORARY TABLE `_cron_jobs_reconciled`;

-- Unique job identity: one definition row per jobKey.
CREATE UNIQUE INDEX `cron_jobs_jobKey_key` ON `cron_jobs`(`jobKey`);

-- The old composite (jobKey, isDeleted) index is now redundant: the unique
-- jobKey index covers every jobKey-prefixed lookup.
DROP INDEX `cron_jobs_jobKey_isDeleted_idx` ON `cron_jobs`;
