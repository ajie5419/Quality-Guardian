ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `category` ENUM('INCOMING', 'PROCESS', 'SHIPMENT') NULL,
  ADD INDEX `qms_inspection_requests_category_idx`(`category`);
