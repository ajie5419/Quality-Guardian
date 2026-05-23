CREATE TABLE `master_projects` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `isDeleted` BOOLEAN NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `master_projects_name_key`(`name`),
  INDEX `master_projects_name_idx`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `master_parts` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` INT NOT NULL DEFAULT 1,
  `sort` INT NOT NULL DEFAULT 0,
  `isDeleted` BOOLEAN NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `master_parts_name_key`(`name`),
  INDEX `master_parts_name_idx`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `inspections`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `inspections_projectId_idx`(`projectId`);

ALTER TABLE `quality_records`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `quality_records_projectId_idx`(`projectId`),
  ADD INDEX `quality_records_partId_idx`(`partId`);

ALTER TABLE `work_orders`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `work_orders_projectId_idx`(`projectId`);

ALTER TABLE `quality_plans`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `quality_plans_projectId_idx`(`projectId`);

ALTER TABLE `vehicle_commissioning_issues`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `vehicle_commissioning_issues_projectId_idx`(`projectId`),
  ADD INDEX `vehicle_commissioning_issues_partId_idx`(`partId`);

ALTER TABLE `supervision_projects`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `supervision_projects_projectId_idx`(`projectId`);

ALTER TABLE `after_sales`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `after_sales_projectId_idx`(`projectId`),
  ADD INDEX `after_sales_partId_idx`(`partId`);

ALTER TABLE `inspection_form_templates`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `inspection_form_templates_projectId_idx`(`projectId`),
  ADD INDEX `inspection_form_templates_partId_idx`(`partId`);

ALTER TABLE `inspection_archive_tasks`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `inspection_archive_tasks_projectId_idx`(`projectId`);

ALTER TABLE `bom_projects`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `bom_projects_projectId_idx`(`projectId`);

ALTER TABLE `doc_projects`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `doc_projects_projectId_idx`(`projectId`);

ALTER TABLE `dfmea_projects`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD INDEX `dfmea_projects_projectId_idx`(`projectId`);

ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `qms_inspection_requests_partId_idx`(`partId`);

ALTER TABLE `work_order_requirements`
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `work_order_requirements_partId_idx`(`partId`);

ALTER TABLE `project_boms`
  ADD COLUMN `partId` VARCHAR(191) NULL,
  ADD INDEX `project_boms_partId_idx`(`partId`);
