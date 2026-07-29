CREATE TABLE `quality_classification_categories` (
  `id` VARCHAR(191) NOT NULL,
  `scope` ENUM(
    'INSPECTION_ISSUE_DEFECT',
    'AFTER_SALES_PRODUCT',
    'AFTER_SALES_DEFECT'
  ) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `quality_classification_categories_scope_code_key`(`scope`, `code`),
  UNIQUE INDEX `quality_classification_categories_scope_name_key`(`scope`, `name`),
  INDEX `quality_class_category_scope_state_sort_idx`(`scope`, `isDeleted`, `status`, `sort`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `quality_classification_subcategories` (
  `id` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `isDeleted` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `quality_classification_subcategories_categoryId_code_key`(`categoryId`, `code`),
  UNIQUE INDEX `quality_classification_subcategories_categoryId_name_key`(`categoryId`, `name`),
  INDEX `quality_class_subcategory_parent_state_sort_idx`(`categoryId`, `isDeleted`, `status`, `sort`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `quality_classification_subcategories`
  ADD CONSTRAINT `quality_classification_subcategories_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `quality_classification_categories`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `quality_records`
  ADD COLUMN `defectCategoryId` VARCHAR(191) NULL,
  ADD COLUMN `defectSubcategoryId` VARCHAR(191) NULL,
  ADD INDEX `quality_records_defectCategoryId_idx`(`defectCategoryId`),
  ADD INDEX `quality_records_defectSubcategoryId_idx`(`defectSubcategoryId`),
  ADD CONSTRAINT `quality_records_defectCategoryId_fkey`
  FOREIGN KEY (`defectCategoryId`) REFERENCES `quality_classification_categories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `quality_records_defectSubcategoryId_fkey`
  FOREIGN KEY (`defectSubcategoryId`) REFERENCES `quality_classification_subcategories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `after_sales`
  ADD COLUMN `productCategoryId` VARCHAR(191) NULL,
  ADD COLUMN `productSubcategoryId` VARCHAR(191) NULL,
  ADD COLUMN `defectCategoryId` VARCHAR(191) NULL,
  ADD COLUMN `defectSubcategoryId` VARCHAR(191) NULL,
  ADD INDEX `after_sales_productCategoryId_idx`(`productCategoryId`),
  ADD INDEX `after_sales_productSubcategoryId_idx`(`productSubcategoryId`),
  ADD INDEX `after_sales_defectCategoryId_idx`(`defectCategoryId`),
  ADD INDEX `after_sales_defectSubcategoryId_idx`(`defectSubcategoryId`),
  ADD CONSTRAINT `after_sales_productCategoryId_fkey`
  FOREIGN KEY (`productCategoryId`) REFERENCES `quality_classification_categories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `after_sales_productSubcategoryId_fkey`
  FOREIGN KEY (`productSubcategoryId`) REFERENCES `quality_classification_subcategories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `after_sales_defectCategoryId_fkey`
  FOREIGN KEY (`defectCategoryId`) REFERENCES `quality_classification_categories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `after_sales_defectSubcategoryId_fkey`
  FOREIGN KEY (`defectSubcategoryId`) REFERENCES `quality_classification_subcategories`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
