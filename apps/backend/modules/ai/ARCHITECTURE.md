# ai 模块

## 职责

AI 能力接入：对话/补全调用、文本分析、标签提取、ITP 生成、案例匹配。支持多供应商配置（系统设置 `AI_CONFIGURATION` 切换，环境变量回退）。

## 文件结构

```
ai/
├── ai.ts                    # callAi / getAiConfig / extractJson 核心
├── ai-route.service.ts      # 路由级 AI 调用
├── analyze.post.service.ts  # 文本分析
├── extract-tags.post.service.ts  # 标签提取
├── generate-itp.post.service.ts  # ITP 生成
└── match-cases.post.service.ts   # 历史案例匹配
```

## 对外接口

- `callAi(messages, options)` — 调用 LLM
- `getAiConfig()` — 解析当前生效的 AI 供应商配置

## 依赖

- `~/utils/prisma` — 读取系统设置
- `@qgs/shared` — `extractAiJson` 等纯函数
- `~/modules/system` — `AI_SETTINGS` 环境回退

## 特殊约束

- 供应商配置结构：`configs` + 活跃 `provider`，缺失回退环境变量
- AI 调用带超时与错误降级，不阻塞主流程
