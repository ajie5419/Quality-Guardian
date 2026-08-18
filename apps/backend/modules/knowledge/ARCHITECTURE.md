# knowledge 模块

## 职责

质量知识库：文档分类与知识条目的浏览、管理。

## 文件结构

```
knowledge/
├── knowledge.ts                 # 建数据/更新数据纯函数
├── knowledge-category.ts        # 分类处理
├── knowledge-route.service.ts   # 路由级知识库查询
└── knowledge.module.ts          # 模块声明
```

## 对外接口

- `buildKnowledgeCreateData` / `buildKnowledgeUpdateData` — 写入数据构造
- 知识分类与条目查询服务

## 依赖

- `~/utils/prisma`
- `~/modules/file-storage` — 附件

## 特殊约束

- 知识条目含附件快照，删除需同步清理文件引用
