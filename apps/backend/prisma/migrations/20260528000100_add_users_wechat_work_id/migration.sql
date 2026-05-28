ALTER TABLE `users`
  ADD COLUMN `wechatWorkId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `users_wechatWorkId_key` ON `users`(`wechatWorkId`);
CREATE INDEX `users_wechatWorkId_idx` ON `users`(`wechatWorkId`);
