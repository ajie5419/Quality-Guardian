# file-storage 模块

## 职责

QMS 文件中心：文档上传、存储与分类。存储后端策略化（LOCAL / 阿里云 OSS），提供附件登记、缩略图、导入解析。

## 文件结构

```
file-storage/
├── storage-strategy.ts      # StorageStrategy 接口 + 策略选择
├── local-storage.ts         # 本地存储实现
├── oss-storage.ts           # 阿里云 OSS 实现
├── file-storage.service.ts  # 文件中心主服务（上传/登记/查询）
├── file-asset-query.ts      # 资产查询（按 provider/类型）
├── file-attachment.ts       # 业务附件登记
├── import-report.ts         # 报表导入
├── thumbnail-backfill.ts    # 缩略图回填
└── upload.service.ts / upload-filename.get.service.ts  # 上传端点服务
```

## 对外接口

- `FileStorageService` — 文件中心主服务
- `StorageStrategy` — 存储后端抽象（可扩展新 provider）

## 依赖

- `~/utils/prisma`
- `sharp` — 缩略图生成
- 阿里云 OSS SDK（环境变量 `OSS_PROVIDER=aliyun` 等）

## 特殊约束

- `StorageProvider` 枚举目前仅 `LOCAL`/`OSS`，新增后端需扩展枚举与 `getStorageStrategyForProvider`
- 生产用 OSS；环境变量缺失回退本地 `uploads/`（重启丢失）
- 业务表只存附件 JSON 快照，文件实体登记 `file_references`
