ALTER TABLE `inspections`
  ADD COLUMN `supplierId` VARCHAR(191) NULL,
  ADD INDEX `inspections_supplierId_idx`(`supplierId`);

ALTER TABLE `quality_records`
  ADD COLUMN `supplierId` VARCHAR(191) NULL,
  ADD COLUMN `responsibleDepartmentId` VARCHAR(191) NULL,
  ADD INDEX `quality_records_supplierId_idx`(`supplierId`),
  ADD INDEX `quality_records_responsibleDepartmentId_idx`(`responsibleDepartmentId`);

ALTER TABLE `supervision_projects`
  ADD COLUMN `supplierId` VARCHAR(191) NULL,
  ADD INDEX `supervision_projects_supplierId_idx`(`supplierId`);

ALTER TABLE `vehicle_commissioning_issues`
  ADD COLUMN `responsibleDepartmentId` VARCHAR(191) NULL,
  ADD INDEX `vehicle_commissioning_issues_responsibleDepartmentId_idx`(`responsibleDepartmentId`);

ALTER TABLE `after_sales`
  ADD COLUMN `respDeptId` VARCHAR(191) NULL,
  ADD COLUMN `feedbackDeptId` VARCHAR(191) NULL,
  ADD INDEX `after_sales_respDeptId_idx`(`respDeptId`),
  ADD INDEX `after_sales_feedbackDeptId_idx`(`feedbackDeptId`);

ALTER TABLE `quality_losses`
  ADD COLUMN `respDeptId` VARCHAR(191) NULL,
  ADD INDEX `quality_losses_respDeptId_idx`(`respDeptId`);

ALTER TABLE `metrology_borrow_records`
  ADD COLUMN `borrowerDepartmentId` VARCHAR(191) NULL,
  ADD INDEX `metrology_borrow_records_borrowerDepartmentId_idx`(`borrowerDepartmentId`);
