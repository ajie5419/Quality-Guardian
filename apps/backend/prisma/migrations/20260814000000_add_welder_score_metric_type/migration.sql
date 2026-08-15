-- AlterTable
-- Generated via `prisma migrate diff --from-url <db> --to-schema-datamodel`:
-- adds WELDER_SCORE to the metric_refresh_type enum for asynchronous welder
-- score refreshes (mirrors the existing SUPPLIER_SCORE queue).
ALTER TABLE `metric_refresh_jobs` MODIFY `metricType` ENUM('SUPPLIER_SCORE', 'WELDER_SCORE') NOT NULL;
