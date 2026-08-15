-- AlterTable
-- Generated via `prisma migrate diff --from-url <db> --to-schema-datamodel`:
-- adds a canonical welder id column so score refreshes can join by id
-- instead of fuzzy name matching (legacy text kept for history).
ALTER TABLE `quality_records` ADD COLUMN `responsibleWelderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `quality_records_responsibleWelderId_idx` ON `quality_records`(`responsibleWelderId`);
