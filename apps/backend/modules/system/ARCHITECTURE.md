# system 模块

## 职责

系统配置与基础设置：系统设置键、菜单 ID、监控、AI 设置测试、物料免费输入、检验手工创建、外协责任设置、受控主数据改名管理。

## 文件结构

```
system/
├── system.service.ts        # 系统配置主服务
├── system-data.ts           # 系统设置默认值与 AI_SETTINGS
├── system-monitoring.service.ts  # 系统监控
├── settings-key.post.service.ts  # 设置键读写
├── menu-id.put.service.ts   # 菜单 ID 维护
├── admin-master-data-rename.post.service.ts  # 主数据改名管理
├── ai-settings-test.post.service.ts          # AI 设置测试
├── inspection-manual-create.post.service.ts  # 检验手工创建
├── inspection-request-outsourcing-responsibility-setting.service.ts  # 外协责任设置
└── incoming-material-free-input.post.service.ts  # 进货物料自由输入
```

## 对外接口

- `SystemService` — 系统配置主服务
- 各设置类 handler（settings-key、menu-id、admin-master-data-rename 等）

## 依赖

- `~/utils/prisma`
- `~/modules/ai` — AI 设置
- `~/modules/master-data-identity` — 改名治理
- `~/modules/inspection` — 检验手工创建/外协责任

## 特殊约束

- 受控主数据改名只能走 `admin-master-data-rename`，禁止直接改字典
- canonical 系统设置（如外协责任、采购部/生产 OBU 解析）是业务契约的事实源
