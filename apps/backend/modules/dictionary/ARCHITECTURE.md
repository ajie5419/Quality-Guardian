# dictionary 模块

## 职责

系统字典数据维护：枚举值、下拉选项的 CRUD 与 API 映射。

## 文件结构

```
dictionary/
├── dictionary.service.ts            # 字典 CRUD 主服务
├── dictionary-create.post.service.ts  # 创建（带校验）
├── dictionary-id.put.service.ts     # 更新
├── dictionary-api-mapping.ts        # 字典 ↔ API 字段映射
└── dictionary.module.ts             # 模块声明
```

## 对外接口

- `DictionaryService` — 字典 CRUD
- 创建/更新 handler（`dictionary-create.post`、`dictionary-id.put`）

## 依赖

- `~/utils/prisma`
- `@qgs/shared` — 枚举定义

## 特殊约束

- 受控主数据（如 TEAM、质量分类）受写保护，禁止通过通用字典入口修改
- 变更需与业务统计的 canonical ID 契约一致
