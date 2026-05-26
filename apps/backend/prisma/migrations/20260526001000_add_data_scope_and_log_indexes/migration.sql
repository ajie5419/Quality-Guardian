CREATE INDEX `after_sales_feedbackDept_idx` ON `after_sales`(`feedbackDept`);
CREATE INDEX `after_sales_handler_idx` ON `after_sales`(`handler`);
CREATE INDEX `after_sales_division_idx` ON `after_sales`(`division`);
CREATE INDEX `audit_logs_isDeleted_idx` ON `audit_logs`(`isDeleted`);
CREATE INDEX `login_logs_isDeleted_idx` ON `login_logs`(`isDeleted`);
CREATE INDEX `quality_records_responsibleBU_idx` ON `quality_records`(`responsibleBU`);
CREATE INDEX `suppliers_buyer_idx` ON `suppliers`(`buyer`);
CREATE INDEX `work_orders_division_idx` ON `work_orders`(`division`);
