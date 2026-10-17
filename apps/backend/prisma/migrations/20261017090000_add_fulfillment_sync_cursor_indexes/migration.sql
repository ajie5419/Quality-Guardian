-- CreateIndex
CREATE INDEX `departments_updatedAt_id_idx` ON `departments`(`updatedAt`, `id`);

-- CreateIndex
CREATE INDEX `processes_updatedAt_id_idx` ON `processes`(`updatedAt`, `id`);

-- CreateIndex
CREATE INDEX `suppliers_updatedAt_id_idx` ON `suppliers`(`updatedAt`, `id`);

-- CreateIndex
CREATE INDEX `users_updatedAt_id_idx` ON `users`(`updatedAt`, `id`);

-- CreateIndex
CREATE INDEX `work_orders_updatedAt_workOrderNumber_idx` ON `work_orders`(`updatedAt`, `workOrderNumber`);

-- CreateIndex
CREATE INDEX `qms_inspection_requests_updatedAt_id_idx` ON `qms_inspection_requests`(`updatedAt`, `id`);

