# 图片上传压缩

## 日期

2026-05-27

## 需求描述

前端图片上传前自动压缩，减少上传体积提升速度。

## 压缩策略

- 不合格品、售后：仅缩尺寸不降画质（quality 1.0, 最大 2560px, 3MB 以下不压缩）
- 其他所有（报检入口、监督检查等）：有损压缩（quality 0.7, 最大 1920px, 目标 500KB）

## 涉及模块

- web-antd（前端所有图片上传组件）

## 改动文件

- apps/web-antd/package.json
- apps/web-antd/src/composables/useImageCompress.ts
- apps/web-antd/src/views/qms/shared/components/QmsFileUpload.vue
- apps/web-antd/src/views/qms/inspection/issues/components/IssuePhotoUpload.vue
- apps/web-antd/src/views/qms/after-sales/components/AfterSalesPhotoUpload.vue
- apps/web-antd/src/views/qms/inspection/requests/entry/index.vue
- apps/web-antd/src/views/qms/inspection/requests/components/CloseInspectionModal.vue
- pnpm-lock.yaml

## 兼容性

- 非图片文件（PDF/Excel）不受影响
- 已经很小的图片不会被二次压缩
